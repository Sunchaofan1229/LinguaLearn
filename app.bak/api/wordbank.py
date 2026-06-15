"""Wordbank API routes.

Provides word recommendation (SSE streaming), user word bank management,
and preset word lists (CET4/6, junior/senior high).
"""

import asyncio
import json
import logging
import math
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.vocabulary import Word, UserWord
from app.services.llm_service import LLMService
from app.services.word_service import WordService

logger = logging.getLogger(__name__)
router = APIRouter()

CEFR_LEVELS = {"A1": 1, "A2": 2, "B1": 3, "B2": 4, "C1": 5, "C2": 6}

# ── Preset word banks ──────────────────────────────────────────────────

_PRESET_BANKS: Dict[str, Dict[str, Any]] = {
    "junior_high": {
        "id": "junior_high",
        "name": "初中英语",
        "description": "适用于初中阶段的基础英语词汇，涵盖日常对话和简单阅读所需单词。",
        "target_level": "A1-A2",
        "word_count": 1500,
        "category": "基础教育",
        "words": [
            {"lemma": "abandon", "part_of_speech": "verb", "basic_definition": "放弃；抛弃"},
            {"lemma": "ability", "part_of_speech": "noun", "basic_definition": "能力；才能"},
            {"lemma": "abroad", "part_of_speech": "adverb", "basic_definition": "在国外；到国外"},
            {"lemma": "accept", "part_of_speech": "verb", "basic_definition": "接受；承认"},
        ],
    },
    "senior_high": {
        "id": "senior_high",
        "name": "高中英语",
        "description": "适用于高中阶段的英语词汇，涵盖学术阅读和写作所需单词。",
        "target_level": "A2-B1",
        "word_count": 3500,
        "category": "基础教育",
        "words": [
            {"lemma": "abandon", "part_of_speech": "verb", "basic_definition": "放弃；遗弃"},
            {"lemma": "abstract", "part_of_speech": "adjective", "basic_definition": "抽象的"},
            {"lemma": "abundant", "part_of_speech": "adjective", "basic_definition": "丰富的；充裕的"},
            {"lemma": "accelerate", "part_of_speech": "verb", "basic_definition": "加速；促进"},
        ],
    },
    "cet4": {
        "id": "cet4",
        "name": "大学英语四级",
        "description": "CET-4 考试核心词汇，涵盖大学英语教学要求的核心单词。",
        "target_level": "B1-B2",
        "word_count": 4500,
        "category": "大学考试",
        "words": [
            {"lemma": "abnormal", "part_of_speech": "adjective", "basic_definition": "反常的；异常的"},
            {"lemma": "abolish", "part_of_speech": "verb", "basic_definition": "废除；取消"},
            {"lemma": "absorb", "part_of_speech": "verb", "basic_definition": "吸收；吸引"},
            {"lemma": "abstract", "part_of_speech": "adjective", "basic_definition": "抽象的；理论的"},
        ],
    },
    "cet6": {
        "id": "cet6",
        "name": "大学英语六级",
        "description": "CET-6 考试核心词汇，涵盖高级学术英语和深度阅读所需词汇。",
        "target_level": "B2-C1",
        "word_count": 6000,
        "category": "大学考试",
        "words": [
            {"lemma": "abolish", "part_of_speech": "verb", "basic_definition": "废除；革除"},
            {"lemma": "abortion", "part_of_speech": "noun", "basic_definition": "流产；堕胎"},
            {"lemma": "abrupt", "part_of_speech": "adjective", "basic_definition": "突然的；唐突的"},
            {"lemma": "absurd", "part_of_speech": "adjective", "basic_definition": "荒谬的；可笑的"},
        ],
    },
}

_PAGE_SIZE = 500


@router.get("/presets")
async def list_presets() -> Dict[str, Any]:
    """Return all available preset word banks."""
    return {
        "presets": [
            {
                "id": bank["id"],
                "name": bank["name"],
                "description": bank["description"],
                "target_level": bank["target_level"],
                "word_count": bank["word_count"],
                "category": bank["category"],
            }
            for bank in _PRESET_BANKS.values()
        ]
    }


@router.get("/presets/{preset_id}")
async def get_preset_words(
    preset_id: str,
    page: int = Query(default=1, ge=1, description="Page number (1-based)."),
    page_size: int = Query(
        default=_PAGE_SIZE,
        ge=1,
        le=_PAGE_SIZE,
        description="Number of words per page (max 500).",
    ),
) -> Dict[str, Any]:
    """Return paginated word list for a specific preset word bank."""
    bank = _PRESET_BANKS.get(preset_id)
    if not bank:
        raise HTTPException(
            status_code=404,
            detail=f"Preset '{preset_id}' not found. Available: {list(_PRESET_BANKS.keys())}",
        )

    words = bank["words"]
    total = len(words)
    total_pages = math.ceil(total / page_size) if total > 0 else 1

    start = (page - 1) * page_size
    end = start + page_size
    items = words[start:end]

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


# ── 🆕 SSE Streaming Recommendation ──────────────────────────────

def _classify_word(
    info: Dict[str, Any],
    existing: Optional[Any],
    user_level: int,
) -> Dict[str, Any]:
    """Classify a single analyzed word into known/recommend/too_hard."""
    wl = info.get("word", "").lower()
    word_level = CEFR_LEVELS.get(info.get("cefr_level", "B1"), 3)
    encounter_count = existing.encounter_count if existing else 0
    status = existing.status if existing else "new"
    due_for_review = False
    if existing and existing.next_review_at:
        due_for_review = existing.next_review_at <= datetime.now(timezone.utc)

    card = {
        "word": info.get("word", wl),
        "translation": info.get("translation", ""),
        "phonetic": info.get("phonetic", ""),
        "part_of_speech": info.get("part_of_speech", ""),
        "cefr_level": info.get("cefr_level", "B1"),
        "example_sentence": info.get("example_sentence", ""),
        "example_translation": info.get("example_translation", ""),
        "topic_tags": info.get("topic_tags", []),
        "encounter_count": encounter_count,
        "status": status,
        "due_for_review": due_for_review,
    }

    if existing and status == "mastered":
        card["category_reason"] = "已掌握"
        return ("known", card)
    elif word_level <= user_level - 1:
        card["category_reason"] = "低于当前水平"
        return ("known", card)
    elif word_level <= user_level + 1:
        card["category_reason"] = "匹配当前水平"
        return ("recommend", card)
    else:
        card["category_reason"] = f"高于当前水平({info.get('cefr_level','')})"
        return ("too_hard", card)


@router.post("/recommend")
async def recommend_words_sse(
    body: Dict[str, Any],
    user: Any = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """SSE streaming word classification.

    Streams analyzed word cards in real-time as LLM batches complete.
    Events:
      - data: {"type":"start","total":N,"chunks":M}
      - data: {"type":"words","known":[...],"recommend":[...],"too_hard":[...]}
      - data: {"type":"done","stats":{...}}
    """
    words_input: List[str] = body.get("words", [])
    cefr_level: str = body.get("cefr_level") or getattr(user, "cefr_level", "B1")
    if hasattr(cefr_level, 'value'):
        cefr_level = str(cefr_level.value)

    if not words_input:
        async def empty_stream():
            yield f"data: {json.dumps({'type': 'done', 'stats': {'total': 0, 'known_count': 0, 'recommend_count': 0, 'too_hard_count': 0}})}\n\n"
        return StreamingResponse(empty_stream(), media_type="text/event-stream")

    # Normalize and deduplicate
    seen: Set[str] = set()
    clean_words: List[str] = []
    for w in words_input:
        wl = w.strip().lower()
        if wl and wl not in seen and len(wl) > 1 and wl.isalpha():
            seen.add(wl)
            clean_words.append(wl)

    clean_words = clean_words[:300]
    if not clean_words:
        async def empty2():
            yield f"data: {json.dumps({'type': 'done', 'stats': {'total': 0, 'known_count': 0, 'recommend_count': 0, 'too_hard_count': 0}})}\n\n"
        return StreamingResponse(empty2(), media_type="text/event-stream")

    user_id = str(user.id)
    user_level = CEFR_LEVELS.get(cefr_level, 3)

    # Pre-load existing user word data
    result = await db.execute(
        select(UserWord, Word).join(Word).where(
            UserWord.user_id == user_id,
            Word.word.in_(clean_words),
        )
    )
    existing_map: Dict[str, Any] = {}
    for uw, w in result:
        existing_map[w.word.lower()] = uw

    # Chunk words for parallel LLM processing
    word_svc = WordService()
    chunks = list(word_svc.chunk_words(clean_words, 50))
    total_chunks = len(chunks)

    async def sse_generator() -> AsyncGenerator[str, None]:
        """Generate SSE events as LLM chunks complete."""
        accumulated_known: List[Dict] = []
        accumulated_recommend: List[Dict] = []
        accumulated_too_hard: List[Dict] = []

        # Send start event
        yield f"data: {json.dumps({'type': 'start', 'total': len(clean_words), 'chunks': total_chunks}, ensure_ascii=False)}\n\n"

        # Process all chunks concurrently, stream results as they complete
        async def process_and_yield(chunk: List[str], chunk_idx: int):
            try:
                analyzed = await word_svc.llm.grade_vocabulary_batch(chunk, cefr_level)
                batch_known, batch_rec, batch_hard = [], [], []
                if analyzed and "words" in analyzed:
                    for item in analyzed["words"]:
                        cat, card = _classify_word(
                            item,
                            existing_map.get(item.get("word", "").lower()),
                            user_level,
                        )
                        if cat == "known":
                            batch_known.append(card)
                        elif cat == "recommend":
                            batch_rec.append(card)
                        else:
                            batch_hard.append(card)
                return (batch_known, batch_rec, batch_hard)
            except Exception as e:
                logger.warning(f"Chunk {chunk_idx} failed: {e}")
                return ([], [], [])

        # Fire all chunks in parallel
        tasks = [process_and_yield(c, i) for i, c in enumerate(chunks)]
        completed = 0
        for coro in asyncio.as_completed(tasks):
            k, r, h = await coro
            accumulated_known.extend(k)
            accumulated_recommend.extend(r)
            accumulated_too_hard.extend(h)
            completed += 1

            # Stream this batch immediately
            yield f"data: {json.dumps({'type': 'words', 'known': k, 'recommend': r, 'too_hard': h, 'progress': {'done': completed, 'total': total_chunks}}, ensure_ascii=False)}\n\n"

        # Sort final results
        def sort_key(c: dict):
            due = 0 if c.get("due_for_review") else 1
            enc = 0 if c.get("encounter_count", 0) == 0 else 1
            return (due, enc)
        accumulated_known.sort(key=sort_key)
        accumulated_recommend.sort(key=sort_key)
        accumulated_too_hard.sort(key=sort_key)

        # Send final sorted results + stats
        final = {
            "type": "done",
            "known": accumulated_known,
            "recommend": accumulated_recommend,
            "too_hard": accumulated_too_hard,
            "stats": {
                "total": len(clean_words),
                "known_count": len(accumulated_known),
                "recommend_count": len(accumulated_recommend),
                "too_hard_count": len(accumulated_too_hard),
            },
        }
        yield f"data: {json.dumps(final, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


# ── Add to Bank ─────────────────────────────────────────────────

@router.post("/add-to-bank")
async def add_words_to_bank(
    body: Dict[str, Any],
    user: Any = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Add words to user's personal vocabulary bank."""
    words_data: List[Dict[str, Any]] = body.get("words", [])
    if not words_data:
        raise HTTPException(status_code=400, detail="请提供要添加的单词列表")

    user_id = str(user.id)
    added = 0
    now = datetime.now(timezone.utc)

    for wd in words_data:
        word_text = wd.get("word", "").strip().lower()
        if not word_text:
            continue

        stmt = pg_insert(Word).values(
            id=str(uuid.uuid4()),
            word=word_text,
            translation=wd.get("translation", ""),
            phonetic=wd.get("phonetic", ""),
            part_of_speech=wd.get("part_of_speech", ""),
            cefr_level=wd.get("cefr_level", "B1"),
            example_sentence=wd.get("example_sentence"),
            example_translation=wd.get("example_translation"),
            topic_tags=",".join(wd.get("topic_tags", [])) if wd.get("topic_tags") else None,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["word"],
            set_={
                "translation": stmt.excluded.translation,
                "phonetic": stmt.excluded.phonetic,
                "updated_at": now,
            },
        )
        await db.execute(stmt)

        result = await db.execute(select(Word.id).where(Word.word == word_text))
        word_row = result.first()
        if not word_row:
            continue
        word_id = word_row[0]

        uw_stmt = pg_insert(UserWord).values(
            id=str(uuid.uuid4()),
            user_id=user_id,
            word_id=word_id,
            encounter_count=1,
            status="new",
            source=wd.get("source", "ocr"),
            first_seen_at=now,
            last_seen_at=now,
        )
        uw_stmt = uw_stmt.on_conflict_do_update(
            constraint="uq_user_word",
            set_={
                "encounter_count": UserWord.encounter_count + 1,
                "last_seen_at": now,
                "source": uw_stmt.excluded.source,
            },
        )
        await db.execute(uw_stmt)
        added += 1

    await db.commit()
    return {"added": added, "total_in_bank": await _count_user_words(db, user_id)}


# ── User Word Bank (Queue / Stats / Progress) ─────────────────────


@router.get("/queue")
async def get_user_word_queue(
    user: Any = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    status: Optional[str] = Query(default=None, description="Filter by status"),
    search: Optional[str] = Query(default=None, description="Search by word text"),
    limit: int = Query(default=200, ge=1, le=500),
) -> Dict[str, Any]:
    """Return the authenticated user's vocabulary queue (personal word bank).

    Supports optional filtering by status and search by word text.
    Words are ordered by CEFR level then by status priority.
    """
    user_id = str(user.id)
    now = datetime.now(timezone.utc)

    # Base query: user's words joined with shared word dictionary
    stmt = (
        select(UserWord, Word)
        .join(Word, UserWord.word_id == Word.id)
        .where(UserWord.user_id == user_id)
    )

    if status and status != "all":
        stmt = stmt.where(UserWord.status == status)

    if search:
        stmt = stmt.where(Word.word.ilike(f"%{search}%"))

    # Order: newest/active first, then by CEFR level
    stmt = stmt.order_by(UserWord.last_seen_at.desc()).limit(limit)

    result = await db.execute(stmt)
    rows = result.all()

    words: List[Dict[str, Any]] = []
    for uw, w in rows:
        topic = w.topic_tags or ""
        # Parse comma-separated tags to get first tag
        topic_main = topic.split(",")[0].strip() if topic else "general"

        words.append({
            "word": w.word,
            "translation": w.translation or "",
            "cefr_level": w.cefr_level or "B1",
            "topic": topic_main,
            "status": uw.status,
            "correct_uses": uw.review_count or 0,
            "next_review": uw.next_review_at.isoformat() if uw.next_review_at else None,
        })

    return {"words": words, "total": len(words)}


@router.get("/stats")
async def get_word_stats(
    user: Any = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Return vocabulary statistics for the authenticated user."""
    user_id = str(user.id)

    # Total count
    total_result = await db.execute(
        select(UserWord).where(UserWord.user_id == user_id)
    )
    all_rows = total_result.scalars().all()

    total = len(all_rows)
    mastered = sum(1 for uw in all_rows if uw.status == "mastered")
    learning = sum(1 for uw in all_rows if uw.status in ("learning", "practicing"))
    new_count = sum(1 for uw in all_rows if uw.status == "new")

    # By CEFR level
    by_level: Dict[str, int] = {}
    if all_rows:
        word_ids = [uw.word_id for uw in all_rows]
        words_result = await db.execute(
            select(Word).where(Word.id.in_(word_ids))
        )
        word_map = {w.id: w for w in words_result.scalars().all()}
        for uw in all_rows:
            word = word_map.get(uw.word_id)
            level = word.cefr_level if word else "B1"
            by_level[level] = by_level.get(level, 0) + 1

    return {
        "total": total,
        "mastered": mastered,
        "learning": learning,
        "new_count": new_count,
        "by_level": by_level,
    }


@router.post("/progress")
async def update_word_progress(
    body: Dict[str, Any],
    user: Any = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Update a word's learning status (e.g., mark as mastered)."""
    word_text = body.get("word", "").strip().lower()
    new_status = body.get("status", "").strip()

    if not word_text:
        raise HTTPException(status_code=400, detail="请提供单词")
    if new_status not in ("new", "learning", "practicing", "mastered"):
        raise HTTPException(status_code=400, detail="无效的状态值")

    user_id = str(user.id)
    now = datetime.now(timezone.utc)

    # Find the word and user-word record
    word_result = await db.execute(select(Word).where(Word.word == word_text))
    word_row = word_result.scalar_one_or_none()
    if not word_row:
        raise HTTPException(status_code=404, detail="单词不存在")

    uw_result = await db.execute(
        select(UserWord).where(
            UserWord.user_id == user_id,
            UserWord.word_id == word_row.id,
        )
    )
    uw_row = uw_result.scalar_one_or_none()
    if not uw_row:
        raise HTTPException(status_code=404, detail="该单词不在你的生词本中")

    # Update progress
    uw_row.status = new_status
    uw_row.last_seen_at = now
    uw_row.review_count = (uw_row.review_count or 0) + 1

    if new_status == "mastered":
        uw_row.mastered_at = now
    else:
        # Schedule next review (simple: 1 day for now)
        from datetime import timedelta
        uw_row.next_review_at = now + timedelta(days=1)

    await db.commit()

    return {
        "word": word_text,
        "status": new_status,
        "updated_at": now.isoformat(),
    }


async def _count_user_words(db: AsyncSession, user_id: str) -> int:
    from sqlalchemy import func as sqlfunc
    result = await db.execute(
        select(sqlfunc.count()).select_from(UserWord).where(UserWord.user_id == user_id)
    )
    return result.scalar() or 0
