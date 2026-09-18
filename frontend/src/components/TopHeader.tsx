import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  LogOut,
  Menu,
  Search,
  User as UserIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/lib/auth-context";

interface TopHeaderProps {
  onToggleMobileMenu: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ onToggleMobileMenu }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleLogout = async () => {
    setDropdownOpen(false);
    await logout();
    navigate("/");
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

  const renderBreadcrumbs = () => {
    const path = location.pathname;
    if (path === "/dashboard" || path.startsWith("/spaces")) {
      return null;
    }
    if (path.startsWith("/projects/")) {
      return (
        <div className="flex items-center space-x-1.5 text-xs text-text-muted">
          <Link to="/spaces" className="hover:text-text-primary transition-colors">
            Spaces
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-text-primary font-medium">Project Workspace</span>
        </div>
      );
    }
    if (path === "/analytics") {
      return <span className="text-sm font-semibold text-text-primary">Global Analytics</span>;
    }
    if (path === "/status") {
      return <span className="text-sm font-semibold text-text-primary">System Status</span>;
    }
    if (path === "/profile") {
      return <span className="text-sm font-semibold text-text-primary">Account Profile</span>;
    }
    if (path === "/admin") {
      const searchParams = new URLSearchParams(location.search);
      const tab = searchParams.get("tab") || "overview";
      const tabLabels: Record<string, string> = {
        overview: "System Overview",
        users: "Users & Tenancy",
        activity: "Audit & Activity",
        ai: "AI Observability",
        jobs: "Pipeline Health",
        evals: "AI Evaluations",
      };
      const label = tabLabels[tab] || "System Overview";
      return (
        <div className="flex items-center space-x-1.5 text-xs text-text-muted">
          <span className="text-accent font-semibold">Admin</span>
          <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-text-primary font-medium">{label}</span>
        </div>
      );
    }
    return null;
  };

  const displayName = user?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "lasya";
  const breadcrumbs = renderBreadcrumbs();

  return (
    <header className="h-16 border-b border-slate-200 dark:border-border bg-white dark:bg-surface backdrop-blur-md px-4 sm:px-8 flex items-center justify-between sticky top-0 z-40 transition-colors duration-200">
      {/* Left: Mobile Toggle + Breadcrumb (if present) */}
      <div className="flex items-center">
        <button
          onClick={onToggleMobileMenu}
          className="md:hidden p-1.5 mr-3 rounded-lg border border-slate-200 dark:border-border text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-surface-muted transition-colors"
          aria-label="Toggle navigation drawer"
        >
          <Menu className="w-4 h-4" />
        </button>
        {breadcrumbs && <div className="flex items-center mr-6">{breadcrumbs}</div>}
      </div>

      {/* Reference Search Bar - placed at left matching reference image */}
      <div className="hidden md:flex flex-1 max-w-lg mr-auto">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              location.pathname.startsWith("/spaces")
                ? "Search spaces, projects, or topics..."
                : "Search for concepts, projects, quizzes..."
            }
            className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-surface-muted border border-slate-200 dark:border-border rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-accent focus:bg-white dark:focus:bg-surface transition-all"
          />
        </div>
      </div>

      {/* Right: Theme Toggle + Bell Notification + User Avatar & Menu */}
      <div className="flex items-center space-x-3 sm:space-x-4">
        {/* Global Theme Toggle */}
        <ThemeToggle />

        {/* Notification Bell with Badge */}
        <div className="relative">
          <button
            type="button"
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-accent hover:bg-slate-100 dark:hover:bg-surface-muted transition-colors relative cursor-pointer"
            aria-label="Notifications"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-surface" />
          </button>
        </div>

        {/* User Avatar + Name + Dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="flex items-center space-x-2.5 p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-surface-muted transition-all cursor-pointer text-left"
            aria-label="User menu"
          >
            <div className="w-9 h-9 rounded-full bg-accent text-white font-bold text-sm flex items-center justify-center flex-shrink-0 shadow-xs">
              {getInitials()}
            </div>
            <div className="hidden sm:flex flex-col text-left leading-tight">
              <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white capitalize">
                {displayName}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-0.5">
                Keep Learning!
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </span>
            </div>
          </button>

          {/* Dropdown Menu */}
          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-52 rounded-2xl bg-white dark:bg-surface border border-slate-200 dark:border-border shadow-xl py-2 z-50 text-xs animate-in fade-in zoom-in-95">
                <div className="px-4 py-2 border-b border-slate-100 dark:border-border">
                  <p className="font-bold text-slate-900 dark:text-white truncate">
                    {user?.full_name || displayName}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
                </div>
                <Link
                  to="/profile"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-surface-muted transition-colors"
                >
                  <UserIcon className="w-4 h-4 text-accent" />
                  <span>Profile Settings</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors text-left font-medium"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Log out</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
