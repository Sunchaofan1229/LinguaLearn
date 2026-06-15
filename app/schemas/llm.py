"""Pydantic schemas for LLM-powered features.

Defines request/response models for chat, translation, syntax exercises,
and dictionary lookups — all powered by DeepSeek via backend proxy.
"""

from typing import List, Optional

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    """A single message in a conversation history."""

    role: str = Field(..., description="Message role: user/assistant/system.")
    content: str = Field(..., description="Message text content.")


class ChatRequest(BaseModel):
    """Request body for the AI chat endpoint."""

    message: str = Field(..., min_length=1, description="The user's latest message.")
    conversation_history: Optional[List[ChatMessage]] = Field(
        default=None,
        description="Previous messages in the conversation for context.",
    )
    cefr_level: str = Field(
        default="A2",
        description="User's CEFR level for vocabulary control.",
    )
    word_list: Optional[List[str]] = Field(
        default=None,
        description="Recently learned words to encourage use.",
    )
    topic: Optional[str] = Field(
        default=None,
        description="Current conversation topic.",
    )
    voice_mode: bool = Field(
        default=False,
        description="If true, responses are more concise for voice output.",
    )


class TranslateRequest(BaseModel):
    """Request body for text translation."""

    text: str = Field(..., min_length=1, description="Text to translate.")
    source_lang: str = Field(default="en", description="Source language code.")
    target_lang: str = Field(default="zh", description="Target language code.")


class SyntaxExerciseRequest(BaseModel):
    """Request body for syntax exercise generation."""

    word: Optional[str] = Field(default=None, description="Single word to build exercises around.")
    words: Optional[List[str]] = Field(
        default=None,
        description="Multiple words to build exercises around.",
    )
    difficulty: str = Field(
        default="medium",
        description="Difficulty level: easy/medium/hard.",
        pattern=r"^(easy|medium|hard)$",
    )


class DictionaryRequest(BaseModel):
    """Request body for dictionary lookup via DeepSeek."""

    word: str = Field(..., min_length=1, description="The word to look up.")


class SSEChunk(BaseModel):
    """A single SSE token chunk for streaming responses."""

    delta: str = Field(..., description="Content delta (token or text fragment).")
    finish_reason: Optional[str] = Field(
        default=None,
        description="Reason the stream ended (stop/length/error) — only on final chunk.",
    )
