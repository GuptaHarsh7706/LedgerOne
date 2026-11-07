import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { api } from "../../services/api";

export const AuthGuard: React.FC = () => {
  const token = api.getToken();

  // If no token exists, redirect to login page
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};
