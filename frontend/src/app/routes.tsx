import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LandingPage } from '../features/landing/LandingPage';
import { LoginPage } from '../features/auth/LoginPage';
import { AppShell } from '../components/layout/AppShell';
import { WorkspaceDashboard } from '../features/workspace/WorkspaceDashboard';
import { DocumentStudio } from '../features/workspace/DocumentStudio';
import { ReviewQueueView } from '../features/workspace/ReviewQueueView';
import { MatchingView } from '../features/workspace/MatchingView';
import { AssistantView } from '../features/workspace/AssistantView';
import { AnalyticsView } from '../features/workspace/AnalyticsView';
import { SettingsView } from '../features/workspace/SettingsView';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />
  },
  {
    path: '/login',
    element: <LoginPage />
  },
  {
    path: '/workspace',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <WorkspaceDashboard />
      },
      {
        path: 'documents',
        element: <DocumentStudio />
      },
      {
        path: 'documents/:id',
        element: <DocumentStudio />
      },
      {
        path: 'review',
        element: <ReviewQueueView />
      },
      {
        path: 'matching',
        element: <MatchingView />
      },
      {
        path: 'assistant',
        element: <AssistantView />
      },
      {
        path: 'analytics',
        element: <AnalyticsView />
      },
      {
        path: 'settings',
        element: <SettingsView />
      }
    ]
  },
  {
    path: '*',
    element: <Navigate to="/" replace />
  }
]);
