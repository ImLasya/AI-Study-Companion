import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  Compass,
  FileText,
  HelpCircle,
  Layers,
  Network,
  Repeat,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const HomePage: React.FC = () => {
  const { user } = useAuth();

  const features = [
    {
      icon: Bot,
      title: "AI Tutor",
      desc: "Ask grounded questions about your study materials with exact document citations.",
      badge: "Grounded RAG",
      color: {
        iconBg: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
        badgeBg: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
        hoverBorder: "hover:border-indigo-500/40",
      },
    },
    {
      icon: HelpCircle,
      title: "Adaptive Quiz",
      desc: "Practice with multiple-choice and open-ended questions that adapt to your knowledge gaps.",
      badge: "Adaptive Practice",
      color: {
        iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
        badgeBg: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
        hoverBorder: "hover:border-blue-500/40",
      },
    },
    {
      icon: Brain,
      title: "Concept Mastery",
      desc: "Understand what you know and what needs improvement with Bayesian mastery scoring.",
      badge: "Bayesian Engine",
      color: {
        iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
        badgeBg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
        hoverBorder: "hover:border-emerald-500/40",
      },
    },
    {
      icon: Layers,
      title: "Flashcards",
      desc: "Review important concepts efficiently with automated SM-2 spaced repetition schedules.",
      badge: "Spaced Repetition",
      color: {
        iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
        badgeBg: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
        hoverBorder: "hover:border-amber-500/40",
      },
    },
    {
      icon: Compass,
      title: "Learning Plans",
      desc: "Follow a structured, milestone-driven learning roadmap tailored to your target exam.",
      badge: "Curriculum",
      color: {
        iconBg: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
        badgeBg: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
        hoverBorder: "hover:border-purple-500/40",
      },
    },
    {
      icon: Network,
      title: "Concept Maps",
      desc: "Visualize relationships and prerequisite dependencies between concepts in an interactive graph.",
      badge: "Knowledge Graph",
      color: {
        iconBg: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
        badgeBg: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20",
        hoverBorder: "hover:border-cyan-500/40",
      },
    },
  ];

  const workflowSteps = [
    {
      step: "01",
      title: "Add Material",
      desc: "Upload textbooks, lecture notes, or PDF study resources.",
      icon: FileText,
    },
    {
      step: "02",
      title: "Understand",
      desc: "Get interactive AI explanations backed by verified source citations.",
      icon: Bot,
    },
    {
      step: "03",
      title: "Practice",
      desc: "Test your comprehension with calibrated adaptive quizzes.",
      icon: HelpCircle,
    },
    {
      step: "04",
      title: "Master",
      desc: "Track concept mastery and pinpoint specific weak topics.",
      icon: Brain,
    },
    {
      step: "05",
      title: "Grow",
      desc: "Follow personalized recommendations to achieve academic goals.",
      icon: TrendingUp,
    },
  ];

  const whyPoints = [
    {
      title: "Grounded AI",
      desc: "Answers and explanations are strictly grounded in your uploaded materials — eliminating hallucinations and keeping learning authoritative.",
      icon: CheckCircle2,
    },
    {
      title: "Adaptive Practice",
      desc: "Quizzes dynamically adjust question difficulty and concept selection based on your previous mistakes and retention signals.",
      icon: Repeat,
    },
    {
      title: "Persistent Learning Context",
      desc: "Your conversation history, mastery scores, flashcard schedules, and study roadmaps carry forward across every study session.",
      icon: Layers,
    },
    {
      title: "Evidence-Based Growth",
      desc: "Track genuine conceptual comprehension with quantitative mastery probability curves rather than superficial completion meters.",
      icon: TrendingUp,
    },
  ];

  return (
    <div className="space-y-24 md:space-y-32 pb-24 overflow-x-hidden transition-colors duration-200">
      {/* ==================================================================== */}
      {/* 1. HERO SECTION                                                      */}
      {/* ==================================================================== */}
      <section className="relative pt-6 sm:pt-12 lg:pt-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Headline & Action Buttons */}
          <div className="lg:col-span-6 space-y-6 text-left">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent/10 border border-accent/25 text-accent text-xs font-semibold shadow-sm animate-fade-in-up">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Your AI Learning Companion</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.15] text-text-primary animate-fade-in-up animation-delay-100">
              Learn smarter. <br />
              <span className="bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 bg-clip-text text-transparent">
                Grow faster.
              </span>
            </h1>

            {/* Supporting Description */}
            <p className="text-base sm:text-lg text-text-secondary max-w-xl leading-relaxed animate-fade-in-up animation-delay-200">
              Turn your study material into personalized learning, practice, and progress with the power of AI.
            </p>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 animate-fade-in-up animation-delay-300">
              {user ? (
                <Link
                  to="/dashboard"
                  className="px-6 py-3.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold text-sm transition-all shadow-md shadow-indigo-500/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Continue Learning</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <Link
                  to="/signup"
                  className="px-6 py-3.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold text-sm transition-all shadow-md shadow-indigo-500/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Get Started</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}

              <a
                href="#features"
                className="px-6 py-3.5 rounded-xl border border-border bg-surface hover:bg-surface-muted text-text-primary font-semibold text-sm transition-colors text-center cursor-pointer shadow-sm"
              >
                Explore Features
              </a>
            </div>

            {/* Value Checkmark Bullets */}
            <div className="pt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-text-secondary animate-fade-in-up animation-delay-400">
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </span>
                <span>Upload your materials</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </span>
                <span>Learn with AI</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </span>
                <span>Track your progress</span>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Visual & Floating Feature Cards */}
          <div className="lg:col-span-6 relative flex items-center justify-center">
            {/* Ambient Background Gradient Glow */}
            <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 via-purple-500/10 to-transparent rounded-3xl filter blur-2xl pointer-events-none" />

            {/* Central Illustrated Card Container */}
            <div className="relative w-full max-w-[500px] rounded-3xl overflow-hidden border border-border bg-surface p-3 sm:p-4 shadow-xl animate-scale-in animation-delay-200">
              <img
                src="/hero-study-ai.jpg"
                alt="Student studying with AI Study Companion"
                className="w-full h-auto rounded-2xl object-cover"
                loading="eager"
              />
            </div>

            {/* Floating Card 1: Top-Left (Upload Materials) */}
            <div className="hidden sm:flex absolute -top-4 -left-4 xl:-left-8 items-center gap-3 px-4 py-2.5 rounded-2xl border border-border bg-surface/95 backdrop-blur-md shadow-lg transition-transform hover:scale-105 animate-float-slow">
              <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">Upload Materials</p>
                <p className="text-[10px] text-text-muted">PDFs, notes, textbooks</p>
              </div>
            </div>

            {/* Floating Card 2: Mid-Left (AI Tutor) */}
            <div className="hidden sm:flex absolute top-1/2 -left-6 xl:-left-12 -translate-y-1/2 items-center gap-3 px-4 py-2.5 rounded-2xl border border-border bg-surface/95 backdrop-blur-md shadow-lg transition-transform hover:scale-105 animate-float-reverse">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">AI Tutor</p>
                <p className="text-[10px] text-text-muted">Ask grounded questions</p>
              </div>
            </div>

            {/* Floating Card 3: Top-Right (Adaptive Quiz) */}
            <div className="hidden sm:flex absolute -top-4 -right-4 xl:-right-8 items-center gap-3 px-4 py-2.5 rounded-2xl border border-border bg-surface/95 backdrop-blur-md shadow-lg transition-transform hover:scale-105 animate-float-slow">
              <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <HelpCircle className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">Adaptive Quiz</p>
                <p className="text-[10px] text-text-muted">Practice & improve</p>
              </div>
            </div>

            {/* Floating Card 4: Bottom-Right (Track Progress) */}
            <div className="hidden sm:flex absolute -bottom-4 -right-4 xl:-right-6 items-center gap-3 px-4 py-2.5 rounded-2xl border border-border bg-surface/95 backdrop-blur-md shadow-lg transition-transform hover:scale-105 animate-float-reverse">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">Track Progress</p>
                <p className="text-[10px] text-text-muted">See your mastery grow</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 2. FEATURES SECTION                                                  */}
      {/* ==================================================================== */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 scroll-mt-20">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-accent/10 text-accent mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Academic Toolkit</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-text-primary tracking-tight">
            Everything you need to learn better
          </h2>
          <p className="mt-3 text-sm sm:text-base text-text-secondary leading-relaxed">
            Powerful tools to turn your study material into real understanding.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, idx) => {
            const Icon = f.icon;
            return (
              <div
                key={idx}
                className={`group rounded-2xl border border-border bg-surface p-6 sm:p-7 ${f.color.hoverBorder} hover:-translate-y-1 hover:shadow-lg transition-all duration-200 flex flex-col justify-between`}
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div className={`p-3 rounded-xl border ${f.color.iconBg} group-hover:scale-105 transition-transform`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className={`text-[10px] font-semibold font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-md border ${f.color.badgeBg}`}>
                      {f.badge}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-text-primary tracking-tight group-hover:text-accent transition-colors">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-text-secondary leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 3. HOW IT WORKS SECTION                                              */}
      {/* ==================================================================== */}
      <section id="how-it-works" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 scroll-mt-20">
        <div className="rounded-3xl border border-border bg-surface p-8 sm:p-12 lg:p-14 shadow-sm">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
              How It Works
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-text-secondary">
              A simple flow to turn your materials into mastery.
            </p>
          </div>

          {/* Steps Grid: Horizontal on Desktop, Vertical on Mobile */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 relative">
            {workflowSteps.map((step, idx) => {
              const StepIcon = step.icon;
              return (
                <div
                  key={idx}
                  className="relative flex flex-col items-center text-center p-4 rounded-2xl bg-surface-muted/60 border border-border/70 hover:border-accent/30 transition-colors"
                >
                  {/* Step Number Badge */}
                  <span className="text-[11px] font-mono font-bold text-accent mb-2">
                    {step.step}
                  </span>

                  {/* Icon */}
                  <div className="w-11 h-11 rounded-xl bg-surface border border-border flex items-center justify-center text-accent mb-3 shadow-sm">
                    <StepIcon className="w-5 h-5" />
                  </div>

                  {/* Step Title & Description */}
                  <h4 className="text-sm font-bold text-text-primary">{step.title}</h4>
                  <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 4. WHY AI STUDY COMPANION SECTION                                    */}
      {/* ==================================================================== */}
      <section id="why-us" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 scroll-mt-20">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
            Why AI Study Companion
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-text-secondary">
            Engineered specifically for academic rigor, source grounding, and continuous progress.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {whyPoints.map((pt, idx) => {
            const Icon = pt.icon;
            return (
              <div
                key={idx}
                className="p-6 rounded-2xl border border-border bg-surface flex items-start gap-4 hover:border-accent/30 transition-colors"
              >
                <div className="p-2.5 rounded-xl bg-accent/10 text-accent flex-shrink-0 mt-0.5">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-text-primary">{pt.title}</h3>
                  <p className="mt-1 text-xs sm:text-sm text-text-secondary leading-relaxed">
                    {pt.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 5. FINAL CALL TO ACTION                                              */}
      {/* ==================================================================== */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-3xl overflow-hidden border border-accent/30 bg-gradient-to-br from-indigo-900/20 via-purple-900/10 to-surface p-8 sm:p-12 text-center shadow-lg">
          <div className="max-w-xl mx-auto space-y-4">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-text-primary tracking-tight">
              Ready to learn smarter?
            </h2>
            <p className="text-sm sm:text-base text-text-secondary">
              Turn your study materials into a personalized learning journey.
            </p>
            <div className="pt-4 flex justify-center">
              {user ? (
                <Link
                  to="/dashboard"
                  className="px-7 py-3.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold text-sm transition-all shadow-md shadow-indigo-500/20 flex items-center gap-2"
                >
                  <span>Continue Learning</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <Link
                  to="/signup"
                  className="px-7 py-3.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold text-sm transition-all shadow-md shadow-indigo-500/20 flex items-center gap-2"
                >
                  <span>Get Started</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
