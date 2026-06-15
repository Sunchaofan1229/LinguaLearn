"""DeepSeek LLM integration service.

Handles all LLM calls — streaming chat, translation, syntax exercise
generation, and dictionary lookups — via the DeepSeek OpenAI-compatible API.
All prompts are built from centralized prompt_templates.
"""

import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

import httpx

from app.config import settings
from app.services.prompt_templates import generate_prompt

logger = logging.getLogger(__name__)


class LLMService:
    """Service for DeepSeek LLM API interactions.

    Uses httpx.AsyncClient for async HTTP with configurable timeout.
    All API keys read from application settings.
    """

    def __init__(self) -> None:
        self._api_key: str = settings.deepseek_api_key
        self._base_url: str = settings.deepseek_base_url.rstrip("/")
        self._timeout: float = 60.0

    # ── Public API ──────────────────────────────────────────────────

    async def chat_stream(
        self,
        messages: List[Dict[str, str]],
        cefr_level: str = "A2",
        word_list: Optional[List[str]] = None,
        topic: Optional[str] = None,
        voice_mode: bool = False,
    ) -> AsyncGenerator[str, None]:
        """Stream a chat completion response token by token.

        Args:
            messages: Conversation history as role/content dicts.
            cefr_level: Student's CEFR level for vocabulary control.
            word_list: Recently learned words to naturally incorporate.
            topic: Current conversation topic.
            voice_mode: If true, responses are more concise.

        Yields:
            Content delta strings (individual tokens or short phrases).
        """
        word_list_str = ", ".join(word_list) if word_list else "(none)"
        topic_str = topic or "free conversation"
        language = "English only" if voice_mode else "English"

        system_prompt = generate_prompt(
            "chat",
            CEFR_LEVEL=cefr_level,
            WORD_LIST=word_list_str,
            TOPIC=topic_str,
            LANGUAGE=language,
        )

        # Replace the first system message or insert one.
        full_messages: List[Dict[str, str]] = []
        has_system = any(m.get("role") == "system" for m in messages)
        if not has_system:
            full_messages = [{"role": "system", "content": system_prompt}] + messages
        else:
            full_messages = [
                {"role": "system", "content": system_prompt} if m.get("role") == "system" else m
                for m in messages
            ]

        temperature = 0.7 if not voice_mode else 0.5
        max_tokens = 150 if voice_mode else 500

        async for chunk in self._stream_request(full_messages, temperature, max_tokens):
            yield chunk

    async def translate_stream(
        self,
        text: str,
        source_lang: str = "en",
        target_lang: str = "zh",
    ) -> AsyncGenerator[str, None]:
        """Stream a translation response token by token.

        Args:
            text: The text to translate.
            source_lang: Source language code.
            target_lang: Target language code.

        Yields:
            Translation text deltas.
        """
        system_prompt = generate_prompt(
            "translate",
            TARGET_LANGUAGE=target_lang,
        )
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ]

        async for chunk in self._stream_request(messages, 0.3, 1000):
            yield chunk

    async def generate_syntax_exercise(
        self,
        words: List[str],
        difficulty: str = "medium",
    ) -> Dict[str, Any]:
        """Generate a syntax exercise with examples and fill-blank questions.

        Args:
            words: Words to build exercises around.
            difficulty: easy/medium/hard.

        Returns:
            Dict with sentence, translation, difficulty, fill_positions,
            correct_answers, and exercise_type.
        """
        system_prompt = generate_prompt(
            "syntax_exercise",
            CEFR_LEVEL="B1",
            EXERCISE_TYPE="fill_blank",
            FOCUS_AREA=f"words: {', '.join(words)} at {difficulty} difficulty",
        )
        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"Generate a {difficulty} fill-in-the-blank syntax exercise using these words: {', '.join(words)}.",
            },
        ]

        result = await self._json_request(messages, 0.5, 800)
        return result

    async def lookup_dictionary(self, word: str) -> Dict[str, Any]:
        """Look up a word with full dictionary data including affix breakdown.

        Args:
            word: The word to look up.

        Returns:
            Dict with lemma, part_of_speech, phonetic_us, phonetic_uk,
            definitions, example_sentences, synonyms, antonyms,
            affix_prefix, affix_roots, affix_suffix, etymology_notes.
        """
        system_prompt = generate_prompt(
            "dictionary",
            WORD=word,
            CEFR_LEVEL="B1",
        )
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Analyze the word: {word}"},
        ]

        result = await self._json_request(messages, 0.2, 1500)
        return result

    # ── Internal helpers ─────────────────────────────────────────────

    async def _stream_request(
        self,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> AsyncGenerator[str, None]:
        """Internal: stream tokens from DeepSeek chat completions API."""
        body = {
            "model": "deepseek-chat",
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        }

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                async with client.stream(
                    "POST",
                    f"{self._base_url}/chat/completions",
                    headers=headers,
                    json=body,
                ) as response:
                    if response.status_code != 200:
                        error_text = await response.aread()
                        logger.error(
                            "DeepSeek API error %d: %s",
                            response.status_code,
                            error_text[:500],
                        )
                        yield json.dumps({"error": f"API error: {response.status_code}"})
                        return

                    buffer = ""
                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            return
                        try:
                            data = json.loads(data_str)
                            delta = data.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield content
                        except json.JSONDecodeError:
                            continue
        except httpx.TimeoutException:
            logger.warning("DeepSeek API timeout")
            yield json.dumps({"error": "Request timed out — please try again."})
        except httpx.RequestError as exc:
            logger.error("DeepSeek request error: %s", exc)
            yield json.dumps({"error": "Network error — please check your connection."})

    async def _json_request(
        self,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> Dict[str, Any]:
        """Internal: make a non-streaming request and parse JSON response."""
        body = {
            "model": "deepseek-chat",
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
        }
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(
                f"{self._base_url}/chat/completions",
                headers=headers,
                json=body,
            )
            if response.status_code != 200:
                logger.error("DeepSeek JSON error %d: %s", response.status_code, response.text[:500])
                raise RuntimeError(f"DeepSeek API error: {response.status_code}")

            data = response.json()
            content = data["choices"][0]["message"]["content"]

        # Strip markdown code fences.
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[-1]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()

        try:
            return json.loads(content)
        except json.JSONDecodeError as exc:
            logger.error("Failed to parse DeepSeek JSON: %s", content[:300])
            raise RuntimeError(f"Failed to parse LLM response as JSON: {exc}") from exc
