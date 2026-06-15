"""CEFR assessment service.

Manages question generation (pre-defined bank), DeepSeek-powered answer
evaluation, and result persistence. The question bank contains 24 curated
questions spanning all CEFR levels with mixed formats.
"""

import json
import logging
import random
from typing import Any, Dict, List

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.assessment import AssessmentRecord
from app.models.user import User, CEFRLevel
from app.schemas.assessment import (
    AssessmentAnswer,
    AssessmentQuestion,
    AssessmentQuestionOption,
    AssessmentResult,
    AssessmentSubmit,
)
from app.services.prompt_templates import generate_prompt

logger = logging.getLogger(__name__)

# ── Pre-defined question bank ──────────────────────────────────────────

# Each question has: id, type, prompt, options (for choice), correct_answer, and target CEFR level.
_QUESTION_BANK: List[Dict[str, Any]] = [
    # ── A1 (Beginner) ─────────────────────────────────────────────
    {
        "id": "a1_01", "type": "choice", "target_level": "A1",
        "prompt": "What is the correct word? 'I ___ a student.'",
        "options": [
            {"key": "A", "text": "am"},
            {"key": "B", "text": "is"},
            {"key": "C", "text": "are"},
            {"key": "D", "text": "be"},
        ],
        "correct_answer": "A",
    },
    {
        "id": "a1_02", "type": "choice", "target_level": "A1",
        "prompt": "Choose the correct answer: '___ name is John.'",
        "options": [
            {"key": "A", "text": "He"},
            {"key": "B", "text": "His"},
            {"key": "C", "text": "Him"},
            {"key": "D", "text": "He's"},
        ],
        "correct_answer": "B",
    },
    {
        "id": "a1_03", "type": "choice", "target_level": "A1",
        "prompt": "Choose: 'She ___ (like) apples.'",
        "options": [
            {"key": "A", "text": "likes"},
            {"key": "B", "text": "like"},
            {"key": "C", "text": "liked"},
            {"key": "D", "text": "liking"},
        ],
        "correct_answer": "A",
    },
    {
        "id": "a1_04", "type": "choice", "target_level": "A1",
        "prompt": "Choose: 'There ___ three books on the table.'",
        "options": [
            {"key": "A", "text": "is"},
            {"key": "B", "text": "are"},
            {"key": "C", "text": "am"},
            {"key": "D", "text": "be"},
        ],
        "correct_answer": "B",
    },
    # ── A2 (Elementary) ───────────────────────────────────────────
    {
        "id": "a2_01", "type": "choice", "target_level": "A2",
        "prompt": "Which sentence is correct?",
        "options": [
            {"key": "A", "text": "He didn't went to school."},
            {"key": "B", "text": "He didn't go to school."},
            {"key": "C", "text": "He not went to school."},
            {"key": "D", "text": "He no go to school."},
        ],
        "correct_answer": "B",
    },
    {
        "id": "a2_02", "type": "choice", "target_level": "A2",
        "prompt": "Choose: 'She ___ (visit) her grandmother last weekend.' (past simple)",
        "options": [
            {"key": "A", "text": "visited"},
            {"key": "B", "text": "visit"},
            {"key": "C", "text": "visits"},
            {"key": "D", "text": "visiting"},
        ],
        "correct_answer": "A",
    },
    {
        "id": "a2_03", "type": "choice", "target_level": "A2",
        "prompt": "Choose: 'I am ___ (tall) than my brother.' (comparative)",
        "options": [
            {"key": "A", "text": "taller"},
            {"key": "B", "text": "tall"},
            {"key": "C", "text": "more tall"},
            {"key": "D", "text": "tallest"},
        ],
        "correct_answer": "A",
    },
    {
        "id": "a2_04", "type": "choice", "target_level": "A2",
        "prompt": "Choose: 'Would you like ___ coffee?'",
        "options": [
            {"key": "A", "text": "some"},
            {"key": "B", "text": "any"},
            {"key": "C", "text": "a"},
            {"key": "D", "text": "much"},
        ],
        "correct_answer": "A",
    },
    # ── B1 (Intermediate) ─────────────────────────────────────────
    {
        "id": "b1_01", "type": "choice", "target_level": "B1",
        "prompt": "Choose: 'If I ___ rich, I would travel the world.'",
        "options": [
            {"key": "A", "text": "am"},
            {"key": "B", "text": "was"},
            {"key": "C", "text": "were"},
            {"key": "D", "text": "be"},
        ],
        "correct_answer": "C",
    },
    {
        "id": "b1_02", "type": "choice", "target_level": "B1",
        "prompt": "Choose: 'The book ___ (write) by Mark Twain in 1884.' (passive voice)",
        "options": [
            {"key": "A", "text": "was written"},
            {"key": "B", "text": "wrote"},
            {"key": "C", "text": "is writing"},
            {"key": "D", "text": "has written"},
        ],
        "correct_answer": "A",
    },
    {
        "id": "b1_03", "type": "choice", "target_level": "B1",
        "prompt": "Choose: 'I have been ___ (study) English for three years.'",
        "options": [
            {"key": "A", "text": "studying"},
            {"key": "B", "text": "study"},
            {"key": "C", "text": "studied"},
            {"key": "D", "text": "studies"},
        ],
        "correct_answer": "A",
    },
    {
        "id": "b1_04", "type": "choice", "target_level": "B1",
        "prompt": "Choose the best English translation: '我从来没有去过北京。'",
        "options": [
            {"key": "A", "text": "I have never been to Beijing."},
            {"key": "B", "text": "I never go to Beijing."},
            {"key": "C", "text": "I didn't go to Beijing."},
            {"key": "D", "text": "I wasn't in Beijing."},
        ],
        "correct_answer": "A",
    },
    # ── B2 (Upper-Intermediate) ───────────────────────────────────
    {
        "id": "b2_01", "type": "choice", "target_level": "B2",
        "prompt": "Choose the correct word: 'The new policy will ___ major changes in the company.'",
        "options": [
            {"key": "A", "text": "bring about"},
            {"key": "B", "text": "bring up"},
            {"key": "C", "text": "bring in"},
            {"key": "D", "text": "bring out"},
        ],
        "correct_answer": "A",
    },
    {
        "id": "b2_02", "type": "choice", "target_level": "B2",
        "prompt": "Choose: 'Not only ___ she finish early, but she also exceeded expectations.' (inversion)",
        "options": [
            {"key": "A", "text": "did"},
            {"key": "B", "text": "does"},
            {"key": "C", "text": "done"},
            {"key": "D", "text": "doing"},
        ],
        "correct_answer": "A",
    },
    {
        "id": "b2_03", "type": "choice", "target_level": "B2",
        "prompt": "Choose: 'Had I known about the meeting, I ___ (attend).' (third conditional)",
        "options": [
            {"key": "A", "text": "would have attended"},
            {"key": "B", "text": "would attend"},
            {"key": "C", "text": "will attend"},
            {"key": "D", "text": "attended"},
        ],
        "correct_answer": "A",
    },
    {
        "id": "b2_04", "type": "choice", "target_level": "B2",
        "prompt": "Choose the best English translation: '尽管下着大雨，他们还是继续了比赛。'",
        "options": [
            {"key": "A", "text": "Despite the heavy rain, they continued the match."},
            {"key": "B", "text": "Although heavy rain, they continued the match."},
            {"key": "C", "text": "Even if rain was heavy, they kept playing."},
            {"key": "D", "text": "Because of the rain, they played on."},
        ],
        "correct_answer": "A",
    },
    # ── C1 (Advanced) ─────────────────────────────────────────────
    {
        "id": "c1_01", "type": "choice", "target_level": "C1",
        "prompt": "Choose: 'The politician's speech was ___; it appealed to people's emotions rather than reason.'",
        "options": [
            {"key": "A", "text": "demagogic"},
            {"key": "B", "text": "demographic"},
            {"key": "C", "text": "democratic"},
            {"key": "D", "text": "demonstrative"},
        ],
        "correct_answer": "A",
    },
    {
        "id": "c1_02", "type": "choice", "target_level": "C1",
        "prompt": "Choose the best English translation: '这个理论的提出彻底改变了我们对宇宙起源的认知。'",
        "options": [
            {"key": "A", "text": "This theory fundamentally changed our understanding of the universe's origin."},
            {"key": "B", "text": "This theory proposed that we change our understanding."},
            {"key": "C", "text": "The universe's origin was proposed to change our cognition."},
            {"key": "D", "text": "We proposed changing the theory of universal origin."},
        ],
        "correct_answer": "A",
    },
    # ── C2 (Proficient) ───────────────────────────────────────────
    {
        "id": "c2_01", "type": "choice", "target_level": "C2",
        "prompt": "Choose: 'The author's ___ prose style, characterized by intricate sentence structures and erudite allusions, can be challenging for casual readers.'",
        "options": [
            {"key": "A", "text": "laconic"},
            {"key": "B", "text": "pellucid"},
            {"key": "C", "text": "sesquipedalian"},
            {"key": "D", "text": "vernacular"},
        ],
        "correct_answer": "C",
    },
    {
        "id": "c2_02", "type": "choice", "target_level": "C2",
        "prompt": "Choose the best English translation: '人工智能的快速发展迫使我们重新审视人类智能的本质以及意识本身的定义。'",
        "options": [
            {"key": "A", "text": "The rapid advancement of AI compels us to reexamine the nature of human intelligence and the definition of consciousness."},
            {"key": "B", "text": "AI development forces us to check human smartness and what awareness means."},
            {"key": "C", "text": "Fast AI makes us rethink human intelligence and its consciousness definition."},
            {"key": "D", "text": "The speed of artificial intelligence pushes us to redefine intelligence and awareness."},
        ],
        "correct_answer": "A",
    },
]


class AssessmentService:
    """Handles CEFR assessment evaluation and result management."""

    def generate_questions(self) -> List[AssessmentQuestion]:
        """Generate a set of 10 assessment questions spanning CEFR levels.

        Distribution: 2×A1, 2×A2, 2×B1, 2×B2, 1×C1, 1×C2.

        Questions are randomly selected from the pre-defined question bank
        for each level to provide variety across sessions.

        Returns:
            List of 10 AssessmentQuestion objects.
        """
        # Group the bank by target level.
        by_level: Dict[str, List[Dict[str, Any]]] = {}
        for q in _QUESTION_BANK:
            by_level.setdefault(q["target_level"], []).append(q)

        distribution = [
            ("A1", 2),
            ("A2", 2),
            ("B1", 2),
            ("B2", 2),
            ("C1", 1),
            ("C2", 1),
        ]

        questions: List[AssessmentQuestion] = []
        for level, count in distribution:
            pool = by_level.get(level, [])
            selected = random.sample(pool, min(count, len(pool)))
            for q in selected:
                options: List[AssessmentQuestionOption] | None = None
                if q.get("options"):
                    options = [
                        AssessmentQuestionOption(**opt)
                        for opt in q["options"]
                    ]
                questions.append(
                    AssessmentQuestion(
                        id=q["id"],
                        type=q["type"],
                        prompt=q["prompt"],
                        options=options,
                        correct_answer=q["correct_answer"],
                    )
                )

        return questions

    async def evaluate_answers(
        self, questions: List[AssessmentQuestion], answers: List[AssessmentAnswer]
    ) -> AssessmentResult:
        """Evaluate user answers using DeepSeek LLM for nuanced scoring.

        Builds a structured comparison of questions, correct answers, and user
        responses, then sends it to DeepSeek with the assessment_eval prompt.

        Args:
            questions: The questions that were presented to the user.
            answers: The user's submitted answers.

        Returns:
            AssessmentResult with CEFR level, per-skill scores, and recommendations.
        """
        questions_json = json.dumps(
            [
                {
                    "id": q.id,
                    "type": q.type,
                    "prompt": q.prompt,
                    "correct_answer": q.correct_answer,
                }
                for q in questions
            ],
            ensure_ascii=False,
        )
        answers_json = json.dumps(
            [{"question_id": a.question_id, "user_answer": a.user_answer} for a in answers],
            ensure_ascii=False,
        )

        system_prompt = generate_prompt(
            "assessment_eval",
            QUESTIONS_JSON=questions_json,
            ANSWERS_JSON=answers_json,
        )

        result = await self._call_deepseek(system_prompt)

        return AssessmentResult(
            cefr_level=CEFRLevel(result.get("cefr_level", "UNASSESSED")),
            listening_score=result.get("listening_score", 0),
            reading_score=result.get("reading_score", 0),
            speaking_score=result.get("speaking_score", 0),
            writing_score=result.get("writing_score", 0),
            grammar_score=result.get("grammar_score", 0),
            recommendations=result.get("recommendations", []),
        )

    async def submit_and_persist(
        self,
        db: AsyncSession,
        user: User,
        questions: List[AssessmentQuestion],
        answers: List[AssessmentAnswer],
    ) -> AssessmentResult:
        """Evaluate answers, persist the result, and update user CEFR level.

        Args:
            db: Active database session.
            user: The authenticated user.
            questions: Assessment questions presented.
            answers: User's submitted answers.

        Returns:
            AssessmentResult with the evaluation outcome.
        """
        result = await self.evaluate_answers(questions, answers)

        # Persist the assessment record.
        record = AssessmentRecord(
            user_id=user.id,
            result_level=result.cefr_level,
            listening_score=result.listening_score,
            reading_score=result.reading_score,
            speaking_score=result.speaking_score,
            writing_score=result.writing_score,
            grammar_score=result.grammar_score,
            raw_responses={
                "answers": [a.model_dump() for a in answers],
                "questions": [q.model_dump() for q in questions],
            },
        )
        db.add(record)

        # Update the user's CEFR level.
        user.cefr_level = result.cefr_level
        db.add(user)

        await db.commit()
        return result

    @staticmethod
    def _fallback_evaluate(
        questions: List[AssessmentQuestion], answers: List[AssessmentAnswer]
    ) -> AssessmentResult:
        """Fallback scoring: simple exact-match comparison when DeepSeek is unavailable.

        Maps each answer to its question and computes exact-match percentage.
        """
        answer_map = {a.question_id: a.user_answer.strip().lower() for a in answers}
        correct = 0
        for q in questions:
            expected = q.correct_answer.strip().lower()
            user_ans = answer_map.get(q.id, "").strip().lower()
            if user_ans == expected:
                correct += 1

        total = len(questions) or 1
        pct = correct / total * 100

        if pct >= 80:
            level = CEFRLevel.C2
        elif pct >= 60:
            level = CEFRLevel.C1
        elif pct >= 40:
            level = CEFRLevel.B2
        elif pct >= 25:
            level = CEFRLevel.B1
        elif pct >= 10:
            level = CEFRLevel.A2
        else:
            level = CEFRLevel.A1

        base_score = int(pct)
        return AssessmentResult(
            cefr_level=level,
            listening_score=base_score,
            reading_score=base_score,
            speaking_score=base_score,
            writing_score=base_score,
            grammar_score=base_score,
            recommendations=[
                "建议从基础词汇和简单句型开始学习",
                "多听英语材料，熟悉语音语调",
                "保持每日学习习惯，积累很重要",
            ],
        )

    async def _call_deepseek(self, system_prompt: str) -> Dict[str, Any]:
        """Call the DeepSeek API for assessment evaluation.

        Args:
            system_prompt: The filled evaluation prompt.

        Returns:
            Parsed JSON response dict.
        """
        headers = {
            "Authorization": f"Bearer {settings.deepseek_api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": "deepseek-chat",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": "Please evaluate the answers and return the result as JSON."},
            ],
            "temperature": 0.1,
            "max_tokens": 2000,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{settings.deepseek_base_url}/chat/completions",
                headers=headers,
                json=body,
            )
            if response.status_code != 200:
                logger.error(
                    "DeepSeek API returned %d: %s",
                    response.status_code,
                    response.text[:500],
                )
                raise RuntimeError(f"DeepSeek API error: {response.status_code}")

            data = response.json()
            content = data["choices"][0]["message"]["content"]

        # Parse the JSON from the response (strip markdown code fences if present).
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[-1]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()

        return json.loads(content)
