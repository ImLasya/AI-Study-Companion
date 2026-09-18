import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Bot,
  HelpCircle,
  Lightbulb,
  Loader2,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const SignupPage: React.FC = () => {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const searchParams = new URLSearchParams(location.search);
  const redirectParam = searchParams.get("redirect");
  const targetPath = redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//")
    ? redirectParam
    : "/dashboard";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await signup(email, password, fullName.trim() || undefined);
      navigate(targetPath, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const benefits = [
    {
      icon: Bot,
      title: "Grounded RAG AI Tutor",
      desc: "Answers verified against your exact uploaded notes and slides",
    },
    {
      icon: HelpCircle,
      title: "Adaptive Quizzes",
      desc: "Instant feedback, evaluations, and rubrics on every question",
    },
    {
      icon: TrendingUp,
      title: "Concept Mastery Tracking",
      desc: "Know exactly which topics you've mastered and where to focus",
    },
    {
      icon: Lightbulb,
      title: "Targeted Study Guidance",
      desc: "Personalized study recommendations to accelerate your learning",
    },
  ];

  return (
    <div className="max-w-4xl mx-auto my-8 sm:my-14 px-4 transition-colors">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left: Value Proposition */}
        <div className="lg:col-span-6 space-y-6">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-accent/15 text-accent border border-accent/25 rounded-xl">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <span className="font-bold text-base text-text-primary tracking-tight block">
                AI Study Companion
              </span>
              <span className="text-xs text-text-muted font-medium">
                Academic Learning Workspace
              </span>
            </div>
          </div>

          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-text-primary tracking-tight leading-tight">
              Start your journey. <br />
              <span className="text-accent">Master any subject.</span>
            </h1>
            <p className="text-xs sm:text-sm text-text-secondary mt-2 leading-relaxed">
              Create an account to organize your spaces, upload textbooks, and start practicing with your grounded AI companion.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            {benefits.map((b, idx) => {
              const Icon = b.icon;
              return (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3 rounded-xl bg-surface-muted/60 border border-border/70 shadow-sm"
                >
                  <div className="p-1.5 rounded-lg bg-accent/15 text-accent border border-accent/25 shrink-0 mt-0.5">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-text-primary">{b.title}</h3>
                    <p className="text-[11px] text-text-muted mt-0.5 leading-snug">{b.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Signup Card */}
        <div className="lg:col-span-6">
          <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-md transition-colors">
            <div className="mb-6">
              <span className="text-[10px] font-mono text-accent uppercase tracking-wider font-semibold">
                Get Started
              </span>
              <h2 className="text-xl font-bold text-text-primary tracking-tight mt-0.5">
                Create your account
              </h2>
              <p className="text-xs text-text-muted mt-1">
                Start your structured learning workspace
              </p>
            </div>

            {error && (
              <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Lasya"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-muted border border-border text-text-primary placeholder-text-muted text-xs focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Email address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-muted border border-border text-text-primary placeholder-text-muted text-xs focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-muted border border-border text-text-primary placeholder-text-muted text-xs focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 py-2.5 px-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating account...</span>
                  </>
                ) : (
                  <>
                    <span>Create Account</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-border text-center text-xs text-text-muted">
              Already have an account?{" "}
              <Link
                to={redirectParam ? `/signin?redirect=${encodeURIComponent(redirectParam)}` : "/signin"}
                className="text-accent hover:text-accent-hover font-semibold"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
