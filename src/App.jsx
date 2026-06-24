import React, { Suspense, lazy } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import { Toaster } from "@/components/ui/toaster";
import Layout from "@/components/Layout";
import Landing from "@/pages/Landing";
import AuthCallback from "@/pages/AuthCallback";
import ProtectedRoute from "@/components/ProtectedRoute";
import ErrorBoundary from "@/components/ErrorBoundary";
import ConnectionHealthChecker from "@/components/ConnectionHealthChecker";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import { AuthManager } from "@/lib/auth";
import "@/utils/removeDebugButton"; // Remove debug button

// Lazy load heavy pages for better performance
const Employees = lazy(() => import("@/pages/Employees"));
const UserManagement = lazy(() => import("@/pages/UserManagement"));
const LeaveRequests = lazy(() => import("@/pages/LeaveRequests"));
const BatchLeaveProposals = lazy(() => import("@/pages/BatchLeaveProposals"));
const LeaveProposals = lazy(() => import("@/pages/LeaveProposals"));
const LeaveHistoryPage = lazy(() => import("@/pages/LeaveHistoryPage"));
const Reports = lazy(() => import("@/pages/Reports"));
const DocxSuratKeterangan = lazy(() => import("@/pages/DocxSuratKeterangan"));
const DocxTemplateManagement = lazy(() => import("@/pages/DocxTemplateManagement"));
const Settings = lazy(() => import("@/pages/Settings"));
const PdfDemo = lazy(() => import("@/pages/PdfDemo"));

// Page loading fallback
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="flex flex-col items-center space-y-3">
      <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-slate-400 text-sm">Memuat halaman...</p>
    </div>
  </div>
);

/**
 * RoleGuard: Membatasi akses halaman berdasarkan role pengguna.
 * Jika user dengan role 'employee' mencoba mengakses halaman admin,
 * akan diredirect ke /leave-requests.
 */
const RoleGuard = ({ children, blockedRoles = [] }) => {
  const user = AuthManager.getUserSession();
  if (user && blockedRoles.includes(user.role)) {
    return <Navigate to="/leave-requests" replace />;
  }
  return children;
};

function App() {
  return (
    <ErrorBoundary>
      <ConnectionHealthChecker>
        <Router>
          <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
            <Routes>
              {/* Public routes - no layout */}
              <Route path="/" element={<Landing />} />
              <Route path="/auth/callback" element={<AuthCallback />} />

              {/* Protected routes - with layout */}
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <Suspense fallback={<PageLoader />}>
                        <Routes>
                          {/* Admin-only routes (blocked for employee) */}
                          <Route path="/employees" element={
                            <RoleGuard blockedRoles={["employee"]}>
                              <Employees />
                            </RoleGuard>
                          } />
                          <Route path="/user-management" element={
                            <RoleGuard blockedRoles={["employee"]}>
                              <UserManagement />
                            </RoleGuard>
                          } />
                          <Route path="/batch-leave-proposals" element={
                            <RoleGuard blockedRoles={["employee"]}>
                              <BatchLeaveProposals />
                            </RoleGuard>
                          } />
                          <Route path="/reports" element={
                            <RoleGuard blockedRoles={["employee"]}>
                              <Reports />
                            </RoleGuard>
                          } />
                          <Route path="/surat-keterangan" element={
                            <RoleGuard blockedRoles={["employee"]}>
                              <DocxSuratKeterangan />
                            </RoleGuard>
                          } />
                          <Route path="/template-management" element={
                            <RoleGuard blockedRoles={["employee"]}>
                              <DocxTemplateManagement />
                            </RoleGuard>
                          } />
                          <Route path="/settings" element={
                            <RoleGuard blockedRoles={["employee"]}>
                              <Settings />
                            </RoleGuard>
                          } />

                          {/* Routes accessible by all roles (including employee) */}
                          <Route
                            path="/leave-requests"
                            element={<LeaveRequests />}
                          />
                          <Route
                            path="/leave-proposals"
                            element={<LeaveProposals />}
                          />
                          <Route
                            path="/leave-history"
                            element={<LeaveHistoryPage />}
                          />
                          {import.meta.env.VITE_TEMPO && (
                            <Route path="/tempobook/*" />
                          )}
                        </Routes>
                      </Suspense>
                    </Layout>
                  </ProtectedRoute>
                }
              />
            </Routes>
            <Toaster />
            <PwaInstallBanner />
          </div>
        </Router>
      </ConnectionHealthChecker>
    </ErrorBoundary>
  );
}

export default App;
