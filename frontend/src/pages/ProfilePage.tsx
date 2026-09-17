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

      {/* Header Profile Summary Card */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 font-bold text-xl flex items-center justify-center flex-shrink-0 shadow-sm">
              {getInitials()}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  {user?.full_name || "User Profile"}
                </h1>
                <span className="text-[11px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                  {user?.role || "user"}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-gray-500" />
                <span>{user?.email}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-stretch sm:self-auto justify-end">
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-gray-800 bg-gray-950/60 text-xs font-medium text-gray-300 hover:text-rose-400 hover:border-rose-900/40 hover:bg-rose-950/20 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Log out</span>
            </button>
          </div>
        </div>
      </div>

      {/* Account Details & Session Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* User Identity Card */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-800">
            <UserIcon className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">Account Details</h2>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-gray-500 block mb-1">Full Name</label>
              <div className="text-gray-200 font-medium px-3 py-2 rounded-lg bg-gray-950/60 border border-gray-800/80">
                {user?.full_name || "Not specified"}
              </div>
            </div>

            <div>
              <label className="text-gray-500 block mb-1">Email Address</label>
              <div className="text-gray-200 font-medium px-3 py-2 rounded-lg bg-gray-950/60 border border-gray-800/80">
                {user?.email}
              </div>
            </div>

            <div>
              <label className="text-gray-500 block mb-1">Account ID</label>
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-950/60 border border-gray-800/80 font-mono text-[11px] text-gray-300">
                <span className="truncate mr-2">{user?.id || "N/A"}</span>
                <button
                  onClick={copyId}
                  className="p-1 rounded text-gray-400 hover:text-white transition-colors"
                  title="Copy Account ID"
                >
                  {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-gray-500 block mb-1">Member Since</label>
              <div className="text-gray-300 px-3 py-2 rounded-lg bg-gray-950/60 border border-gray-800/80 flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                <span>{formatDate(user?.created_at)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Security & Permissions Card */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 pb-3 border-b border-gray-800">
              <Shield className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-white">Security &amp; Session</h2>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-gray-950/60 border border-gray-800/80 space-y-1">
                <div className="text-gray-400 flex items-center justify-between">
                  <span>Session Type</span>
                  <span className="text-emerald-400 font-medium">Active</span>
                </div>
                <div className="text-gray-300 font-mono text-[11px]">
                  HTTP-Only Secure Cookie Session
                </div>
              </div>

              <div className="p-3 rounded-lg bg-gray-950/60 border border-gray-800/80 space-y-1">
                <div className="text-gray-400 flex items-center justify-between">
                  <span>Role Permissions</span>
                  <span className="text-indigo-400 font-mono uppercase">{user?.role}</span>
                </div>
                <div className="text-gray-400 text-[11px]">
                  {user?.role === "admin"
                    ? "Full platform administrative and workspace privileges"
                    : "Full access to Spaces, Learning Materials, AI Tutor, and Quizzes"}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-gray-950/60 border border-gray-800/80 flex items-start gap-2 text-gray-400 text-[11px]">
                <KeyRound className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                <span>
                  Credentials, access tokens, and API keys are managed securely on the server and never exposed in the browser.
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-800/80 flex justify-end">
            <Link
              to="/dashboard"
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
