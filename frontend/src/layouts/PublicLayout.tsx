import React from "react";
import { Outlet } from "react-router-dom";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";

export const PublicLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return (
    <div className="bg-[#090d16] text-slate-100 antialiased min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-1">
        {children || <Outlet />}
      </main>
      <PublicFooter />
    </div>
  );
};
