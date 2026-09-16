# AI Study Companion — AI Quality Evaluation Harness

## 1. Overview & Purpose

The AI Quality Evaluation Harness provides an automated, deterministic test suite to validate the reliability, groundedness, and hallucination resistance of the AI operations in the AI Study Companion platform.

It is designed to run in two modes:
1. **Deterministic Mock Mode (Default)**: Uses `MockLLMProvider` with seeded responses to provide fast, 100% reproducible test runs for pytest, local development, and CI/CD without incurring Gemini API costs or hitting token quotas.
2. **Live Gemini Provider Mode**: Evaluates live responses from Google Gemini models (e.g., `gemini-2.5-flash`) for real-world prompt regressions and quality checks.

---

## 2. Rule-Based & Regex Judging Strategy (Deliberate Simplification)

> [!IMPORTANT]
> **Deliberate Design Simplification**:
> The evaluation harness deliberately employs **deterministic rule-based and regular expression judging** rather than model-based LLM-as-a-judge evaluation.

### Rationale:
1. **Zero Nondeterminism & Flakiness**: LLM-as-a-judge introduces stochastic scoring variance, temperature drift, and evaluation prompt sensitivity. Rule-based checks ensure identical inputs produce identical scores every run.
2. **CI/CD Independence**: Model-based judges require external API keys, network availability, and quota allowances. Regex and structural checks run in milliseconds completely offline.
3. **Cost & Latency Efficiency**: Evaluation suites can be run on every pull request without adding API charges or wait times.
4. **Transparent Failure Reasons**: Exact failure strings (e.g., missing citations, malformed JSON, out-of-bounds MCQ choices) are immediately apparent and debuggable.

### Future Evolution:
While rule-based judging satisfies Phase 6 requirements, future expansions may introduce hybrid judging where deterministic checks form Stage 1 and an LLM judge evaluates subjective semantic nuances in Stage 2.

---

## 3. Evaluation Test Suites

The test fixtures are located at [`backend/app/evaluations/fixtures/eval_test_cases.json`](file:///c:/Users/lasya/Desktop/ai-study-companion/backend/app/evaluations/fixtures/eval_test_cases.json) and cover three core suites:

### Suite 1: Grounded Retrieval (`groundedness`)
- **Objective**: Ensure the AI Tutor grounds its explanations strictly in the supplied source chunks and explicitly cites sources (e.g., `[Chunk 1]`, `[Chunk 2]`).
- **Scoring Rules**:
  - Requires presence of chunk citation references matching `\[(Chunk \d+|Material \w+)\]`.
  - Requires inclusion of key terminology present in the retrieved material chunks.
  - Penalizes unsupported claims.

### Suite 2: Hallucination Detection (`hallucination_detection`)
- **Objective**: Verify that when asked questions whose answers are absent from the context, the tutor explicitly declines or admits insufficient context rather than hallucinating facts.
- **Scoring Rules**:
  - Must match refusal patterns: `(?i)(not mentioned|insufficient context|not found in the provided|cannot be determined)`.
  - Fails if the model outputs affirmative false statements regarding unprovided context.

### Suite 3: Adaptive MCQ Generation (`mcq_generation`)
- **Objective**: Ensure generated questions conform to structural validity, distinct distractors, and valid schema.
- **Scoring Rules**:
  - Validates question text length (> 20 characters).
  - Validates exactly 4 distinct options labeled A, B, C, D.
  - Validates correct option pointer points to a valid option index (0 to 3).
  - Validates non-empty explanation grounding the correct choice.

---

## 4. Execution & API Access

### Backend Evaluation Runner
The evaluation runner is located at [`backend/app/evaluations/runner.py`](file:///c:/Users/lasya/Desktop/ai-study-companion/backend/app/evaluations/runner.py).

To execute via Python:
```python
from app.evaluations.runner import EvaluationRunner
from app.ai.providers import MockLLMProvider

runner = EvaluationRunner(provider=MockLLMProvider())
summary = await runner.run_all(session=db_session)
print(f"Pass Rate: {summary['overall_pass_rate']}%")
```

### Admin REST API Endpoints
All evaluation runs are recorded in PostgreSQL table `ai_evaluation_runs`:
- `GET /admin/evaluations`: Retrieve historical runs and latest test case breakdowns.
- `POST /admin/evaluations/run`: Trigger a new evaluation run (defaults to deterministic mock provider).

### Web UI
Administrators can trigger runs and inspect per-test case pass/fail scores, notes, and duration directly in the **AI Evaluations** tab of the `/admin` dashboard.

---

## 5. Known Limitations & Historical Telemetry Boundary

While all ongoing AI operations from Phase 6 forward log comprehensive latency, token counts, costs, and success flags directly into `ai_usage_logs`, the historical backfill has inherent data boundaries.

> [!NOTE]
> Specifically, historical AI telemetry backfilled during Migration 0007 could only recover past assistant responses from `tutor_messages` and recommendation records from `recommendations`; pre-Phase-6 LLM operations for `concept_extraction`, `quiz_question_generation`, and `open_ended_evaluation` could not be backfilled because granular per-call token, latency, and invocation metadata was not persisted prior to the introduction of `ai_usage_logs`.

