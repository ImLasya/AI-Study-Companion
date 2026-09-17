import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, LogOut, Shield, Sparkles, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo & Name */}
        <Link to={user ? "/dashboard" : "/"} className="flex items-center space-x-3 group">
          <div className="p-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl group-hover:scale-105 transition-transform">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-white tracking-tight">AI Study Companion</span>
            </div>
            <p className="text-xs text-gray-400">Persistent, contextual, measurable learning</p>
          </div>
        </Link>

        {/* Navigation Actions */}
        <div className="flex items-center space-x-3">
          <Link
            to="/"
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors px-3 py-1.5 rounded-lg border border-transparent hover:border-gray-800"
          >
            System Status
          </Link>

          {user ? (
            <>
              <Link
                to="/dashboard"
                className="text-xs text-gray-300 hover:text-white font-medium px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-800 hover:border-gray-700 transition-colors"
              >
                Spaces
              </Link>

              {user.role === "admin" && (
                <Link
                  to="/admin"
                  className="text-xs text-amber-300 hover:text-amber-200 font-medium px-3 py-1.5 rounded-lg bg-amber-950/40 border border-amber-800/40 hover:border-amber-700/60 transition-colors flex items-center gap-1.5"
                >
                  <Shield className="w-3.5 h-3.5" />
                  Admin
                </Link>
              )}

              <div className="h-4 w-px bg-gray-800 mx-1 hidden sm:block" />

              <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-gray-900/60 border border-gray-800 text-xs text-gray-300">
                <UserIcon className="w-3.5 h-3.5 text-indigo-400" />
                <span className="max-w-[120px] sm:max-w-[180px] truncate">
                  {user.full_name || user.email}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase font-mono font-semibold">
                  {user.role}
                </span>
              </div>

              <button
                onClick={handleLogout}
                title="Log out"
                className="p-1.5 rounded-lg border border-gray-800 text-gray-400 hover:text-rose-400 hover:border-rose-900/50 hover:bg-rose-950/30 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="text-xs text-gray-300 hover:text-white px-3 py-1.5 rounded-lg border border-gray-800 hover:border-gray-700 bg-gray-900/50 transition-colors"
              >
                Sign in
              </Link>
              <Link
                to="/signup"
                className="text-xs text-white px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-medium transition-colors"
              >
                Create account
              </Link>
            </>
          )}

          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-800 hover:border-gray-700 bg-gray-900/50"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            API Docs
          </a>
        </div>
      </div>
    </header>
  );
};
