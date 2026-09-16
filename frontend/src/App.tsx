import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth-context";
import { RootLayout } from "@/layouts/RootLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import { HomePage } from "@/pages/HomePage";
import { LoginPage } from "@/pages/LoginPage";
import { SignupPage } from "@/pages/SignupPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { SpaceDetailPage } from "@/pages/SpaceDetailPage";
import { ProjectDetailPage } from "@/pages/ProjectDetailPage";
import { AdminPage } from "@/pages/AdminPage";

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootLayout />}>
            {/* Public System & Architecture View */}
            <Route index element={<HomePage />} />

            {/* Auth Routes */}
            <Route path="login" element={<LoginPage />} />
            <Route path="signup" element={<SignupPage />} />

            {/* Authenticated Workspace Routes */}
            <Route
              path="dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="spaces/:spaceId"
              element={
                <ProtectedRoute>
                  <SpaceDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="projects/:projectId"
              element={
                <ProtectedRoute>
                  <ProjectDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin"
              element={
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
