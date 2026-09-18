import React from "react";
import { Outlet } from "react-router-dom";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";

export const PublicLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return (
    <div className="bg-background text-text-primary antialiased min-h-screen flex flex-col transition-colors duration-200">
      <PublicHeader />

      <main className="flex-1">
        {children || <Outlet />}
      </main>
      <PublicFooter />
    </div>
  );
};
