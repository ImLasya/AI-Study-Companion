import React from "react";
import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";

export const PublicFooter: React.FC = () => {
  return (
    <footer className="border-t border-gray-800/80 bg-[#070a12] py-12 text-gray-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-sm text-white tracking-tight">AI Study Companion</span>
              <p className="text-xs text-gray-400">Persistent, contextual, measurable learning</p>
            </div>
          </div>

          <nav className="flex flex-wrap justify-center gap-6 text-xs text-gray-400">
            <Link to="/" className="hover:text-gray-200 transition-colors">
              Home
            </Link>
            <a href="/#features" className="hover:text-gray-200 transition-colors">
              Features
            </a>
            <Link to="/status" className="hover:text-gray-200 transition-colors">
              System Status
            </Link>
            <Link to="/signin" className="hover:text-gray-200 transition-colors">
              Sign In
            </Link>
            <Link to="/signup" className="hover:text-gray-200 transition-colors">
              Create Account
            </Link>
          </nav>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-900 text-center text-xs text-gray-500">
          &copy; {new Date().getFullYear()} AI Study Companion. All rights reserved.
        </div>
      </div>
    </footer>
  );
};
