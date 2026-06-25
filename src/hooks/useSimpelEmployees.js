import { useState, useEffect, useCallback } from "react";
import { supabaseSimpelAdmin } from "@/lib/supabaseSSO";
import { useToast } from "@/components/ui/use-toast";
import { AuthManager } from "@/lib/auth";
import { applyEmployeeScopeFilter } from "@/utils/employeeScope";

const EMPLOYEES_PER_PAGE = 50;

/**
 * Hook untuk data pegawai dari SIMPEL — real-time, tanpa sync/cache
 * Menggantikan useEmployeeData.js yang query ke DB lokal SiCuti
 */
export const useSimpelEmployeeData = (
  searchTerm = "",
  selectedDepartment = "",
  selectedPositionType = "",
  selectedAsnStatus = "",
  selectedRankGroup = "",
  page = 1
) => {
  const { toast } = useToast();
  const [displayedEmployees, setDisplayedEmployees] = useState([]);
  const [totalFilteredCount, setTotalFilteredCount] = useState(0);
  const [overallTotalCount, setOverallTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [positionTypes, setPositionTypes] = useState([]);
  const [asnStatuses, setAsnStatuses] = useState([]);
  const [rankGroups, setRankGroups] = useState([]);

  const currentUser = AuthManager.getUserSession();

  // Fetch dropdown options dari SIMPEL
  const fetchDropdownOptions = useCallback(async () => {
    try {
      let query = supabaseSimpelAdmin.from("employees").select("department, position_type, asn_status, rank_group");
      query = applyEmployeeScopeFilter(query, currentUser);

      const { data, error } = await query;
      if (error) throw error;

      const unique = (field) => [...new Set(data.map(e => e[field]).filter(Boolean))].sort();

      setDepartmentOptions(unique("department").map(d => ({ value: d, label: d })));
      setPositionTypes(unique("position_type").map(t => ({ value: t, label: t })));
      setAsnStatuses(unique("asn_status").map(s => ({ value: s, label: s })));
      setRankGroups(unique("rank_group").map(r => ({ value: r, label: r })));
    } catch (error) {
      console.error("[useSimpelEmployees] fetchDropdownOptions error:", error);
    }
  }, [currentUser?.role, currentUser?.department]);

  // Fetch employees dari SIMPEL
  const fetchEmployees = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabaseSimpelAdmin
        .from("employees")
        .select("id, nip, name, department, position_name, position_type, asn_status, rank_group, join_date", { count: "exact" });

      query = applyEmployeeScopeFilter(query, currentUser);

      // Search
      if (searchTerm?.trim()) {
        query = query.or(`name.ilike.%${searchTerm}%,nip.ilike.%${searchTerm}%`);
      }

      // Filters — skip jika nilai "ALL" atau kosong
      if (selectedDepartment && selectedDepartment !== "ALL") query = query.eq("department", selectedDepartment);
      if (selectedPositionType && selectedPositionType !== "ALL") query = query.eq("position_type", selectedPositionType);
      if (selectedAsnStatus && selectedAsnStatus !== "ALL") query = query.eq("asn_status", selectedAsnStatus);
      if (selectedRankGroup && selectedRankGroup !== "ALL") query = query.eq("rank_group", selectedRankGroup);

      // Pagination
      const from = (page - 1) * EMPLOYEES_PER_PAGE;
      const to = from + EMPLOYEES_PER_PAGE - 1;
      query = query.range(from, to).order("name");

      const { data, error, count } = await query;
      if (error) throw error;

      setDisplayedEmployees(data || []);
      setTotalFilteredCount(count || 0);
      setTotalPages(Math.ceil((count || 0) / EMPLOYEES_PER_PAGE));

    } catch (error) {
      console.error("[useSimpelEmployees] fetchEmployees error:", error);
      toast({
        variant: "destructive",
        title: "Gagal Memuat Data Pegawai",
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, selectedDepartment, selectedPositionType, selectedAsnStatus, selectedRankGroup, page, currentUser?.role, currentUser?.department]);

  // Fetch overall total
  const fetchOverallTotal = useCallback(async () => {
    try {
      let query = supabaseSimpelAdmin
        .from("employees")
        .select("id", { count: "exact", head: true });

      query = applyEmployeeScopeFilter(query, currentUser);

      const { count } = await query;
      setOverallTotalCount(count || 0);
    } catch (error) {
      console.error("[useSimpelEmployees] fetchOverallTotal error:", error);
    }
  }, [currentUser?.role, currentUser?.department]);

  useEffect(() => {
    fetchDropdownOptions();
    fetchOverallTotal();
  }, [fetchDropdownOptions, fetchOverallTotal]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  return {
    displayedEmployees,
    totalFilteredEmployeeCount: totalFilteredCount,
    overallTotalEmployeeCount: overallTotalCount,
    isLoading,
    totalPages,
    unitPenempatanOptions: departmentOptions,
    positionTypes,
    asnStatuses,
    rankGroups,
    refetchEmployees: fetchEmployees,
  };
};

/**
 * Ambil single employee dari SIMPEL by NIP
 * Dipakai oleh LeaveRequests, dll yang perlu cari pegawai by NIP
 */
export const getSimpelEmployeeByNip = async (nip) => {
  const user = AuthManager.getUserSession();
  let query = supabaseSimpelAdmin
    .from("employees")
    .select("id, nip, name, department, position_name, rank_group, asn_status")
    .eq("nip", nip);

  query = applyEmployeeScopeFilter(query, user);
  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return data;
};

/**
 * Ambil employee dari SIMPEL by ID (UUID SIMPEL)
 */
export const getSimpelEmployeeById = async (id) => {
  const user = AuthManager.getUserSession();
  let query = supabaseSimpelAdmin
    .from("employees")
    .select("id, nip, name, department, position_name, rank_group, asn_status")
    .eq("id", id);

  query = applyEmployeeScopeFilter(query, user);
  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return data;
};

/**
 * Ambil semua employees dari SIMPEL (untuk dropdown/autocomplete)
 * Bisa difilter by department
 */
export const getSimpelEmployees = async (department = null) => {
  const user = AuthManager.getUserSession();
  let query = supabaseSimpelAdmin
    .from("employees")
    .select("id, nip, name, department, position_name, rank_group")
    .order("name");

  query = applyEmployeeScopeFilter(query, user);

  if (department) {
    query = query.eq("department", department);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};