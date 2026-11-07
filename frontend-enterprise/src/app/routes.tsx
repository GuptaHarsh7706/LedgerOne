import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { AuthGuard } from "../features/auth/AuthGuard";
import { PermissionGuard } from "../features/auth/PermissionGuard";
import { LoginPage } from "../features/auth/LoginPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { DocumentLibraryPage } from "../features/documents/DocumentLibraryPage";
import { DocumentWorkspacePage } from "../features/workspace/DocumentWorkspacePage";
import { ReviewQueuePage } from "../features/review/ReviewQueuePage";
import { ThreeWayMatchingPage } from "../features/matching/ThreeWayMatchingPage";
import { AssistantPage } from "../features/assistant/AssistantPage";
import { SpendAnalyticsPage } from "../features/analytics/SpendAnalyticsPage";
import { SettingsPage } from "../features/settings/SettingsPage";

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Route */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected Routes */}
      <Route element={<AuthGuard />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/documents" element={<DocumentLibraryPage />} />
          <Route path="/documents/:id/review" element={<DocumentWorkspacePage />} />
          <Route
            path="/review-queue"
            element={
              <PermissionGuard permission="review.read">
                <ReviewQueuePage />
              </PermissionGuard>
            }
          />
          <Route
            path="/matching"
            element={
              <PermissionGuard permission="matching.read">
                <ThreeWayMatchingPage />
              </PermissionGuard>
            }
          />
          <Route
            path="/assistant"
            element={
              <PermissionGuard permission="assistant.use">
                <AssistantPage />
              </PermissionGuard>
            }
          />
          <Route
            path="/analytics"
            element={
              <PermissionGuard permission="analytics.read">
                <SpendAnalyticsPage />
              </PermissionGuard>
            }
          />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      {/* Fallback Catch-All */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};
