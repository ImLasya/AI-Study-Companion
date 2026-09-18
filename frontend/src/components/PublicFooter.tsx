import React from "react";
import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";

export const PublicFooter: React.FC = () => {
  return (
    <footer className="border-t border-border bg-surface-muted/60 py-12 text-text-muted transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-accent/15 text-accent border border-accent/25 rounded-xl">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-sm text-text-primary tracking-tight">AI Study Companion</span>
              <p className="text-xs text-text-muted">Academic Learning Workspace</p>
            </div>
          </div>

          <nav className="flex flex-wrap justify-center gap-6 text-xs text-text-secondary">
            <Link to="/" className="hover:text-text-primary transition-colors">
              Home
            </Link>
            <a href="/#features" className="hover:text-text-primary transition-colors">
              Features
            </a>
            <a href="/#how-it-works" className="hover:text-text-primary transition-colors">
              How It Works
            </a>
            <a href="/#why-us" className="hover:text-text-primary transition-colors">
              About
            </a>
            <Link to="/status" className="hover:text-text-primary transition-colors">
              System Status
            </Link>
            <Link to="/signin" className="hover:text-text-primary transition-colors">
              Sign In
            </Link>
            <Link to="/signup" className="hover:text-text-primary transition-colors">
              Create Account
            </Link>
          </nav>
        </div>

        <div className="mt-8 pt-6 border-t border-border/80 text-center text-xs text-text-muted">
          &copy; {new Date().getFullYear()} AI Study Companion. Academic Learning Workspace. All rights reserved.
        </div>
      </div>
    </footer>
  );
};
