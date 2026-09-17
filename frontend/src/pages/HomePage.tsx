import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  FileText,
  FolderKanban,
  HelpCircle,
  Repeat,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const HomePage: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // If already logged in, redirect to dashboard
  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, navigate]);

  const features = [
    {
      icon: FolderKanban,
      title: "Learning Spaces & Projects",
      desc: "Organize wide subject domains into focused learning projects with target goals and dedicated progress tracking.",
    },
    {
      icon: FileText,
      title: "PDF Learning Materials",
      desc: "Upload textbooks, papers, and lecture slides with asynchronous OCR extraction, semantic chunking, and metadata parsing.",
    },
    {
      icon: Bot,
      title: "Grounded AI Tutor",
      desc: "Interactive conversational tutor providing verified, grounded answers strictly citing your uploaded source documents.",
    },
    {
      icon: HelpCircle,
      title: "Adaptive Quizzes",
      desc: "Dynamically generated multiple-choice and open-ended questions calibrated to your current knowledge gaps.",
    },
    {
      icon: Brain,
      title: "Concept Mastery",
      desc: "Bayesian-inspired mastery probability tracking across every core domain concept to identify strengths and weaknesses.",
    },
    {
      icon: TrendingUp,
      title: "Growth & Recommendations",
      desc: "Personalized, targeted study recommendations guiding you to the most impactful next step in your curriculum.",
    },
    {
      icon: BarChart3,
      title: "Learning Analytics",
      desc: "Comprehensive activity telemetry, study day streaks, quiz score progressions, and token observability.",
    },
  ];

  const learningLoop = [
    { step: "01", title: "Learn", desc: "Ingest textbooks, notes, and PDF materials into structured vector knowledge." },
    { step: "02", title: "Understand", desc: "Engage with the Grounded AI Tutor for interactive Q&A backed by exact citations." },
    { step: "03", title: "Practice", desc: "Test comprehension with adaptive quizzes tailored to key domain concepts." },
    { step: "04", title: "Evaluate", desc: "Receive automated qualitative assessment and rubrics on your submissions." },
    { step: "05", title: "Improve", desc: "Review actionable recommendations to reinforce weak areas and fill knowledge gaps." },
    { step: "06", title: "Repeat", desc: "Close the learning cycle with persistent mastery growth and zero context loss." },
  ];

  return (
    <div className="space-y-20 pb-16">
      {/* Hero Section */}
      <section className="pt-8 sm:pt-16 pb-8 text-center max-w-4xl mx-auto px-4">
        {/* Small Operational Status Indicator */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/40 border border-emerald-800/40 text-xs text-emerald-400 mb-6">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>All systems operational</span>
          <span className="text-gray-500">•</span>
          <Link to="/status" className="hover:underline flex items-center gap-1 font-medium">
            <span>View System Status</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Main Title */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-tight">
          AI Study Companion
        </h1>

        {/* Subtitle */}
        <p className="mt-4 text-lg sm:text-xl text-indigo-200/90 font-medium">
          Your personal AI-powered learning workspace.
        </p>

        {/* Supporting text */}
        <p className="mt-3 text-sm sm:text-base text-gray-400 max-w-2xl mx-auto leading-relaxed">
          Learn from your own materials, ask grounded questions, practice with adaptive quizzes,
          and track your understanding over time.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/signup"
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all shadow-md hover:shadow-indigo-500/20 flex items-center justify-center gap-2"
          >
            <span>Create Account</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/signin"
            className="w-full sm:w-auto px-6 py-3 rounded-xl border border-gray-800 bg-gray-900/60 hover:bg-gray-800 text-gray-200 font-semibold text-sm transition-colors flex items-center justify-center"
          >
            Sign In
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="max-w-6xl mx-auto px-4 scroll-mt-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Comprehensive Learning Architecture
          </h2>
          <p className="text-xs sm:text-sm text-gray-400 mt-2 max-w-xl mx-auto">
            Everything you need to master complex topics with rigorous AI grounding and measurable feedback.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, idx) => {
            const Icon = f.icon;
            return (
              <div
                key={idx}
                className="rounded-2xl border border-[#1e293b] bg-slate-900/50 p-6 hover:border-indigo-500/40 hover:bg-slate-900/80 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="p-3 rounded-xl bg-indigo-600/15 text-indigo-400 border border-indigo-500/25 w-fit mb-4">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-white tracking-tight">{f.title}</h3>
                  <p className="text-xs text-gray-400 mt-2 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Your Learning Loop Section */}
      <section className="max-w-5xl mx-auto px-4">
        <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-8 sm:p-10">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-3">
              <Repeat className="w-3.5 h-3.5" />
              <span>Continuous Improvement</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Your Learning Loop
            </h2>
            <p className="text-xs sm:text-sm text-gray-400 mt-2 max-w-lg mx-auto">
              A closed-feedback loop designed to ensure deep conceptual retention rather than passive reading.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {learningLoop.map((step, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-gray-800 bg-gray-950/60 p-4 flex flex-col justify-between hover:border-gray-700 transition-colors"
              >
                <div>
                  <span className="text-[11px] font-mono font-bold text-indigo-400">
                    Step {step.step}
                  </span>
                  <h3 className="text-sm font-bold text-white mt-1">{step.title}</h3>
                  <p className="text-xs text-gray-400 mt-2 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 pt-6 border-t border-gray-800/80 text-center">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shadow-sm"
            >
              <span>Get Started with AI Study Companion</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};
