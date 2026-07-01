import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabaseClient";
import { supabaseSimpelAdmin } from "@/lib/supabaseSSO";
import { AuthManager } from "@/lib/auth";
import { applyEmployeeScopeFilter, assertCanAccessSicutiEmployeeById } from "@/utils/employeeScope";
import { Loader2, Search, X, Plus } from "lucide-react";
import { LeaveDocumentUploader } from "@/components/leave_documents/LeaveDocumentUploader";
import {
  countWorkingDays,
  fetchNationalHolidaysFromDB,
} from "@/utils/workingDays";
import { calculateLeaveBalance, ensureLeaveBalance } from "@/utils/leaveBalanceCalculator";
import { attachSicutiEmployeeIds, resolveSicutiEmployeeIds } from "@/utils/sicutiEmployeeResolver";

const LeaveRequestForm = ({
  employees,
  leaveTypes,
  onSubmitSuccess,
  onCancel,
  initialData,
}) => {
  const { toast } = useToast();

  // Dynamic year calculation for quota
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [selectedPeriod, setSelectedPeriod] = useState(currentYear);

  const quotaYears = useMemo(() => [
    { value: selectedPeriod.toString(), label: `${selectedPeriod} (Tahun Berjalan)` },
    { value: (selectedPeriod - 1).toString(), label: `${selectedPeriod - 1} (Penangguhan)` },
  ], [selectedPeriod]);

  const [formData, setFormData] = useState({
    employee_id: "",
    simpel_employee_id: "",
    employee_name: "",
    employee_nip: "",
    employee_rank: "",
    employee_position: "",
    employee_department: "",
    leave_type_id: "",
    start_date: "",
    end_date: "",
    reason: "",
    leave_letter_number: "",
    leave_letter_date: "",
    signed_by: "",
    address_during_leave: "",
    leave_quota_year: new Date().getFullYear().toString(),
    leave_period: new Date().getFullYear().toString(),
    application_form_date: new Date().toISOString().split("T")[0],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [signersData, setSignersData] = useState([]);
  const [isLoadingSigners, setIsLoadingSigners] = useState(false);
  const [signerSearchTerm, setSignerSearchTerm] = useState("");
  const [selectedSigner, setSelectedSigner] = useState(null);
  const [showSignerDropdown, setShowSignerDropdown] = useState(false);
  const [isManageSignersOpen, setIsManageSignersOpen] = useState(false);
  const [signerSearchResults, setSignerSearchResults] = useState([]);
  const [isSearchingSigner, setIsSearchingSigner] = useState(false);
  const [hasNewColumns, setHasNewColumns] = useState(true); // True after migration
  const [holidays, setHolidays] = useState(new Set());
  const [holidaysYear, setHolidaysYear] = useState(new Date().getFullYear());
  const [overlapWarning, setOverlapWarning] = useState("");
  const [isCheckingOverlap, setIsCheckingOverlap] = useState(false);
  const [leaveBalanceSummary, setLeaveBalanceSummary] = useState(null);
  const [isLoadingLeaveBalance, setIsLoadingLeaveBalance] = useState(false);
  const [leaveBalanceError, setLeaveBalanceError] = useState("");
  
  // Document upload state
  const [leaveRequestId, setLeaveRequestId] = useState(null);
  const [documentsRefresh, setDocumentsRefresh] = useState(0);

  const selectedLeaveType = useMemo(() => {
    return leaveTypes.find((t) => t.id === formData.leave_type_id) || null;
  }, [leaveTypes, formData.leave_type_id]);

  const selectedQuotaYear = useMemo(() => {
    const parsed = parseInt(formData.leave_quota_year);
    return Number.isFinite(parsed) ? parsed : null;
  }, [formData.leave_quota_year]);

  const selectedQuotaRemaining = useMemo(() => {
    if (!leaveBalanceSummary || selectedQuotaYear == null) return null;
    if (selectedQuotaYear === leaveBalanceSummary.periodYear) {
      return {
        label: `Saldo jatah ${selectedQuotaYear}`,
        value: leaveBalanceSummary.remaining_current,
      };
    }
    if (selectedQuotaYear < leaveBalanceSummary.periodYear) {
      return {
        label: `Saldo penangguhan ${selectedQuotaYear}`,
        value: leaveBalanceSummary.remaining_deferred,
      };
    }
    return null;
  }, [leaveBalanceSummary, selectedQuotaYear]);

  const resolveEmployeeForSicuti = async (employee) => {
    const nipToLocalId = await resolveSicutiEmployeeIds([employee]);
    const [resolvedEmployee] = attachSicutiEmployeeIds([employee], nipToLocalId);

    if (!resolvedEmployee?.id) {
      throw new Error(
        `Pegawai ${employee.name || ""} belum dapat dipetakan ke data pegawai SiCuti. Pastikan NIP pegawai valid.`,
      );
    }

    return resolvedEmployee;
  };

  const fetchEmployees = useCallback(
    async (query) => {
      if (!query.trim()) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const safeQuery = query.replace(/,/g, "");
        const currentUser = AuthManager.getUserSession();

        let dbQuery = supabaseSimpelAdmin
          .from("employees")
          .select("id, nip, name, department, position_name, rank_group, asn_status")
          .or(`name.ilike.%${safeQuery}%,nip.ilike.%${safeQuery}%`)
          .limit(10);

        dbQuery = applyEmployeeScopeFilter(dbQuery, currentUser);

        const { data, error } = await dbQuery;
        if (error) throw error;
        setSearchResults(data || []);
      } catch (error) {
        console.error("Error searching employees:", error);
        toast({
          variant: "destructive",
          title: "Gagal memuat data pegawai",
          description: error.message,
        });
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchTerm.trim()) {
        fetchEmployees(searchTerm);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, fetchEmployees]);

  useEffect(() => {
    const fetchEmployeeData = async () => {
      if (initialData?.employee_id) {
        try {
          const { data: localEmployee, error: localError } = await supabase
            .from("employees")
            .select("id, nip, name, department, position_name, rank_group, asn_status")
            .eq("id", initialData.employee_id)
            .maybeSingle();

          if (localError) throw localError;

          let employee = null;
          if (localEmployee?.nip) {
            const { data: simpelEmployee, error: simpelError } = await supabaseSimpelAdmin
              .from("employees")
              .select("id, nip, name, department, position_name, rank_group, asn_status")
              .eq("nip", localEmployee.nip)
              .maybeSingle();

            if (simpelError) throw simpelError;
            employee = simpelEmployee || null;
          }

          const displayEmployee = employee || localEmployee;

          if (displayEmployee) {
            setFormData((prev) => ({
              ...prev,
              employee_id: localEmployee.id,
              simpel_employee_id: employee?.id || "",
              employee_name: displayEmployee.name,
              employee_nip: displayEmployee.nip || "",
              employee_rank: displayEmployee.rank_group || "",
              employee_position: displayEmployee.position_name || "",
              employee_department: displayEmployee.department || "",
            }));
            setSearchTerm(displayEmployee.name);
          }
        } catch (error) {
          console.error("Error fetching employee data:", error);
          toast({
            variant: "destructive",
            title: "Gagal memuat data pegawai",
            description: error.message,
          });
        }
      } else {
        setFormData((prev) => ({
          ...prev,
          employee_id: "",
          simpel_employee_id: "",
          employee_name: "",
          employee_nip: "",
          employee_rank: "",
          employee_position: "",
          employee_department: "",
        }));
        setSearchTerm("");
      }
    };

    if (initialData) {
      // First set all the non-employee related fields
      setFormData((prev) => ({
        ...prev,
        leave_type_id: initialData.leave_type_id || "",
        start_date: initialData.start_date
          ? initialData.start_date.split("T")[0]
          : "",
        end_date: initialData.end_date
          ? initialData.end_date.split("T")[0]
          : "",
        reason: initialData.reason || "",
        leave_letter_number: initialData.leave_letter_number || "",
        leave_letter_date: initialData.leave_letter_date
          ? initialData.leave_letter_date.split("T")[0]
          : "",
        signed_by: initialData.signed_by || "",
        address_during_leave: initialData.address_during_leave || "",
        leave_quota_year:
          initialData.leave_quota_year?.toString() ||
          new Date().getFullYear().toString(),
        application_form_date: initialData.application_form_date
          ? initialData.application_form_date.split("T")[0]
          : new Date().toISOString().split("T")[0],
        leave_period:
          initialData.leave_period?.toString() ||
          initialData.leave_quota_year?.toString() ||
          new Date().getFullYear().toString(),
      }));

      // Set selected period based on initial data
      const period = initialData.leave_period || initialData.leave_quota_year || new Date().getFullYear();
      setSelectedPeriod(parseInt(period));

      // Then fetch and set employee data
      fetchEmployeeData();
    } else {
      setFormData({
        employee_id: "",
        simpel_employee_id: "",
        employee_name: "",
        employee_nip: "",
        employee_rank: "",
        employee_position: "",
        employee_department: "",
        leave_type_id: "",
        start_date: "",
        end_date: "",
        reason: "",
        leave_letter_number: "",
        leave_letter_date: "",
        signed_by: "",
        address_during_leave: "",
        leave_quota_year: new Date().getFullYear().toString(),
        leave_period: new Date().getFullYear().toString(),
        application_form_date: new Date().toISOString().split("T")[0],
      });
      setSearchTerm("");
      setLeaveRequestId(null); // Reset document upload state
    }
  }, [initialData]);

  // Fetch data penandatangan saat komponen dimuat
  // Verify migration columns are available
  useEffect(() => {
    const checkDatabaseColumns = async () => {
      try {
        // Verify the new columns work correctly after migration
        const { data, error } = await supabase
          .from("leave_requests")
          .select("leave_quota_year, application_form_date")
          .limit(1);

        if (error) {
          console.error("Migration verification failed:", error);
          setHasNewColumns(false);
          toast({
            variant: "destructive",
            title: "Database Migration Issue",
            description:
              "New columns not available. Please check migration status.",
          });
        } else {
          setHasNewColumns(true);
          console.log("âœ… Migration verified - new columns available");
        }
      } catch (error) {
        console.error("Migration check error:", error);
        setHasNewColumns(false);
      }
    };

    checkDatabaseColumns();
  }, [toast]);

  // Load saved signers from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("saved_signers");
    if (saved) {
      try {
        setSignersData(JSON.parse(saved));
      } catch (e) {
        console.error("Error parsing saved_signers", e);
      }
    }
  }, []);

  // Save signers to localStorage whenever they change
  useEffect(() => {
    if (signersData.length > 0) {
      localStorage.setItem("saved_signers", JSON.stringify(signersData));
    }
  }, [signersData]);

  const handleAddSigner = (employee) => {
    // Check if already exists
    if (signersData.some(s => s.id === employee.id)) {
      toast({
        title: "Sudah ada",
        description: "Pegawai ini sudah ada dalam daftar penandatangan",
      });
      return;
    }

    const newSigner = {
      id: employee.id,
      name: employee.name,
      nip: employee.nip,
      position_name: employee.position_name,
      rank_group: employee.rank_group,
      department: employee.department
    };

    setSignersData(prev => [...prev, newSigner]);
    toast({
      title: "Berhasil ditambahkan",
      description: "Pegawai ditambahkan ke daftar penandatangan",
    });
    // Close modal if open (handled in UI)
  };

  const handleRemoveSigner = (id) => {
    const newSigners = signersData.filter(s => s.id !== id);
    setSignersData(newSigners);
    localStorage.setItem("saved_signers", JSON.stringify(newSigners)); // Force update

    if (selectedSigner?.id === id) {
      handleClearSigner();
    }
  };

  useEffect(() => {
    if (initialData?.signed_by && signersData.length > 0) {
      const signer = signersData.find((s) => s.name === initialData.signed_by);
      if (signer) {
        setSelectedSigner(signer);
        setSignerSearchTerm(signer.name);
      }
    } else if (!initialData) {
      setSelectedSigner(null);
      setSignerSearchTerm("");
    }
  }, [initialData, signersData]);

  const handleSelectEmployee = async (employee) => {
    try {
      const resolvedEmployee = await resolveEmployeeForSicuti(employee);
      setFormData((prev) => ({
        ...prev,
        employee_id: resolvedEmployee.id,
        simpel_employee_id: resolvedEmployee.simpelId || employee.id,
        employee_name: resolvedEmployee.name,
        employee_nip: resolvedEmployee.nip,
        employee_rank: resolvedEmployee.rank_group || "",
        employee_position: resolvedEmployee.position_name || "",
        employee_department: resolvedEmployee.department || "",
      }));
      setSearchTerm(resolvedEmployee.name);
      setShowDropdown(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Gagal memilih pegawai",
        description: error.message,
      });
    }
  };

  const handleClearEmployee = () => {
    setFormData((prev) => ({
      ...prev,
      employee_id: "",
      simpel_employee_id: "",
      employee_name: "",
      employee_nip: "",
      employee_rank: "",
      employee_position: "",
      employee_department: "",
    }));
    setSearchTerm("");
    setSearchResults([]);
    setShowDropdown(false);
    setLeaveBalanceSummary(null);
    setLeaveBalanceError("");
    setLeaveRequestId(null); // Reset document upload
  };

  const handleSelectSigner = (signer) => {
    setSelectedSigner(signer);
    setSignerSearchTerm(signer.name);
    handleChange("signed_by", signer.name);
    setShowSignerDropdown(false);
  };

  const handleClearSigner = () => {
    setSelectedSigner(null);
    setSignerSearchTerm("");
    handleChange("signed_by", "");
  };

  const handleChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Fetch holidays from DB when dates change (support multi-year)
  useEffect(() => {
    const fetchHolidays = async () => {
      const startYear = formData.start_date
        ? new Date(formData.start_date).getFullYear()
        : new Date().getFullYear();
      const endYear = formData.end_date
        ? new Date(formData.end_date).getFullYear()
        : startYear;

      try {
        const yearsToFetch = [startYear];
        if (endYear !== startYear) {
          yearsToFetch.push(endYear);
        }

        const holidaySets = await Promise.all(
          yearsToFetch.map(y => fetchNationalHolidaysFromDB(y))
        );

        // Merge sets
        const mergedHolidays = new Set();
        holidaySets.forEach(set => {
          set.forEach(h => mergedHolidays.add(h));
        });

        setHolidays(mergedHolidays);
        setHolidaysYear(startYear);
      } catch (err) {
        console.warn("Gagal mengambil hari libur nasional from DB:", err.message);
        setHolidays(new Set());
      }
    };

    fetchHolidays();
  }, [formData.start_date, formData.end_date]);

  // Check for date overlap
  useEffect(() => {
    const checkOverlap = async () => {
      if (!formData.employee_id || !formData.start_date || !formData.end_date) {
        setOverlapWarning("");
        return;
      }

      console.log("Checking overlap for:", {
        emp: formData.employee_id,
        start: formData.start_date,
        end: formData.end_date
      });

      setIsCheckingOverlap(true);
      try {
        // Query for overlapping dates:
        // Existing Start <= New End  AND  Existing End >= New Start
        // Note: 'status' column does not exist in leave_requests, assuming all existing requests are valid/active
        const { data: overlappingRequests, error } = await supabase
          .from("leave_requests")
          .select("id, start_date, end_date, leave_types(name)")
          .eq("employee_id", formData.employee_id)
          .lte('start_date', formData.end_date)
          .gte('end_date', formData.start_date);

        if (error) throw error;

        console.log("DB Overlap Results:", overlappingRequests);

        // Perform precise date overlap check in JS to handle edge cases
        const overlaps = overlappingRequests.filter(req => {
          const reqStart = new Date(req.start_date);
          const reqEnd = new Date(req.end_date);
          const formStart = new Date(formData.start_date);
          const formEnd = new Date(formData.end_date);

          // Check if there is an actual overlap
          return reqStart <= formEnd && reqEnd >= formStart;
        });

        console.log("Filtered Overlaps:", overlaps);

        // Remove current request from check if editing
        const actualOverlaps = initialData?.id
          ? overlaps.filter(r => r.id !== initialData.id) // This won't work perfectly because we didn't select ID. But wait, `or` filter returns potential matches. 
          // Better approach: filter out the current ID in the query or here if we had IDs.
          // Since we didn't select ID in query above, let's refine the query.
          : overlaps;

        if (actualOverlaps.length > 0) {
          const conflict = actualOverlaps[0]; // Just take first conflict
          setOverlapWarning(
            `âš ï¸ Peringatan: Terdapat pengajuan cuti lain (${conflict.leave_types?.name}) pada tanggal yang beririsan: ${conflict.start_date} s.d. ${conflict.end_date}`
          );
        } else {
          setOverlapWarning("");
        }
      } catch (error) {
        console.error("Error checking overlap:", error);
      } finally {
        setIsCheckingOverlap(false);
      }
    };

    const debounceCheck = setTimeout(() => {
      checkOverlap();
    }, 500);

    return () => clearTimeout(debounceCheck);
  }, [formData.employee_id, formData.start_date, formData.end_date, initialData?.id]);

  const calculateDaysRequested = (start, end) => {
    if (!start || !end) return 0;
    return countWorkingDays(start, end, holidays);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    if (
      !formData.employee_id ||
      !formData.leave_type_id ||
      !formData.start_date ||
      !formData.end_date
    ) {
      toast({
        variant: "destructive",
        title: "Data Tidak Lengkap",
        description:
          "Pegawai, Jenis Cuti, Tanggal Mulai, dan Tanggal Selesai wajib diisi.",
      });
      setIsSubmitting(false);
      return;
    }

    // Validate quota year based on selected period
    if (hasNewColumns) {
      const startYear = formData.start_date
        ? new Date(formData.start_date).getFullYear()
        : null;
      const periodYear = parseInt(formData.leave_period);

      if (Number.isFinite(periodYear) && Number.isFinite(startYear)) {
        if (periodYear > startYear || periodYear < startYear - 1) {
          toast({
            variant: "destructive",
            title: "Periode Cuti Tidak Valid",
            description:
              `Untuk tanggal cuti tahun ${startYear}, periode hanya boleh ${startYear} atau ${startYear - 1}.`,
          });
          setIsSubmitting(false);
          return;
        }
      }

      const quotaYear = parseInt(formData.leave_quota_year);

      if (quotaYear < selectedPeriod - 1) {
        toast({
          variant: "destructive",
          title: "Tahun Jatah Cuti Tidak Valid",
          description:
            `Untuk periode ${selectedPeriod}, hanya bisa menggunakan jatah cuti tahun ${selectedPeriod} atau ${selectedPeriod - 1}.`,
        });
        setIsSubmitting(false);
        return;
      }

      if (quotaYear > selectedPeriod) {
        toast({
          variant: "destructive",
          title: "Tahun Jatah Cuti Tidak Valid",
          description:
            "Tidak bisa menggunakan jatah cuti dari tahun yang akan datang.",
        });
        setIsSubmitting(false);
        return;
      }
    }

    // Block submission if there is an overlap
    if (overlapWarning) {
      toast({
        variant: "destructive",
        title: "Terdapat Tanggal Cuti yang Beririsan",
        description: "Mohon ganti tanggal cuti karena bertabrakan dengan pengajuan lain.",
      });
      setIsSubmitting(false);
      return;
    }

    // Cross-year validation removed to allow flexible leave dates
    // if (
    //   hasNewColumns &&
    //   formData.start_date &&
    //   formData.end_date &&
    //   new Date(formData.start_date).getFullYear() !==
    //   new Date(formData.end_date).getFullYear()
    // ) {
    //   toast({
    //     variant: "destructive",
    //     title: "Rentang Tanggal Tidak Valid",
    //     description:
    //       "Tanggal mulai dan tanggal selesai harus berada pada tahun yang sama.",
    //   });
    //   setIsSubmitting(false);
    //   return;
    // }

    const days_requested = calculateDaysRequested(
      formData.start_date,
      formData.end_date,
    );
    if (days_requested <= 0) {
      toast({
        variant: "destructive",
        title: "Tanggal Tidak Valid",
        description: "Tanggal selesai harus setelah tanggal mulai.",
      });
      setIsSubmitting(false);
      return;
    }

    // Prepare complete data including new fields (after migration)
    const dataToSubmit = {
      ...(initialData?.id ? { id: formData.id } : {}), // Only include id for updates
      employee_id: formData.employee_id,
      leave_type_id: formData.leave_type_id,
      start_date: formData.start_date,
      end_date: formData.end_date,
      days_requested,
      reason: formData.reason || null,
      leave_letter_number: formData.leave_letter_number || null,
      leave_letter_date: formData.leave_letter_date || null,
      signed_by: formData.signed_by || null,
      address_during_leave: formData.address_during_leave || null,
      leave_quota_year:
        parseInt(formData.leave_quota_year) || new Date().getFullYear(),
      leave_period: parseInt(formData.leave_period) || selectedPeriod,
      application_form_date: formData.application_form_date || null,
      submitted_date: initialData?.id
        ? formData.submitted_date
        : new Date().toISOString(),
    };
    // Convert empty strings to null
    Object.keys(dataToSubmit).forEach((key) => {
      if (dataToSubmit[key] === "") {
        dataToSubmit[key] = null;
      }
    });

    try {
      const currentUser = AuthManager.getUserSession();
      await assertCanAccessSicutiEmployeeById(currentUser, formData.employee_id);

      let error;
      if (initialData?.id) {
        // EDIT MODE: Update existing request and adjust balance
        const { error: updateError } = await supabase
          .from("leave_requests")
          .update(dataToSubmit)
          .eq("id", initialData.id);
        error = updateError;
        if (error) throw error;

        // Adjust balance if key data changed
        const oldDays = initialData.days_requested;
        const newDays = days_requested;
        const oldYear =
          parseInt(initialData.leave_period) ||
          new Date(initialData.start_date).getFullYear();
        const newYear =
          parseInt(dataToSubmit.leave_period) ||
          new Date(dataToSubmit.start_date).getFullYear();
        const oldType = initialData.leave_type_id;
        const newType = dataToSubmit.leave_type_id;
        const oldEmployeeId = initialData.employee_id;
        const newEmployeeId = dataToSubmit.employee_id;

        if (
          oldDays !== newDays ||
          oldYear !== newYear ||
          oldType !== newType ||
          oldEmployeeId !== newEmployeeId
        ) {
          // Revert old balance using smart splitting
          const { error: revertError } = await supabase.rpc(
            "update_leave_balance_with_splitting",
            {
              p_employee_id: oldEmployeeId,
              p_leave_type_id: oldType,
              p_requested_year: oldYear,
              p_days: -oldDays,
            },
          );
          if (revertError) throw revertError;

          // Apply new balance using smart splitting
          const { error: applyError } = await supabase.rpc(
            "update_leave_balance_with_splitting",
            {
              p_employee_id: newEmployeeId,
              p_leave_type_id: newType,
              p_requested_year: newYear,
              p_days: newDays,
            },
          );
          if (applyError) throw applyError;
        }
      } else {
        // CREATE MODE: Insert new request and update balance
        const { data: insertedRequest, error: insertError } = await supabase
          .from("leave_requests")
          .insert([dataToSubmit])
          .select("id")
          .single();
        error = insertError;
        if (error) throw error;
        
        // Store leave request ID for document upload
        if (insertedRequest?.id) {
          setLeaveRequestId(insertedRequest.id);
        }

        // Use smart splitting function for balance update
        const requestPeriodYear =
          parseInt(dataToSubmit.leave_period) ||
          new Date(dataToSubmit.start_date).getFullYear();
        const { error: rpcError } = await supabase.rpc(
          "update_leave_balance_with_splitting",
          {
            p_employee_id: dataToSubmit.employee_id,
            p_leave_type_id: dataToSubmit.leave_type_id,
            p_requested_year: requestPeriodYear,
            p_days: days_requested,
          },
        );
        if (rpcError) {
          if (insertedRequest?.id) {
            await supabase
              .from("leave_requests")
              .delete()
              .eq("id", insertedRequest.id);
          }
          throw rpcError;
        }
      }

      // Enhanced success message with quota year info
      const quotaYearInfo =
        hasNewColumns && formData.leave_quota_year
          ? ` (Jatah Cuti ${formData.leave_quota_year})`
          : "";

      const successMsg = initialData?.id 
        ? `Data cuti berhasil diperbarui${quotaYearInfo}.` 
        : `Data cuti berhasil ditambahkan${quotaYearInfo}. Anda dapat melampirkan dokumen pendukung di bawah (opsional).`;
      
      toast({
        title: `✅ Data Cuti ${initialData?.id ? "Diperbarui" : "Ditambahkan"}`,
        description: successMsg,
      });
      
      // If editing, close form. If creating, stay open to allow document upload
      if (initialData?.id) {
        onSubmitSuccess();
      }
    } catch (error) {
      console.error("Error submitting leave request:", error);
      toast({
        variant: "destructive",
        title: `âŒ Gagal ${initialData?.id ? "Memperbarui" : "Menambahkan"} Data`,
        description: error.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const employeeId = formData.employee_id;
    const leaveType = selectedLeaveType;
    const periodYear = parseInt(formData.leave_period || selectedPeriod);
    if (!employeeId || !leaveType || !Number.isFinite(periodYear)) {
      setLeaveBalanceSummary(null);
      setLeaveBalanceError("");
      return;
    }

    let cancelled = false;
    (async () => {
      setIsLoadingLeaveBalance(true);
      setLeaveBalanceError("");
      try {
        const dbBalance = await ensureLeaveBalance(
          supabase,
          employeeId,
          leaveType.id,
          periodYear,
          leaveType,
        );

        const { data: leaveRequests, error: leaveRequestsError } =
          await supabase
            .from("leave_requests")
            .select(
              "days_requested, leave_quota_year, leave_period, start_date, leave_type_id",
            )
            .eq("employee_id", employeeId)
            .eq("leave_type_id", leaveType.id);

        if (leaveRequestsError) throw leaveRequestsError;

        const calculated = calculateLeaveBalance({
          dbBalance,
          leaveRequests: leaveRequests || [],
          leaveType,
          year: periodYear,
          currentYear,
        });

        const remaining_current = Math.max(
          0,
          (calculated.total || 0) - (calculated.used_current || 0),
        );
        const remaining_deferred = Math.max(
          0,
          (calculated.deferred || 0) - (calculated.used_deferred || 0),
        );

        if (!cancelled) {
          setLeaveBalanceSummary({
            ...calculated,
            periodYear,
            remaining_current,
            remaining_deferred,
          });
        }
      } catch (error) {
        console.error("Error fetching leave balance summary:", error);
        if (!cancelled) {
          setLeaveBalanceSummary(null);
          setLeaveBalanceError(
            error?.message || "Gagal memuat saldo cuti.",
          );
        }
      } finally {
        if (!cancelled) setIsLoadingLeaveBalance(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    formData.employee_id,
    formData.leave_period,
    selectedPeriod,
    selectedLeaveType,
    currentYear,
  ]);

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col h-[70vh] min-h-[500px] max-h-[800px] overflow-hidden"
    >
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="space-y-4">
          {/* Employee Search */}
          <div
            className="relative"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) {
                setShowDropdown(false);
              }
            }}
          >
            <Label htmlFor="employee_search" className="text-slate-300">
              Nama Pegawai
            </Label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <Input
                id="employee_search"
                name="employee_search"
                type="text"
                placeholder="Cari nama atau NIP pegawai..."
                className="pl-10 bg-slate-700 border-slate-600 text-white"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                autoComplete="off"
              />
              {formData.employee_id && (
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={handleClearEmployee}
                >
                  <X className="h-4 w-4 text-gray-400 hover:text-white" />
                </button>
              )}
            </div>

            {/* Dropdown with search results */}
            {showDropdown && (searchTerm || searchResults.length > 0) && (
              <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {isSearching ? (
                  <div className="p-4 text-center text-slate-400">
                    Mencari...
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((employee) => (
                    <div
                      key={employee.id}
                      className="px-4 py-2 cursor-pointer hover:bg-slate-700"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectEmployee(employee);
                      }}
                    >
                      <p className="text-white">{employee.name}</p>
                      <p className="text-sm text-slate-400">{employee.nip}</p>
                    </div>
                  ))
                ) : searchTerm && !isSearching ? (
                  <div className="p-4 text-center text-slate-400">
                    Pegawai tidak ditemukan.
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Employee Details */}
          {formData.employee_id && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-4 mt-4 bg-slate-800/50 rounded-md border border-slate-700/50">
              {/* Header */}
              <div className="md:col-span-2 lg:col-span-3 mb-2">
                <span className="text-sm font-medium text-slate-300">
                  Informasi Pegawai
                </span>
              </div>

              <div>
                <span className="text-xs font-medium text-slate-400">
                  NIP
                </span>
                <div className="mt-1 text-sm text-white">
                  {formData.employee_nip}
                </div>
              </div>
              <div>
                <span className="text-xs font-medium text-slate-400">
                  Pangkat/Golongan
                </span>
                <div className="mt-1 text-sm text-white">
                  {formData.employee_rank}
                </div>
              </div>
              <div className="lg:col-span-1">
                <span className="text-xs font-medium text-slate-400">
                  Jabatan
                </span>
                <div className="mt-1 text-sm text-white">
                  {formData.employee_position}
                </div>
              </div>
              <div className="md:col-span-2 lg:col-span-3">
                <span className="text-xs font-medium text-slate-400">
                  Unit Penempatan
                </span>
                <div className="mt-1 text-sm text-white">
                  {formData.employee_department}
                </div>
              </div>
            </div>
          )}
          <div>
            <Label htmlFor="leave_type_id" className="text-slate-300">
              Jenis Cuti
            </Label>
            <Select
              value={formData.leave_type_id}
              onValueChange={(value) => handleChange("leave_type_id", value)}
              required
            >
              <SelectTrigger
                id="leave_type_id"
                className="bg-slate-700 border-slate-600 text-white"
              >
                <SelectValue placeholder="Pilih jenis cuti" />
              </SelectTrigger>
              <SelectContent className="bg-slate-700 border-slate-600">
                {leaveTypes.map((type) => (
                  <SelectItem
                    key={type.id}
                    value={type.id}
                    className="text-white hover:bg-slate-600"
                  >
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="start_date" className="text-slate-300">
              Tanggal Mulai
            </Label>
            <Input
              id="start_date"
              name="start_date"
              type="date"
              value={formData.start_date}
              onChange={(e) => {
                const value = e.target.value;
                handleChange("start_date", value);
                if (hasNewColumns && value) {
                  const startYear = new Date(value).getFullYear();
                  setFormData((prev) => {
                    // When date changes, we only adjust the period if it's completely out of range (more than 1 year difference)
                    // Otherwise, we respect the current period selection.
                    const currentPeriodYear = parseInt(prev.leave_period);
                    const desiredPeriodYear =
                      Number.isFinite(currentPeriodYear) &&
                        Math.abs(currentPeriodYear - startYear) <= 1
                        ? currentPeriodYear
                        : startYear;

                    const currentQuotaYear = parseInt(prev.leave_quota_year);
                    const desiredQuotaYear =
                      Number.isFinite(currentQuotaYear) &&
                        currentQuotaYear <= desiredPeriodYear &&
                        currentQuotaYear >= desiredPeriodYear - 1
                        ? currentQuotaYear
                        : desiredPeriodYear;

                    setSelectedPeriod(desiredPeriodYear);
                    return {
                      ...prev,
                      leave_period: desiredPeriodYear.toString(),
                      leave_quota_year: desiredQuotaYear.toString(),
                    };
                  });
                }
              }}
              className="bg-slate-700 border-slate-600 text-white"
              required
            />
          </div>
          <div>
            <Label htmlFor="end_date" className="text-slate-300">
              Tanggal Selesai
            </Label>
            <Input
              id="end_date"
              name="end_date"
              type="date"
              value={formData.end_date}
              onChange={(e) => handleChange("end_date", e.target.value)}
              className="bg-slate-700 border-slate-600 text-white"
              required
            />
          </div>
        </div>

        {/* Overlap Warning Message */}
        {overlapWarning && (
          <div className="p-3 bg-red-900/40 border border-red-500/50 rounded text-red-300 text-sm flex items-center animate-in fade-in slide-in-from-top-1">
            <span className="mr-2">âš ï¸</span>
            {overlapWarning}
          </div>
        )}

        {/* New fields - only show if database columns exist */}
        {hasNewColumns && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="leave_period" className="text-slate-300">
                Periode Cuti
                <span className="text-xs text-slate-400 block">
                  (Pilih tahun periode cuti yang sedang diinput)
                </span>
              </Label>
              <Select
                value={selectedPeriod.toString()}
                onValueChange={(value) => {
                  const newPeriod = parseInt(value);
                  setSelectedPeriod(newPeriod);
                  setFormData((prev) => {
                    const currentQuotaYear = parseInt(prev.leave_quota_year);
                    const desiredQuotaYear =
                      Number.isFinite(currentQuotaYear) &&
                        currentQuotaYear <= newPeriod &&
                        currentQuotaYear >= newPeriod - 1
                        ? currentQuotaYear
                        : newPeriod;
                    return {
                      ...prev,
                      leave_period: value,
                      leave_quota_year: desiredQuotaYear.toString(),
                    };
                  });
                }}
              >
                <SelectTrigger
                  id="leave_period"
                  className="bg-slate-700 border-slate-600 text-white"
                >
                  <SelectValue placeholder="Pilih periode cuti" />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600">
                  {/* Generate years from 2024 to current year */}
                  {Array.from({ length: currentYear - 2023 }, (_, i) => currentYear - i).map(year => (
                    <SelectItem
                      key={year}
                      value={year.toString()}
                      className="text-white hover:bg-slate-600"
                    >
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mt-2 p-2 rounded border border-slate-600/50 bg-slate-800/30">
                <p className="text-xs text-slate-400">
                  ðŸ’¡ Periode menentukan tahun cuti yang sedang Anda input.
                  Pilih <strong className="text-slate-300">2025</strong> untuk input data cuti periode 2025,
                  atau <strong className="text-slate-300">2026</strong> untuk periode 2026.
                </p>
              </div>
              <div className="mt-2 p-2 rounded border border-slate-600/50 bg-slate-800/30">
                {!formData.employee_id || !formData.leave_type_id ? (
                  <p className="text-xs text-slate-400">
                    Pilih pegawai dan jenis cuti untuk melihat saldo cuti.
                  </p>
                ) : isLoadingLeaveBalance ? (
                  <div className="text-xs text-slate-400 flex items-center">
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Memuat saldo cuti...
                  </div>
                ) : leaveBalanceError ? (
                  <p className="text-xs text-red-300">{leaveBalanceError}</p>
                ) : leaveBalanceSummary ? (
                  <div className="text-xs text-slate-300 space-y-1">
                    <p>
                      <strong>Saldo Periode {leaveBalanceSummary.periodYear}</strong>: {leaveBalanceSummary.remaining} hari
                    </p>
                    <p className="text-slate-400">
                      Tahun berjalan: {leaveBalanceSummary.remaining_current} hari
                    </p>
                    <p className="text-slate-400">
                      Penangguhan: {leaveBalanceSummary.remaining_deferred} hari
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Saldo cuti tidak tersedia.</p>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="leave_quota_year" className="text-slate-300">
                Jatah Cuti Tahun
                <span className="text-xs text-slate-400 block">
                  (Tahun jatah cuti yang digunakan)
                </span>
              </Label>
              <Select
                value={formData.leave_quota_year}
                onValueChange={(value) =>
                  handleChange("leave_quota_year", value)
                }
                required
              >
                <SelectTrigger
                  id="leave_quota_year"
                  className="bg-slate-700 border-slate-600 text-white"
                >
                  <SelectValue placeholder="Pilih tahun jatah cuti" />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600">
                  {/* Dynamic years for quota selection */}
                  {quotaYears.map((year) => (
                    <SelectItem
                      key={year.value}
                      value={year.value}
                      className="text-white hover:bg-slate-600"
                    >
                      {year.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {formData.leave_quota_year && (
                <div className="mt-2 p-2 rounded border">
                  {parseInt(formData.leave_quota_year) < currentYear ? (
                    <div className="text-xs text-yellow-400 bg-yellow-900/20 p-2 rounded">
                      âš ï¸ <strong>Saldo Cuti Penangguhan</strong>
                      <br />
                      Menggunakan saldo cuti yang ditangguhkan dari tahun{" "}
                      {formData.leave_quota_year}. Pastikan pegawai memiliki
                      saldo penangguhan yang cukup.
                    </div>
                  ) : (
                    <div className="text-xs text-green-400 bg-green-900/20 p-2 rounded">
                      âœ“ <strong>Saldo Cuti Tahun Berjalan</strong>
                      <br />
                      Menggunakan saldo cuti normal tahun{" "}
                      {formData.leave_quota_year}.
                    </div>
                  )}
                </div>
              )}

              {formData.leave_quota_year && selectedQuotaRemaining && (
                <div className="mt-2 p-2 rounded border border-slate-600/50 bg-slate-800/30">
                  <p className="text-xs text-slate-300">
                    <strong>{selectedQuotaRemaining.label}</strong>: {selectedQuotaRemaining.value} hari
                  </p>
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="application_form_date" className="text-slate-300">
                Tanggal Formulir Pengajuan Cuti
                <span className="text-xs text-slate-400 block">
                  (Tanggal pengajuan formulir cuti)
                </span>
              </Label>
              <Input
                id="application_form_date"
                name="application_form_date"
                type="date"
                value={formData.application_form_date}
                onChange={(e) =>
                  handleChange("application_form_date", e.target.value)
                }
                className="bg-slate-700 border-slate-600 text-white"
                required
              />
            </div>
          </div>
        )}

        {/* Database migration notice */}
        {!hasNewColumns && (
          <div className="p-4 bg-blue-900/20 border border-blue-600/30 rounded-lg">
            <div className="flex items-start space-x-2">
              <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center mt-0.5">
                <span className="text-white text-xs font-bold">i</span>
              </div>
              <div className="text-sm">
                <p className="text-blue-200 font-medium mb-1">
                  Fitur Baru Tersedia
                </p>
                <p className="text-blue-300 text-xs">
                  Fitur "Jatah Cuti Tahun" dan "Tanggal Formulir" tersedia
                  setelah database migration. Hubungi administrator untuk
                  mengaktifkan fitur ini.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="leave_letter_number" className="text-slate-300">
              No. Surat Cuti
            </Label>
            <Input
              id="leave_letter_number"
              name="leave_letter_number"
              placeholder="Nomor surat cuti yang diterbitkan"
              value={formData.leave_letter_number}
              onChange={(e) =>
                handleChange("leave_letter_number", e.target.value)
              }
              className="bg-slate-700 border-slate-600 text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="leave_letter_date" className="text-slate-300">
              Tanggal Surat
            </Label>
            <Input
              id="leave_letter_date"
              name="leave_letter_date"
              type="date"
              value={formData.leave_letter_date}
              onChange={(e) =>
                handleChange("leave_letter_date", e.target.value)
              }
              className="bg-slate-700 border-slate-600 text-white"
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="signed_by" className="text-slate-300">
              Pejabat yang Menandatangani
            </Label>
            <div className="flex gap-2 mt-1 px-1">
              <div className="relative flex-1">
                <Input
                  id="signed_by"
                  placeholder="Pilih atau cari penandatangan..."
                  value={signerSearchTerm}
                  onChange={(e) => {
                    setSignerSearchTerm(e.target.value);
                    setShowSignerDropdown(true);
                    handleChange("signed_by", e.target.value);
                  }}
                  onClick={() => setShowSignerDropdown(true)}
                  className="w-full bg-slate-700 border-slate-600 text-white"
                  autoComplete="off"
                />
                {/* Dropdown for saved signers */}
                {showSignerDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {signersData.length === 0 ? (
                      <div className="p-3 text-sm text-slate-400 text-center">
                        Belum ada daftar penandatangan.
                        <br />Klik "Kelola" untuk menambah.
                      </div>
                    ) : (
                      signersData
                        .filter(s => s.name.toLowerCase().includes(signerSearchTerm.toLowerCase()))
                        .map((signer) => (
                          <div
                            key={signer.id || signer.name}
                            className="p-2 hover:bg-slate-700 cursor-pointer text-sm"
                            onClick={() => handleSelectSigner(signer)}
                          >
                            <div className="font-medium text-slate-200">{signer.name}</div>
                            <div className="text-xs text-slate-400">
                              {signer.position_name}
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                )}
                {showSignerDropdown && (
                  <div className="fixed inset-0 z-0" onClick={() => setShowSignerDropdown(false)}></div>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsManageSignersOpen(true)}
                className="whitespace-nowrap border-slate-600 text-slate-200 hover:bg-slate-700"
              >
                Kelola
              </Button>
            </div>

            {selectedSigner && (
              <div className="mt-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 flex justify-between items-start">
                <div>
                  <div className="text-sm font-medium text-slate-300">
                    {selectedSigner.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {selectedSigner.nip && <div>NIP: {selectedSigner.nip}</div>}
                    {selectedSigner.position_name && (
                      <div>Jabatan: {selectedSigner.position_name}</div>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-slate-400 hover:text-red-400"
                  onClick={handleClearSigner}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Manage Signatories Modal */}
            <Dialog open={isManageSignersOpen} onOpenChange={setIsManageSignersOpen}>
              <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-slate-200">
                <DialogHeader>
                  <DialogTitle>Kelola Daftar Penandatangan</DialogTitle>
                  <DialogDescription className="text-slate-400">
                    Tambahkan pimpinan ke daftar untuk akses cepat.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="signer_modal_search">Cari Pegawai / Pimpinan</Label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                      <Input
                        id="signer_modal_search"
                        placeholder="Ketik nama atau NIP..."
                        className="pl-9 bg-slate-800 border-slate-700 text-white"
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val.length > 2) {
                            setIsSearchingSigner(true);
                            const currentUser = AuthManager.getUserSession();
                            let query = supabaseSimpelAdmin
                              .from("employees")
                              .select("id, nip, name, department, position_name, rank_group")
                              .or(`name.ilike.%${val}%,nip.ilike.%${val}%`)
                              .limit(5);

                            query = applyEmployeeScopeFilter(query, currentUser);

                            query.then(({ data }) => {
                              setSignerSearchResults(data || []);
                              setIsSearchingSigner(false);
                            });
                          } else {
                            setSignerSearchResults([]);
                          }
                        }}
                      />
                    </div>
                    {/* Search Results */}
                    {signerSearchResults.length > 0 && (
                      <div className="border border-slate-700 rounded-md max-h-40 overflow-y-auto mt-2 bg-slate-800">
                        {signerSearchResults.map(emp => (
                          <div
                            key={emp.id}
                            className="p-2 hover:bg-slate-700 cursor-pointer flex justify-between items-center border-b border-slate-700 last:border-0"
                            onClick={() => {
                              handleAddSigner(emp);
                              setSignerSearchResults([]); // Clear search after add
                            }}
                          >
                            <div>
                              <div className="text-sm font-medium">{emp.name}</div>
                              <div className="text-xs text-slate-400">{emp.position_name}</div>
                            </div>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 hover:bg-slate-600">
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Daftar Tersimpan</div>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                      {signersData.length === 0 ? (
                        <p className="text-sm text-slate-500 italic">Belum ada data tersimpan.</p>
                      ) : (
                        signersData.map((signer) => (
                          <div key={signer.id} className="flex justify-between items-center p-2 bg-slate-800 rounded border border-slate-700 mb-2">
                            <div>
                              <div className="text-sm font-medium">{signer.name}</div>
                              <div className="text-xs text-slate-400">{signer.position_name}</div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-400 hover:text-red-300 hover:bg-red-950/20 h-8"
                              onClick={() => handleRemoveSigner(signer.id)}
                            >
                              Hapus
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Signer Details Box */}
        {selectedSigner && (
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-slate-800/50 rounded-md border border-slate-700/50">
            <div>
              <span className="text-xs font-medium text-slate-400">NIP</span>
              <div className="mt-1 text-sm text-white">
                {selectedSigner.nip}
              </div>
            </div>
            <div>
              <span className="text-xs font-medium text-slate-400">
                Jabatan
              </span>
              <div className="mt-1 text-sm text-white">
                {selectedSigner.position_name}
              </div>
            </div>
          </div>
        )}

        <div className="md:col-span-2">
          <Label htmlFor="address_during_leave" className="text-slate-300">
            Alamat Selama Cuti
          </Label>
          <Textarea
            id="address_during_leave"
            placeholder="Alamat lengkap selama menjalankan cuti"
            value={formData.address_during_leave}
            onChange={(e) =>
              handleChange("address_during_leave", e.target.value)
            }
            className="bg-slate-700 border-slate-600 text-white"
          />
        </div>
        <div>
          <Label htmlFor="reason" className="text-slate-300">
            Alasan/Keterangan
          </Label>
          <Textarea
            id="reason"
            placeholder="Masukkan alasan atau keterangan cuti"
            value={formData.reason}
            onChange={(e) => handleChange("reason", e.target.value)}
            className="bg-slate-700 border-slate-600 text-white"
          />
        </div>
      </div>

      {/* ── Upload Dokumen Pendukung ── */}
      {leaveRequestId && (
        <div className="space-y-3 px-4 pb-4">
          <div className="border-t border-slate-700 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-slate-200">Dokumen Pendukung</h3>
              <Badge variant="outline" className="bg-blue-900/30 text-blue-300 border-blue-600">
                Opsional
              </Badge>
            </div>
            <div className="bg-blue-900/20 border border-blue-700/40 rounded p-3 mb-4 text-xs text-blue-300">
              💡 Upload dokumen pendukung untuk pengajuan cuti ini (opsional).
              Dokumen akan diunggah ke Google Drive dan dapat diakses untuk verifikasi.
            </div>
          </div>

          <LeaveDocumentUploader
            leaveRequestId={leaveRequestId}
            slot={{
              code: 'formulir_cuti',
              label: 'Formulir Permohonan Cuti',
              required: false,
            }}
            readonly={false}
            onChange={() => setDocumentsRefresh(prev => prev + 1)}
          />

          <LeaveDocumentUploader
            leaveRequestId={leaveRequestId}
            slot={{
              code: 'surat_keterangan',
              label: 'Surat Keterangan Pendukung (jika ada)',
              required: false,
            }}
            readonly={false}
            onChange={() => setDocumentsRefresh(prev => prev + 1)}
          />
          
          <div className="bg-green-900/20 border border-green-700/40 rounded p-3 text-xs text-green-300">
            ✓ Dokumen telah tersimpan. Anda dapat menutup form ini atau upload dokumen tambahan.
          </div>
        </div>
      )}

      <div className="p-4 border-t border-slate-700 bg-slate-800/50">
        <div className="flex justify-end space-x-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            className="text-slate-300 hover:text-white"
          >
            Batal
          </Button>
          {leaveRequestId ? (
            <Button
              type="button"
              onClick={onCancel}
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
            >
              Selesai
            </Button>
          ) : (
            <Button
              type="submit"
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting
                ? initialData?.id
                  ? "Memperbarui..."
                  : "Menyimpan..."
                : initialData?.id
                  ? "Simpan Perubahan"
                  : "Simpan Data Cuti"}
            </Button>
          )}
        </div>
      </div>

    </form>
  );
};

export default LeaveRequestForm;
