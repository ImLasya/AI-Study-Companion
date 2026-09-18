import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  BarChart3,
  BookOpen,
  FolderKanban,
  LayoutGrid,
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
      return parts[0]?.charAt(0).toUpperCase() || "L";
    }
    if (user?.email) {
      return user.email.charAt(0).toUpperCase();
    }
    return "L";
  };

  const displayName = user?.full_name || "lasya";
  const displayRole = (user?.role || "USER").toUpperCase();

  return (
    <aside className="w-[260px] bg-[#fbfbfe] dark:bg-slate-900 border-r border-[#edf0f7] dark:border-slate-800 flex flex-col h-full select-none transition-colors justify-between overflow-hidden">
      {/* 1. BRAND HEADER */}
      <div>
        <div className="h-[85px] px-5 flex items-center justify-between border-b border-[#edf0f7] dark:border-slate-800 bg-[#fbfbfe] dark:bg-slate-900">
          <Link
            to={user?.role === "admin" ? "/admin" : "/dashboard"}
            onClick={onCloseMobile}
            className="flex items-center space-x-3.5 group"
          >
            {/* Open Book Logo Icon */}
            <div className="w-11 h-11 rounded-2xl bg-[#edf0fe] dark:bg-indigo-950/60 text-[#5454ee] dark:text-indigo-400 flex items-center justify-center flex-shrink-0 shadow-sm transition-transform group-hover:scale-105">
              <BookOpen className="w-5.5 h-5.5 stroke-[2.2]" />
            </div>
            <div>
              <span className="font-bold text-[17px] text-[#1e2238] dark:text-white tracking-tight block leading-tight">
                EduMind
              </span>
              <span className="text-[11px] text-[#717a94] dark:text-slate-400 font-medium block leading-tight mt-0.5">
                {user?.role === "admin" ? "Admin Workspace" : "Intelligent Learning Workspace"}
              </span>
            </div>
          </Link>
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* 2. NAVIGATION SECTIONS */}
        <div className="px-3.5 py-4 space-y-4 overflow-y-auto">
          {user?.role === "admin" ? (
            <div>
              <div className="px-3 mb-2 text-[10.5px] font-bold text-[#8d95ab] dark:text-slate-400 uppercase tracking-wider font-mono">
                Admin &amp; Operations
              </div>
              <nav className="space-y-1">
                {ADMIN_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = isAdminTabActive(item.key);
                  return (
                    <Link
                      key={item.key}
                      to={item.path}
                      onClick={onCloseMobile}
                      className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[13px] transition-all duration-150 ${
                        active
                          ? "bg-gradient-to-r from-[#eceffe] to-[#f2effe] dark:from-indigo-950/50 dark:to-purple-950/40 text-[#5454ee] dark:text-indigo-400 border border-[#e0e2f8] dark:border-indigo-800/60 font-semibold shadow-[0_1px_2px_rgba(84,84,238,0.05)]"
                          : "text-[#1e2238] dark:text-slate-200 hover:bg-[#f4f5fb] dark:hover:bg-slate-800/60 border border-transparent font-medium"
                      }`}
                    >
                      <Icon className="w-5 h-5 text-[#5454ee] dark:text-indigo-400 stroke-[2]" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          ) : (
            <>
              {/* MAIN SECTION */}
              <div>
                <div className="px-3 mb-2 text-[10.5px] font-bold text-[#8d95ab] dark:text-slate-400 uppercase tracking-wider font-mono">
                  Main
                </div>
                <nav className="space-y-1">
                  {/* Dashboard */}
                  {(() => {
                    const active = isCurrent("/dashboard");
                    return (
                      <Link
                        to="/dashboard"
                        onClick={onCloseMobile}
                        className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[13px] transition-all duration-150 ${
                          active
                            ? "bg-gradient-to-r from-[#eceffe] to-[#f2effe] dark:from-indigo-950/50 dark:to-purple-950/40 text-[#5454ee] dark:text-indigo-400 border border-[#e0e2f8] dark:border-indigo-800/60 font-semibold shadow-[0_1px_2px_rgba(84,84,238,0.05)]"
                            : "text-[#1e2238] dark:text-slate-200 hover:bg-[#f4f5fb] dark:hover:bg-slate-800/60 border border-transparent font-medium"
                        }`}
                      >
                        <LayoutGrid
                          className={`w-5 h-5 stroke-[2] ${
                            active
                              ? "text-[#5454ee] dark:text-indigo-400"
                              : "text-[#5454ee] dark:text-indigo-400"
                          }`}
                        />
                        <span>Dashboard</span>
                      </Link>
                    );
                  })()}

                  {/* Spaces */}
                  {(() => {
                    const active = isCurrent("/spaces");
                    return (
                      <Link
                        to="/spaces"
                        onClick={onCloseMobile}
                        className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[13px] transition-all duration-150 ${
                          active
                            ? "bg-gradient-to-r from-[#eceffe] to-[#f2effe] dark:from-indigo-950/50 dark:to-purple-950/40 text-[#5454ee] dark:text-indigo-400 border border-[#e0e2f8] dark:border-indigo-800/60 font-semibold shadow-[0_1px_2px_rgba(84,84,238,0.05)]"
                            : "text-[#1e2238] dark:text-slate-200 hover:bg-[#f4f5fb] dark:hover:bg-slate-800/60 border border-transparent font-medium"
                        }`}
                      >
                        <FolderKanban className="w-5 h-5 text-[#5454ee] dark:text-indigo-400 stroke-[2]" />
                        <span>Spaces</span>
                      </Link>
                    );
                  })()}
                </nav>
              </div>

              {/* ANALYTICS SECTION */}
              <div>
                <div className="px-3 mb-2 text-[10.5px] font-bold text-[#8d95ab] dark:text-slate-400 uppercase tracking-wider font-mono">
                  Analytics
                </div>
                <nav className="space-y-1">
                  {(() => {
                    const active = isCurrent("/analytics");
                    return (
                      <Link
                        to="/analytics"
                        onClick={onCloseMobile}
                        className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[13px] transition-all duration-150 ${
                          active
                            ? "bg-gradient-to-r from-[#eceffe] to-[#f2effe] dark:from-indigo-950/50 dark:to-purple-950/40 text-[#5454ee] dark:text-indigo-400 border border-[#e0e2f8] dark:border-indigo-800/60 font-semibold shadow-[0_1px_2px_rgba(84,84,238,0.05)]"
                            : "text-[#1e2238] dark:text-slate-200 hover:bg-[#f4f5fb] dark:hover:bg-slate-800/60 border border-transparent font-medium"
                        }`}
                      >
                        <BarChart3 className="w-5 h-5 text-[#5454ee] dark:text-indigo-400 stroke-[2]" />
                        <span>Global Analytics</span>
                      </Link>
                    );
                  })()}
                </nav>
              </div>

              {/* TOOLS SECTION */}
              <div>
                <div className="px-3 mb-2 text-[10.5px] font-bold text-[#8d95ab] dark:text-slate-400 uppercase tracking-wider font-mono">
                  Tools
                </div>
                <nav className="space-y-1">
                  {(() => {
                    const active = isCurrent("/status");
                    return (
                      <Link
                        to="/status"
                        onClick={onCloseMobile}
                        className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[13px] transition-all duration-150 ${
                          active
                            ? "bg-gradient-to-r from-[#eceffe] to-[#f2effe] dark:from-indigo-950/50 dark:to-purple-950/40 text-[#5454ee] dark:text-indigo-400 border border-[#e0e2f8] dark:border-indigo-800/60 font-semibold shadow-[0_1px_2px_rgba(84,84,238,0.05)]"
                            : "text-[#1e2238] dark:text-slate-200 hover:bg-[#f4f5fb] dark:hover:bg-slate-800/60 border border-transparent font-medium"
                        }`}
                      >
                        {/* Green pulse/heartbeat icon accent */}
                        <Activity className="w-5 h-5 text-[#10b981] stroke-[2.2]" />
                        <span>System Status</span>
                      </Link>
                    );
                  })()}
                </nav>
              </div>

              {/* ACCOUNT SECTION */}
              <div>
                <div className="px-3 mb-2 text-[10.5px] font-bold text-[#8d95ab] dark:text-slate-400 uppercase tracking-wider font-mono">
                  Account
                </div>
                <nav className="space-y-1">
                  {(() => {
                    const active = isCurrent("/profile");
                    return (
                      <Link
                        to="/profile"
                        onClick={onCloseMobile}
                        className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[13px] transition-all duration-150 ${
                          active
                            ? "bg-gradient-to-r from-[#eceffe] to-[#f2effe] dark:from-indigo-950/50 dark:to-purple-950/40 text-[#5454ee] dark:text-indigo-400 border border-[#e0e2f8] dark:border-indigo-800/60 font-semibold shadow-[0_1px_2px_rgba(84,84,238,0.05)]"
                            : "text-[#1e2238] dark:text-slate-200 hover:bg-[#f4f5fb] dark:hover:bg-slate-800/60 border border-transparent font-medium"
                        }`}
                      >
                        <UserIcon className="w-5 h-5 text-[#5454ee] dark:text-indigo-400 stroke-[2]" />
                        <span>Profile</span>
                      </Link>
                    );
                  })()}
                </nav>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 3. PINNED BOTTOM AREA */}
      <div className="p-3.5 border-t border-[#edf0f7] dark:border-slate-800 bg-[#fbfbfe] dark:bg-slate-900">
        {/* User Profile Card */}
        <div className="p-2.5 px-3 rounded-2xl bg-[#f0f2fe] dark:bg-indigo-950/40 border border-[#e0e4fb] dark:border-indigo-800/40 flex items-center justify-between shadow-sm">
          <Link
            to="/profile"
            onClick={onCloseMobile}
            className="flex items-center gap-3 min-w-0 flex-1 group"
          >
            {/* Circular Avatar containing 'L' */}
            <div className="w-9 h-9 rounded-full bg-[#5454ee] text-white font-bold text-sm flex items-center justify-center flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform">
              {getInitials()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-[#1e2238] dark:text-white truncate">
                {displayName}
              </div>
              <div className="text-[10px] font-semibold text-[#717a94] dark:text-slate-400 uppercase tracking-wider mt-0.5">
                {displayRole}
              </div>
            </div>
          </Link>

          {/* Logout / exit icon on the right */}
          <button
            onClick={handleLogout}
            title="Log out"
            className="p-1.5 rounded-lg text-[#5454ee] dark:text-indigo-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors ml-1 cursor-pointer"
          >
            <LogOut className="w-4.5 h-4.5 stroke-[2]" />
          </button>
        </div>
      </div>
    </aside>
  );
};

