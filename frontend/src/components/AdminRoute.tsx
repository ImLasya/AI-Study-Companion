import React from "react";
import { Navigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

interface AdminRouteProps {
  children: React.ReactNode;
}

export const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/signin" replace />;
  }

  if (user.role !== "admin") {
    return (
      <div className="min-h-[450px] flex flex-col items-center justify-center text-center p-8">
        <div className="p-4 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 mb-4">
          <ShieldAlert className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-bold text-white tracking-tight">Access Denied (HTTP 403)</h2>
        <p className="text-sm text-gray-400 max-w-md mt-2 leading-relaxed">
          Administrator privileges are required to access this control surface. Your current account role is{" "}
          <span className="font-mono text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-200 uppercase font-semibold">
            {user.role}
          </span>.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};
