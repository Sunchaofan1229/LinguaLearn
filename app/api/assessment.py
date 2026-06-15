"""Assessment API routes.

Exposes endpoints for retrieving CEFR level-placement questions,
submitting answers for evaluation, and fetching past results.
"""

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.assessment import AssessmentRecord
from app.models.user import CEFRLevel, User
from app.schemas.assessment import (
    AssessmentQuestion,
    AssessmentResult,
    AssessmentSubmit,
)
from app.services.assessment_service import AssessmentService

router = APIRouter()


def _get_assessment_service() -> AssessmentService:
    """Provide AssessmentService as a singleton dependency."""
    return AssessmentService()


@router.get("/questions", response_model=List[AssessmentQuestion])
async def get_questions(
    service: AssessmentService = Depends(_get_assessment_service),
) -> List[AssessmentQuestion]:
    """Return a set of 10 assessment questions spanning CEFR levels A1 to C2.

    Questions are randomly sampled from a pre-defined question bank.
    Distribution: 2×A1, 2×A2, 2×B1, 2×B2, 1×C1, 1×C2.
    Question types include multiple-choice, fill-in-the-blank, and translation.
    """
    return service.generate_questions()


@router.post("/submit", response_model=AssessmentResult)
async def submit_assessment(
    data: AssessmentSubmit,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    service: AssessmentService = Depends(_get_assessment_service),
) -> AssessmentResult:
    """Submit answers for CEFR assessment evaluation.

    Answers are evaluated by DeepSeek (with local fallback). The result is
    persisted and the user's CEFR level is updated. Returns the assessment
    result with per-skill scores and personalized recommendations.
    """
    # Re-fetch the same questions to get correct_answer fields.
    questions = service.generate_questions()
    # Map submitted answers to their question objects.
    question_map = {q.id: q for q in questions}

    # Filter answers to only those matching known question IDs.
    validated_answers = [a for a in data.answers if a.question_id in question_map]
    matched_questions = [question_map[a.question_id] for a in validated_answers]

    return await service.submit_and_persist(db, current_user, matched_questions, validated_answers)


@router.get("/result", response_model=AssessmentResult)
async def get_latest_result(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    service: AssessmentService = Depends(_get_assessment_service),
) -> AssessmentResult:
    """Return the most recent assessment result for the current user.

    If no previous assessment exists, returns a default UNASSESSED result.
    """
    stmt = (
        select(AssessmentRecord)
        .where(AssessmentRecord.user_id == current_user.id)
        .order_by(desc(AssessmentRecord.assessed_at))
        .limit(1)
    )
    result = await db.execute(stmt)
    record = result.scalar_one_or_none()

    if not record:
        return AssessmentResult(
            cefr_level=CEFRLevel.UNASSESSED,
            listening_score=0,
            reading_score=0,
            speaking_score=0,
            writing_score=0,
            grammar_score=0,
            recommendations=["完成一次评估测试以获取个性化学习建议"],
        )

    return AssessmentResult(
        cefr_level=record.result_level,
        listening_score=record.listening_score,
        reading_score=record.reading_score,
        speaking_score=record.speaking_score,
        writing_score=record.writing_score,
        grammar_score=record.grammar_score,
        recommendations=[],
    )
