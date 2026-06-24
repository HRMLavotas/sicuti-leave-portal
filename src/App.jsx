import React, { Suspense, lazy } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useRoutes,
} from "react-router-dom";

import { Toaster } from "@/components/ui/toaster";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Landing from "@/pages/Landing";
import ProtectedRoute from "@/components/ProtectedRoute";
import ErrorBoundary from "@/components/ErrorBoundary";
import ConnectionHealthChecker from "@/components/ConnectionHealthChecker";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import "@/utils/removeDebugButton"; // Remove debug button

// Lazy load heavy pages for better performance
const Employees = lazy(() => import("@/pages/Employees"));
const UserManagement = lazy(() => import("@/pages/UserManagement"));
const LeaveRequests = lazy(() => import("@/pages/LeaveRequests"));
const BatchLeaveProposals = lazy(() => import("@/pages/BatchLeaveProposals"));
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

function App() {
  return (
    <ErrorBoundary>
      <ConnectionHealthChecker>
        <Router>
          <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
            <Routes>
              {/* Public routes - no layout */}
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />

              {/* Protected routes - with layout */}
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <Suspense fallback={<PageLoader />}>
                        <Routes>
                          <Route path="/employees" element={<Employees />} />
                          <Route
                            path="/user-management"
                            element={<UserManagement />}
                          />
                          <Route
                            path="/leave-requests"
                            element={<LeaveRequests />}
                          />
                          <Route
                            path="/batch-leave-proposals"
                            element={<BatchLeaveProposals />}
                          />
                          <Route
                            path="/leave-history"
                            element={<LeaveHistoryPage />}
                          />
                          <Route path="/reports" element={<Reports />} />
                          <Route
                            path="/surat-keterangan"
                            element={<DocxSuratKeterangan />}
                          />
                          <Route
                            path="/template-management"
                            element={<DocxTemplateManagement />}
                          />
                          <Route path="/settings" element={<Settings />} />
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
