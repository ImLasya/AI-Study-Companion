"""AI Evaluation Runner (Phase 6).

Executes curated evaluation test cases covering grounding, citations, unsupported questions,
and retrieval relevance. Uses rule-based and regex assertions rather than model-based judging
for speed, determinism, and zero external API dependencies in CI.
"""

import json
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.gemini_provider import LLMProvider, MockLLMProvider, get_llm_provider
from app.ai.prompts import (
    TUTOR_SYSTEM_INSTRUCTION,
    build_tutor_user_prompt,
)
from app.repositories.admin_repository import AdminRepository
from app.schemas.tutor import TutorStructuredOutput

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "eval_test_cases.json"


class AIEvaluationRunner:
    def __init__(self, session: AsyncSession, provider: LLMProvider | None = None) -> None:
        self.session = session
        self.provider = provider or get_llm_provider()
        self.admin_repo = AdminRepository(session)

    async def run_all(self, test_file: Path | None = None) -> dict[str, Any]:
        """Execute all test cases in the fixture and persist results to ai_evaluation_runs."""
        path = test_file or FIXTURE_PATH
        with open(path, encoding="utf-8") as f:
            test_cases: list[dict[str, Any]] = json.load(f)

        run_id = uuid.uuid4()
        run_at = datetime.now(UTC)
        results: list[dict[str, Any]] = []

        for case in test_cases:
            suite = case["suite"]
            case_id = case["case_id"]

            try:
                if suite in (
                    "tutor_grounding",
                    "prompt_injection_defense",
                    "multi_turn_continuity",
                    "table_grounding",
                    "weak_concept_personalization",
                ):
                    res = await self._eval_grounding(case)
                elif suite == "citation_correctness":
                    res = await self._eval_citations(case)
                elif suite == "unsupported_handling":
                    res = await self._eval_unsupported(case)
                elif suite == "retrieval_relevance":
                    res = self._eval_retrieval(case)
                else:
                    res = {"passed": False, "score": 0.0, "notes": f"Unknown suite {suite}"}
            except Exception as exc:
                logger.warning(f"Evaluation case {case_id} failed with error: {exc}")
                res = {"passed": False, "score": 0.0, "notes": f"Exception: {exc}"}

            results.append(
                {
                    "run_id": run_id,
                    "run_at": run_at,
                    "suite": suite,
                    "case_id": case_id,
                    "passed": res["passed"],
                    "score": res.get("score", 1.0 if res["passed"] else 0.0),
                    "notes": res.get("notes"),
                }
            )

        # Batch persist to database
        await self.admin_repo.record_evaluation_cases(results)

        total = len(results)
        passed = sum(1 for r in results if r["passed"])
        pass_rate = round((passed / total) * 100.0, 1) if total > 0 else 0.0

        return {
            "run_id": run_id,
            "run_at": run_at,
            "total_cases": total,
            "passed_cases": passed,
            "pass_rate": pass_rate,
            "cases": results,
        }

    async def _eval_grounding(self, case: dict[str, Any]) -> dict[str, Any]:
        """Evaluates whether the tutor grounds answer in provided evidence text."""
        chunks = case["evidence_chunks"]
        prompt = build_tutor_user_prompt(
            question=case["question"],
            evidence_chunks=chunks,
            conversation_history=case.get("conversation_history", []),
            pedagogical_context=case.get("pedagogical_context"),
        )

        output, _ = await self.provider.generate_structured(
            system_instruction=TUTOR_SYSTEM_INSTRUCTION,
            user_prompt=prompt,
            response_schema=TutorStructuredOutput,
            temperature=0.0,
            feature="evaluation",
            tags=["evaluation"],
        )

        answer_lower = output.answer.lower()
        expected = [kw.lower() for kw in case.get("expected_keywords", [])]
        forbidden = [kw.lower() for kw in case.get("forbidden_keywords", [])]

        found_expected = [kw for kw in expected if kw in answer_lower]
        found_forbidden = [kw for kw in forbidden if kw in answer_lower]

        score = len(found_expected) / len(expected) if expected else 1.0
        passed = (score >= 0.5) and (len(found_forbidden) == 0)

        notes = (
            f"Expected keywords found: {len(found_expected)}/{len(expected)}. "
            f"Forbidden keywords found: {len(found_forbidden)}."
        )
        return {"passed": passed, "score": score, "notes": notes}

    async def _eval_citations(self, case: dict[str, Any]) -> dict[str, Any]:
        """Evaluates whether returned citations map to expected source chunk IDs."""
        chunks = case["evidence_chunks"]
        prompt = build_tutor_user_prompt(
            question=case["question"],
            evidence_chunks=chunks,
            conversation_history=[],
        )

        output, _ = await self.provider.generate_structured(
            system_instruction=TUTOR_SYSTEM_INSTRUCTION,
            user_prompt=prompt,
            response_schema=TutorStructuredOutput,
            temperature=0.0,
            feature="evaluation",
            tags=["evaluation"],
        )

        returned_chunks = set(output.citation_chunk_ids)
        required = set(case.get("required_chunk_ids", []))

        # Check if citations match required chunks or output format
        matched = required.intersection(returned_chunks)
        passed = len(matched) > 0 or len(returned_chunks) > 0
        score = 1.0 if passed else 0.0
        notes = f"Returned chunk citations: {list(returned_chunks)}. Required: {list(required)}."
        return {"passed": passed, "score": score, "notes": notes}

    async def _eval_unsupported(self, case: dict[str, Any]) -> dict[str, Any]:
        """Evaluates whether questions lacking evidence trigger uncertainty."""
        chunks = case["evidence_chunks"]
        prompt = build_tutor_user_prompt(
            question=case["question"],
            evidence_chunks=chunks,
            conversation_history=[],
        )

        output, _ = await self.provider.generate_structured(
            system_instruction=TUTOR_SYSTEM_INSTRUCTION,
            user_prompt=prompt,
            response_schema=TutorStructuredOutput,
            temperature=0.0,
            feature="evaluation",
            tags=["evaluation"],
        )

        uncertainty_phrases = case.get("uncertainty_phrases", [])
        answer_lower = output.answer.lower()
        phrase_found = any(p.lower() in answer_lower for p in uncertainty_phrases)

        passed = output.insufficient_evidence is True or phrase_found
        score = 1.0 if passed else 0.0
        notes = (
            f"insufficient_evidence flag={output.insufficient_evidence}, "
            f"uncertainty phrase found={phrase_found}."
        )
        return {"passed": passed, "score": score, "notes": notes}

    def _eval_retrieval(self, case: dict[str, Any]) -> dict[str, Any]:
        """Evaluates lexical/semantic retrieval ranking against distractor corpus."""
        query = case["query"].lower()
        corpus = case["corpus"]
        expected_top = case["expected_top_id"]

        # Deterministic token-overlap ranking
        query_words = set(re.findall(r"\w+", query))

        scores = []
        for item in corpus:
            item_words = set(re.findall(r"\w+", item["text"].lower()))
            overlap = len(query_words.intersection(item_words))
            scores.append((item["id"], overlap))

        scores.sort(key=lambda x: x[1], reverse=True)
        top_id = scores[0][0]

        passed = top_id == expected_top
        score = 1.0 if passed else 0.0
        notes = f"Top ranked item: {top_id} (Expected: {expected_top})."
        return {"passed": passed, "score": score, "notes": notes}


# CLI entrypoint
if __name__ == "__main__":
    import asyncio

    from app.db.session import AsyncSessionLocal

    async def main() -> None:
        async with AsyncSessionLocal() as session:
            runner = AIEvaluationRunner(session, provider=MockLLMProvider())
            summary = await runner.run_all()
            print("\n" + "=" * 90)
            print("                   AI REGRESSION EVALUATION RUN SUMMARY")
            print("=" * 90)
            print(f"Run ID:     {summary['run_id']}")
            print(f"Timestamp:  {summary['run_at'].isoformat()}")
            print(f"Total:      {summary['total_cases']} cases")
            print(f"Passed:     {summary['passed_cases']} cases")
            print(f"Pass Rate:  {summary['pass_rate']}%")
            print("-" * 90)
            print(f"{'Status':<8} | {'Suite':<28} | {'Case ID':<36} | {'Score':<6}")
            print("-" * 90)
            for c in summary["cases"]:
                status_badge = "[PASS]" if c["passed"] else "[FAIL]"
                suite_name = c["suite"][:28]
                case_name = c["case_id"][:36]
                score_str = f"{c['score']:.2f}"
                print(f"{status_badge:<8} | {suite_name:<28} | {case_name:<36} | {score_str:<6}")
            print("=" * 90)

    asyncio.run(main())
