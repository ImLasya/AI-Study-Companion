import React from "react";
import {
  Layers,
  BrainCircuit,
  CheckCircle2,
  Workflow,
} from "lucide-react";
import { SystemStatus } from "@/components/SystemStatus";

const learningLoopSteps = [
  { step: 1, title: "Space", desc: "Broad knowledge domain" },
  { step: 2, title: "Project", desc: "Focused learning journey" },
  { step: 3, title: "Learning Material", desc: "PDF & document ingestion" },
  { step: 4, title: "Document Processing", desc: "Async OCR, chunking, metadata" },
  { step: 5, title: "Knowledge / RAG", desc: "pgvector semantic embeddings" },
  { step: 6, title: "AI Tutor", desc: "Grounded responses with citations" },
  { step: 7, title: "Adaptive Quiz", desc: "Targeted MCQ & open questions" },
  { step: 8, title: "Assessment", desc: "Qualitative evaluation of understanding" },
  { step: 9, title: "Concept Mastery", desc: "Dynamic probability of mastery" },
  { step: 10, title: "Growth Analysis", desc: "Trend tracking & weak areas" },
  { step: 11, title: "Recommendation", desc: "Actionable next study step" },
  { step: 12, title: "Continue Learning", desc: "Loop closed without context loss" },
];

const phase0Checklist = [
  { name: "Monorepo & Environment Configuration", done: true },
  { name: "FastAPI Backend Scaffolding with CORS & Logging", done: true },
  { name: "SQLAlchemy 2.0 Async Engine & Sessionmaker", done: true },
  { name: "Docker Compose with PostgreSQL 16 & pgvector", done: true },
  { name: "Alembic Migrations Configured with pgvector Extension", done: true },
  { name: "Redis 7 & Celery Asynchronous Worker Scaffold", done: true },
  { name: "FastAPI Health Probes (/health, /health/ready, /health/db)", done: true },
  { name: "React + Vite + TypeScript Strict Mode + Tailwind CSS", done: true },
  { name: "Automated Pytest Suite with Async Client", done: true },
  { name: "Architecture & Data Model Documentation under docs/", done: true },
];

export const HomePage: React.FC = () => {
  return (
    <div className="space-y-8">
      {/* Hero / Intro Banner */}
      <div className="border border-gray-800 rounded-2xl bg-gradient-to-r from-gray-900 via-gray-900/90 to-indigo-950/40 p-8 shadow-sm">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-4">
            <Workflow className="w-3.5 h-3.5" /> Phase 0 Foundation Complete
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            AI Study Companion
          </h1>
          <p className="mt-3 text-base text-gray-300 leading-relaxed">
            A persistent, contextual, and measurable AI learning workspace designed to help users
            understand, practice, measure, and continuously improve a skill or area of knowledge.
          </p>
        </div>
      </div>

      {/* System Health Section */}
      <SystemStatus />

      {/* 2-Column Grid: Architecture Flow & Learning Loop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* System Architecture */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Layers className="w-5 h-5 text-indigo-400" />
              <h3 className="text-base font-semibold text-white">System Architecture</h3>
            </div>
            <p className="text-xs text-gray-400 mb-6">
              Clean separation of responsibilities between presentation, application, storage, and AI layers.
            </p>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 rounded-lg border border-gray-800 bg-gray-950/70 flex items-center justify-between">
                <span className="text-indigo-300 font-semibold">1. Frontend Layer</span>
                <span className="text-gray-400">React &bull; Vite &bull; Tailwind CSS</span>
              </div>
              <div className="flex justify-center text-gray-600">↓</div>
              <div className="p-3 rounded-lg border border-gray-800 bg-gray-950/70 flex items-center justify-between">
                <span className="text-sky-300 font-semibold">2. Application Layer</span>
                <span className="text-gray-400">FastAPI &bull; Pydantic v2 &bull; API v1</span>
              </div>
              <div className="flex justify-center text-gray-600">↓</div>
              <div className="p-3 rounded-lg border border-gray-800 bg-gray-950/70 flex items-center justify-between">
                <span className="text-emerald-300 font-semibold">3. Data & Storage Layer</span>
                <span className="text-gray-400">PostgreSQL 16 &bull; pgvector &bull; Alembic</span>
              </div>
              <div className="flex justify-center text-gray-600">↓</div>
              <div className="p-3 rounded-lg border border-gray-800 bg-gray-950/70 flex items-center justify-between">
                <span className="text-amber-300 font-semibold">4. Background Processing</span>
                <span className="text-gray-400">Redis 7 &bull; Celery Workers</span>
              </div>
              <div className="flex justify-center text-gray-600">↓</div>
              <div className="p-3 rounded-lg border border-gray-800 bg-gray-950/70 flex items-center justify-between">
                <span className="text-purple-300 font-semibold">5. AI & Evaluation Layer</span>
                <span className="text-gray-400">OpenAI &bull; LangGraph &bull; LangSmith</span>
              </div>
            </div>
          </div>
        </div>

        {/* Phase 0 Acceptance Checklist */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <h3 className="text-base font-semibold text-white">Phase 0 Scaffolding Checklist</h3>
            </div>
            <p className="text-xs text-gray-400 mb-6">
              Foundations established before implementing business features in Phase 1+.
            </p>

            <ul className="space-y-2.5 text-xs">
              {phase0Checklist.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-center gap-2.5 p-2 rounded-lg bg-gray-950/40 border border-gray-800/80"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span className="text-gray-300">{item.name}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* The 12-Step PRD Learning Loop */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-6">
        <div className="flex items-center gap-2 mb-2">
          <BrainCircuit className="w-5 h-5 text-indigo-400" />
          <h3 className="text-base font-semibold text-white">The PRD Core Learning Loop</h3>
        </div>
        <p className="text-xs text-gray-400 mb-6">
          The central continuous cycle connecting knowledge ingestion, intelligent tutoring, adaptive assessment, and personalized recommendations.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {learningLoopSteps.map((item) => (
            <div
              key={item.step}
              className="p-3.5 rounded-lg border border-gray-800/90 bg-gray-950/60 flex flex-col justify-between hover:border-gray-700 transition-colors"
            >
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 font-mono">
                  Step {item.step < 10 ? `0${item.step}` : item.step}
                </span>
                <h4 className="text-sm font-semibold text-gray-100 mt-1">{item.title}</h4>
              </div>
              <p className="text-xs text-gray-400 mt-2">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
