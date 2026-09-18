import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BookOpen, LayoutDashboard, LogOut, Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/lib/auth-context";

export const PublicHeader: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const isHome = location.pathname === "/";

  const handleLogout = async () => {
    setMobileMenuOpen(false);
    await logout();
    navigate("/");
  };

  const handleNavClick = (hash: string) => {
    setMobileMenuOpen(false);
    if (location.pathname !== "/") {
      navigate(`/${hash}`);
    } else {
      const el = document.querySelector(hash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface/90 backdrop-blur-md transition-colors duration-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo & Name */}
        <Link to="/" className="flex items-center space-x-3 group">
          <div className="p-2 bg-accent/15 text-accent border border-accent/25 rounded-xl group-hover:scale-105 transition-transform">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-base sm:text-lg text-text-primary tracking-tight block">
              AI Study Companion
            </span>
            <p className="text-[11px] text-text-muted hidden sm:block">
              Academic Learning Workspace
            </p>
          </div>
        </Link>

        {/* Center / Desktop Navigation Links */}
        <nav className="hidden md:flex items-center space-x-1 lg:space-x-2">
          <Link
            to="/"
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
              isHome
                ? "text-accent bg-accent/10 font-semibold"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-muted"
            }`}
          >
            Home
          </Link>
          <button
            type="button"
            onClick={() => handleNavClick("#features")}
            className="text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-muted px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            Features
          </button>
          <button
            type="button"
            onClick={() => handleNavClick("#how-it-works")}
            className="text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-muted px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            How It Works
          </button>
          <button
            type="button"
            onClick={() => handleNavClick("#why-us")}
            className="text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-muted px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            About
          </button>
          <Link
            to="/status"
            className="text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-muted px-3 py-1.5 rounded-lg transition-colors"
          >
            Status
          </Link>
        </nav>

        {/* Right Actions: Theme Toggle + Auth CTAs */}
        <div className="hidden md:flex items-center space-x-3">
          <ThemeToggle />

          {user ? (
            <div className="flex items-center space-x-2">
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-1.5 text-xs text-white px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover font-semibold transition-colors shadow-sm"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Dashboard</span>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="p-2 rounded-xl border border-border text-text-muted hover:text-rose-500 hover:border-rose-300 dark:hover:border-rose-800 transition-colors"
                title="Log out"
                aria-label="Log out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2.5">
              <Link
                to="/signin"
                className="text-xs text-text-secondary hover:text-text-primary px-3.5 py-2 rounded-xl border border-border hover:border-slate-400 dark:hover:border-slate-600 bg-surface font-medium transition-colors"
              >
                Sign In
              </Link>
              <Link
                to="/signup"
                className="text-xs text-white px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover font-semibold transition-colors shadow-sm"
              >
                Create Account
              </Link>
            </div>
          )}
        </div>

        {/* Mobile controls: Theme Toggle + Drawer Menu Button */}
        <div className="flex md:hidden items-center space-x-2">
          <ThemeToggle />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-xl border border-border text-text-secondary hover:text-text-primary hover:bg-surface-muted transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-border bg-surface px-4 py-4 space-y-3 transition-colors duration-200">
          <div className="flex flex-col space-y-1">
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm text-text-secondary hover:text-text-primary py-2 px-3 rounded-lg hover:bg-surface-muted"
            >
              Home
            </Link>
            <button
              type="button"
              onClick={() => handleNavClick("#features")}
              className="text-left text-sm text-text-secondary hover:text-text-primary py-2 px-3 rounded-lg hover:bg-surface-muted"
            >
              Features
            </button>
            <button
              type="button"
              onClick={() => handleNavClick("#how-it-works")}
              className="text-left text-sm text-text-secondary hover:text-text-primary py-2 px-3 rounded-lg hover:bg-surface-muted"
            >
              How It Works
            </button>
            <button
              type="button"
              onClick={() => handleNavClick("#why-us")}
              className="text-left text-sm text-text-secondary hover:text-text-primary py-2 px-3 rounded-lg hover:bg-surface-muted"
            >
              About
            </button>
            <Link
              to="/status"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm text-text-secondary hover:text-text-primary py-2 px-3 rounded-lg hover:bg-surface-muted"
            >
              System Status
            </Link>
          </div>

          <div className="pt-3 border-t border-border flex flex-col space-y-2">
            {user ? (
              <>
                <Link
                  to="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-center text-xs text-white py-2.5 rounded-xl bg-accent hover:bg-accent-hover font-semibold"
                >
                  Go to Dashboard
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-center text-xs text-rose-500 py-2 rounded-xl border border-border bg-surface font-medium hover:bg-rose-50 dark:hover:bg-rose-950/20"
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/signin"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-center text-xs text-text-primary py-2 rounded-xl border border-border bg-surface font-medium hover:bg-surface-muted"
                >
                  Sign In
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-center text-xs text-white py-2.5 rounded-xl bg-accent hover:bg-accent-hover font-semibold"
                >
                  Create Account
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
