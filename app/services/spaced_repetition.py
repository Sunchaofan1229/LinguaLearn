"""SM-2 spaced repetition algorithm implementation.

Based on the SuperMemo SM-2 algorithm by Piotr Wozniak.
Calculates next review interval based on quality of recall (0-5).
"""
import math
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# Default SM-2 parameters
DEFAULT_EASE_FACTOR = 2.5
MINIMUM_EASE_FACTOR = 1.3
INITIAL_INTERVALS = {
    0: timedelta(minutes=10),   # Black-out — re-review same day
    1: timedelta(minutes=30),   # Nearly forgot
    2: timedelta(hours=1),      # Recalled with difficulty
    3: timedelta(hours=4),      # Recalled but effortful → graduation day 1
}


class SM2Result:
    """Result of an SM-2 review evaluation."""

    def __init__(
        self,
        ease_factor: float,
        interval: timedelta,
        repetitions: int,
        next_review_at: datetime,
        quality: int,
    ):
        self.ease_factor = ease_factor
        self.interval = interval
        self.repetitions = repetitions
        self.next_review_at = next_review_at
        self.quality = quality

    def to_dict(self) -> dict:
        return {
            "ease_factor": self.ease_factor,
            "interval_hours": self.interval.total_seconds() / 3600,
            "repetitions": self.repetitions,
            "next_review_at": self.next_review_at.isoformat(),
            "quality": self.quality,
        }


def quality_from_correct(correct: bool, response_time_ms: Optional[float] = None) -> int:
    """Map a correct/incorrect response to an SM-2 quality score (0-5).

    Args:
        correct: Whether the user answered correctly.
        response_time_ms: Optional response time in ms for finer grading.

    Returns:
        Quality score 0-5:
        5 = perfect response (correct, fast <3s)
        4 = correct with hesitation (3-10s)
        3 = correct but difficult (>10s)
        2 = incorrect, but answer was familiar
        1 = incorrect, answer seemed familiar
        0 = complete blackout
    """
    if not correct:
        return 1

    if response_time_ms is None:
        return 4

    if response_time_ms < 3000:
        return 5
    elif response_time_ms < 10000:
        return 4
    else:
        return 3


def sm2_review(
    quality: int,
    repetitions: int,
    ease_factor: float,
    interval: Optional[timedelta] = None,
    now: Optional[datetime] = None,
) -> SM2Result:
    """Execute one SM-2 review step.

    Args:
        quality: User recall quality (0-5).
        repetitions: Number of consecutive correct recalls so far.
        ease_factor: Current ease factor.
        interval: Current interval (None for first review).
        now: Current time (defaults to UTC now).

    Returns:
        SM2Result with updated ease factor, interval, and next review date.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    # Clamp quality to valid range
    quality = max(0, min(5, quality))

    if quality < 3:
        # Failed recall — reset repetitions and re-learn
        repetitions = 0
        # New interval based on quality
        if quality == 0:
            interval = INITIAL_INTERVALS[0]
        elif quality == 1:
            interval = INITIAL_INTERVALS[1]
        else:
            interval = INITIAL_INTERVALS[2]
    else:
        # Successful recall
        if repetitions == 0:
            # First correct recall — 1 day
            interval = timedelta(days=1)
        elif repetitions == 1:
            # Second correct recall — 6 days
            interval = timedelta(days=6)
        else:
            # Subsequent: interval = previous_interval * ease_factor
            if interval is None:
                interval = timedelta(days=1)
            interval = timedelta(
                seconds=interval.total_seconds() * ease_factor
            )
        repetitions += 1

    # Update ease factor (SM-2 formula)
    new_ease = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    ease_factor = max(MINIMUM_EASE_FACTOR, new_ease)

    next_review = now + interval

    return SM2Result(
        ease_factor=ease_factor,
        interval=interval,
        repetitions=repetitions,
        next_review_at=next_review,
        quality=quality,
    )


def get_due_words_ordered(
    user_words: list,
    now: Optional[datetime] = None,
    limit: int = 20,
) -> list:
    """Sort overdue words by priority (most overdue first).

    Priority ordering:
    1. Failed review / overdue (past next_review_at)
    2. New words (not yet reviewed)
    3. Recently reviewed

    Args:
        user_words: List of UserWord objects.
        now: Reference time.
        limit: Max words to return.

    Returns:
        Sorted list of (priority_score, user_word) tuples.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    scored = []
    for uw in user_words:
        if uw.next_review_at and uw.next_review_at <= now:
            # Overdue — most urgent first
            overdue_hours = (now - uw.next_review_at).total_seconds() / 3600
            score = -overdue_hours  # More overdue = lower (more urgent)
        elif uw.review_count == 0:
            # New word — medium priority
            score = 1
        else:
            # Already reviewed, not due yet — low priority
            score = 2

        scored.append((score, uw))

    scored.sort(key=lambda x: x[0])
    return scored[:limit]
