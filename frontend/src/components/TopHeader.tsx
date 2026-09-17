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
    if (path === "/dashboard") {
      return <span className="text-sm font-semibold text-white">Dashboard</span>;
    }
    if (path === "/spaces") {
      return <span className="text-sm font-semibold text-white">Learning Spaces</span>;
    }
    if (path.startsWith("/spaces/")) {
      return (
        <div className="flex items-center space-x-1.5 text-xs text-slate-400">
          <Link to="/spaces" className="hover:text-slate-200 transition-colors">
            Spaces
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-white font-medium">Space Details</span>
        </div>
      );
    }
    if (path.startsWith("/projects/")) {
      return (
        <div className="flex items-center space-x-1.5 text-xs text-slate-400">
          <Link to="/spaces" className="hover:text-slate-200 transition-colors">
            Spaces
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-white font-medium">Project Workspace</span>
        </div>
      );
    }
    if (path === "/analytics") {
      return <span className="text-sm font-semibold text-white">Global Analytics</span>;
    }
    if (path === "/status") {
      return <span className="text-sm font-semibold text-white">System Status</span>;
    }
    if (path === "/profile") {
      return <span className="text-sm font-semibold text-white">Account Profile</span>;
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
        <div className="flex items-center space-x-1.5 text-xs text-slate-400">
          <span className="text-purple-400 font-semibold">Admin</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-white font-medium">{label}</span>
        </div>
      );
    }
    return <span className="text-sm font-semibold text-white">AI Study Companion</span>;
  };

  return (
    <header className="h-14 border-b border-[#1e293b] bg-[#070a13]/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Left: Mobile Toggle + Breadcrumb */}
      <div className="flex items-center space-x-3">
        <button
          onClick={onToggleMobileMenu}
          className="md:hidden p-1.5 rounded-lg border border-[#1e293b] text-slate-400 hover:text-white hover:bg-slate-900"
          aria-label="Toggle navigation drawer"
        >
          <Menu className="w-4 h-4" />
        </button>
        <div className="flex items-center">{renderBreadcrumbs()}</div>
      </div>

      {/* Right: Search + Notifications + User Menu */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* Compact Search Input */}
        <div className="relative hidden md:block">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search anything..."
            className="w-44 lg:w-56 pl-8 pr-3 py-1.5 text-xs bg-slate-900/80 border border-[#1e293b] rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/80 focus:w-64 transition-all"
          />
        </div>

        {/* Small Operational Indicator */}
        <Link
          to="/status"
          className="hidden xl:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-950/40 border border-emerald-800/40 text-[11px] text-emerald-400 hover:bg-emerald-950/60 transition-colors"
          title="System Status"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Operational</span>
        </Link>



        {/* User Avatar + Name + Dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="flex items-center space-x-2 pl-2 pr-2 py-1 rounded-lg hover:bg-slate-900/80 border border-transparent hover:border-[#1e293b] transition-all text-xs text-slate-300 hover:text-white"
            aria-label="User menu"
          >
            <div className="w-6 h-6 rounded-md bg-indigo-600/25 border border-indigo-500/30 text-indigo-300 font-bold text-[10px] flex items-center justify-center flex-shrink-0">
              {getInitials()}
            </div>
            <span className="hidden sm:inline font-medium max-w-[120px] truncate">
              {user?.full_name || user?.email?.split("@")[0] || "User"}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {/* Dropdown Menu */}
          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-48 rounded-xl bg-slate-900 border border-[#1e293b] shadow-xl py-1 z-50 text-xs animate-in fade-in zoom-in-95">
                <div className="px-3 py-2 border-b border-[#1e293b]/80">
                  <p className="font-semibold text-white truncate">
                    {user?.full_name || "Account"}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
                </div>
                <Link
                  to="/profile"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
                >
                  <UserIcon className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Profile Settings</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-rose-400 hover:bg-rose-950/20 transition-colors text-left"
                >
                  <LogOut className="w-3.5 h-3.5" />
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
