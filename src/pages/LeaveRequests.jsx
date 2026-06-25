import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  FileText,
  Plus,
  Filter,
  Search,
  CalendarDays,
  RefreshCw,
  Edit,
  Trash2,
  Calendar as CalendarIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { getSimpelEmployees } from "@/hooks/useSimpelEmployees";
import LeaveRequestForm from "@/components/leave_requests/LeaveRequestForm";
import LeaveRequestCard from "@/components/leave_requests/LeaveRequestCard";
import { Combobox } from "@/components/ui/combobox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { useDepartments } from "@/hooks/useDepartments";
import { useLeaveTypes } from "@/hooks/useLeaveTypes";
import { AuthManager } from "@/lib/auth";

const LeaveRequests = () => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 10;

  const [isLoading, setIsLoading] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState(null);

  const { departments: unitPenempatanOptions, isLoadingDepartments } =
    useDepartments();
  const { leaveTypes, isLoadingLeaveTypes } = useLeaveTypes();

  const [selectedUnitPenempatan, setSelectedUnitPenempatan] = useState("");
  const [selectedLeaveType, setSelectedLeaveType] = useState("");
  const [selectedDateRange, setSelectedDateRange] = useState({
    from: null,
    to: null,
  });

  const fetchLeaveRequests = useCallback(async () => {
    setIsLoading(true);
    try {
      // First, get the total count for pagination
      let countQuery = supabase
        .from("leave_requests")
        .select("*", { count: "exact", head: true });

      // Apply unit-based filtering for admin_unit users
      const currentUser = AuthManager.getUserSession();

      // DEBUG: Log user session for leave requests
      console.log("ðŸ” DEBUG LeaveRequests - User session:", {
        role: currentUser?.role,
        unit_kerja: currentUser?.unit_kerja,
        unitKerja: currentUser?.unitKerja,
        nip: currentUser?.nip
      });

      // Fix: Use unit_kerja instead of unitKerja
      const userUnit = currentUser?.unit_kerja || currentUser?.unitKerja || currentUser?.department;
      let employeeIdsFilter = null;

      // Employee role: hanya bisa melihat data cuti mereka sendiri berdasarkan NIP
      if (currentUser && currentUser.role === 'employee' && currentUser.nip) {
        console.log("ðŸ” DEBUG LeaveRequests - Employee filtering by NIP:", currentUser.nip);

        const { data: selfEmployee, error: selfError } = await supabase
          .from("employees")
          .select("id")
          .eq("nip", currentUser.nip)
          .maybeSingle();

        if (selfError) {
          console.error("Error fetching employee by NIP:", selfError);
        }

        if (selfEmployee) {
          employeeIdsFilter = [selfEmployee.id];
          countQuery = countQuery.eq("employee_id", selfEmployee.id);
        } else {
          // NIP tidak ditemukan di data pegawai, tampilkan data kosong
          countQuery = countQuery.eq("employee_id", "00000000-0000-0000-0000-000000000000");
          employeeIdsFilter = [];
        }
      } else if (currentUser && currentUser.role === 'admin_unit' && userUnit) {
        console.log("ðŸ” DEBUG LeaveRequests - Getting employees from unit:", userUnit);

        // First get employee IDs from the user's unit
        const { data: unitEmployees, error: empError } = await supabase
          .from("employees")
          .select("id")
          .eq("department", userUnit);

        if (empError) {
          console.error("Error fetching unit employees:", empError);
        } else {
          employeeIdsFilter = unitEmployees.map(emp => emp.id);
          console.log("ðŸ” DEBUG LeaveRequests - Employee IDs in unit:", employeeIdsFilter.length);

          if (employeeIdsFilter.length > 0) {
            countQuery = countQuery.in("employee_id", employeeIdsFilter);
          } else {
            // No employees in this unit, return empty result
            countQuery = countQuery.eq("employee_id", "00000000-0000-0000-0000-000000000000"); // Non-existent ID
          }
        }
      }

      // Apply filters to the count query
      // Note: For search across joined tables, we'll fetch all data and filter client-side
      // This is more reliable than complex Supabase OR queries across relations
      if (selectedUnitPenempatan && selectedUnitPenempatan.trim() !== "") {
        countQuery = countQuery.ilike(
          "employees.department",
          `%${selectedUnitPenempatan}%`,
        );
      }
      if (
        selectedLeaveType &&
        selectedLeaveType !== "all" &&
        selectedLeaveType !== ""
      ) {
        countQuery = countQuery.eq("leave_type_id", selectedLeaveType);
      }
      if (selectedDateRange.from) {
        countQuery = countQuery.gte(
          "start_date",
          format(selectedDateRange.from, "yyyy-MM-dd"),
        );
      }
      if (selectedDateRange.to) {
        countQuery = countQuery.lte(
          "end_date",
          format(selectedDateRange.to, "yyyy-MM-dd"),
        );
      }

      // Get the data query with pagination
      let dataQuery = supabase
        .from("leave_requests")
        .select(
          `
          *,
          employees:employee_id!inner (id, name, nip, department, rank_group),
          leave_types!inner (id, name)
        `,
        )
        .order("submitted_date", { ascending: false });

      // Apply role-based filtering to data query (employee or admin_unit)
      if (currentUser && employeeIdsFilter) {
        if (currentUser.role === 'employee') {
          // Employee: filter to only their own data
          if (employeeIdsFilter.length > 0) {
            dataQuery = dataQuery.eq("employee_id", employeeIdsFilter[0]);
          } else {
            dataQuery = dataQuery.eq("employee_id", "00000000-0000-0000-0000-000000000000");
          }
        } else if (currentUser.role === 'admin_unit') {
          console.log("ðŸ” DEBUG LeaveRequests - Applying employee IDs filter to data query:", employeeIdsFilter.length);
          if (employeeIdsFilter.length > 0) {
            dataQuery = dataQuery.in("employee_id", employeeIdsFilter);
          } else {
            // No employees in this unit, return empty result
            dataQuery = dataQuery.eq("employee_id", "00000000-0000-0000-0000-000000000000"); // Non-existent ID
          }
        }
      }

      // Only apply pagination if not searching (for search, we need all data to filter client-side)
      if (!debouncedSearchTerm) {
        dataQuery = dataQuery.range(
          (currentPage - 1) * itemsPerPage,
          currentPage * itemsPerPage - 1,
        );
      }

      // Apply filters to the data query
      if (debouncedSearchTerm) {
        // For searching across related tables, we need to use separate filter conditions
        // Since Supabase doesn't support complex OR across joins, we'll use multiple conditions
        const searchTerm = debouncedSearchTerm.toLowerCase();

        // We'll apply this as a client-side filter after fetching the data
        // This is more reliable than trying to use complex OR queries across joins
      }
      if (selectedUnitPenempatan && selectedUnitPenempatan.trim() !== "") {
        dataQuery = dataQuery.ilike(
          "employees.department",
          `%${selectedUnitPenempatan}%`,
        );
      }
      if (
        selectedLeaveType &&
        selectedLeaveType !== "all" &&
        selectedLeaveType !== ""
      ) {
        dataQuery = dataQuery.eq("leave_type_id", selectedLeaveType);
      }
      if (selectedDateRange.from) {
        dataQuery = dataQuery.gte(
          "start_date",
          format(selectedDateRange.from, "yyyy-MM-dd"),
        );
      }
      if (selectedDateRange.to) {
        dataQuery = dataQuery.lte(
          "end_date",
          format(selectedDateRange.to, "yyyy-MM-dd"),
        );
      }

      const [{ data: requestsData, error: requestsError }, { count }] =
        await Promise.all([dataQuery, countQuery]);

      if (requestsError) throw requestsError;

      // Map the data first
      let mappedData = requestsData.map((req) => ({
        ...req,
        employee_id: req.employees.id,
        employeeName: req.employees.name,
        nip: req.employees.nip,
        department: req.employees.department,
        rank_group: req.employees.rank_group,
        leave_type_id: req.leave_types.id,
        leaveTypeName: req.leave_types.name,
      }));

      // Apply client-side search filter if needed
      if (debouncedSearchTerm) {
        const searchTerm = debouncedSearchTerm.toLowerCase();
        mappedData = mappedData.filter(
          (req) =>
            req.employeeName?.toLowerCase().includes(searchTerm) ||
            req.nip?.toLowerCase().includes(searchTerm) ||
            req.leaveTypeName?.toLowerCase().includes(searchTerm) ||
            req.reference_number?.toLowerCase().includes(searchTerm) ||
            req.reason?.toLowerCase().includes(searchTerm),
        );
      }

      // Calculate total pages based on filtered data if search is active
      const finalCount = debouncedSearchTerm ? mappedData.length : count || 0;
      const totalPages = Math.ceil(finalCount / itemsPerPage);
      setTotalPages(totalPages);
      setTotalItems(finalCount);

      // If current page is greater than total pages, reset to first page
      if (currentPage > 1 && currentPage > totalPages) {
        setCurrentPage(1);
        return; // Will trigger another fetch with page 1
      }

      // Apply pagination to filtered data if search is active
      if (debouncedSearchTerm) {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        mappedData = mappedData.slice(startIndex, endIndex);
      }

      setLeaveRequests(mappedData);
    } catch (error) {
      console.error("Error fetching leave requests:", error);
      toast({
        variant: "destructive",
        title: "Gagal mengambil data cuti",
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    toast,
    debouncedSearchTerm,
    selectedUnitPenempatan,
    selectedLeaveType,
    selectedDateRange,
    currentPage,
  ]);

  const fetchDropdownData = useCallback(async () => {
    try {
      // Query employees dari SIMPEL langsung
        const employeesData = await getSimpelEmployees(
          currentUser?.role === "admin_unit" ? currentUser?.department : null
        );
        setEmployees(employeesData);
      // Leave types and departments are fetched by their respective hooks
    } catch (error) {
      console.error("Error fetching dropdown data:", error);
      toast({
        variant: "destructive",
        title: "Gagal memuat data pendukung",
        description: error.message,
      });
    }
  }, [toast]);

  useEffect(() => {
    fetchLeaveRequests();
  }, [fetchLeaveRequests]);

  useEffect(() => {
    fetchDropdownData();
  }, [fetchDropdownData]);

  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);
    return () => clearTimeout(timerId);
  }, [searchTerm]);

  const handleRefresh = () => {
    setSearchTerm("");
    setDebouncedSearchTerm("");
    setSelectedUnitPenempatan("");
    setSelectedLeaveType("");
    setSelectedDateRange({ from: null, to: null });
    // fetchLeaveRequests will be called due to state changes in its dependency array
  };

  const onFormSubmitSuccess = () => {
    setIsFormOpen(false);
    setEditingRequest(null);
    fetchLeaveRequests();
  };

  const handleEditRequest = (request) => {
    setEditingRequest(request);
    setIsFormOpen(true);
  };

  const handleDeleteRequest = async (requestId) => {
    if (
      !window.confirm(
        "Apakah Anda yakin ingin menghapus data cuti ini? Saldo cuti pegawai akan dikembalikan.",
      )
    ) {
      return;
    }
    setIsLoading(true);
    try {
      const requestToDelete = leaveRequests.find((r) => r.id === requestId);
      if (!requestToDelete) throw new Error("Data cuti tidak ditemukan.");

      const { error: deleteError } = await supabase
        .from("leave_requests")
        .delete()
        .eq("id", requestId);
      if (deleteError) throw deleteError;

      const requestPeriodYear =
        parseInt(requestToDelete.leave_period) ||
        new Date(requestToDelete.start_date).getFullYear();

      const { error: rpcError } = await supabase.rpc(
        "update_leave_balance_with_splitting",
        {
          p_employee_id: requestToDelete.employee_id,
          p_leave_type_id: requestToDelete.leave_type_id,
          p_requested_year: requestPeriodYear,
          p_days: -requestToDelete.days_requested,
        },
      );
      if (rpcError)
        console.error(`Gagal mengembalikan saldo cuti:`, rpcError.message);

      toast({
        title: "ï¿½ï¿½ï¿½ Data Dihapus",
        description: "Data cuti berhasil dihapus dan saldo telah dikembalikan.",
      });
      fetchLeaveRequests();
    } catch (error) {
      console.error("Error deleting request:", error);
      toast({
        variant: "destructive",
        title: "âŒ Gagal Menghapus",
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Check if current user is employee
  const currentUser = AuthManager.getUserSession();
  const isEmployee = currentUser?.role === 'employee';
  const isReadOnly  = currentUser?.role === "admin_pimpinan";
  const canEditReq  = !isEmployee && !isReadOnly;

  const leaveTypeOptions = [
    { value: "", label: "Semua Jenis Cuti" },
    ...leaveTypes.map((lt) => ({ value: lt.id, label: lt.name })),
  ];

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">
            {isEmployee ? 'Data Cuti Saya' : 'Data Cuti Pegawai'}
          </h1>
          <p className="text-slate-300">
            {isEmployee ? 'Lihat data pengajuan cuti Anda' : 'Kelola data cuti pegawai yang telah diinput'}
          </p>
        </div>
        <div className="flex space-x-2 mt-4 sm:mt-0">
          <Button
            onClick={handleRefresh}
            variant="outline"
            className="border-slate-600 text-slate-300 hover:text-white"
            disabled={isLoading}
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
            />
            {isLoading ? "Memuat..." : "Refresh"}
          </Button>
          {!isEmployee && (
            <Dialog
              open={isFormOpen}
              onOpenChange={(open) => {
                setIsFormOpen(open);
                if (!open) setEditingRequest(null);
              }}
            >
              <DialogTrigger asChild>
                <Button
                  className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                  onClick={() => setEditingRequest(null)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Input Data Cuti
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg">
                <DialogHeader>
                  <DialogTitle>
                    {editingRequest ? "Edit Data Cuti" : "Form Input Data Cuti"}
                  </DialogTitle>
                  <DialogDescription>
                    {editingRequest
                      ? "Ubah detail data cuti di bawah ini."
                      : "Isi detail data cuti di bawah ini."}
                  </DialogDescription>
                </DialogHeader>
                <LeaveRequestForm
                  employees={employees}
                  leaveTypes={leaveTypes}
                  onSubmitSuccess={onFormSubmitSuccess}
                  onCancel={() => {
                    setIsFormOpen(false);
                    setEditingRequest(null);
                  }}
                  initialData={editingRequest}
                />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <Card className="bg-slate-800/50 backdrop-blur-xl border-slate-700/50">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div className="relative lg:col-span-1">
                <label
                  htmlFor="search-leave-request"
                  className="text-sm font-medium text-slate-300 mb-1 block"
                >
                  Cari Data Cuti
                </label>
                <Search className="absolute left-3 top-[calc(50%+0.3rem)] transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  id="search-leave-request"
                  name="search-leave-request"
                  placeholder="Nama, NIP, Jenis Cuti..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-slate-700/50 border-slate-600/50 text-white placeholder-slate-400"
                  autoComplete="off"
                />
              </div>
              <div>
                <label
                  htmlFor="unit-penempatan-filter-lr"
                  className="text-sm font-medium text-slate-300 mb-1 block"
                >
                  Unit Penempatan
                </label>
                <Input
                  id="unit-penempatan-filter-lr"
                  name="unitPenempatan"
                  type="text"
                  placeholder="Ketik nama unit penempatan..."
                  className="w-full bg-slate-700/50 border-slate-600/50 text-white placeholder-slate-400"
                  value={selectedUnitPenempatan}
                  onChange={(e) => setSelectedUnitPenempatan(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div>
                <label
                  htmlFor="leave-type-filter-lr"
                  className="text-sm font-medium text-slate-300 mb-1 block"
                >
                  Jenis Cuti
                </label>
                <select
                  id="leave-type-filter-lr"
                  name="leave-type-filter-lr"
                  value={selectedLeaveType || ""}
                  onChange={(e) => setSelectedLeaveType(e.target.value || null)}
                  className="flex h-10 w-full rounded-md border border-slate-600/50 bg-slate-700/50 px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {leaveTypeOptions.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      className="bg-slate-800 text-white"
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="date-range-filter-lr"
                  className="text-sm font-medium text-slate-300 mb-1 block"
                >
                  Rentang Tanggal
                </label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="date-range-filter-lr"
                      variant={"outline"}
                      className="w-full justify-start text-left font-normal bg-slate-700/50 border-slate-600/50 text-white hover:text-white"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDateRange?.from ? (
                        selectedDateRange.to ? (
                          <>
                            {format(selectedDateRange.from, "dd LLL yy", {
                              locale: id,
                            })}{" "}
                            -{" "}
                            {format(selectedDateRange.to, "dd LLL yy", {
                              locale: id,
                            })}
                          </>
                        ) : (
                          format(selectedDateRange.from, "dd LLL yy", {
                            locale: id,
                          })
                        )
                      ) : (
                        <span>Pilih rentang tanggal</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-auto p-0 bg-slate-800 border-slate-700"
                    align="start"
                  >
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={selectedDateRange?.from}
                      selected={selectedDateRange}
                      onSelect={setSelectedDateRange}
                      numberOfMonths={2}
                      locale={id}
                      className="text-white"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <Card className="bg-slate-800/50 backdrop-blur-xl border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-white">Daftar Data Cuti</CardTitle>
            <p className="text-sm text-slate-400">
              Menampilkan {leaveRequests.length} data cuti sesuai filter.
            </p>
          </CardHeader>
          <CardContent>
            {isLoading && leaveRequests.length === 0 ? (
              <div className="text-center py-8 text-slate-300">
                Memuat data cuti...
              </div>
            ) : leaveRequests.length > 0 ? (
              <div className="space-y-4">
                {leaveRequests.map((request, index) => (
                  <LeaveRequestCard
                    key={request.id}
                    request={request}
                    index={index}
                    onEdit={canEditReq ? handleEditRequest : undefined}
                    onDelete={canEditReq ? handleDeleteRequest : undefined}
                  />
                ))}

                {/* Pagination */}
                <div className="flex flex-col sm:flex-row items-center justify-between pt-4 border-t border-slate-700/50 mt-6">
                  <p className="text-sm text-slate-400 mb-4 sm:mb-0">
                    Menampilkan{" "}
                    {Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)}
                    -{Math.min(currentPage * itemsPerPage, totalItems)} dari{" "}
                    {totalItems} data
                  </p>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="border-slate-600 text-slate-300 hover:text-white"
                    >
                      Sebelumnya
                    </Button>
                    <div className="flex items-center space-x-1">
                      {Array.from(
                        { length: Math.min(5, totalPages) },
                        (_, i) => {
                          // Show pages around current page
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }

                          return (
                            <button
                              key={pageNum}
                              onClick={() => setCurrentPage(pageNum)}
                              className={`w-8 h-8 rounded-md text-sm ${
                                currentPage === pageNum
                                  ? "bg-blue-600 text-white"
                                  : "text-slate-300 hover:bg-slate-700/50"
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        },
                      )}
                      {totalPages > 5 && currentPage < totalPages - 2 && (
                        <span className="px-2 text-slate-400">...</span>
                      )}
                      {totalPages > 5 && currentPage < totalPages - 2 && (
                        <button
                          onClick={() => setCurrentPage(totalPages)}
                          className={`w-8 h-8 rounded-md text-sm ${
                            currentPage === totalPages
                              ? "bg-blue-600 text-white"
                              : "text-slate-300 hover:bg-slate-700/50"
                          }`}
                        >
                          {totalPages}
                        </button>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={currentPage >= totalPages}
                      className="border-slate-600 text-slate-300 hover:text-white"
                    >
                      Selanjutnya
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <CalendarDays className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">
                  Tidak ada data cuti yang ditemukan untuk filter ini.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default LeaveRequests;
