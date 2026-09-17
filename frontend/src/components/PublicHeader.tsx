import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BookOpen, Menu, X } from "lucide-react";

export const PublicHeader: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const isHome = location.pathname === "/";
  const isStatus = location.pathname === "/status";

  return (
    <header className="border-b border-gray-800/80 bg-[#090d16]/90 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo & Name */}
        <Link to="/" className="flex items-center space-x-3 group">
          <div className="p-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl group-hover:scale-105 transition-transform">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-base sm:text-lg text-white tracking-tight">
              AI Study Companion
            </span>
            <p className="text-[11px] text-gray-400 hidden sm:block">
              Persistent, contextual, measurable learning
            </p>
          </div>
        </Link>

        {/* Center / Desktop Navigation */}
        <nav className="hidden md:flex items-center space-x-1">
          <Link
            to="/"
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
              isHome
                ? "text-white bg-gray-900/80 border border-gray-800"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-900/50"
            }`}
          >
            Home
          </Link>
          <a
            href="/#features"
            className="text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-900/50 px-3 py-1.5 rounded-lg transition-colors"
          >
            Features
          </a>
          <Link
            to="/status"
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
              isStatus
                ? "text-white bg-gray-900/80 border border-gray-800"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-900/50"
            }`}
          >
            System Status
          </Link>
        </nav>

        {/* Right CTA Actions */}
        <div className="hidden md:flex items-center space-x-3">
          <Link
            to="/signin"
            className="text-xs text-gray-300 hover:text-white px-3.5 py-2 rounded-lg border border-gray-800 hover:border-gray-700 bg-gray-900/60 font-medium transition-colors"
          >
            Sign In
          </Link>
          <Link
            to="/signup"
            className="text-xs text-white px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-medium transition-colors shadow-sm"
          >
            Create Account
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-lg border border-gray-800 text-gray-400 hover:text-white hover:bg-gray-900 transition-colors"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-gray-800 bg-[#090d16] px-4 py-4 space-y-3">
          <div className="flex flex-col space-y-1">
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm text-gray-300 hover:text-white py-2 px-3 rounded-lg hover:bg-gray-900"
            >
              Home
            </Link>
            <a
              href="/#features"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm text-gray-300 hover:text-white py-2 px-3 rounded-lg hover:bg-gray-900"
            >
              Features
            </a>
            <Link
              to="/status"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm text-gray-300 hover:text-white py-2 px-3 rounded-lg hover:bg-gray-900"
            >
              System Status
            </Link>
          </div>
          <div className="pt-3 border-t border-gray-800/80 flex flex-col space-y-2">
            <Link
              to="/signin"
              onClick={() => setMobileMenuOpen(false)}
              className="text-center text-xs text-gray-300 hover:text-white py-2 rounded-lg border border-gray-800 bg-gray-900/60 font-medium"
            >
              Sign In
            </Link>
            <Link
              to="/signup"
              onClick={() => setMobileMenuOpen(false)}
              className="text-center text-xs text-white py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-medium"
            >
              Create Account
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};
