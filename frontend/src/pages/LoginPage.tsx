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
      title: "AI Tutor with source citations",
      desc: "Grounded answers directly citing uploaded textbooks and lecture slides",
    },
    {
      icon: HelpCircle,
      title: "Adaptive quizzes & assessments",
      desc: "Dynamic practice calibrated to your current knowledge state",
    },
    {
      icon: TrendingUp,
      title: "Track mastery & growth",
      desc: "Bayesian concept mastery tracking over time with confidence estimates",
    },
    {
      icon: Lightbulb,
      title: "Get personalized recommendations",
      desc: "Targeted next steps to reinforce weak areas and accelerate learning",
    },
  ];

  return (
    <div className="max-w-4xl mx-auto my-8 sm:my-14 px-4 transition-colors">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left: Value Proposition & Benefit Cards */}
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
              Learn smarter. <br />
              <span className="text-accent">Grow faster.</span>
            </h1>
            <p className="text-xs sm:text-sm text-text-secondary mt-2 leading-relaxed">
              Turn your study material into personalized learning, practice, and measurable progress — with AI.
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
