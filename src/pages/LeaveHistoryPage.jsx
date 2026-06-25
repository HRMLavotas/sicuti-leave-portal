import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  History,
  Download,
  Calendar,
  User,
  Clock,
  TrendingUp,
  FileText,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/hooks/useAuth";
import { checkSupabaseConnection } from "@/utils/supabaseHealthChecker";

import { useLeaveTypes } from "@/hooks/useLeaveTypes";
import { useDepartments } from "@/hooks/useDepartments";
import LeaveHistoryEmployeeCard from "@/components/leave_history/LeaveHistoryEmployeeCard";
import LeaveHistoryDeferralInfo from "@/components/leave_history/LeaveHistoryDeferralInfo";
import AddDeferredLeaveDialog from "@/components/leave_history/AddDeferredLeaveDialog";
import EmployeeLeaveHistoryModal from "@/components/leave_history/EmployeeLeaveHistoryModal";

import LeaveHistoryFilters from "@/components/leave_history/LeaveHistoryFilters";
import { exportToExcelWithMultipleSheets } from "@/utils/excelUtils";
import { calculateLeaveBalance, ensureLeaveBalance } from "@/utils/leaveBalanceCalculator";
import { useLeaveBalanceYear } from "@/hooks/useLeaveBalanceYear";

const STATIC_LEAVE_TYPES_CONFIG = {
  "Cuti Tahunan": {
    key: "annual",
    name: "Cuti Tahunan",
    color: "from-blue-500 to-cyan-500",
    default_days: 12,
    can_defer: true,
  },
  "Cuti Sakit": {
    key: "sick",
    name: "Cuti Sakit",
    color: "from-red-500 to-pink-500",
    default_days: 12,
    max_days: 365,
  },
  "Cuti Alasan Penting": {
    key: "important",
    name: "Cuti Alasan Penting",
    color: "from-yellow-500 to-orange-500",
    default_days: 30,
    max_days: 30,
  },
  "Cuti Besar": {
    key: "big",
    name: "Cuti Besar",
    color: "from-purple-500 to-indigo-500",
    default_days: 60,
    max_days: 90,
  },
  "Cuti Melahirkan": {
    key: "maternity",
    name: "Cuti Melahirkan",
    color: "from-green-500 to-emerald-500",
    default_days: 90,
    max_days: 90,
  },
};

const LEAVE_HISTORY_PER_PAGE = 10;

const LeaveHistoryPage = () => {
  const { toast } = useToast();
  const { profile } = useAuth(); // Use new Supabase auth hook
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  // Default to current year dynamically
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear().toString());
  const [selectedUnitPenempatan, setSelectedUnitPenempatan] = useState("");
  const [employeesWithBalances, setEmployeesWithBalances] = useState([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [totalEmployeesInFilter, setTotalEmployeesInFilter] = useState(0);
  const [overallTotalEmployees, setOverallTotalEmployees] = useState(0);
  const [isAddDeferredOpen, setIsAddDeferredOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedEmployeeLeaveData, setSelectedEmployeeLeaveData] =
    useState(null);
  const [selectedDeferralLog, setSelectedDeferralLog] = useState(null);

  const { leaveTypes, isLoadingLeaveTypes } = useLeaveTypes();
  const { departments: unitPenempatanOptions, isLoadingDepartments } =
    useDepartments();
  const { currentYear } = useLeaveBalanceYear();

  // Track if initial data fetch has been completed to prevent duplicates
  const [hasInitialLoad, setHasInitialLoad] = useState(false);

  // Dynamically generate years based on current year (5 years back and 2 years forward)
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const yearsArray = [];
    // Include 3 years back, current year, and 2 years forward
    for (let y = currentYear - 3; y <= currentYear + 2; y++) {
      yearsArray.push(y.toString());
    }
    return yearsArray;
  }, []);

  // Set default selected year to current year on mount
  useEffect(() => {
    const currentYear = new Date().getFullYear().toString();
    // Only set if selectedYear is not in the valid years list or is outdated
    if (!years.includes(selectedYear)) {
      setSelectedYear(currentYear);
    }
  }, [years, selectedYear]);

  const getLeaveTypeConfig = useCallback(
    (leaveTypeName) => {
      const dbType = leaveTypes.find((lt) => lt.name === leaveTypeName);
      const staticConfig = Object.values(STATIC_LEAVE_TYPES_CONFIG).find(
        (ltc) => ltc.name === leaveTypeName,
      );

      if (dbType) {
        return {
          key: dbType.name
            .toLowerCase()
            .replace(/\s+/g, "_")
            .replace(/-/g, "_"),
          name: dbType.name,
          color: staticConfig?.color || "from-gray-500 to-gray-600",
          default_days: dbType.default_days,
          can_defer: dbType.can_defer,
          max_days: staticConfig?.max_days,
        };
      }
      return (
        staticConfig || {
          key: "unknown",
          name: leaveTypeName,
          color: "from-gray-500 to-gray-600",
          default_days: 0,
          can_defer: false,
        }
      );
    },
    [leaveTypes],
  );

  const fetchLeaveData = useCallback(
    async (isInitialLoad = false) => {
      if (leaveTypes.length === 0 && !isLoadingLeaveTypes) {
        toast({
          variant: "destructive",
          title: "Data Jenis Cuti Kosong",
          description:
            "Tidak dapat mengambil data saldo karena jenis cuti belum termuat.",
        });
        return;
      }
      if (isLoadingLeaveTypes) return;

      setIsLoadingData(true);
      try {
        const currentUser = profile;

        // Build the base query for employees
        let query = supabase
          .from("employees")
          .select("id, name, nip, department, position_name, rank_group", {
            count: "exact",
          });

        // Apply role-based filtering
        const userUnit = currentUser?.unit_kerja || currentUser?.unitKerja;
        const userNip = currentUser?.nip;

        // Employee role: hanya tampilkan data mereka sendiri berdasarkan NIP
        if (currentUser?.role === 'employee' && userNip) {
          query = query.eq("nip", userNip);
        } else if (currentUser?.role === 'admin_unit' && userUnit) {
          if (userUnit.length > 0 && userUnit.length < 500) {
            query = query.eq("department", userUnit);
          } else {
            throw new Error("Invalid unit name in user session");
          }
        } else if (currentUser?.role === 'admin_unit') {
          query = query.eq("id", "00000000-0000-0000-0000-000000000000");
        } else if (currentUser?.role === 'employee' && !userNip) {
          // Employee tanpa NIP, tampilkan data kosong
          query = query.eq("id", "00000000-0000-0000-0000-000000000000");
        }

        // Add search filter if search term exists
        if (debouncedSearchTerm) {
          query = query.or(
            `name.ilike.%${debouncedSearchTerm}%,nip.ilike.%${debouncedSearchTerm}%`,
          );
        }

        // Add department filter if selected
        if (selectedUnitPenempatan && selectedUnitPenempatan.trim() !== "") {
          query = query.ilike(
            "department",
            `%${selectedUnitPenempatan.trim()}%`,
          );
        }

        // Add pagination
        query = query.range(0, LEAVE_HISTORY_PER_PAGE - 1);

        // Execute the query
        const { data: employeesData, error: employeesError, count } = await query;

        if (employeesError) {
          throw employeesError;
        }

        setTotalEmployeesInFilter(count || 0);

        // Get total employees count on initial load only
        if (isInitialLoad && overallTotalEmployees === 0) {
          let totalCountQuery = supabase
            .from("employees")
            .select("*", { count: "exact", head: true });

          if (currentUser?.role === 'employee' && userNip) {
            totalCountQuery = totalCountQuery.eq("nip", userNip);
          } else if (currentUser?.role === 'admin_unit' && userUnit) {
            totalCountQuery = totalCountQuery.eq("department", userUnit);
          } else if (currentUser?.role === 'admin_unit') {
            totalCountQuery = totalCountQuery.eq("id", "00000000-0000-0000-0000-000000000000");
          } else if (currentUser?.role === 'employee' && !userNip) {
            totalCountQuery = totalCountQuery.eq("id", "00000000-0000-0000-0000-000000000000");
          }

          const { count: totalCount, error: countError } = await totalCountQuery;
          if (!countError) {
            setOverallTotalEmployees(totalCount || 0);
          }
        }

        // Return early if no employees found
        if (!employeesData || employeesData.length === 0) {
          setEmployeesWithBalances([]);
          setIsLoadingData(false);
          return;
        }

        // Get employee IDs for fetching related data
        const employeeIds = employeesData.map((emp) => emp.id);
        const year = parseInt(selectedYear);
        const previousYear = year - 1;

        // Parallel fetch: balances, requests, and deferral logs
        // This avoids sequential queries and dramatically improves performance
        const [balancesResult, requestsResult, deferralsResult] = await Promise.all([
          // Fetch existing balances
          supabase
            .from("leave_balances")
            .select("employee_id, year, total_days, used_days, deferred_days, leave_type_id")
            .eq("year", year)
            .in("employee_id", employeeIds),

          // Fetch leave requests
          supabase
            .from("leave_requests")
            .select("employee_id, leave_type_id, days_requested, leave_quota_year, leave_period, start_date")
            .in("employee_id", employeeIds)
            .gte("start_date", `${year - 1}-01-01`)
            .lte("start_date", `${year + 1}-12-31`),

          // Fetch deferral logs for previous year
          supabase
            .from("leave_deferrals")
            .select("id, employee_id, days_deferred, google_drive_link")
            .eq("year", previousYear)
            .in("employee_id", employeeIds)
        ]);

        const { data: leaveBalancesData, error: balancesError } = balancesResult;
        const { data: leaveRequestsData, error: requestsError } = requestsResult;
        const { data: deferralsLogData, error: deferralsLogError } = deferralsResult;

        if (balancesError) throw balancesError;
        if (requestsError) throw requestsError;
        if (deferralsLogError) throw deferralsLogError;

        // Identify missing balance records and ensure they exist
        const existingBalanceKeys = new Set(
          (leaveBalancesData || []).map((b) => `${b.employee_id}-${b.leave_type_id}`)
        );

        const missingBalances = [];
        for (const emp of employeesData) {
          for (const leaveType of leaveTypes) {
            const key = `${emp.id}-${leaveType.id}`;
            if (!existingBalanceKeys.has(key)) {
              missingBalances.push({ emp, leaveType });
            }
          }
        }

        // Batch ensure missing balances (much faster than individual calls)
        if (missingBalances.length > 0) {
          const deferralLogMap = new Map(
            (deferralsLogData || []).map((d) => [d.employee_id, d.days_deferred])
          );

          const batchInserts = missingBalances.map(({ emp, leaveType }) => {
            let deferredDays = 0;
            if (leaveType.can_defer && previousYear >= 2020) {
              deferredDays = deferralLogMap.get(emp.id) || 0;
            }
            return {
              employee_id: emp.id,
              leave_type_id: leaveType.id,
              year: year,
              total_days: leaveType.default_days || 0,
              used_days: 0,
              deferred_days: deferredDays,
            };
          });

          // Insert missing balances in batch (single query)
          if (batchInserts.length > 0) {
            const { error: insertError } = await supabase
              .from("leave_balances")
              .insert(batchInserts);

            if (insertError && insertError.code !== '23505') { // 23505 = unique constraint
              console.warn("Non-critical batch insert error:", insertError);
            }
          }

          // Fetch updated balances after batch insert
          const { data: updatedBalances, error: updatedError } = await supabase
            .from("leave_balances")
            .select("employee_id, year, total_days, used_days, deferred_days, leave_type_id")
            .eq("year", year)
            .in("employee_id", employeeIds);

          if (!updatedError) {
            leaveBalancesData.push(...(updatedBalances || []));
          }
        }

        // Create maps for O(1) lookups instead of O(n) filtering
        const deferralLogMap = new Map();
        (deferralsLogData || []).forEach((d) => {
          deferralLogMap.set(d.employee_id, {
            id: d.id,
            days_deferred: d.days_deferred,
            google_drive_link: d.google_drive_link,
          });
        });

        // Create maps for employee balances and requests by employee ID
        const balancesByEmployeeMap = new Map();
        (leaveBalancesData || []).forEach((balance) => {
          const key = balance.employee_id;
          if (!balancesByEmployeeMap.has(key)) {
            balancesByEmployeeMap.set(key, []);
          }
          balancesByEmployeeMap.get(key).push(balance);
        });

        const requestsByEmployeeMap = new Map();
        (leaveRequestsData || []).forEach((request) => {
          const key = request.employee_id;
          if (!requestsByEmployeeMap.has(key)) {
            requestsByEmployeeMap.set(key, []);
          }
          requestsByEmployeeMap.get(key).push(request);
        });

        // Process employee data with their leave balances
        const processedData = employeesData.map((emp) => {
          // Optimize: Use maps for O(1) lookups
          const empBalances = balancesByEmployeeMap.get(emp.id) || [];
          const empLeaveRequests = requestsByEmployeeMap.get(emp.id) || [];
          const balances = {};

          // Initialize balances for each leave type
          leaveTypes.forEach((leaveType) => {
            const ltConfig = getLeaveTypeConfig(leaveType.name);
            const dbBalance = empBalances.find(
              (b) => b.leave_type_id === leaveType.id,
            );

            // Use the new utility function for accurate calculation
            const calculatedBalance = calculateLeaveBalance({
              dbBalance,
              leaveRequests: empLeaveRequests,
              leaveType,
              year,
              currentYear,
            });

            // Extract values from calculated balance
            const total = calculatedBalance.total;
            const deferred = calculatedBalance.deferred;
            const usedFromCurrentYear = calculatedBalance.used_current;
            const usedFromDeferred = calculatedBalance.used_deferred;
            const totalUsed = calculatedBalance.used;
            const remaining = calculatedBalance.remaining;

            // Set the balance for this leave type
            if (ltConfig) {
              balances[ltConfig.key] = {
                total,
                used: totalUsed,
                used_current: usedFromCurrentYear,
                used_deferred: usedFromDeferred,
                remaining,
                deferred,
              };
            }
          });

          // Return the processed employee data
          return {
            id: emp.id,
            employeeName: emp.name,
            nip: emp.nip,
            department: emp.department,
            positionName: emp.position_name,
            rankGroup: emp.rank_group,
            year,
            balances,
            deferralLog: deferralLogMap.get(emp.id) || null,
          };
        });

        // Update the state with processed data
        setEmployeesWithBalances(processedData);
      } catch (error) {
        // Determine appropriate error message based on error type
        let errorMessage = "Terjadi kesalahan saat mengambil data cuti. Silakan coba lagi.";
        let errorTitle = "Gagal mengambil data cuti";

        if (error?.message?.includes("fetch") || error?.name === "TypeError") {
          errorMessage = "Gagal terhubung ke server. Periksa koneksi internet Anda.";
          errorTitle = "Connection Error";
        } else if (error?.message?.includes("permission") || error?.message?.includes("policy")) {
          errorMessage = "Anda tidak memiliki izin untuk mengakses data ini.";
          errorTitle = "Permission Error";
        } else if (error?.code) {
          errorMessage = `Database error (${error.code}): ${error.message}`;
          errorTitle = "Database Error";
        } else if (error?.message) {
          errorMessage = error.message;
        }

        toast({
          variant: "destructive",
          title: errorTitle,
          description: errorMessage,
        });

        // Reset data on error
        setEmployeesWithBalances([]);
        setTotalEmployeesInFilter(0);
      } finally {
        setIsLoadingData(false);
      }
    },
    [
      toast,
      selectedYear,
      debouncedSearchTerm,
      selectedUnitPenempatan,
      leaveTypes,
      getLeaveTypeConfig,
      overallTotalEmployees,
      isLoadingLeaveTypes,
      LEAVE_HISTORY_PER_PAGE,
    ],
  );

  const handleOpenAddDeferred = (employee, deferralLog) => {
    setSelectedEmployee(employee);
    setSelectedDeferralLog(deferralLog);
    setIsAddDeferredOpen(true);
  };

  const handleViewHistory = async (employee) => {
    if (!employee?.id) {
      console.error("No employee ID provided");
      toast({
        variant: "destructive",
        title: "Error",
        description: "Data pegawai tidak valid",
      });
      return;
    }

    setSelectedEmployee(employee);

    try {
      console.log("Fetching leave history for employee:", employee.id);

      // First, fetch the employee's leave requests without joining
      const { data: leaveHistory, error: leaveError } = await supabase
        .from("leave_requests")
        .select("*")
        .eq("employee_id", employee.id)
        .order("start_date", { ascending: false })
        .limit(1); // Only get the most recent leave request

      if (leaveError) {
        console.error("Supabase leave_requests query error:", leaveError);
        throw new Error(`Gagal mengambil data cuti: ${leaveError.message}`);
      }

      console.log("Leave history data received:", leaveHistory);

      if (leaveHistory && leaveHistory.length > 0) {
        const latestLeave = leaveHistory[0];

        // Format the leave data for the download using employee prop directly
        const leaveData = {
          employee_name:
            employee.name || employee.employeeName || "Nama Pegawai",
          nip: employee.nip || "NIP tidak tersedia",
          position:
            employee.position_name ||
            employee.positionName ||
            "Jabatan tidak tersedia",
          rank:
            employee.rank_group ||
            employee.rankGroup ||
            "Pangkat tidak tersedia",
          department: employee.department || "Unit Kerja tidak tersedia",
          leave_dates: [
            latestLeave.start_date || new Date().toISOString().split("T")[0],
            latestLeave.end_date || new Date().toISOString().split("T")[0],
          ],
          duration: latestLeave.days_requested || 1,
          duration_in_words:
            latestLeave.days_requested === 1
              ? "satu"
              : latestLeave.days_requested === 2
                ? "dua"
                : (latestLeave.days_requested || 1).toString(),
          address_during_leave:
            latestLeave.address_during_leave || "Alamat tidak tersedia",
          nomor_naskah: "800/", // Default value, should be replaced with actual data
          ttd_pengirim: "KEPALA BADAN PUSAT STATISTIK", // Default value
          nip_pengirim: "19670412 199203 1 001", // Default value
          pangkat_pengirim: "Pembina Utama Muda", // Default value
          nama_pengirim: "Ir. AMALIA ADININGGAR, M.Si.", // Default value
          created_at: new Date().toISOString().split("T")[0], // Current date in YYYY-MM-DD format
        };

        console.log("Prepared leave data for download:", leaveData);
        setSelectedEmployeeLeaveData(leaveData);
      } else {
        console.log("No leave history found for employee:", employee.id);
        setSelectedEmployeeLeaveData(null);
        toast({
          variant: "info",
          title: "Tidak ada riwayat cuti",
          description:
            "Tidak ada riwayat cuti yang ditemukan untuk pegawai ini.",
        });
      }

      setIsHistoryOpen(true);
    } catch (error) {
      console.error("Error in handleViewHistory:", error);
      toast({
        variant: "destructive",
        title: "Gagal mengambil data cuti",
        description:
          error.message ||
          "Terjadi kesalahan saat mengambil data riwayat cuti. Silakan coba lagi.",
      });
    }
  };

  const handleDataChange = () => {
    // Force refresh dengan delay kecil untuk memastikan database sudah ter-update
    setTimeout(() => {
      fetchLeaveData(true); // Force full refresh including total counts
    }, 500);
  };

  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);
    return () => clearTimeout(timerId);
  }, [searchTerm]);

  // Consolidated effect: fetch data when filters or year changes
  // On initial load: isInitialLoad=true, on filter changes: isInitialLoad=false
  useEffect(() => {
    if (!isLoadingLeaveTypes && leaveTypes.length > 0) {
      const isYearChange = true; // Year changes should refetch counts
      fetchLeaveData(isYearChange);
      setHasInitialLoad(true);
    }
  }, [
    selectedYear,
    debouncedSearchTerm,
    selectedUnitPenempatan,
    leaveTypes,
    isLoadingLeaveTypes,
    fetchLeaveData,
  ]);


  const handleRefresh = () => {
    setSearchTerm("");
    setSelectedUnitPenempatan("");
    setSelectedYear("2025");
  };

  const handleFeatureClick = (feature) => {
    toast({
      title: `ðŸš€ ${feature}`,
      description:
        "ï¿½ï¿½ Fitur ini belum diimplementasikanâ€”tapi jangan khawatir! Anda bisa memintanya di prompt berikutnya! ðŸš€",
    });
  };

  const handleExportDataCuti = async () => {
    try {
      toast({
        title: "ðŸ“Š Export Data Cuti",
        description: "Sedang mempersiapkan data untuk export...",
      });

      // Fetch leave requests data
      const { data: leaveRequests, error: leaveRequestsError } = await supabase
        .from("leave_requests")
        .select(
          `
          *,
          employees (name, nip, department),
          leave_types (name)
        `,
        )
        .order("created_at", { ascending: false });

      if (leaveRequestsError) throw leaveRequestsError;

      // Fetch deferrals data
      const { data: deferrals, error: deferralsError } = await supabase
        .from("leave_deferrals")
        .select(
          `
          *,
          employees (name, nip, department)
        `,
        )
        .order("created_at", { ascending: false });

      if (deferralsError) throw deferralsError;

      // Get unique employee IDs who have leave requests
      const employeeIdsWithRequests = [
        ...new Set(
          leaveRequests?.map((req) => req.employee_id).filter(Boolean) || [],
        ),
      ];

      // Fetch leave balances only for employees who have leave requests
      const { data: leaveBalances, error: leaveBalancesError } = await supabase
        .from("leave_balances")
        .select(
          `
          *,
          employees (name, nip, department),
          leave_types (name)
        `,
        )
        .in("employee_id", employeeIdsWithRequests)
        .eq("year", parseInt(selectedYear))
        .order("employees(name)", { ascending: true });

      if (leaveBalancesError) throw leaveBalancesError;

      console.log("ðŸ“‹ Leave balances data:", leaveBalances);
      console.log("ðŸ“Š Total leave balances:", leaveBalances?.length || 0);

      // Filter leaveBalances hanya untuk Cuti Tahunan
      const cutiTahunanBalances =
        leaveBalances?.filter((b) => b.leave_types?.name === "Cuti Tahunan") ||
        [];

      // Ambil leave_requests hanya untuk Cuti Tahunan
      const cutiTahunanRequests =
        leaveRequests?.filter((r) => r.leave_types?.name === "Cuti Tahunan") ||
        [];

      // Buat mapping saldo cuti tahunan per pegawai
      const saldoCutiTahunan = cutiTahunanBalances.map((balance) => {
        const employee_id = balance.employee_id;
        const employee_name = balance.employees?.name || "";
        const employee_nip = balance.employees?.nip || "";
        const employee_department = balance.employees?.department || "";
        const year = balance.year;
        const jatah_tahun_berjalan = balance.total_days || 0;
        const jatah_penangguhan = balance.deferred_days || 0;

        const normalizeYear = (value) => {
          if (value == null) return null;
          const parsed = typeof value === "string" ? parseInt(value, 10) : value;
          return Number.isFinite(parsed) ? parsed : null;
        };

        const isRequestPeriod = (r) => {
          const executionYear = r?.start_date
            ? new Date(r.start_date).getFullYear()
            : null;
          const requestPeriod = normalizeYear(r?.leave_period) || executionYear;
          return requestPeriod === year;
        };

        // Digunakan tahun berjalan: leave_requests dengan leave_quota_year == year
        const digunakan_tahun_berjalan = cutiTahunanRequests
          .filter(
            (r) =>
              r.employee_id === employee_id &&
              isRequestPeriod(r) &&
              normalizeYear(r.leave_quota_year) === year,
          )
          .reduce((sum, r) => sum + (r.days_requested || r.days || 0), 0);

        // Digunakan penangguhan: leave_requests dengan leave_quota_year < year
        const digunakan_penangguhan = cutiTahunanRequests
          .filter(
            (r) =>
              r.employee_id === employee_id &&
              isRequestPeriod(r) &&
              (normalizeYear(r.leave_quota_year) ?? year) < year,
          )
          .reduce((sum, r) => sum + (r.days_requested || r.days || 0), 0);

        const sisa_tahun_berjalan =
          jatah_tahun_berjalan - digunakan_tahun_berjalan;
        const sisa_penangguhan = jatah_penangguhan - digunakan_penangguhan;

        return {
          employee_id,
          employee_name,
          employee_nip,
          employee_department,
          year,
          jatah_tahun_berjalan,
          digunakan_tahun_berjalan,
          sisa_tahun_berjalan,
          jatah_penangguhan,
          digunakan_penangguhan,
          sisa_penangguhan,
        };
      });

      // Hanya tampilkan pegawai yang punya pengajuan cuti tahunan
      const saldoCutiTahunanFiltered = saldoCutiTahunan.filter((row) => {
        return (
          row.digunakan_tahun_berjalan > 0 || row.digunakan_penangguhan > 0
        );
      });

      // Format data untuk export
      const formattedLeaveRequests =
        leaveRequests?.map((request) => ({
          employee_id: request.employee_id,
          employee_name: request.employees?.name || "",
          employee_nip: request.employees?.nip || "",
          employee_department: request.employees?.department || "",
          leave_type: request.leave_types?.name || "",
          start_date: request.start_date,
          end_date: request.end_date,
          days: request.days_requested || request.days,
          leave_quota_year: request.leave_quota_year,
          status: request.status,
          reason: request.reason,
          created_at: request.created_at,
          notes: request.notes || "",
        })) || [];

      const formattedDeferrals =
        deferrals?.map((deferral) => ({
          employee_id: deferral.employee_id,
          employee_name: deferral.employees?.name || "",
          employee_nip: deferral.employees?.nip || "",
          employee_department: deferral.employees?.department || "",
          year: deferral.year,
          days_deferred: deferral.days_deferred,
          google_drive_link: deferral.google_drive_link || "",
          notes: deferral.notes || "",
          created_at: deferral.created_at,
          status: "Aktif",
        })) || [];

      // Untuk sheet Saldo Cuti, gunakan saldoCutiTahunanFiltered
      const exportData = {
        leaveRequests: formattedLeaveRequests,
        deferrals: formattedDeferrals,
        leaveBalances: saldoCutiTahunanFiltered,
      };

      console.log("ðŸ“¦ Final export data:", exportData);

      const fileName = `Data_Cuti_${new Date().toISOString().split("T")[0]}.xlsx`;

      await exportToExcelWithMultipleSheets(exportData, fileName);

      toast({
        title: "âœ… Export Berhasil",
        description: `Data cuti berhasil diekspor ke file ${fileName}`,
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        variant: "destructive",
        title: "âŒ Export Gagal",
        description: error.message || "Gagal mengekspor data cuti",
      });
    }
  };

  const dynamicLeaveTypesConfig = useMemo(() => {
    if (leaveTypes.length === 0) return STATIC_LEAVE_TYPES_CONFIG;
    const config = {};
    leaveTypes.forEach((lt) => {
      const staticConfig = Object.values(STATIC_LEAVE_TYPES_CONFIG).find(
        (slt) => slt.name === lt.name,
      );
      config[lt.name] = {
        key: lt.name.toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_"),
        name: lt.name,
        color: staticConfig?.color || "from-gray-500 to-gray-600",
        default_days: lt.default_days,
        can_defer: lt.can_defer,
        max_days: staticConfig?.max_days,
      };
    });
    return config;
  }, [leaveTypes]);

  const isEmployee = profile?.role === 'employee';

  return (
    <>
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              {isEmployee ? 'Riwayat & Saldo Cuti Saya' : 'Riwayat & Saldo Cuti'}
            </h1>
            <p className="text-slate-300">
              {isEmployee ? 'Lihat riwayat dan saldo cuti Anda' : 'Lihat riwayat cuti dan kelola saldo cuti tahunan'}
            </p>
          </div>
          <div className="flex space-x-2 mt-4 sm:mt-0">
            <Button
              onClick={() => fetchLeaveData(true)}
              variant="outline"
              className="border-slate-600 text-slate-300 hover:text-white"
              disabled={isLoadingData}
            >
              <RefreshCw
                className={`w-4 h-4 mr-2 ${isLoadingData ? "animate-spin" : ""}`}
              />
              {isLoadingData ? "Memuat..." : "Refresh"}
            </Button>
            {!isEmployee && (
              <Button
                onClick={handleExportDataCuti}
                className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Export Data Cuti
              </Button>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <LeaveHistoryFilters
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            selectedYear={selectedYear}
            onSelectedYearChange={setSelectedYear}
            years={years}
            selectedDepartment={selectedUnitPenempatan}
            onSelectedDepartmentChange={setSelectedUnitPenempatan}
            departments={unitPenempatanOptions}
            onRefresh={handleRefresh}
            isLoading={
              isLoadingData || isLoadingLeaveTypes || isLoadingDepartments
            }
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card className="bg-slate-800/50 backdrop-blur-xl border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white">
                Saldo Cuti Pegawai - Tahun {selectedYear}
              </CardTitle>
              <p className="text-sm text-slate-400">
                Menampilkan {employeesWithBalances.length} dari{" "}
                {totalEmployeesInFilter} pegawai sesuai filter. Total pegawai di
                sistem: {overallTotalEmployees}.
              </p>
              <div className="mt-2 p-2 bg-green-900/20 border border-green-600/30 rounded text-xs text-green-300">
                âœ… <strong>Fitur Aktif:</strong> Pemisahan saldo tahun berjalan
                vs penangguhan berdasarkan pilihan "Jatah Cuti Tahun" pada form
                pengajuan cuti. Migration database berhasil!
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingLeaveTypes ? (
                <div className="text-center py-8 text-slate-300">
                  Memuat konfigurasi jenis cuti...
                </div>
              ) : isLoadingData ? (
                <div className="text-center py-8 text-slate-300">
                  Memuat data saldo cuti...
                </div>
              ) : employeesWithBalances.length > 0 ? (
                <div className="space-y-6">
                  {employeesWithBalances.map((employee, index) => (
                    <LeaveHistoryEmployeeCard
                      key={employee.id}
                      employee={employee}
                      index={index}
                      leaveTypesConfig={dynamicLeaveTypesConfig}
                      leaveData={
                        employee.id === selectedEmployee?.id
                          ? selectedEmployeeLeaveData
                          : null
                      }
                      onAddDeferredLeave={!isEmployee ? handleOpenAddDeferred : undefined}
                      onViewHistory={handleViewHistory}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <History className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">
                    Tidak ada data saldo cuti yang ditemukan untuk filter ini.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <LeaveHistoryDeferralInfo />
      </div>
      <AddDeferredLeaveDialog
        isOpen={isAddDeferredOpen}
        onOpenChange={setIsAddDeferredOpen}
        employee={selectedEmployee}
        year={parseInt(selectedYear)}
        onSuccess={handleDataChange}
        leaveTypes={leaveTypes}
        deferralLog={selectedDeferralLog}
      />
      <EmployeeLeaveHistoryModal
        isOpen={isHistoryOpen}
        onOpenChange={setIsHistoryOpen}
        employee={selectedEmployee}
        year={parseInt(selectedYear)}
        onDataChange={handleDataChange}
      />
    </>
  );
};

export default LeaveHistoryPage;
