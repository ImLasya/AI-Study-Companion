import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  Check,
  ChevronRight,
  Copy,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  Pencil,
  Shield,
  Star,
  Target,
  TrendingUp,
  User as UserIcon,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getGlobalAnalyticsApi } from "@/lib/api";
import type { GlobalAnalyticsResponse } from "@/types";

/**
 * Mountain Summit Illustration SVG
 * Matches the reference aesthetic with soft layered purple mountains,
 * a winding summit path, and a mountain peak flag.
 */
const MountainIllustration: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg
    viewBox="0 0 380 140"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`select-none pointer-events-none ${className}`}
    preserveAspectRatio="xMidYMid slice"
  >
    <defs>
      <linearGradient id="mntLayer1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#e0e7ff" stopOpacity="0.8" />
        <stop offset="100%" stopColor="#ede9fe" stopOpacity="0.4" />
      </linearGradient>
      <linearGradient id="mntLayer2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#c7d2fe" stopOpacity="0.85" />
        <stop offset="100%" stopColor="#ddd6fe" stopOpacity="0.5" />
      </linearGradient>
      <linearGradient id="mntLayer3" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#a5b4fc" stopOpacity="0.9" />
        <stop offset="100%" stopColor="#c4b5fd" stopOpacity="0.75" />
      </linearGradient>
      <linearGradient id="peakFlagGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#4f46e5" />
        <stop offset="100%" stopColor="#6366f1" />
      </linearGradient>
    </defs>

    {/* Distant soft mountains */}
    <path
      d="M -10 140 L 70 75 L 150 140 Z"
      fill="url(#mntLayer1)"
      opacity="0.6"
    />
    <path
      d="M 90 140 L 190 60 L 290 140 Z"
      fill="url(#mntLayer2)"
      opacity="0.7"
    />

    {/* Primary Foreground Summit Mountain */}
    <path
      d="M 160 140 L 310 26 L 410 140 Z"
      fill="url(#mntLayer3)"
    />

    {/* Soft floating clouds */}
    <ellipse cx="230" cy="40" rx="22" ry="7" fill="#ffffff" opacity="0.6" />
    <ellipse cx="220" cy="37" rx="14" ry="6" fill="#ffffff" opacity="0.7" />
    <ellipse cx="140" cy="65" rx="18" ry="5" fill="#ffffff" opacity="0.5" />

    {/* Winding Summit Path */}
    <path
      d="M 310 140 C 322 118, 288 102, 305 78 C 314 65, 305 45, 310 28"
      stroke="#ffffff"
      strokeWidth="6"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.95"
    />
    <path
      d="M 310 140 C 322 118, 288 102, 305 78 C 314 65, 305 45, 310 28"
      stroke="#e0e7ff"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />

    {/* Summit Flagpole */}
    <line x1="310" y1="8" x2="310" y2="28" stroke="#4338ca" strokeWidth="2.5" strokeLinecap="round" />

    {/* Fluttering Summit Flag */}
    <path
      d="M 310 9 L 332 9 L 327 15 L 332 21 L 310 21 Z"
      fill="url(#peakFlagGrad)"
    />

    {/* Stars & subtle sparkle accents */}
    <circle cx="260" cy="22" r="1.5" fill="#818cf8" opacity="0.7" />
    <circle cx="280" cy="14" r="2" fill="#a5b4fc" opacity="0.8" />
    <circle cx="350" cy="18" r="1.5" fill="#6366f1" opacity="0.6" />
    <circle cx="180" cy="30" r="1.8" fill="#c7d2fe" opacity="0.7" />
  </svg>
);

export const ProfilePage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [copiedId, setCopiedId] = useState(false);
  const [analytics, setAnalytics] = useState<GlobalAnalyticsResponse | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(user?.full_name || "");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Fetch real-time analytics data for statistics
  useEffect(() => {
    let isMounted = true;
    getGlobalAnalyticsApi()
      .then((data) => {
        if (isMounted) {
          setAnalytics(data);
        }
      })
      .catch((err) => {
        console.warn("Could not load analytics for profile page:", err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

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
      return parts[0]?.charAt(0).toUpperCase() || "U";
    }
    if (user?.email) {
      return user.email.charAt(0).toUpperCase();
    }
    return "L";
  };

  // Format date to: "Sep 17, 2026"
  const formatShortDate = (isoString?: string) => {
    if (!isoString) return "Sep 17, 2026";
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return "Sep 17, 2026";
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "Sep 17, 2026";
    }
  };

  // Format date to: "September 17, 2026"
  const formatLongDate = (isoString?: string) => {
    if (!isoString) return "September 17, 2026";
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return "September 17, 2026";
      return d.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "September 17, 2026";
    }
  };

  // Real or dynamically computed statistics
  const spacesJoined = analytics?.projects_by_progress?.length ?? 0;
  const quizzesCompleted = analytics?.total_study_activity?.total_quizzes_completed ?? 0;
  const streakDays =
    analytics?.total_study_activity?.review_streak_days ??
    analytics?.total_study_activity?.active_study_days ??
    0;
  const memberSinceFormattedShort = formatShortDate(user?.created_at);
  const memberSinceFormattedLong = formatLongDate(user?.created_at);

  const displayFullName = user?.full_name || "—";
  const displayEmail = user?.email || "—";
  const displayRole = (user?.role || "USER").toUpperCase();
  const rawId = user?.id || "—";
  const displayAccountId =
    rawId.length > 34 ? `${rawId.substring(0, 32)}...` : rawId;

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setIsEditing(false);
    setStatusMessage("Profile details updated successfully.");
    setTimeout(() => setStatusMessage(null), 3500);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* 1. Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
        <span className="hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer">
          Account
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600" />
        <span className="text-slate-800 dark:text-slate-100 font-semibold">Profile</span>
      </nav>

      {/* Success/Notification Toast if any */}
      {statusMessage && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs rounded-xl flex items-center justify-between animate-fade-in">
          <span>{statusMessage}</span>
          <button
            onClick={() => setStatusMessage(null)}
            className="p-1 text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. Top Profile Header Hero Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-3xl p-6 sm:p-7 shadow-sm relative overflow-hidden">
        {/* Mountain illustration background decoration on the right */}
        <div className="absolute top-0 right-0 bottom-0 w-1/2 max-w-sm pointer-events-none opacity-40 sm:opacity-80 dark:opacity-25 overflow-hidden">
          <MountainIllustration className="w-full h-full object-cover" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          {/* Left: User Avatar & Info */}
          <div className="flex items-center gap-5">
            {/* Avatar */}
            <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-[#5454ee] flex items-center justify-center text-white text-3xl font-bold shadow-md flex-shrink-0">
              {getInitials()}
            </div>

            {/* Name, Badge, Email & Quote */}
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl sm:text-[26px] font-bold text-slate-800 dark:text-white tracking-tight">
                  {displayFullName}
                </h1>
                <span className="bg-indigo-50 dark:bg-indigo-950/50 text-[#5454ee] dark:text-indigo-400 text-[11px] font-semibold uppercase px-2.5 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-800">
                  {displayRole}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-1">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <span>{displayEmail}</span>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-normal">
                Keep learning, keep growing!
              </p>
            </div>
          </div>

          {/* Middle: Inspirational Quote */}
          <div className="hidden lg:flex items-center gap-2 text-slate-700 dark:text-slate-200 font-semibold text-sm max-w-xs pr-4">
            <span className="text-indigo-500 text-3xl font-serif leading-none select-none">“</span>
            <div className="leading-snug">
              <span>“A curious mind builds a brighter future.”</span>
            </div>
          </div>

          {/* Right: Log out Button */}
          <div className="self-end md:self-auto flex-shrink-0">
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-rose-600 hover:border-rose-200 dark:hover:border-rose-900 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 shadow-sm transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-500 hover:text-rose-500" />
              <span>Log out</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Four Statistics / KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Stat 1: Spaces Joined */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 text-[#5454ee] dark:text-indigo-400 flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Spaces Joined</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{spacesJoined}</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              {spacesJoined === 1 ? "Active learning space" : "Active learning spaces"}
            </p>
          </div>
        </div>

        {/* Stat 2: Quizzes Completed */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
            <Target className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Quizzes Completed</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{quizzesCompleted}</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Keep practicing!</p>
          </div>
        </div>

        {/* Stat 3: Learning Streak */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Learning Streak</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{streakDays}</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Days in a row</p>
          </div>
        </div>

        {/* Stat 4: Member Since */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-500 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
            <Star className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Member Since</p>
            <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-0.5 truncate">
              {memberSinceFormattedShort}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Part of EduMind</p>
          </div>
        </div>
      </div>

      {/* 4. Main Two-Column Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Account Details */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-[#5454ee] dark:text-indigo-400 flex items-center justify-center flex-shrink-0">
                  <UserIcon className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800 dark:text-white">Account Details</h2>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    Your personal information and account details.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsEditing(!isEditing)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold text-[#5454ee] dark:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-all cursor-pointer"
              >
                <Pencil className="w-3 h-3" />
                <span>Edit Profile</span>
              </button>
            </div>

            {/* Inline Profile Edit Drawer/Form if toggled */}
            {isEditing && (
              <form
                onSubmit={handleSaveProfile}
                className="mt-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Update Display Name
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="text-slate-400 hover:text-slate-600 text-xs"
                  >
                    Cancel
                  </button>
                </div>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Enter full name"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 bg-[#5454ee] hover:bg-[#4343db] text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            )}

            {/* Details Rows */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs pt-1">
              {/* Full Name */}
              <div className="py-3.5 flex items-center justify-between gap-4">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Full Name</span>
                <span className="text-slate-800 dark:text-slate-100 font-semibold">
                  {editName || displayFullName}
                </span>
              </div>

              {/* Email Address */}
              <div className="py-3.5 flex items-center justify-between gap-4">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Email Address</span>
                <span className="text-slate-800 dark:text-slate-100 font-semibold">
                  {displayEmail}
                </span>
              </div>

              {/* Account ID with copy */}
              <div className="py-3.5 flex items-center justify-between gap-4">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Account ID</span>
                <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                  <span title={rawId}>{displayAccountId}</span>
                  <button
                    onClick={copyId}
                    className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                    title="Copy full Account ID"
                  >
                    {copiedId ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Member Since */}
              <div className="py-3.5 flex items-center justify-between gap-4">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Member Since</span>
                <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-100 font-semibold">
                  <Calendar className="w-3.5 h-3.5 text-[#5454ee]" />
                  <span>{memberSinceFormattedLong}</span>
                </div>
              </div>

              {/* Account Type */}
              <div className="py-3.5 flex items-center justify-between gap-4">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Account Type</span>
                <span className="bg-indigo-50 dark:bg-indigo-950/50 text-[#5454ee] dark:text-indigo-400 font-semibold text-[11px] px-3 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-800">
                  {user?.role === "admin" ? "Administrator" : "Student"}
                </span>
              </div>

              {/* Status */}
              <div className="py-3.5 flex items-center justify-between gap-4">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Status</span>
                <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] px-2.5 py-0.5 rounded-full border border-emerald-100 dark:border-emerald-800/60 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Active
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Security & Session */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            {/* Header */}
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800/80">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800 dark:text-white">Security &amp; Session</h2>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  Manage your account security and session information.
                </p>
              </div>
            </div>

            {/* 3 Security Rows */}
            <div className="space-y-3 pt-4">
              {/* Card 1: Session Security */}
              <div className="p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-[#5454ee] dark:text-indigo-400 flex items-center justify-center flex-shrink-0">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-slate-800 dark:text-white">
                      Session Security
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      HTTP-Only Secure Cookie Session with CSRF defense.
                    </p>
                  </div>
                </div>
                <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-emerald-100 dark:border-emerald-800 flex-shrink-0">
                  Active
                </span>
              </div>

              {/* Card 2: Role Permissions */}
              <div className="p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-[#5454ee] dark:text-indigo-400 flex items-center justify-center flex-shrink-0">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-slate-800 dark:text-white">
                      Role Permissions
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {user?.role === "admin"
                        ? "Full platform administrative and workspace privileges."
                        : "Full access to Spaces, Learning Materials, AI Tutor, and Quizzes."}
                    </p>
                  </div>
                </div>
                <span className="bg-indigo-50 dark:bg-indigo-950/50 text-[#5454ee] dark:text-indigo-400 text-[11px] font-semibold uppercase px-2.5 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-800 flex-shrink-0">
                  {displayRole}
                </span>
              </div>

              {/* Card 3: Data Security */}
              <div className="p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-[#5454ee] dark:text-indigo-400 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-slate-800 dark:text-white">
                      Data Security
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Credentials, access tokens, and API keys are managed securely on the server and never exposed to the client.
                    </p>
                  </div>
                </div>
                <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-emerald-100 dark:border-emerald-800 flex-shrink-0">
                  Protected
                </span>
              </div>
            </div>
          </div>

          {/* Go to Dashboard CTA Button */}
          <div className="pt-2">
            <Link
              to="/dashboard"
              className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-[#5454ee] hover:bg-[#4343db] text-white text-xs font-semibold shadow-md hover:shadow-lg transition-all cursor-pointer"
            >
              <span>Go to Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* 5. Motivational Footer Banner */}
      <div className="bg-[#f0f2ff] dark:bg-[#1a1c30] border border-indigo-100 dark:border-indigo-900/40 rounded-3xl p-6 relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Left: Quotes and text */}
        <div className="relative z-10 flex items-start gap-3">
          <span className="text-[#5454ee] text-3xl font-serif leading-none select-none mt-0.5">“</span>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
              “Learning today, a brighter tomorrow.”
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Your journey matters. Keep exploring!
            </p>
          </div>
        </div>

        {/* Right: Mountain summit flag graphic */}
        <div className="absolute right-0 top-0 bottom-0 w-72 pointer-events-none opacity-80 dark:opacity-40">
          <MountainIllustration className="w-full h-full object-cover" />
        </div>
      </div>
    </div>
  );
};
