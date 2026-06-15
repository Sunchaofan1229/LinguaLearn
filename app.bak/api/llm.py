"""LLM API routes.

Exposes DeepSeek-powered endpoints: streaming chat, streaming translation,
syntax exercise generation, and dictionary lookups. All endpoints require
Bearer token authentication.
"""

import json
import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.llm import (
    ChatRequest,
    DictionaryRequest,
    SSEChunk,
    SyntaxExerciseRequest,
    TranslateRequest,
)
from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_llm_service() -> LLMService:
    """Provide LLMService as a singleton dependency."""
    return LLMService()


# ── Streaming helper ───────────────────────────────────────────────────

async def _sse_generator(chunks):
    """Wrap an async generator as SSE text/event-stream output."""
    async for chunk in chunks:
        sse = SSEChunk(delta=chunk)
        yield f"data: {sse.model_dump_json()}\n\n"
    yield "data: [DONE]\n\n"


# ── Chat endpoint ──────────────────────────────────────────────────────

@router.post("/chat")
async def llm_chat(
    data: ChatRequest,
    current_user: User = Depends(get_current_user),
    service: LLMService = Depends(_get_llm_service),
) -> StreamingResponse:
    """Streaming AI chat conversation.

    Sends the user's message with conversation history, CEFR level, and
    word list to DeepSeek. Returns SSE streamed token-by-token.
    """
    history = []
    if data.conversation_history:
        history = [
            {"role": m.role, "content": m.content}
            for m in data.conversation_history
        ]
    history.append({"role": "user", "content": data.message})

    async def stream():
        try:
            async for chunk in service.chat_stream(
                messages=history,
                cefr_level=data.cefr_level,
                word_list=data.word_list,
                topic=data.topic,
                voice_mode=data.voice_mode,
            ):
                sse = SSEChunk(delta=chunk)
                yield f"data: {sse.model_dump_json()}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as exc:
            logger.exception("Chat stream error")
            error = SSEChunk(
                delta=json.dumps({"error": str(exc)}),
                finish_reason="error",
            )
            yield f"data: {error.model_dump_json()}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Translate endpoint ─────────────────────────────────────────────────

@router.post("/translate")
async def llm_translate(
    data: TranslateRequest,
    current_user: User = Depends(get_current_user),
    service: LLMService = Depends(_get_llm_service),
) -> StreamingResponse:
    """Streaming text translation via SSE."""
    async def stream():
        try:
            async for chunk in service.translate_stream(
                text=data.text,
                source_lang=data.source_lang,
                target_lang=data.target_lang,
            ):
                sse = SSEChunk(delta=chunk)
                yield f"data: {sse.model_dump_json()}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as exc:
            logger.exception("Translate stream error")
            error = SSEChunk(delta=json.dumps({"error": str(exc)}), finish_reason="error")
            yield f"data: {error.model_dump_json()}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


# ── Syntax Exercise endpoint ───────────────────────────────────────────

@router.post("/syntax-exercise")
async def llm_syntax_exercise(
    data: SyntaxExerciseRequest,
    current_user: User = Depends(get_current_user),
    service: LLMService = Depends(_get_llm_service),
) -> Dict[str, Any]:
    """Generate a fill-in-the-blank syntax exercise.

    Uses words from the request (or falls back to 'example' if none given).
    Returns a structured exercise with sentence, blanks, and answers.
    """
    words = data.words or []
    if data.word and data.word not in words:
        words = [data.word] + words
    if not words:
        words = ["example"]

    return await service.generate_syntax_exercise(words, data.difficulty)


# ── Dictionary endpoint ────────────────────────────────────────────────

@router.post("/dictionary")
async def llm_dictionary(
    data: DictionaryRequest,
    current_user: User = Depends(get_current_user),
    service: LLMService = Depends(_get_llm_service),
) -> Dict[str, Any]:
    """Look up a word with full dictionary data (affix breakdown, examples, etc.)."""
    return await service.lookup_dictionary(data.word)
