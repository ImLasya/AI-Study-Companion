import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SystemStatus } from "@/components/SystemStatus";
import { useAuth } from "@/lib/auth-context";

export const StatusPage: React.FC = () => {
  const { user } = useAuth();

  if (user) {
    return <SystemStatus />;
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6">
      <div className="mb-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs text-indigo-500 hover:text-indigo-400 font-medium transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Home</span>
        </Link>
      </div>
      <SystemStatus />
    </div>
  );
};
