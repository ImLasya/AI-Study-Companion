import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const searchParams = new URLSearchParams(location.search);
  const redirectParam = searchParams.get("redirect");
  const statePathname = (location.state as { from?: { pathname: string; search?: string } })?.from?.pathname;
  const rawTarget = redirectParam || statePathname || "/dashboard";
  const targetPath = rawTarget.startsWith("/") && !rawTarget.startsWith("//") ? rawTarget : "/dashboard";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const loggedUser = await login(email, password);
      const destination = targetPath === "/dashboard" && loggedUser?.role === "admin" ? "/admin" : targetPath;
      navigate(destination, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to sign in";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const benefits = [
    {
      icon: Bot,
      color: "text-indigo-500 bg-indigo-500/10 ring-indigo-500/20",
      title: "AI Tutor with source citations",
      desc: "Grounded answers directly citing uploaded textbooks and lecture slides",
    },
    {
      icon: HelpCircle,
      color: "text-sky-500 bg-sky-500/10 ring-sky-500/20",
      title: "Adaptive quizzes & assessments",
      desc: "Dynamic practice calibrated to your current knowledge state",
    },
    {
      icon: TrendingUp,
      color: "text-emerald-500 bg-emerald-500/10 ring-emerald-500/20",
      title: "Track mastery & growth",
      desc: "Bayesian concept mastery tracking over time with confidence estimates",
    },
    {
      icon: Lightbulb,
      color: "text-amber-500 bg-amber-500/10 ring-amber-500/20",
      title: "Personalized study recommendations",
      desc: "Targeted next steps to reinforce weak areas and accelerate learning",
    },
  ];

  return (
    <div className="max-w-5xl mx-auto my-8 sm:my-16 px-4 transition-colors">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
        {/* Left: Open Value Proposition — no rectangular container boxes */}
        <div className="lg:col-span-6 space-y-7">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-accent/15 text-accent flex items-center justify-center font-bold shadow-sm">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-text-primary block">
                EduMind
              </span>
              <span className="text-[11px] text-text-muted font-medium">
                Intelligent Learning Workspace
              </span>
            </div>
          </div>

          <div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-text-primary tracking-tight leading-[1.15]">
              Turn learning into mastery.
            </h1>
            <p className="text-sm text-text-secondary mt-3 leading-relaxed max-w-md">
              Learn with AI, practice what matters, and track your progress every step of the way.
            </p>
          </div>

          {/* Open Feature Highlights — Clean rows with semantic icons, zero nested card boxes */}
          <div className="space-y-4 pt-1">
            {benefits.map((b, idx) => {
              const Icon = b.icon;
              return (
                <div key={idx} className="flex items-start gap-3.5 group">
                  <div className={`p-2 rounded-lg ring-1 shrink-0 mt-0.5 transition-transform group-hover:scale-105 ${b.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-text-primary tracking-tight">{b.title}</h3>
                    <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{b.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Open trust indicator */}
          <div className="pt-2 flex items-center gap-3 text-xs text-text-muted">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-muted text-[11px] font-medium text-text-secondary border border-border/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Grounded RAG + SM-2
            </span>
            <span>Zero hallucinated study advice</span>
          </div>
        </div>

        {/* Right: Login Card */}
        <div className="lg:col-span-6">
          <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-md transition-colors">
            <div className="mb-6">
              <span className="text-[10px] font-mono text-accent uppercase tracking-wider font-semibold">
                Sign In
              </span>
              <h2 className="text-xl font-bold text-text-primary tracking-tight mt-0.5">
                Welcome back
              </h2>
              <p className="text-xs text-text-muted mt-1">
                Continue your learning journey
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
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
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-border text-center text-xs text-text-muted">
              Don't have an account?{" "}
              <Link
                to={redirectParam ? `/signup?redirect=${encodeURIComponent(redirectParam)}` : "/signup"}
                className="text-accent hover:text-accent-hover font-semibold"
              >
                Create an account
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
