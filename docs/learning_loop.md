# The 12-Step Learning Loop: AI Study Companion

This document specifies the lifecycle and technical mechanics of the central continuous learning loop described in the PRD.

---

## 1. The Core Loop Overview

```
Space 
  ↓ 
Project 
  ↓ 
Learning Material 
  ↓ 
Document Processing 
  ↓ 
Knowledge / RAG 
  ↓ 
AI Tutor 
  ↓ 
Adaptive Quiz 
  ↓ 
Assessment 
  ↓ 
Concept Mastery 
  ↓ 
Growth Analysis 
  ↓ 
Recommendation 
  ↓ 
Continue Learning (Loop)
```

---

## 2. Step-by-Step Breakdown

| Step | Component | Responsibilities & Invariants |
|---|---|---|
| **1. Space** | `SpaceService` | Defines high-level domain. Grouping container for related projects. |
| **2. Project** | `ProjectService` | Establishes the bounded context and user learning goal. Enforces data isolation. |
| **3. Material** | `MaterialService` | Ingests PDF documents and persists files in Supabase Storage with status `queued`. |
| **4. Processing** | Celery Worker | Async task executes PDF text extraction/OCR, structural layout analysis, and chunking. |
| **5. Knowledge / RAG** | Vector Index | Generates 1536-dimensional embeddings with OpenAI API and stores them in `document_chunks` using `pgvector`. |
| **6. AI Tutor** | `AITutorWorkflow` | Answers learner queries using retrieved context with page citations. Expresses uncertainty when evidence is insufficient. |
| **7. Adaptive Quiz** | `QuizService` | Generates targeted multiple-choice and open-ended questions targeting current mastery gaps. |
| **8. Assessment** | `AssessmentWorkflow` | Evaluates qualitative student answers against rubrics, highlighting understood concepts vs missing points. |
| **9. Concept Mastery** | `MasteryService` | Updates estimated mastery percentages (0-100%) and confidence metrics across project concepts. |
| **10. Growth Analysis** | `AnalyticsService` | Categorizes concepts into `Improving`, `Stable`, and `Requiring Attention`. |
| **11. Recommendation** | `RecommendationService`| Computes the highest-leverage next action (e.g. "Review Page 14 of ML Notes, then re-test gradient descent"). |
| **12. Continue Learning**| Application Loop | Returns learner to the project dashboard or tutor with fresh context, closing the loop seamlessly. |

---

## 3. Grounded AI & Unsupported-Question Handling

A critical requirement from PRD Section 7 is handling questions when project materials lack sufficient evidence:

```
Learner Question
       ↓
Identify Project Context & Retrieve Evidence (pgvector)
       ↓
Is Evidence Sufficient?
 ┌─────┴────────────────────────────────┐
 YES                                   NO
 ↓                                     ↓
Generate Answer with                  Explain Insufficient Evidence
Exact Page Citations                  Suggest Relevant Material to Upload
```
