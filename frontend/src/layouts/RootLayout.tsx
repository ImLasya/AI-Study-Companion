import React from "react";
import { Outlet } from "react-router-dom";
import { Header } from "@/components/Header";

export const RootLayout: React.FC = () => {
  return (
    <div className="bg-[#090d16] text-slate-100 antialiased min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-gray-900 py-6 text-center text-xs text-gray-500">
        AI Study Companion &bull; Persistent, Contextual, Measurable Learning
      </footer>
    </div>
  );
};
