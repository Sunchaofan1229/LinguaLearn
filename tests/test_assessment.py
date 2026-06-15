"""Tests for assessment API endpoints.

Covers:
- GET /api/v1/assessment/questions — returns 10 questions
- POST /api/v1/assessment/submit — submit answers (mocked DeepSeek)
- GET /api/v1/assessment/result — latest result for user
"""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.services.assessment_service import AssessmentService


# ── Helpers ────────────────────────────────────────────────────────────────

def _make_ds_result(
    cefr_level: str = "B1",
    scores: dict | None = None,
    recommendations: list | None = None,
) -> dict:
    """Build a parsed DeepSeek evaluation dict matching what
    AssessmentService._call_deepseek returns."""
    if scores is None:
        scores = {
            "cefr_level": cefr_level,
            "listening_score": 65,
            "reading_score": 65,
            "speaking_score": 65,
            "writing_score": 65,
            "grammar_score": 65,
        }
    else:
        scores["cefr_level"] = cefr_level
    if recommendations is None:
        recommendations = [
            "Practice reading longer articles",
            "Work on writing complex sentences",
        ]
    scores["recommendations"] = recommendations
    return scores


# ── Tests ──────────────────────────────────────────────────────────────────


class TestGetQuestions:
    """Tests for GET /api/v1/assessment/questions."""

    async def test_get_questions_returns_10(
        self, client: AsyncClient
    ) -> None:
        """The endpoint returns exactly 10 questions (no auth required)."""
        response = await client.get("/api/v1/assessment/questions")

        assert response.status_code == 200, f"Questions failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 10, f"Expected 10 questions, got {len(data)}"

    async def test_question_structure(
        self, client: AsyncClient
    ) -> None:
        """Each question has the required fields."""
        response = await client.get("/api/v1/assessment/questions")
        data = response.json()

        for q in data:
            assert "id" in q, f"Missing 'id' in question {q}"
            assert "type" in q, f"Missing 'type' in question {q}"
            assert "prompt" in q, f"Missing 'prompt' in question {q}"
            assert "correct_answer" in q, f"Missing 'correct_answer' in question {q}"
            assert q["type"] in ("choice", "fill_blank", "translation"), (
                f"Unexpected type: {q['type']}"
            )

    async def test_question_distribution(
        self, client: AsyncClient
    ) -> None:
        """Questions span all CEFR levels with correct distribution."""
        response = await client.get("/api/v1/assessment/questions")
        data = response.json()

        # Count IDs per level (ID prefix: a1_..., a2_..., b1_..., etc.)
        level_counts = {"A1": 0, "A2": 0, "B1": 0, "B2": 0, "C1": 0, "C2": 0}
        for q in data:
            prefix = q["id"][:2].upper()
            if prefix in level_counts:
                level_counts[prefix] += 1

        assert level_counts["A1"] == 2, f"A1 count: {level_counts['A1']}"
        assert level_counts["A2"] == 2, f"A2 count: {level_counts['A2']}"
        assert level_counts["B1"] == 2, f"B1 count: {level_counts['B1']}"
        assert level_counts["B2"] == 2, f"B2 count: {level_counts['B2']}"
        assert level_counts["C1"] == 1, f"C1 count: {level_counts['C1']}"
        assert level_counts["C2"] == 1, f"C2 count: {level_counts['C2']}"

    async def test_choice_questions_have_options(
        self, client: AsyncClient
    ) -> None:
        """Choice-type questions include an options list."""
        response = await client.get("/api/v1/assessment/questions")
        data = response.json()

        choice_questions = [q for q in data if q["type"] == "choice"]
        assert len(choice_questions) > 0, "Should have at least one choice question"
        for q in choice_questions:
            assert q["options"] is not None
            assert len(q["options"]) >= 2


class TestSubmitAssessment:
    """Tests for POST /api/v1/assessment/submit."""

    @pytest.fixture(autouse=True)
    def _mock_deepseek(self) -> None:
        """Patch _call_deepseek on every test in this class.

        The real _call_deepseek hits the DeepSeek HTTP API, which is slow
        and requires an API key.  We replace it with a fast AsyncMock that
        returns a pre-canned dict.
        """
        self._ds_patcher = patch.object(
            AssessmentService,
            "_call_deepseek",
            new_callable=AsyncMock,
        )

    async def test_submit_answers(
        self, client: AsyncClient, registered_user: dict, auth_headers
    ) -> None:
        """Submitting valid answers returns an assessment result."""
        q_response = await client.get("/api/v1/assessment/questions")
        questions = q_response.json()

        answers = [
            {"question_id": q["id"], "user_answer": q["correct_answer"]}
            for q in questions[:5]
        ]

        with self._ds_patcher as mock_ds:
            mock_ds.return_value = _make_ds_result("B1")

            response = await client.post(
                "/api/v1/assessment/submit",
                json={"answers": answers},
                headers=auth_headers(registered_user["access_token"]),
            )

        assert response.status_code == 200, (
            f"Submit failed: {response.status_code} {response.text}"
        )
        data = response.json()
        assert data["cefr_level"] == "B1"
        assert "listening_score" in data
        assert "reading_score" in data
        assert "speaking_score" in data
        assert "writing_score" in data
        assert "grammar_score" in data
        assert "recommendations" in data

    async def test_submit_with_empty_answers(
        self, client: AsyncClient, registered_user: dict, auth_headers
    ) -> None:
        """Submitting an empty answers list returns 422."""
        response = await client.post(
            "/api/v1/assessment/submit",
            json={"answers": []},
            headers=auth_headers(registered_user["access_token"]),
        )

        assert response.status_code == 422, (
            f"Expected 422 for empty answers, got {response.status_code}"
        )

    async def test_submit_unauthenticated(
        self, client: AsyncClient
    ) -> None:
        """Submit without auth returns 401."""
        response = await client.post(
            "/api/v1/assessment/submit",
            json={
                "answers": [{"question_id": "a1_01", "user_answer": "A"}]
            },
        )

        assert response.status_code == 401

    async def test_submit_filters_invalid_question_ids(
        self, client: AsyncClient, registered_user: dict, auth_headers
    ) -> None:
        """Answers with invalid question IDs are filtered out."""
        with self._ds_patcher as mock_ds:
            mock_ds.return_value = _make_ds_result("A1")

            response = await client.post(
                "/api/v1/assessment/submit",
                json={
                    "answers": [
                        {"question_id": "nonexistent_01", "user_answer": "X"},
                        {"question_id": "a1_01", "user_answer": "A"},
                    ]
                },
                headers=auth_headers(registered_user["access_token"]),
            )

        # Should still succeed — invalid IDs are silently filtered
        assert response.status_code == 200, (
            f"Submit with mixed IDs failed: {response.text}"
        )


class TestGetAssessmentResult:
    """Tests for GET /api/v1/assessment/result."""

    async def test_get_result_no_assessment(
        self, client: AsyncClient, registered_user: dict, auth_headers
    ) -> None:
        """User with no prior assessment gets UNASSESSED default."""
        response = await client.get(
            "/api/v1/assessment/result",
            headers=auth_headers(registered_user["access_token"]),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["cefr_level"] == "UNASSESSED"
        assert data["listening_score"] == 0
        assert data["reading_score"] == 0

    async def test_get_result_with_prior_submission(
        self, client: AsyncClient, registered_user: dict, auth_headers
    ) -> None:
        """After submitting, the result endpoint returns the stored result."""
        q_response = await client.get("/api/v1/assessment/questions")
        questions = q_response.json()
        answers = [
            {"question_id": q["id"], "user_answer": q["correct_answer"]}
            for q in questions[:5]
        ]

        with patch.object(
            AssessmentService, "_call_deepseek", new_callable=AsyncMock
        ) as mock_ds:
            mock_ds.return_value = _make_ds_result("B2")

            submit_resp = await client.post(
                "/api/v1/assessment/submit",
                json={"answers": answers},
                headers=auth_headers(registered_user["access_token"]),
            )
            assert submit_resp.status_code == 200, f"Submit failed: {submit_resp.text}"

        # Now fetch the result (within the SAME test/db_session)
        result_response = await client.get(
            "/api/v1/assessment/result",
            headers=auth_headers(registered_user["access_token"]),
        )

        assert result_response.status_code == 200, (
            f"Result fetch failed: {result_response.text}"
        )
        result = result_response.json()
        assert result["cefr_level"] == "B2", (
            f"Expected B2, got {result['cefr_level']}"
        )
        assert result["listening_score"] > 0

    async def test_get_result_unauthenticated(
        self, client: AsyncClient
    ) -> None:
        """Get result without auth returns 401."""
        response = await client.get("/api/v1/assessment/result")

        assert response.status_code == 401
