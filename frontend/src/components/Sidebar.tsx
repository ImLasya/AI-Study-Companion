import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  BarChart3,
  BookOpen,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Server,
  Sparkles,
  User as UserIcon,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

interface SidebarProps {
  onCloseMobile?: () => void;
}

const ADMIN_NAV_ITEMS = [
  {
    key: "overview",
    label: "System Overview",
    icon: BarChart3,
    path: "/admin?tab=overview",
  },
  {
    key: "users",
    label: "Users & Tenancy",
    icon: Users,
    path: "/admin?tab=users",
  },
  {
    key: "activity",
    label: "Audit & Activity",
    icon: Activity,
    path: "/admin?tab=activity",
  },
  {
    key: "ai",
    label: "AI Observability",
    icon: Zap,
    path: "/admin?tab=ai",
  },
  {
    key: "jobs",
    label: "Pipeline Health",
    icon: Server,
    path: "/admin?tab=jobs",
  },
  {
    key: "evals",
    label: "AI Evaluations",
    icon: Sparkles,
    path: "/admin?tab=evals",
  },
];

export const Sidebar: React.FC<SidebarProps> = ({ onCloseMobile }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const isCurrent = (path: string) => {
    if (path === "/dashboard") return location.pathname === "/dashboard";
    if (path === "/spaces") {
      return location.pathname === "/spaces" || location.pathname.startsWith("/spaces/");
    }
    if (path === "/analytics") return location.pathname === "/analytics";
    if (path === "/status") return location.pathname === "/status";
    if (path === "/profile") return location.pathname === "/profile";
    return location.pathname.startsWith(path);
  };

  const isAdminTabActive = (tabKey: string) => {
    if (location.pathname !== "/admin") return false;
    const searchParams = new URLSearchParams(location.search);
    const currentTab = searchParams.get("tab") || "overview";
    return currentTab === tabKey;
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

  const navLinkClass = (path: string) => {
    const active = isCurrent(path);
    return `relative flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
      active
        ? "bg-indigo-600/15 text-indigo-200 border border-indigo-500/30 font-semibold shadow-sm shadow-indigo-950/40"
        : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent"
    }`;
  };

  const adminNavLinkClass = (tabKey: string) => {
    const active = isAdminTabActive(tabKey);
    return `relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
      active
        ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-semibold shadow-sm shadow-indigo-950/40"
        : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent"
    }`;
  };

  return (
    <aside className="w-60 bg-[#070a13] border-r border-[#1e293b] flex flex-col h-full select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-[#1e293b] flex items-center justify-between">
        <Link
          to={user?.role === "admin" ? "/admin" : "/dashboard"}
          onClick={onCloseMobile}
          className="flex items-center space-x-3 group"
        >
          <div className="p-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl group-hover:scale-105 transition-transform">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-sm text-white tracking-tight block">
              AI Study Companion
            </span>
            <span className="text-[11px] text-slate-400 font-medium">
              {user?.role === "admin" ? "Admin Workspace" : "Academic Learning Workspace"}
            </span>
          </div>
        </Link>
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {user?.role === "admin" ? (
          <div>
            <div className="px-3 mb-2 text-[10px] font-semibold text-purple-400/80 uppercase tracking-wider font-mono">
              Admin & Operations
            </div>
            <nav className="space-y-1">
              {ADMIN_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.key}
                    to={item.path}
                    onClick={onCloseMobile}
                    className={adminNavLinkClass(item.key)}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        ) : (
          <>
            {/* MAIN */}
            <div>
              <div className="px-3 mb-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
                Main
              </div>
              <nav className="space-y-1">
                <Link
                  to="/dashboard"
                  onClick={onCloseMobile}
                  className={navLinkClass("/dashboard")}
                >
                  <LayoutDashboard className="w-4 h-4 text-indigo-400" />
                  <span>Dashboard</span>
                </Link>
                <Link
                  to="/spaces"
                  onClick={onCloseMobile}
                  className={navLinkClass("/spaces")}
                >
                  <FolderKanban className="w-4 h-4 text-indigo-400" />
                  <span>Spaces</span>
                </Link>
              </nav>
            </div>

            {/* ANALYTICS */}
            <div>
              <div className="px-3 mb-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
                Analytics
              </div>
              <nav className="space-y-1">
                <Link
                  to="/analytics"
                  onClick={onCloseMobile}
                  className={navLinkClass("/analytics")}
                >
                  <BarChart3 className="w-4 h-4 text-purple-400" />
                  <span>Global Analytics</span>
                </Link>
              </nav>
            </div>

            {/* TOOLS */}
            <div>
              <div className="px-3 mb-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
                Tools
              </div>
              <nav className="space-y-1">
                <Link
                  to="/status"
                  onClick={onCloseMobile}
                  className={navLinkClass("/status")}
                >
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>System Status</span>
                </Link>
              </nav>
            </div>

            {/* ACCOUNT */}
            <div>
              <div className="px-3 mb-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
                Account
              </div>
              <nav className="space-y-1">
                <Link
                  to="/profile"
                  onClick={onCloseMobile}
                  className={navLinkClass("/profile")}
                >
                  <UserIcon className="w-4 h-4 text-indigo-400" />
                  <span>Profile</span>
                </Link>
              </nav>
            </div>
          </>
        )}
      </div>

      {/* User Footer Card */}
      <div className="p-3 border-t border-[#1e293b] bg-[#070a13]">
        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-[#1e293b]/70 hover:border-[#1e293b] transition-all">
          {user?.role === "admin" ? (
            <div className="flex items-center space-x-2.5 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-300 font-bold text-xs flex items-center justify-center flex-shrink-0">
                {getInitials()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-200 truncate">
                  {user?.full_name || user?.email}
                </div>
                <div className="text-[10px] font-mono text-purple-400 uppercase font-semibold">
                  {user?.role || "admin"}
                </div>
              </div>
            </div>
          ) : (
            <Link
              to="/profile"
              onClick={onCloseMobile}
              className="flex items-center space-x-2.5 min-w-0 flex-1 group"
            >
              <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 font-bold text-xs flex items-center justify-center flex-shrink-0 group-hover:border-indigo-400 transition-colors">
                {getInitials()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-200 truncate group-hover:text-white transition-colors">
                  {user?.full_name || user?.email}
                </div>
                <div className="text-[10px] font-mono text-slate-400 uppercase">
                  {user?.role || "user"}
                </div>
              </div>
            </Link>
          )}
          <button
            onClick={handleLogout}
            title="Log out"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors ml-1"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
