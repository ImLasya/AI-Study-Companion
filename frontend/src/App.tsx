import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { PublicLayout } from "@/layouts/PublicLayout";
import { AuthenticatedLayout } from "@/layouts/AuthenticatedLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import { HomePage } from "@/pages/HomePage";
import { LoginPage } from "@/pages/LoginPage";
import { SignupPage } from "@/pages/SignupPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { SpacesPage } from "@/pages/SpacesPage";
import { SpaceDetailPage } from "@/pages/SpaceDetailPage";
import { ProjectDetailPage } from "@/pages/ProjectDetailPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { AdminPage } from "@/pages/AdminPage";
import { StatusPage } from "@/pages/StatusPage";
import { GlobalAnalyticsPage } from "@/pages/GlobalAnalyticsPage";

const StatusRoute: React.FC = () => {
  const { user } = useAuth();
  if (user) {
    return (
      <AuthenticatedLayout>
        <StatusPage />
      </AuthenticatedLayout>
    );
  }
  return (
    <PublicLayout>
      <StatusPage />
    </PublicLayout>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Landing & Authentication Views */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/signin" element={<LoginPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
          </Route>

          {/* System Status Route (Dynamic layout based on auth) */}
          <Route path="/status" element={<StatusRoute />} />

          {/* Authenticated Workspace Views with Sidebar */}
          <Route
            element={
              <ProtectedRoute>
                <AuthenticatedLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/spaces" element={<SpacesPage />} />
            <Route path="/spaces/:spaceId" element={<SpaceDetailPage />} />
            <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
            <Route path="/analytics" element={<GlobalAnalyticsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              }
            />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
