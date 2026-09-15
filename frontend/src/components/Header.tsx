import React from "react";
import { BookOpen, Sparkles } from "lucide-react";

export const Header: React.FC = () => {
  return (
    <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-white tracking-tight">AI Study Companion</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
                Phase 0
              </span>
            </div>
            <p className="text-xs text-gray-400">Persistent, contextual, measurable learning</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-800 hover:border-gray-700 bg-gray-900/50"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            FastAPI Docs
          </a>
        </div>
      </div>
    </header>
  );
};
