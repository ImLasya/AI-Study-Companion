import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] bg-background text-text-primary">
        <Loader2 className="w-8 h-8 text-accent animate-spin mb-4" />
        <p className="text-sm text-text-muted">Verifying authentication session...</p>
      </div>
    );
  }

  if (!user) {
    const redirectParam = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/signin?redirect=${redirectParam}`} replace state={{ from: location }} />;
  }

  return <>{children}</>;
};
