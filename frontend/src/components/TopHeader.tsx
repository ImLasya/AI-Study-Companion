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
    if (path === "/dashboard") {
      return <span className="text-sm font-semibold text-text-primary">Dashboard</span>;
    }
    if (path === "/spaces") {
      return <span className="text-sm font-semibold text-text-primary">Learning Spaces</span>;
    }
    if (path.startsWith("/spaces/")) {
      return (
        <div className="flex items-center space-x-1.5 text-xs text-text-muted">
          <Link to="/spaces" className="hover:text-text-primary transition-colors">
            Spaces
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-text-primary font-medium">Space Details</span>
        </div>
      );
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
    return <span className="text-sm font-semibold text-text-primary">EduMind</span>;
  };

  return (
    <header className="h-14 border-b border-border bg-surface/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40 transition-colors duration-200">
      {/* Left: Mobile Toggle + Breadcrumb */}
      <div className="flex items-center space-x-3">
        <button
          onClick={onToggleMobileMenu}
          className="md:hidden p-1.5 rounded-lg border border-border text-text-muted hover:text-text-primary hover:bg-surface-muted transition-colors"
          aria-label="Toggle navigation drawer"
        >
          <Menu className="w-4 h-4" />
        </button>
        <div className="flex items-center">{renderBreadcrumbs()}</div>
      </div>

      {/* Right: Search + Status + Theme Toggle + User Menu */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* Compact Search Input */}
        <div className="relative hidden md:block">
          <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search anything..."
            className="w-44 lg:w-56 pl-8 pr-3 py-1.5 text-xs bg-surface-muted/80 border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/80 focus:w-64 transition-all"
          />
        </div>

        {/* Small Operational Indicator */}
        <Link
          to="/status"
          className="hidden xl:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[11px] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
          title="System Status"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Operational</span>
        </Link>

        {/* Global Theme Toggle */}
        <ThemeToggle />

        {/* User Avatar + Name + Dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="flex items-center space-x-2 pl-2 pr-2 py-1 rounded-lg hover:bg-surface-muted border border-transparent hover:border-border transition-all text-xs text-text-secondary hover:text-text-primary"
            aria-label="User menu"
          >
            <div className="w-6 h-6 rounded-md bg-accent/20 border border-accent/30 text-accent font-bold text-[10px] flex items-center justify-center flex-shrink-0">
              {getInitials()}
            </div>
            <span className="hidden sm:inline font-medium max-w-[120px] truncate">
              {user?.full_name || user?.email?.split("@")[0] || "User"}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
          </button>

          {/* Dropdown Menu */}
          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-48 rounded-xl bg-surface border border-border shadow-xl py-1 z-50 text-xs animate-in fade-in zoom-in-95">
                <div className="px-3 py-2 border-b border-border/80">
                  <p className="font-semibold text-text-primary truncate">
                    {user?.full_name || "Account"}
                  </p>
                  <p className="text-[11px] text-text-muted truncate">{user?.email}</p>
                </div>
                <Link
                  to="/profile"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-surface-muted transition-colors"
                >
                  <UserIcon className="w-3.5 h-3.5 text-accent" />
                  <span>Profile Settings</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-text-muted hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors text-left"
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
