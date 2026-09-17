import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SystemStatus } from "@/components/SystemStatus";
import { useAuth } from "@/lib/auth-context";

export const StatusPage: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 sm:px-6">
      <div className="mb-6">
        <Link
          to={user ? "/dashboard" : "/"}
          className="inline-flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to {user ? "Dashboard" : "Home"}</span>
        </Link>
      </div>

      <SystemStatus />
    </div>
  );
};
