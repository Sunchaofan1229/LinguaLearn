"""WebSocket handler for simultaneous translation.

Full pipeline: Browser SpeechRecognition → WebSocket text → Qwen translation → back
"""

import base64
import json
import logging
import struct

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.llm_service import LLMService
llm_service = LLMService()

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/translate")
async def ws_translate(websocket: WebSocket):
    await websocket.accept()
    logger.info("WS translate client connected")

    try:
        while True:
            message = await websocket.receive_text()
            data = json.loads(message)
            msg_type = data.get("type", "")

            if msg_type == "config":
                lang = data.get("lang", "zh")
                await websocket.send_json({"type": "config_ack", "sample_rate": 16000, "mode": "text"})

            elif msg_type == "text":
                text = data.get("text", "").strip()
                direction = data.get("direction", "zh2en")
                if not text or len(text) < 2:
                    continue

                logger.info(f"Translating [{direction}]: {text[:50]}...")

                if direction == "zh2en":
                    src_lang, tgt_lang = "zh", "en"
                else:
                    src_lang, tgt_lang = "en", "zh"

                translation_parts = []
                async for chunk in llm_service.translate_stream(text, source_lang=src_lang, target_lang=tgt_lang):
                    translation_parts.append(chunk)
                translation = "".join(translation_parts)

                await websocket.send_json({
                    "type": "translation",
                    "text": translation,
                    "original": text,
                    "confidence": 0.85,
                    "source": "stt+qwen",
                })

            elif msg_type == "audio":
                pcm_bytes = base64.b64decode(data.get("data", ""))
                if len(pcm_bytes) >= 4:
                    samples = struct.unpack(f"<{len(pcm_bytes)//2}h", pcm_bytes[:len(pcm_bytes) // 2 * 2])
                    if samples:
                        rms = (sum(s * s for s in samples) / len(samples)) ** 0.5
                        level = min(int(rms / 1000 * 100), 100)
                        await websocket.send_json({"type": "level", "level": level})

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "close":
                break

    except WebSocketDisconnect:
        logger.info("WS translate client disconnected")
    except Exception as e:
        logger.error(f"WS translate error: {e}")
