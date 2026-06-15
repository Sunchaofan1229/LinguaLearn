"""Review API routes — spaced repetition review sessions.

Provides endpoints for getting due-for-review words, submitting
review results (SM-2 update), and tracking daily review progress.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.vocabulary import Word, UserWord
from app.services.spaced_repetition import (
    sm2_review,
    quality_from_correct,
    get_due_words_ordered,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/due")
async def get_due_words(
    limit: int = Query(default=20, ge=1, le=100, description="Max words to return"),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return words due for review, ordered by urgency.

    Uses SM-2 priority: most overdue words first, then new words.
    """
    user_id = str(user.id)
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(UserWord, Word)
        .join(Word, UserWord.word_id == Word.id)
        .where(UserWord.user_id == user_id)
        .order_by(UserWord.next_review_at.asc().nullsfirst())
        .limit(limit * 2)
    )
    rows = result.all()

    user_words = [uw for uw, w in rows]
    due = get_due_words_ordered(user_words, now, limit)

    words = []
    for _, uw in due:
        w = None
        for uww, ww in rows:
            if uww.id == uw.id:
                w = ww
                break
        if w is None:
            continue
        words.append({
            "id": str(uw.id),
            "word": w.word,
            "translation": w.translation,
            "phonetic": w.phonetic,
            "part_of_speech": w.part_of_speech,
            "example_sentence": w.example_sentence,
            "example_translation": w.example_translation,
            "status": uw.status,
            "review_count": uw.review_count,
            "next_review_at": uw.next_review_at.isoformat() if uw.next_review_at else None,
            "ease_factor": getattr(uw, "ease_factor", 2.5),
        })

    # Stats
    total_result = await db.execute(
        select(func.count()).select_from(UserWord).where(UserWord.user_id == user_id)
    )
    total = total_result.scalar() or 0

    due_count_result = await db.execute(
        select(func.count()).select_from(UserWord).where(
            UserWord.user_id == user_id,
            UserWord.next_review_at.isnot(None),
            UserWord.next_review_at <= now,
        )
    )
    due_count = due_count_result.scalar() or 0

    new_count_result = await db.execute(
        select(func.count()).select_from(UserWord).where(
            UserWord.user_id == user_id,
            UserWord.review_count == 0,
        )
    )
    new_count = new_count_result.scalar() or 0

    return {
        "words": words,
        "total": total,
        "due_count": due_count,
        "new_count": new_count,
        "returned": len(words),
    }


@router.post("/submit")
async def submit_review(
    body: dict,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit a review result for one word.

    Body:
      word_id: UserWord UUID
      correct: bool — whether the user answered correctly
      response_time_ms: optional response time in ms
    """
    word_id = body.get("word_id")
    correct = body.get("correct", False)
    response_time_ms = body.get("response_time_ms")

    if not word_id:
        raise HTTPException(400, "word_id is required")

    user_id = str(user.id)
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(UserWord).where(
            UserWord.id == word_id,
            UserWord.user_id == user_id,
        )
    )
    uw = result.scalar_one_or_none()
    if not uw:
        raise HTTPException(404, "Word not found in your bank")

    # Run SM-2
    quality = quality_from_correct(correct, response_time_ms)
    ef = getattr(uw, "ease_factor", 2.5)
    if not hasattr(uw, "ease_factor"):
        uw.ease_factor = 2.5

    sm2 = sm2_review(
        quality=quality,
        repetitions=uw.review_count,
        ease_factor=float(ef),
        interval=(
            uw.next_review_at - uw.last_seen_at
            if uw.next_review_at and uw.last_seen_at
            else None
        ),
        now=now,
    )

    # Update UserWord
    uw.ease_factor = sm2.ease_factor
    uw.review_count = sm2.repetitions
    uw.next_review_at = sm2.next_review_at
    uw.last_seen_at = now

    # Update status
    if sm2.quality < 3:
        uw.status = "learning"
    elif sm2.repetitions >= 5:
        uw.status = "mastered"
        uw.mastered_at = now
    elif sm2.repetitions >= 2:
        uw.status = "practicing"
    else:
        uw.status = "learning"

    await db.commit()

    return {
        "word_id": str(uw.id),
        "quality": sm2.quality,
        "status": uw.status,
        "ease_factor": sm2.ease_factor,
        "interval_hours": round(sm2.interval.total_seconds() / 3600, 1),
        "next_review_at": sm2.next_review_at.isoformat(),
        "repetitions": sm2.repetitions,
    }


@router.get("/stats")
async def get_review_stats(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get today's review statistics."""
    user_id = str(user.id)
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    from sqlalchemy import func as sqlfunc, cast, Date

    # Total in bank
    total_q = await db.execute(
        select(sqlfunc.count()).select_from(UserWord).where(UserWord.user_id == user_id)
    )
    total = total_q.scalar() or 0

    # Due today
    due_q = await db.execute(
        select(sqlfunc.count()).select_from(UserWord).where(
            UserWord.user_id == user_id,
            UserWord.next_review_at.isnot(None),
            UserWord.next_review_at <= now,
        )
    )
    due = due_q.scalar() or 0

    # Reviewed today
    today_q = await db.execute(
        select(sqlfunc.count()).select_from(UserWord).where(
            UserWord.user_id == user_id,
            cast(UserWord.last_seen_at, Date) == today_start.date(),
        )
    )
    reviewed_today = today_q.scalar() or 0

    # Mastered
    mastered_q = await db.execute(
        select(sqlfunc.count()).select_from(UserWord).where(
            UserWord.user_id == user_id,
            UserWord.status == "mastered",
        )
    )
    mastered = mastered_q.scalar() or 0

    # New / learning / practicing
    new_q = await db.execute(
        select(sqlfunc.count()).select_from(UserWord).where(
            UserWord.user_id == user_id,
            UserWord.review_count == 0,
        )
    )
    new_words = new_q.scalar() or 0

    learning_q = await db.execute(
        select(sqlfunc.count()).select_from(UserWord).where(
            UserWord.user_id == user_id,
            UserWord.status == "learning",
        )
    )
    learning = learning_q.scalar() or 0

    practicing_q = await db.execute(
        select(sqlfunc.count()).select_from(UserWord).where(
            UserWord.user_id == user_id,
            UserWord.status == "practicing",
        )
    )
    practicing = practicing_q.scalar() or 0

    return {
        "total": total,
        "due_today": due,
        "reviewed_today": reviewed_today,
        "mastered": mastered,
        "new_words": new_words,
        "learning": learning,
        "practicing": practicing,
        "progress_pct": round(mastered / total * 100, 1) if total > 0 else 0,
    }

