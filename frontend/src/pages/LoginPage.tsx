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

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/dashboard";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const loggedUser = await login(email, password);
      const destination = from === "/dashboard" && loggedUser?.role === "admin" ? "/admin" : from;
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
    <div className="max-w-4xl mx-auto my-8 sm:my-14 px-4">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left: Value Proposition & Benefit Cards */}
        <div className="lg:col-span-6 space-y-6">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <span className="font-bold text-base text-white tracking-tight block">
                AI Study Companion
              </span>
              <span className="text-xs text-slate-400 font-medium">
                Academic Learning Workspace
              </span>
            </div>
          </div>

          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
              Learn smarter. <br />
              <span className="text-indigo-400">Grow faster.</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-2 leading-relaxed">
              Turn your study material into personalized learning, practice, and measurable progress — with AI.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            {benefits.map((b, idx) => {
              const Icon = b.icon;
              return (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/40 border border-[#1e293b]"
                >
                  <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0 mt-0.5">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-white">{b.title}</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{b.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Login Card */}
        <div className="lg:col-span-6">
          <div className="rounded-2xl border border-[#1e293b] bg-slate-900/60 p-6 sm:p-8 shadow-xl">
            <div className="mb-6">
              <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-wider font-semibold">
                Sign In
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight mt-0.5">
                Welcome back
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Continue your learning journey
              </p>
            </div>

            {error && (
              <div className="mb-5 p-3 rounded-xl bg-rose-950/50 border border-rose-800/40 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Email address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-[#1e293b] text-white placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-[#1e293b] text-white placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm"
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

            <div className="mt-6 pt-4 border-t border-[#1e293b] text-center text-xs text-slate-400">
              Don't have an account?{" "}
              <Link to="/signup" className="text-indigo-400 hover:text-indigo-300 font-semibold">
                Create an account
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
