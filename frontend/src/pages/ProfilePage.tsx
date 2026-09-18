import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Copy,
  KeyRound,
  LogOut,
  Mail,
  Shield,
  User as UserIcon,
  Calendar,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const ProfilePage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [copiedId, setCopiedId] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const copyId = () => {
    if (user?.id) {
      navigator.clipboard.writeText(user.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const getInitials = () => {
    if (user?.full_name) {
      const parts = user.full_name.trim().split(" ");
      return parts.map((p) => p[0]).slice(0, 2).join("").toUpperCase();
    }
    if (user?.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return "U";
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return "N/A";
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back to Dashboard Navigation */}
      <div>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Dashboard</span>
        </Link>
      </div>

      {/* Open Profile Header Hero */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-6 border-b border-border">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 rounded-2xl bg-accent/15 border border-accent/25 text-accent font-bold text-xl flex items-center justify-center flex-shrink-0 shadow-sm">
            {getInitials()}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight">
                {user?.full_name || "User Profile"}
              </h1>
              <span className="text-[11px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-accent-soft text-accent border border-accent/20 font-semibold">
                {user?.role || "user"}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-1.5 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-text-muted" />
              <span>{user?.email}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-stretch sm:self-auto justify-end">
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border bg-surface text-xs font-medium text-text-secondary hover:text-rose-500 hover:border-rose-300 dark:hover:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Log out</span>
          </button>
        </div>
      </div>

      {/* Account Details & Session Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
        {/* User Identity - Open divider list */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2">
            <div className="p-1.5 rounded-lg bg-accent/10 text-accent">
              <UserIcon className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-semibold text-text-primary">Account Details</h2>
          </div>

          <div className="divide-y divide-border/60 text-xs">
            <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-text-muted">Full Name</span>
              <span className="text-text-primary font-medium">
                {user?.full_name || "Not specified"}
              </span>
            </div>

            <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-text-muted">Email Address</span>
              <span className="text-text-primary font-medium">
                {user?.email}
              </span>
            </div>

            <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-text-muted">Account ID</span>
              <div className="flex items-center gap-2 font-mono text-[11px] text-text-secondary">
                <span className="truncate max-w-[200px]">{user?.id || "N/A"}</span>
                <button
                  onClick={copyId}
                  className="p-1 rounded text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                  title="Copy Account ID"
                >
                  {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-text-muted">Member Since</span>
              <div className="text-text-secondary flex items-center gap-1.5 font-medium">
                <Calendar className="w-3.5 h-3.5 text-accent" />
                <span>{formatDate(user?.created_at)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Security & Permissions - Open informative rows */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
              <Shield className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-semibold text-text-primary">Security &amp; Session</h2>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-xl bg-surface-muted/60 border-l-2 border-emerald-500 space-y-1">
              <div className="text-text-secondary flex items-center justify-between">
                <span className="font-medium text-text-primary">Session Security</span>
                <span className="text-emerald-500 font-semibold text-[11px] bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  Active
                </span>
              </div>
              <p className="text-text-muted text-[11px]">
                HTTP-Only Secure Cookie Session with CSRF defense.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-surface-muted/60 border-l-2 border-accent space-y-1">
              <div className="text-text-secondary flex items-center justify-between">
                <span className="font-medium text-text-primary">Role Permissions</span>
                <span className="text-accent font-mono uppercase font-semibold text-[11px]">
                  {user?.role}
                </span>
              </div>
              <p className="text-text-muted text-[11px]">
                {user?.role === "admin"
                  ? "Full platform administrative and workspace privileges."
                  : "Full access to Spaces, Learning Materials, AI Tutor, and Quizzes."}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-surface-muted/40 flex items-start gap-2.5 text-text-muted text-[11px]">
              <KeyRound className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
              <span>
                Credentials, access tokens, and API keys are managed securely on the server and never exposed to the client.
              </span>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Link
              to="/dashboard"
              className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow-sm transition-all"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
