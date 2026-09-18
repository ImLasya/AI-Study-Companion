import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { TopHeader } from "@/components/TopHeader";

export const AuthenticatedLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  return (
    <div className="bg-background text-text-primary antialiased min-h-screen flex transition-colors duration-200">
      {/* Desktop Sidebar (fixed/static on md+) */}

      <div className="hidden md:block w-[260px] flex-shrink-0 h-screen sticky top-0">
        <Sidebar />
      </div>

      {/* Mobile Drawer (backdrop + sliding sidebar) */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <div className="relative z-10 h-full">
            <Sidebar onCloseMobile={() => setMobileDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader onToggleMobileMenu={() => setMobileDrawerOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-7 max-w-[1440px] w-full mx-auto">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
};
