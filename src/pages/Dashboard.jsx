import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase, OptimizedQueries } from "@/lib/supabaseOptimized";
import {
  Loader2,
  Users,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
} from "lucide-react";
import AutocompleteInput from "@/components/ui/AutocompleteInput";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useDepartments } from "@/hooks/useDepartments";
import { Label } from '@/components/ui/label';
import { supabaseSimpelAdmin } from "@/lib/supabaseSSO";
import { AuthManager } from "@/lib/auth";
import { applyEmployeeScopeFilter } from "@/utils/employeeScope";

// Stat card component with loading state
const StatCard = ({
  title,
  value,
  icon: Icon,
  loading = false,
  className = "",
  color = "from-blue-500 to-cyan-500",
}) => (
  <Card
    className={`bg-slate-800/50 backdrop-blur-xl border-slate-700/50 ${className}`}
  >
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-slate-400 text-sm font-medium">{title}</p>
          {loading ? (
            <div className="h-8 flex items-center">
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            </div>
          ) : (
            <p className="text-2xl font-bold text-white mt-1">
              {typeof value === "number"
                ? value.toLocaleString("id-ID")
                : value}
            </p>
          )}
        </div>
        {Icon && (
          <div
            className={`w-12 h-12 rounded-lg bg-gradient-to-r ${color} flex items-center justify-center flex-shrink-0`}
          >
            <Icon className="w-6 h-6 text-white" />
          </div>
        )}
      </div>
    </CardContent>
  </Card>
);

const Dashboard = () => {
  const { toast } = useToast();
  const [unitInputValue, setUnitInputValue] = useState("Semua Unit Kerja");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Use departments hook
  const { departments, isLoadingDepartments, departmentsError } =
    useDepartments();

  const [stats, setStats] = useState({
    totalEmployees: 0,
    pnsCount: 0,
    pppkCount: 0,
    outsourcingCount: 0,
    rankGroups: {},
    totalLeaveRequests: 0,
    sickLeaveCount: 0,
    annualLeaveCount: 0,
    longLeaveCount: 0,
    maternityLeaveCount: 0,
    importantReasonLeaveCount: 0,
  });

  // Use departments from hook
  const departmentOptions = useMemo(() => departments, [departments]);

  // Optimized stats fetching with direct queries
  const fetchStats = useCallback(async () => {
    if (isLoadingDepartments) return;

    setIsLoadingStats(true);
    setError(null);

    try {
      console.log("Fetching stats for department:", selectedUnit);

      const currentUser = AuthManager.getUserSession();

      // Build base employee query — scoped by role
      let employeeQuery = supabaseSimpelAdmin.from("employees").select("*");
      employeeQuery = applyEmployeeScopeFilter(employeeQuery, currentUser);

      // Apply department filter if selected
      if (selectedUnit && selectedUnit.trim() !== "") {
        employeeQuery = employeeQuery.ilike("department", `%${selectedUnit}%`);
      }

      // Fetch employees
      const { data: employees, error: employeeError } = await employeeQuery;
      if (employeeError) throw employeeError;

      // Calculate employee stats
      const totalEmployees = employees?.length || 0;
      const pnsCount =
        employees?.filter((emp) => emp.asn_status === "PNS").length || 0;
      const pppkCount =
        employees?.filter((emp) => emp.asn_status === "PPPK").length || 0;
      const outsourcingCount =
        employees?.filter(
          (emp) =>
            emp.asn_status === "Non ASN" || emp.position_type === "Outsourcing",
        ).length || 0;

      // Calculate rank groups
      const rankGroups = {};
      employees?.forEach((emp) => {
        if (emp.rank_group) {
          rankGroups[emp.rank_group] = (rankGroups[emp.rank_group] || 0) + 1;
        }
      });

      // Build leave requests query
      let leaveQuery = supabase
        .from("leave_requests")
        .select("*, employees!inner(department)");

      // Apply department filter to leave requests if selected
      if (selectedUnit && selectedUnit.trim() !== "") {
        leaveQuery = leaveQuery.ilike(
          "employees.department",
          `%${selectedUnit}%`,
        );
      }

      // Fetch leave requests
      const { data: leaveRequests, error: leaveError } = await leaveQuery;
      if (leaveError) {
        console.warn("Leave requests query failed:", leaveError);
        // Continue without leave data
      }

      // Calculate leave stats (with fallback if leave_types table doesn't exist)
      let leaveStats = {
        totalLeaveRequests: 0,
        sickLeaveCount: 0,
        annualLeaveCount: 0,
        longLeaveCount: 0,
        maternityLeaveCount: 0,
        importantReasonLeaveCount: 0,
      };

      if (leaveRequests) {
        leaveStats.totalLeaveRequests = leaveRequests.length;

        // Try to get leave types for proper categorization
        try {
          const { data: leaveTypes } = await supabase
            .from("leave_types")
            .select("*");

          if (leaveTypes) {
            const typeMap = {};
            leaveTypes.forEach((lt) => {
              typeMap[lt.id] = lt.name;
            });

            leaveRequests.forEach((req) => {
              const typeName = typeMap[req.leave_type_id] || "";
              if (typeName.includes("Sakit")) leaveStats.sickLeaveCount++;
              else if (typeName.includes("Tahunan"))
                leaveStats.annualLeaveCount++;
              else if (typeName.includes("Besar")) leaveStats.longLeaveCount++;
              else if (typeName.includes("Melahirkan"))
                leaveStats.maternityLeaveCount++;
              else if (typeName.includes("Penting"))
                leaveStats.importantReasonLeaveCount++;
            });
          }
        } catch (leaveTypeError) {
          console.warn("Could not fetch leave types:", leaveTypeError);
        }
      }

      const finalStats = {
        totalEmployees,
        pnsCount,
        pppkCount,
        outsourcingCount,
        rankGroups,
        ...leaveStats,
      };

      console.log("Dashboard stats calculated:", finalStats);
      setStats(finalStats);
    } catch (err) {
      console.error("Error fetching stats:", err);
      setError("Gagal memuat data statistik. Silakan coba lagi.");
      toast({
        variant: "destructive",
        title: "Gagal memuat statistik",
        description: err.message,
      });
    } finally {
      setIsLoadingStats(false);
      setIsRefreshing(false);
    }
  }, [selectedUnit, isLoadingDepartments, toast]);

  // Fetch stats when dependencies change
  useEffect(() => {
    if (!isLoadingDepartments) {
      fetchStats();
    }
  }, [selectedUnit, isLoadingDepartments, fetchStats]);

  // Initial data load - departments are handled by the hook

  // Handle manual refresh
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setSelectedUnit("");
    setUnitInputValue("Semua Unit Kerja");
    fetchStats();
  }, [fetchStats]);

  // Format date for display
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Tambahkan log untuk debug autocomplete
  console.log("Autocomplete options:", departmentOptions);

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">
            Dashboard
          </h1>
          <p className="text-slate-400 text-sm">
            {selectedUnit
              ? `Menampilkan data untuk unit: ${selectedUnit}`
              : "Menampilkan data semua unit"}
            {!isLoadingStats && stats.totalEmployees > 0 && (
              <span className="ml-2 text-xs text-slate-500">
                (Diperbarui: {formatDate(new Date())})
              </span>
            )}
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={isLoadingStats || isLoadingDepartments}
          className="mt-3 md:mt-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRefreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Segarkan Data
        </Button>
      </div>

      {/* Filter Section */}
      <Card className="bg-slate-800/50 backdrop-blur-xl border-slate-700/50 mb-6">
        <CardContent className="p-4">
          <div className="max-w-2xl">
            <Label htmlFor="unit-filter" className="block text-sm font-medium text-slate-300 mb-2">
              Filter Berdasarkan Unit Penempatan
            </Label>
            <AutocompleteInput
              value={unitInputValue}
              onChange={setUnitInputValue}
              onSelect={(option) => {
                setSelectedUnit(option.value || "");
                setUnitInputValue(option.label || "");
              }}
              options={departmentOptions}
              loading={isLoadingDepartments}
              disabled={isLoadingDepartments || isLoadingStats}
              placeholder="Ketik nama unit..."
              error={error}
            />
            <p className="mt-2 text-xs text-slate-400">
              Ketik untuk mencari unit. Pilih dari daftar saran atau ketik
              manual.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Error Message */}
      {error && (
        <Card className="bg-red-900/30 border-red-700 text-red-200 mb-6">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Employee Statistics */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">
          Statistik Pegawai
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <StatCard
            title="Total Pegawai"
            value={stats.totalEmployees}
            icon={Users}
            loading={isLoadingStats}
          />
          <StatCard
            title="Pegawai PNS"
            value={stats.pnsCount}
            icon={Users}
            loading={isLoadingStats}
            color="from-green-500 to-emerald-500"
          />
          <StatCard
            title="Pegawai PPPK"
            value={stats.pppkCount}
            icon={Users}
            loading={isLoadingStats}
            color="from-yellow-500 to-orange-500"
          />
          <StatCard
            title="Pegawai Lainnya"
            value={stats.outsourcingCount}
            icon={Users}
            loading={isLoadingStats}
            color="from-purple-500 to-pink-500"
          />
        </div>
      </div>

      {/* Leave Request Statistics */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">
          Statistik Cuti
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 mb-8">
          <StatCard
            title="Total Pengajuan Cuti"
            value={stats.totalLeaveRequests}
            icon={Calendar}
            loading={isLoadingStats}
          />
          <StatCard
            title="Cuti Sakit"
            value={stats.sickLeaveCount}
            icon={Calendar}
            loading={isLoadingStats}
            color="from-red-500 to-pink-500"
          />
          <StatCard
            title="Cuti Tahunan"
            value={stats.annualLeaveCount}
            icon={Calendar}
            loading={isLoadingStats}
            color="from-green-500 to-emerald-500"
          />
          <StatCard
            title="Cuti Besar"
            value={stats.longLeaveCount}
            icon={Calendar}
            loading={isLoadingStats}
            color="from-yellow-500 to-orange-500"
          />
          <StatCard
            title="Cuti Melahirkan"
            value={stats.maternityLeaveCount}
            icon={Calendar}
            loading={isLoadingStats}
            color="from-pink-500 to-rose-500"
          />
          <StatCard
            title="Cuti Alasan Penting"
            value={stats.importantReasonLeaveCount}
            icon={Calendar}
            loading={isLoadingStats}
            color="from-indigo-500 to-purple-500"
          />
        </div>
      </div>

      {/* Summary Section */}
      {stats.totalEmployees > 0 && (
        <div className="space-y-6">
          <Card className="bg-slate-800/30 backdrop-blur-xl border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white">
                Distribusi Pangkat/Golongan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Object.entries(stats.rankGroups).map(([rank, count]) => (
                  <div
                    key={rank}
                    className="bg-slate-700/30 rounded p-4 border border-slate-600/30"
                  >
                    <div className="text-sm text-slate-400">
                      {rank || "Tidak Diketahui"}
                    </div>
                    <div className="text-xl font-bold text-white">
                      {count}{" "}
                      <span className="text-sm text-slate-400">
                        ({Math.round((count / stats.totalEmployees) * 100)}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/30 backdrop-blur-xl border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white">Ringkasan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h4 className="text-sm font-medium text-slate-400 mb-3">
                    Distribusi Jenis Pegawai
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-green-400">Pegawai PNS</span>
                      <span className="text-white">
                        {stats.pnsCount} (
                        {stats.totalEmployees > 0
                          ? Math.round(
                              (stats.pnsCount / stats.totalEmployees) * 100,
                            )
                          : 0}
                        %)
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-yellow-400">Pegawai PPPK</span>
                      <span className="text-white">
                        {stats.pppkCount} (
                        {stats.totalEmployees > 0
                          ? Math.round(
                              (stats.pppkCount / stats.totalEmployees) * 100,
                            )
                          : 0}
                        %)
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-purple-400">Pegawai Lainnya</span>
                      <span className="text-white">
                        {stats.outsourcingCount} (
                        {stats.totalEmployees > 0
                          ? Math.round(
                              (stats.outsourcingCount / stats.totalEmployees) *
                                100,
                            )
                          : 0}
                        %)
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-slate-400 mb-3">
                    Rata-rata Cuti per Pegawai
                  </h4>
                  <div className="text-white text-2xl font-bold mb-3">
                    {stats.totalEmployees > 0
                      ? (
                          stats.totalLeaveRequests / stats.totalEmployees
                        ).toFixed(1)
                      : "0.0"}
                    <span className="text-sm text-slate-400 ml-1">
                      cuti/pegawai
                    </span>
                  </div>
                  <div className="text-sm text-slate-400">
                    Total {stats.totalLeaveRequests} cuti dari{" "}
                    {stats.totalEmployees} pegawai
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
