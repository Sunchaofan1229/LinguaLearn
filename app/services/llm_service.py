"""DeepSeek/Qwen LLM integration service.

Handles all LLM calls — streaming chat, translation, syntax exercise
generation, dictionary lookups, vocabulary grading, and learning plans.
Uses OpenAI-compatible API (works with both DeepSeek and Qwen).
"""

import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

import httpx

from app.config import settings
from app.services.prompt_templates import generate_prompt

logger = logging.getLogger(__name__)


class LLMService:
    """Service for LLM API interactions (DeepSeek or Qwen via OpenAI-compatible API)."""

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
        target_words: Optional[List[str]] = None,
        topic: Optional[str] = None,
        voice_mode: bool = False,
    ) -> AsyncGenerator[str, None]:
        """Stream a chat completion response token by token.

        Args:
            messages: Conversation history.
            cefr_level: Student's CEFR level.
            word_list: Recently learned words.
            target_words: Target words to practice in conversation.
            topic: Current topic.
            voice_mode: Concise responses when True.

        Yields: Content delta strings.
        """
        word_list_str = ", ".join(word_list) if word_list else "(none)"
        target_words_str = ", ".join(target_words) if target_words else "(none)"
        topic_str = topic or "free conversation"
        language = "English only" if voice_mode else "English"

        system_prompt = generate_prompt(
            "chat",
            CEFR_LEVEL=cefr_level,
            WORD_LIST=word_list_str,
            TARGET_WORDS=target_words_str,
            TOPIC=topic_str,
            LANGUAGE=language,
        )

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
        """Stream a translation response."""
        system_prompt = generate_prompt("translate", TARGET_LANGUAGE=target_lang)
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ]
        async for chunk in self._stream_request(messages, 0.3, 1000):
            yield chunk

    async def generate_syntax_exercise(self, words: List[str], difficulty: str = "medium") -> Dict[str, Any]:
        """Generate a syntax exercise."""
        system_prompt = generate_prompt(
            "syntax_exercise", CEFR_LEVEL="B1", EXERCISE_TYPE="fill_blank",
            FOCUS_AREA=f"words: {', '.join(words)} at {difficulty} difficulty",
        )
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Generate a {difficulty} fill-in-the-blank syntax exercise using these words: {', '.join(words)}."},
        ]
        return await self._json_request(messages, 0.5, 800)

    async def lookup_dictionary(self, word: str) -> Dict[str, Any]:
        """Look up a word with full dictionary data."""
        system_prompt = generate_prompt("dictionary", WORD=word, CEFR_LEVEL="B1")
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Analyze the word: {word}"},
        ]
        return await self._json_request(messages, 0.2, 1500)

    async def grade_vocabulary_batch(self, words: List[str], user_cefr_level: str = "A2") -> Dict[str, Any]:
        """Grade a batch of vocabulary words by CEFR level.

        Args:
            words: List of English words to analyze.
            user_cefr_level: User's current CEFR level.

        Returns:
            Dict with 'words' array containing analysis per word.
        """
        words_str = ", ".join(words[:30])
        system_prompt = generate_prompt(
            "vocabulary_grade", WORDS=words_str, USER_LEVEL=user_cefr_level,
        )
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Analyze these {len(words)} words for a CEFR {user_cefr_level} student: {words_str}"},
        ]
        result = await self._json_request(messages, 0.2, 4000)
        return result

    async def generate_learning_plan(
        self, title: str, words_summary: str, total_words: int, source_type: str = "article",
    ) -> str:
        """Generate a human-readable learning plan from imported vocabulary."""
        system_prompt = generate_prompt(
            "learning_plan",
            TITLE=title,
            SOURCE_TYPE=source_type,
            TOTAL_WORDS=str(total_words),
            WORDS_SUMMARY=words_summary,
        )
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Create a learning plan from '{title}' ({source_type}) with {total_words} new words."},
        ]
        # Non-JSON response, plain text
        body = {
            "model": "deepseek-chat",
            "messages": messages,
            "temperature": 0.5,
            "max_tokens": 1500,
            "stream": False,
        }
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(
                f"{self._base_url}/chat/completions",
                headers=headers, json=body,
            )
            if response.status_code != 200:
                logger.error("Plan generation error %d", response.status_code)
                return "学习计划生成失败，请稍后重试。"
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            return content.strip()

    # ── Internal helpers ─────────────────────────────────────────────

    async def _stream_request(
        self, messages: List[Dict[str, str]], temperature: float, max_tokens: int,
    ) -> AsyncGenerator[str, None]:
        """Stream tokens from chat completions API."""
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
                async with client.stream("POST", f"{self._base_url}/chat/completions", headers=headers, json=body) as response:
                    if response.status_code != 200:
                        error_text = await response.aread()
                        logger.error("API error %d: %s", response.status_code, error_text[:500])
                        yield json.dumps({"error": f"API error: {response.status_code}"})
                        return
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
            logger.warning("API timeout")
            yield json.dumps({"error": "请求超时"})
        except httpx.RequestError as exc:
            logger.error("Request error: %s", exc)
            yield json.dumps({"error": "网络错误"})

    @staticmethod
    def _robust_parse_json(content: str) -> Dict[str, Any]:
        """Parse LLM JSON with multiple fallback strategies."""
        content = content.strip()

        # Remove markdown code fences
        if content.startswith("```"):
            lines = content.split("\n")
            lines = lines[1:] if len(lines) > 1 else lines
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            content = "\n".join(lines).strip()

        strategies = [
            ("direct", lambda s: json.loads(s)),
            ("regex_extract", lambda s: _extract_json_from_text(s)),
        ]

        errors = []
        for name, fn in strategies:
            try:
                result = fn(content)
                if isinstance(result, dict):
                    return result
            except Exception as exc:
                errors.append(f"{name}: {exc}")

        # Last resort: try to fix common JSON issues then parse
        try:
            fixed = _repair_json_text(content)
            return json.loads(fixed)
        except json.JSONDecodeError as exc:
            logger.error("All JSON parse strategies failed. Content[:500]: %s", content[:500])
            raise RuntimeError(
                f"Failed to parse LLM response as JSON after all attempts. "
                f"Errors: {'; '.join(errors[-3:])}"
            ) from exc

    async def _json_request(
        self, messages: List[Dict[str, str]], temperature: float, max_tokens: int,
    ) -> Dict[str, Any]:
        """Non-streaming request returning JSON."""
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
            response = await client.post(f"{self._base_url}/chat/completions", headers=headers, json=body)
            if response.status_code != 200:
                logger.error("JSON error %d: %s", response.status_code, response.text[:500])
                raise RuntimeError(f"API error: {response.status_code}")
            data = response.json()
            content = data["choices"][0]["message"]["content"]

        return self._robust_parse_json(content)


# ── JSON repair helpers (module-level for static method access) ──

def _extract_json_from_text(text: str) -> Dict[str, Any]:
    """Extract the first complete JSON object from text using bracket matching."""
    start = text.find("{")
    if start == -1:
        raise ValueError("No JSON object found in text")

    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if escape:
            escape = False
            continue
        if ch == "\\":
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(text[start:i + 1])

    raise ValueError("Unclosed JSON object")


def _repair_json_text(text: str) -> str:
    """Attempt to repair common JSON formatting issues from LLM output."""
    import re

    # Fix single-quoted strings (only property names and simple values)
    # Be conservative: only fix obvious cases
    text = re.sub(r"(?<!\\)'([^'\n]{1,50}?)'\s*:", r'"\1":', text)  # 'key': -> "key":
    text = re.sub(r":\s*'([^'\n]{1,200}?)'", r': "\1"', text)  # : 'value' -> : "value"

    # Fix unquoted property names like {word: "hello"} -> {"word": "hello"}
    text = re.sub(r'(?<![\w"\\])([a-zA-Z_][a-zA-Z0-9_]*)\s*:', r'"\1":', text)

    # Remove trailing commas before closing brackets
    text = re.sub(r',\s*}', '}', text)
    text = re.sub(r',\s*\]', ']', text)

    return text
