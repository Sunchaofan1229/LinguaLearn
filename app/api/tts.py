"""
Boson Higgs Audio TTS proxy endpoint.

Forwards text-to-speech requests to Boson AI's Higgs Audio v3 TTS API.
Supports MP3 (non-streaming) and PCM (streaming) output formats.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel, Field

from app.api.deps import get_current_user
from app.models.user import User
from app.config import settings
import httpx

router = APIRouter()


class TTSRequest(BaseModel):
    """TTS synthesis request."""
    text: str = Field(..., min_length=1, max_length=4096,
                      description="Text to synthesize")
    voice: str = Field(default="default",
                       description="Preset voice name (e.g. jake, nova, default)")
    response_format: str = Field(default="mp3",
                                 description="Audio format: mp3, pcm, opus, aac, flac, wav")
    stream: bool = Field(default=False,
                         description="Stream audio as raw PCM bytes (requires pcm format)")


@router.post("/tts/speech")
async def text_to_speech(
    request: TTSRequest,
    current_user: User = Depends(get_current_user),
):
    """Synthesize speech using Boson Higgs Audio v3 TTS.

    Non-streaming: returns MP3 audio file.
    Streaming: returns raw 16-bit 24kHz mono PCM byte stream.

    Rate-limited by Boson during public preview (free tier).
    """
    if not settings.boson_api_key:
        raise HTTPException(
            status_code=503,
            detail="TTS service not configured (missing BOSON_API_KEY)"
        )

    payload = {
        "model": "higgs-audio-v3-tts",
        "input": request.text,
        "voice": request.voice,
        "response_format": request.response_format,
        "stream": request.stream,
    }

    # Streaming requires PCM format
    if request.stream and request.response_format != "pcm":
        payload["response_format"] = "pcm"

    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
        try:
            boson_resp = await client.post(
                f"{settings.boson_api_base}/audio/speech",
                headers={
                    "Authorization": f"Bearer {settings.boson_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

            if boson_resp.status_code != 200:
                error_body = ""
                try:
                    error_body = boson_resp.text[:300]
                except Exception:
                    pass
                raise HTTPException(
                    status_code=502,
                    detail=f"Boson API error ({boson_resp.status_code}): {error_body}"
                )

            if request.stream:
                media = "audio/pcm"
                return StreamingResponse(
                    boson_resp.aiter_bytes(chunk_size=4096),
                    media_type=media,
                    headers={
                        "X-Audio-Format": "pcm",
                        "X-Audio-SampleRate": "24000",
                        "X-Audio-Channels": "1",
                        "X-Audio-BitDepth": "16",
                    },
                )
            else:
                content_type = {
                    "mp3": "audio/mpeg",
                    "pcm": "audio/pcm",
                    "opus": "audio/opus",
                    "aac": "audio/aac",
                    "flac": "audio/flac",
                    "wav": "audio/wav",
                }.get(request.response_format, "audio/mpeg")

                return Response(
                    content=boson_resp.content,
                    media_type=content_type,
                    headers={"Content-Disposition": "inline"},
                )

        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="TTS request timed out")
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail="Cannot connect to TTS service")
        except Exception as e:
            if isinstance(e, HTTPException):
                raise
            raise HTTPException(status_code=500, detail=f"TTS failed: {str(e)[:200]}")
