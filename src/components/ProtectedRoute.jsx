import React from "react";
import { Navigate } from "react-router-dom";
import { AuthManager } from "@/lib/auth";

const ProtectedRoute = ({ children, requiredRole = null }) => {
  const isAuthenticated = AuthManager.isAuthenticated();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check role-based access if required
  if (requiredRole && !AuthManager.hasRole(requiredRole)) {
    return <Navigate to="/employees" replace />;
  }

  return children;
};

export default ProtectedRoute;
