import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  FileText,
  Users,
  Download,
  Loader2,
  Search,
  FileArchive as FileDocxIcon,
  CheckCircle,
  AlertCircle,
  Plus,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabaseClient";
import { supabaseSimpelAdmin } from "@/lib/supabaseSSO";
import { formatDateRange } from "@/utils/dateFormatters";
import DocxFormFiller from "@/components/DocxFormFiller";
import {
  extractDocxVariables,
  processDocxTemplate,
} from "@/utils/docxTemplates";
import { saveAs } from "file-saver";
import {
  countWorkingDays,
  fetchNationalHolidaysFromDB,
} from "@/utils/workingDays";
import { AuthManager } from "@/lib/auth";
import {
  getScopedSicutiEmployeeIds,
  applySicutiEmployeeIdFilter,
} from "@/utils/employeeScope";

// Dummy data for employees - in a real app, this would come from an API
const dummyEmployees = [
  {
    id: "1",
    nip: "198709012023012001",
    nama: "John Doe",
    jabatan: "Staf",
    unit_kerja: "Fakultas Teknik",
    superior_id: "3", // Ahmad Budiman sebagai atasan
  },
  {
    id: "2",
    nip: "199004152023022002",
    nama: "Jane Smith",
    jabatan: "Dosen",
    unit_kerja: "Fakultas Kedokteran",
    superior_id: "6", // Dr. Memey sebagai atasan
  },
  {
    id: "3",
    nip: "197512032001121001",
    nama: "Ahmad Budiman",
    jabatan: "Dekan",
    unit_kerja: "Fakultas Teknik",
    superior_id: "7", // Rektor sebagai atasan
  },
  {
    id: "4",
    nip: "1982061534567890",
    nama: "Siti Rahayu",
    jabatan: "Kepala Bagian",
    unit_kerja: "Fakultas Ekonomi",
    superior_id: "8", // Dekan Ekonomi sebagai atasan
  },
  {
    id: "5",
    nip: "1995112045678901",
    nama: "Budi Santoso",
    jabatan: "Staf",
    unit_kerja: "Fakultas Hukum",
    superior_id: "9", // Dekan Hukum sebagai atasan
  },
];

// Helper function to get signatory data based on signed_by name from leave request
const getSignatoryByName = async (signatoryName) => {
  if (!signatoryName) return null;

  try {
    // Cari di SIMPEL — exact match dulu
    let { data: employeeData, error } = await supabaseSimpelAdmin
      .from("employees")
      .select("name, nip, position_name, rank_group, department")
      .eq("name", signatoryName)
      .limit(1);

    if (!employeeData || employeeData.length === 0) {
      // Fallback partial match
      const { data: partialData, error: partialError } = await supabaseSimpelAdmin
        .from("employees")
        .select("name, nip, position_name, rank_group, department")
        .ilike("name", `%${signatoryName}%`)
        .limit(1);

      if (!partialError) employeeData = partialData;
    }

    if (employeeData && employeeData.length > 0) {
      const employee = employeeData[0];
      return {
        nama: employee.name,
        nip: employee.nip || "NIP tidak tersedia",
        jabatan: employee.position_name || "Jabatan tidak tersedia",
        unit_kerja: employee.department || ""
      };
    }
  } catch (error) {
    console.warn("Error searching employee database for signatory:", error);
  }

  // Jika tidak ditemukan, return null
  return null;
};

// Helper function to get signatory data for an employee (fallback method)
const getSignatoryForEmployee = async (employee) => {
  if (!employee) return null;

  // Jika employee memiliki superior_id, cari data atasan (DB lookup needed here if we had logic for it)
  // For now, simpler fallback: try to find Dept Head? 
  // Since we don't have easy hierarchy lookup here without more DB calls, we will return null 
  // and let the letter be generated with placeholders if necessary.

  return null;
};

function DocxSuratKeterangan() {
  // State management
  const [mode, setMode] = useState("individu");
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingLeaveRequests, setIsLoadingLeaveRequests] = useState(true);
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [isEmployeeDialogOpen, setIsEmployeeDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [availableEmployees, setAvailableEmployees] = useState(dummyEmployees);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [tempSelectedEmployees, setTempSelectedEmployees] = useState([]);
  const [formData, setFormData] = useState({});
  const [autoFillData, setAutoFillData] = useState({});
  const [holidays, setHolidays] = useState(new Set());
  const { toast } = useToast();

  // Load DOCX templates from Supabase database
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        console.log("Loading templates from Supabase...");

        const currentUser = AuthManager.getUserSession();
        if (!currentUser) {
          throw new Error("User not authenticated");
        }

        console.log("Current user:", { role: currentUser.role, unit: currentUser.department });

        let query = supabase.from("templates").select("*");

        // Apply role-based filtering
        if (currentUser.role === "admin_pusat") {
          // Master admin sees only global templates
          query = query.eq("template_scope", "global");
        } else if (currentUser.role === "admin_unit") {
          // Admin unit sees only their own unit's templates
          const userUnit = currentUser.department;
          if (!userUnit) {
            throw new Error("Admin unit user must have a unit assigned");
          }
          query = query.eq("template_scope", "unit").eq("unit_scope", userUnit);
        } else {
          // Other roles have no access
          throw new Error("Insufficient permissions to access templates");
        }

        const { data, error } = await query
          .eq("type", "docx")
          .order("name", { ascending: true });

        if (error) {
          throw error;
        }

        console.log("Templates loaded from Supabase:", data);
        setSavedTemplates(data || []);

        if (data && data.length > 0 && !selectedTemplate) {
          setSelectedTemplate(data[0]);
        }
      } catch (error) {
        console.error("Error loading templates from Supabase:", error);
        toast({
          title: "Gagal memuat template dari database",
          description:
            "Mencoba memuat dari penyimpanan lokal sebagai cadangan: " +
            error.message,
          variant: "destructive",
        });

        // Fallback to localStorage if Supabase fails
        try {
          const savedTemplates =
            JSON.parse(localStorage.getItem("savedTemplates")) || [];
          const docxTemplates = savedTemplates.filter((t) => {
            return t.type === "docx" && t.content?.type === "docx";
          });
          console.log(
            "Fallback: Loaded DOCX templates from localStorage:",
            docxTemplates,
          );
          setSavedTemplates(docxTemplates);

          if (docxTemplates.length > 0 && !selectedTemplate) {
            setSelectedTemplate(docxTemplates[0]);
          }
        } catch (localError) {
          console.error("Error loading from localStorage:", localError);
        }
      }
    };

    loadTemplates();
  }, [toast]);

  // Fetch leave requests
  useEffect(() => {
    const fetchLeaveRequests = async () => {
      try {
        setIsLoadingLeaveRequests(true);

        const currentUser = AuthManager.getUserSession();
        const scopedEmployeeIds = await getScopedSicutiEmployeeIds(currentUser);

        let query = supabase
          .from("leave_requests")
          .select(
            `
            *,
            employees (
              id,
              name,
              nip,
              rank_group,
              department
            ),
            leave_types (
              id,
              name
            )
          `,
          )
          .order("created_at", { ascending: false });

        query = applySicutiEmployeeIdFilter(query, scopedEmployeeIds);

        const { data, error } = await query;

        if (error) throw error;

        console.log("Fetched leave requests:", data);
        setLeaveRequests(data || []);
      } catch (error) {
        console.error("Error fetching leave requests:", error);
        toast({
          title: "Gagal memuat data cuti",
          description: "Terjadi kesalahan saat memuat data pengajuan cuti",
          variant: "destructive",
        });
      } finally {
        setIsLoadingLeaveRequests(false);
      }
    };

    fetchLeaveRequests();
  }, [toast]);

  // Load holidays from database
  useEffect(() => {
    const loadHolidays = async () => {
      try {
        const currentYear = new Date().getFullYear();
        
        // Load holidays for a wider range: current year, previous year, and next year
        // This ensures we have data for leave requests spanning different years
        const yearsToLoad = [currentYear - 1, currentYear, currentYear + 1];
        
        // Load holidays for all relevant years
        const holidayPromises = yearsToLoad.map(year => 
          fetchNationalHolidaysFromDB(year).catch(error => {
            console.warn(`Failed to load holidays for year ${year}:`, error);
            return new Set(); // Return empty set on error
          })
        );
        
        const holidayResults = await Promise.all(holidayPromises);
        
        // Combine holidays from all years
        const allHolidays = new Set();
        holidayResults.forEach(yearHolidays => {
          yearHolidays.forEach(holiday => allHolidays.add(holiday));
        });
        
        setHolidays(allHolidays);

        console.log(
          `ðŸ“… Loaded ${allHolidays.size} national holidays for years ${yearsToLoad.join(', ')}`,
          Array.from(allHolidays),
        );

        if (allHolidays.size > 0) {
          toast({
            title: "ðŸ“… Hari Libur Nasional Dimuat",
            description: `${allHolidays.size} hari libur nasional telah dimuat untuk perhitungan yang akurat`,
            variant: "default",
          });
        }
      } catch (error) {
        console.error("Failed to load national holidays:", error);
        toast({
          title: "Peringatan",
          description:
            "Gagal memuat data hari libur nasional. Perhitungan mungkin tidak akurat.",
          variant: "destructive",
        });
        // Set empty holidays set as fallback
        setHolidays(new Set());
      }
    };

    loadHolidays();
  }, [toast]);

  // Update auto-fill data when selected employees change (only for individual mode)
  useEffect(() => {
    const updateAutoFillData = async () => {
      if (selectedEmployees.length > 0 && mode === "individu") {
        try {
          console.log("=== UPDATING AUTO-FILL DATA (INDIVIDUAL MODE) ===");
          console.log("Selected employee:", selectedEmployees[0]);

          // Generate data dengan support BOTH flat dan indexed variables
          // menggunakan generateBatchTemplateData yang sudah punya bridge mapping
          const batchData = await generateBatchTemplateData(selectedEmployees, 5);

          console.log("Generated auto-fill data (with hierarchical support):", batchData);
          console.log("Key fields check:");
          console.log("- Flat - nama:", batchData.nama, "nip:", batchData.nip);
          console.log("- Indexed - nama_1:", batchData.nama_1, "nip_1:", batchData.nip_1);

          setAutoFillData(batchData);
          console.log("Auto-fill data state updated with both flat and indexed variables");
          console.log("=== END AUTO-FILL DATA UPDATE ===");
        } catch (error) {
          console.error("Error getting letter data:", error);
          setAutoFillData({});
        }
      } else {
        console.log(
          "Clearing auto-fill data (batch mode or no employees selected)",
        );
        setAutoFillData({});
      }
    };

    updateAutoFillData();
  }, [selectedEmployees, mode]);

  // Filter leave requests based on search query
  const filteredLeaveRequests = leaveRequests.filter((request) => {
    if (!searchQuery) return true;

    const query = searchQuery.toLowerCase();
    return (
      request.employees?.name?.toLowerCase().includes(query) ||
      request.employees?.nip?.includes(query) ||
      request.leave_types?.name?.toLowerCase().includes(query) ||
      request.reference_number?.toLowerCase().includes(query)
    );
  });

  // Filter employees based on search query
  const filteredEmployees = availableEmployees.filter(
    (employee) =>
      employee.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
      employee.nip.includes(searchQuery),
  );

  // Check if an employee is selected
  const isEmployeeSelected = (employee) => {
    return tempSelectedEmployees.some((e) => e.id === employee.id);
  };

  // Check if a leave request is selected
  const isLeaveRequestSelected = (request) => {
    return tempSelectedEmployees.some((r) => r.id === request.id);
  };

  // Toggle leave request selection
  const toggleLeaveRequestSelection = (request) => {
    if (mode === "individu") {
      setTempSelectedEmployees(
        isLeaveRequestSelected(request) ? [] : [request],
      );
    } else {
      setTempSelectedEmployees((prev) =>
        isLeaveRequestSelected(request)
          ? prev.filter((r) => r.id !== request.id)
          : [...prev, request],
      );
    }
  };

  // Save selected leave requests
  const saveSelectedLeaveRequests = () => {
    setSelectedEmployees([...tempSelectedEmployees]);
    setIsEmployeeDialogOpen(false);
  };

  // Close leave request dialog
  const closeLeaveRequestDialog = () => {
    setTempSelectedEmployees([...selectedEmployees]);
    setIsEmployeeDialogOpen(false);
  };

  // Toggle employee selection
  const toggleEmployeeSelection = (employee) => {
    if (mode === "individu") {
      // In individual mode, only one employee can be selected at a time
      setTempSelectedEmployees(isEmployeeSelected(employee) ? [] : [employee]);
    } else {
      // In batch mode, multiple employees can be selected
      setTempSelectedEmployees((prev) =>
        isEmployeeSelected(employee)
          ? prev.filter((e) => e.id !== employee.id)
          : [...prev, employee],
      );
    }
  };

  // Save selected employees and close dialog
  const saveSelectedEmployees = () => {
    setSelectedEmployees([...tempSelectedEmployees]);
    setIsEmployeeDialogOpen(false);
  };

  // Close employee dialog and reset selection
  const closeEmployeeDialog = () => {
    setTempSelectedEmployees([...selectedEmployees]);
    setIsEmployeeDialogOpen(false);
  };

  // Format date in Indonesian
  const formatDateLong = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("id-ID", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Calculate working days between two dates (excluding weekends and national holidays)
  const calculateWorkingDays = (startDate, endDate) => {
    if (!startDate || !endDate) return 0;
    return countWorkingDays(startDate, endDate, holidays);
  };

  // Convert number to Indonesian words
  const numberToWords = (num) => {
    if (num === 0) return "nol";

    const ones = [
      "",
      "satu",
      "dua",
      "tiga",
      "empat",
      "lima",
      "enam",
      "tujuh",
      "delapan",
      "sembilan",
    ];
    const teens = [
      "sepuluh",
      "sebelas",
      "dua belas",
      "tiga belas",
      "empat belas",
      "lima belas",
      "enam belas",
      "tujuh belas",
      "delapan belas",
      "sembilan belas",
    ];
    const tens = [
      "",
      "",
      "dua puluh",
      "tiga puluh",
      "empat puluh",
      "lima puluh",
      "enam puluh",
      "tujuh puluh",
      "delapan puluh",
      "sembilan puluh",
    ];

    if (num < 10) return ones[num];
    if (num < 20) return teens[num - 10];
    if (num < 100) {
      const ten = Math.floor(num / 10);
      const one = num % 10;
      return tens[ten] + (one > 0 ? " " + ones[one] : "");
    }

    return num.toString(); // For larger numbers, just return the number
  };

  // Get letter data for the selected leave request
  const getLetterData = async (leaveRequest) => {
    if (!leaveRequest) return {};

    // Helper function to format dates consistently
    const formatDate = (dateString) => {
      if (!dateString) return "";
      try {
        const options = { day: "2-digit", month: "long", year: "numeric" };
        return new Date(dateString).toLocaleDateString("id-ID", options);
      } catch (error) {
        console.error("Error formatting date:", error);
        return "";
      }
    };

    // Helper function to format date range for tanggal_cuti
    const formatTanggalCuti = (startDate, endDate) => {
      if (!startDate || !endDate) return "";

      const start = new Date(startDate);
      const end = new Date(endDate);

      const startDay = start.getDate();
      const endDay = end.getDate();
      const month = end.toLocaleString("id-ID", { month: "long" });
      const year = end.getFullYear();

      if (start.getTime() === end.getTime()) {
        // Same date
        return `${startDay} ${month} ${year}`;
      } else if (
        start.getMonth() === end.getMonth() &&
        start.getFullYear() === end.getFullYear()
      ) {
        // Same month and year
        return `${startDay} s.d. ${endDay} ${month} ${year}`;
      } else {
        // Different months or years
        const startMonth = start.toLocaleString("id-ID", { month: "long" });
        const startYear = start.getFullYear();
        return `${startDay} ${startMonth} ${startYear} s.d. ${endDay} ${month} ${year}`;
      }
    };

    // Get employee data - prioritize from employees relation, then fallback
    const employeeData = leaveRequest.employees || leaveRequest;

    console.log("Processing employee data:", employeeData);
    console.log("Leave request structure:", {
      hasEmployees: !!leaveRequest.employees,
      hasStartDate: !!leaveRequest.start_date,
      hasEndDate: !!leaveRequest.end_date,
      isDummyData: !leaveRequest.employees && !!leaveRequest.nama,
    });

    // Fetch fresh employee data from database to get the most up-to-date jabatan
    let freshEmployeeData = null;
    if (employeeData?.id) {
      try {
        const { data: empData, error } = await supabaseSimpelAdmin
          .from("employees")
          .select("id, name, nip, position_name, rank_group, department")
          .eq("id", employeeData.id)
          .single();

        if (!error && empData) {
          freshEmployeeData = empData;
          console.log("Fresh employee data fetched:", freshEmployeeData);
        }
      } catch (error) {
        console.warn("Error fetching fresh employee data:", error);
      }
    }

    // Get signatory name from signed_by field in leave request
    const signatoryName = leaveRequest.signed_by;
    console.log("Signatory name from signed_by field:", signatoryName);

    // Try to find signatory data based on signed_by name
    let signatory = null;
    if (signatoryName) {
      signatory = await getSignatoryByName(signatoryName);
    }

    // If not found in database, create a basic signatory object with the name
    if (!signatory && signatoryName) {
      signatory = {
        nama: signatoryName,
        nip: "NIP tidak tersedia", // Will be filled if found in database
        jabatan: "Jabatan tidak tersedia", // Will be filled if found in database
      };
    }

    // Fallback to auto-detection if no signed_by data
    if (!signatory) {
      signatory = getSignatoryForEmployee(employeeData);
    }

    console.log("Final signatory data:", signatory);
    // Handle API response format (from Supabase)
    if (leaveRequest.start_date && leaveRequest.end_date) {
      const startDate = new Date(leaveRequest.start_date);
      const endDate = new Date(leaveRequest.end_date);
      const durationDays =
        Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
      const workingDays = calculateWorkingDays(startDate, endDate);
      const today = new Date();

      return {
        nomor_surat: leaveRequest.reference_number || ".../.../...",
        nama:
          leaveRequest.employees?.name ||
          leaveRequest.nama_pegawai ||
          leaveRequest.nama ||
          "Nama Pegawai",
        nip:
          leaveRequest.employees?.nip ||
          leaveRequest.nip ||
          "NIP tidak tersedia",
        pangkat_golongan:
          leaveRequest.employees?.rank_group ||
          leaveRequest.pangkat_golongan ||
          "...",
        jabatan:
          freshEmployeeData?.position_name ||
          leaveRequest.employees?.position_name ||
          leaveRequest.employees?.position ||
          leaveRequest.jabatan ||
          "Jabatan tidak tersedia",
        unit_kerja:
          leaveRequest.employees?.department ||
          leaveRequest.unit_kerja ||
          "Unit Kerja tidak tersedia",
        jenis_cuti:
          leaveRequest.leave_types?.name ||
          leaveRequest.jenis_cuti ||
          "Jenis Cuti tidak tersedia",
        lama_cuti: `${workingDays} (${numberToWords(workingDays)}) hari kerja`,
        tanggal_mulai: formatDateLong(
          leaveRequest.start_date || leaveRequest.tanggal_mulai,
        ),
        tanggal_selesai: formatDateLong(
          leaveRequest.end_date || leaveRequest.tanggal_selesai,
        ),
        tanggal_cuti: formatTanggalCuti(
          leaveRequest.start_date || leaveRequest.tanggal_mulai,
          leaveRequest.end_date || leaveRequest.tanggal_selesai,
        ),
        tanggal_formulir_pengajuan: formatDateLong(
          leaveRequest.application_form_date ||
          leaveRequest.created_at ||
          leaveRequest.tanggal_pengajuan ||
          new Date().toISOString(),
        ),
        alamat_selama_cuti:
          leaveRequest.address_during_leave ||
          leaveRequest.alamat_selama_cuti ||
          "Alamat tidak tersedia",
        // Auto-fill signatory data
        nama_atasan:
          leaveRequest.nama_atasan || signatory?.nama || "Nama Atasan",
        nip_atasan: leaveRequest.nip_atasan || signatory?.nip || "NIP Atasan",
        jabatan_atasan:
          leaveRequest.jabatan_atasan || signatory?.jabatan || "Jabatan Atasan",

        // ADDED: Missing variables that might be empty
        pangkat_golongan: leaveRequest.employees?.rank_group || leaveRequest.pangkat_golongan || "Pangkat tidak tersedia",
        status_asn: leaveRequest.employees?.asn_status || leaveRequest.status_asn || "Status ASN tidak tersedia",
        durasi_hari_terbilang: workingDays > 0 ? numberToWords(workingDays) : numberToWords(totalDays),
        nomor_surat_referensi: leaveRequest.reference_number || leaveRequest.nomor_surat_referensi || "REF tidak tersedia",
        tempat_lahir: leaveRequest.employees?.tempat_lahir || leaveRequest.tempat_lahir || "Tempat lahir tidak tersedia",
        tanggal_lahir: leaveRequest.employees?.tanggal_lahir ? formatDateLong(leaveRequest.employees.tanggal_lahir) : leaveRequest.tanggal_lahir || "Tanggal lahir tidak tersedia",
        tanggal_surat: (() => {
          console.log("=== TANGGAL SURAT DEBUG ===");
          console.log("leaveRequest.leave_letter_date:", leaveRequest.leave_letter_date);
          console.log("leaveRequest.created_at:", leaveRequest.created_at);
          console.log("Raw leave request data:", leaveRequest);

          const result = formatDate(leaveRequest.leave_letter_date || leaveRequest.created_at || new Date());
          console.log("Final tanggal_surat result:", result);
          console.log("=== END TANGGAL SURAT DEBUG ===");
          return result;
        })(),
        kota: leaveRequest.kota || "...",
        tahun: (leaveRequest.tanggal_surat
          ? new Date(leaveRequest.tanggal_surat)
          : new Date()
        ).getFullYear(),
        jatah_cuti_tahun:
          leaveRequest.leave_quota_year ||
          new Date(
            leaveRequest.start_date || leaveRequest.tanggal_mulai || new Date(),
          ).getFullYear(),
        bulan: (leaveRequest.tanggal_surat
          ? new Date(leaveRequest.tanggal_surat)
          : new Date()
        ).toLocaleString("id-ID", { month: "long" }),
        durasi_hari: durationDays.toString(),
        durasi_hari_terbilang: numberToWords(durationDays),
        alasan: leaveRequest.reason || leaveRequest.alasan || "...",
      };
    }

    // Handle form data format (from UI state) or dummy employee data
    const startDate = leaveRequest.tanggal_mulai
      ? new Date(leaveRequest.tanggal_mulai)
      : null;
    const endDate = leaveRequest.tanggal_selesai
      ? new Date(leaveRequest.tanggal_selesai)
      : null;
    const totalDays =
      startDate && endDate
        ? Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1
        : 7; // Default to 7 days for dummy data

    console.log("Form data processing:", {
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
      totalDays,
    });

    const workingDays =
      startDate && endDate
        ? calculateWorkingDays(startDate, endDate)
        : totalDays;

    // For dummy data, create sample dates if not available
    const sampleStartDate = startDate || new Date();
    const sampleEndDate =
      endDate || new Date(Date.now() + (totalDays - 1) * 24 * 60 * 60 * 1000);

    const result = {
      nama: leaveRequest.nama_pegawai || leaveRequest.nama || "Nama Pegawai",
      nip: leaveRequest.nip || "NIP tidak tersedia",
      jabatan: leaveRequest.jabatan || "Jabatan tidak tersedia",
      unit_kerja: leaveRequest.unit_kerja || "Unit Kerja tidak tersedia",
      jenis_cuti: leaveRequest.jenis_cuti || "Cuti Tahunan",
      alasan: leaveRequest.alasan || "Keperluan pribadi",

      // ADDED: Missing variables for form mode
      pangkat_golongan: leaveRequest.pangkat_golongan || "Pangkat tidak tersedia",
      status_asn: leaveRequest.status_asn || "Status ASN tidak tersedia",
      durasi_hari_terbilang: workingDays > 0 ? numberToWords(workingDays) : numberToWords(totalDays),
      nomor_surat_referensi: leaveRequest.reference_number || "REF tidak tersedia",
      tempat_lahir: leaveRequest.tempat_lahir || "Tempat lahir tidak tersedia",
      tanggal_lahir: leaveRequest.tanggal_lahir || "Tanggal lahir tidak tersedia",
      tanggal_mulai: formatDate(sampleStartDate),
      tanggal_selesai: formatDate(sampleEndDate),
      tanggal_cuti: formatTanggalCuti(sampleStartDate, sampleEndDate),
      tanggal_formulir_pengajuan: formatDateLong(
        leaveRequest.application_form_date ||
        leaveRequest.created_at ||
        leaveRequest.tanggal_pengajuan ||
        new Date().toISOString(),
      ),
      lama_cuti:
        workingDays > 0
          ? `${workingDays} (${numberToWords(workingDays)}) hari kerja`
          : `${totalDays} hari`,
      alamat_selama_cuti: leaveRequest.alamat_selama_cuti || "Alamat rumah",
      // Auto-fill signatory data for form format as well
      nama_atasan: leaveRequest.nama_atasan || signatory?.nama || "Nama Atasan",
      nip_atasan: leaveRequest.nip_atasan || signatory?.nip || "NIP Atasan",
      jabatan_atasan:
        leaveRequest.jabatan_atasan || signatory?.jabatan || "Jabatan Atasan",
      tanggal_surat: (() => {
        console.log("=== TANGGAL SURAT DEBUG (FORM DATA) ===");
        console.log("leaveRequest.leave_letter_date:", leaveRequest.leave_letter_date);
        console.log("leaveRequest.created_at:", leaveRequest.created_at);
        console.log("Raw leave request data:", leaveRequest);

        const result = formatDate(leaveRequest.leave_letter_date || leaveRequest.created_at || new Date());
        console.log("Final tanggal_surat result:", result);
        console.log("=== END TANGGAL SURAT DEBUG (FORM DATA) ===");
        return result;
      })(),
      tahun: new Date().getFullYear(),
      jatah_cuti_tahun:
        leaveRequest.leave_quota_year || new Date().getFullYear(),
      bulan: new Date().toLocaleString("id-ID", { month: "long" }),
    };

    console.log("Final form data result:", result);
    return result;
  };

  // Render template selection UI
  const renderTemplateSelection = () => (
    <div className="space-y-2">

      <div className="flex justify-between items-center">
        <Label>Pilih Template DOCX</Label>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-blue-500 border-blue-200 hover:bg-blue-50 hover:text-blue-600"
          onClick={() => window.open("https://drive.google.com/drive/folders/1wOcdhROICJjoFxh16G2kRe0RIqY4PCcX?usp=sharing", "_blank")}
        >
          <ExternalLink className="w-3 h-3 mr-2" />
          Download Contoh Template
        </Button>
      </div>
      {savedTemplates.length > 0 ? (
        <Select
          value={selectedTemplate?.id || ""}
          onValueChange={(value) => {
            const template = savedTemplates.find((t) => t.id === value);
            if (template) {
              setSelectedTemplate(template);
              setFormData({}); // Reset form data when template changes
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Pilih template DOCX" />
          </SelectTrigger>
          <SelectContent>
            {savedTemplates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                <div className="flex items-center">
                  <FileDocxIcon className="w-4 h-4 mr-2 text-blue-500" />
                  {template.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="p-4 border border-dashed rounded-lg text-center">
          <FileDocxIcon className="w-8 h-8 mx-auto mb-2 text-slate-500" />
          <p className="text-sm text-slate-400 mb-2">
            Belum ada template DOCX tersedia
          </p>
          <Button
            variant="link"
            className="text-blue-400 p-0 h-auto"
            onClick={() => (window.location.href = "/docx-template-management")}
          >
            Buat template baru di halaman Kelola Template
          </Button>
        </div>
      )}

      {selectedTemplate && (
        <div className="mt-2 p-3 bg-slate-700/50 rounded-lg border border-slate-600">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center mb-1">
                <FileDocxIcon className="w-4 h-4 mr-2 text-blue-500" />
                <h4 className="font-medium text-slate-200">
                  {selectedTemplate.name}
                </h4>
              </div>
              {selectedTemplate.description && (
                <p className="text-sm text-slate-400 mb-2">
                  {selectedTemplate.description}
                </p>
              )}
              <div className="text-xs text-slate-500 space-y-1">
                <div>Sumber: Database (Template tersimpan)</div>
                <div>
                  Dibuat:{" "}
                  {new Date(
                    selectedTemplate.created_at || selectedTemplate.updatedAt,
                  ).toLocaleDateString("id-ID")}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const handleFormDataChange = (newFormData) => {
    setFormData(newFormData);
  };

  const handleGenerate = async (docxBlob, formData) => {
    console.log("Generated DOCX blob:", docxBlob);
    console.log("Form data used:", formData);

    try {
      const fileName = `surat-${formData.nama || "pegawai"}.docx`;
      saveAs(docxBlob, fileName);

      toast({
        title: "Surat berhasil dibuat",
        description:
          "Surat keterangan telah berhasil dibuat dan diunduh dalam format DOCX asli",
        variant: "default",
      });
    } catch (error) {
      console.error("Error saving file:", error);
      toast({
        title: "Gagal mengunduh surat",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Generate combined data for batch template with indexed variables
  const generateBatchTemplateData = async (employees, maxSlots = 45) => {
    console.log(
      `=== GENERATING BATCH DATA FOR ${employees.length} EMPLOYEES (max ${maxSlots} slots) ===`,
    );

    // Helper function to format dates consistently for batch data
    const formatDate = (dateString) => {
      if (!dateString) return "";
      try {
        const options = { day: "2-digit", month: "long", year: "numeric" };
        return new Date(dateString).toLocaleDateString("id-ID", options);
      } catch (error) {
        console.error("Error formatting date:", error);
        return "";
      }
    };

    const batchData = {
      // Common template data (from first employee for consistency)
      nomor_surat: ".../.../...",
      tanggal_surat: "", // Will be filled from first employee data
      kota: "Jakarta",
      tahun: new Date().getFullYear(),
      // Signatory info (from first employee)
      nama_atasan: "",
      nip_atasan: "",
      jabatan_atasan: "",
    };

    // Get signatory info from first employee
    if (employees.length > 0) {
      const firstEmployeeData = await getLetterData(employees[0]);
      batchData.nama_atasan = firstEmployeeData.nama_atasan || "";
      batchData.nip_atasan = firstEmployeeData.nip_atasan || "";
      batchData.jabatan_atasan = firstEmployeeData.jabatan_atasan || "";
      batchData.nomor_surat = firstEmployeeData.nomor_surat || ".../.../...";
      batchData.tanggal_surat = (() => {
        console.log("=== BATCH TANGGAL SURAT DEBUG ===");
        console.log("firstEmployeeData.tanggal_surat:", firstEmployeeData.tanggal_surat);
        console.log("firstEmployeeData raw:", firstEmployeeData);
        console.log("employees[0] raw:", employees[0]);

        const result = firstEmployeeData.tanggal_surat || formatDate(new Date().toISOString());
        console.log("Final batch tanggal_surat result:", result);
        console.log("=== END BATCH TANGGAL SURAT DEBUG ===");
        return result;
      })();

      console.log("Common data from first employee:", {
        nama_atasan: batchData.nama_atasan,
        nip_atasan: batchData.nip_atasan,
        jabatan_atasan: batchData.jabatan_atasan,
        nomor_surat: batchData.nomor_surat,
        tanggal_surat: batchData.tanggal_surat,
      });
    }

    // Fill indexed variables for each employee (up to maxSlots)
    for (let i = 0; i < maxSlots; i++) {
      const index = i + 1; // 1-based indexing

      if (i < employees.length) {
        // Employee exists, fill with actual data
        console.log(
          `Processing employee ${index}/${employees.length}:`,
          employees[i].employees?.name || employees[i].nama || "Unknown",
        );

        const employeeData = await getLetterData(employees[i]);

        console.log(`Employee ${index} data:`, {
          nama: employeeData.nama,
          nip: employeeData.nip,
          jabatan: employeeData.jabatan,
          tanggal_cuti: employeeData.tanggal_cuti,
          lama_cuti: employeeData.lama_cuti,
        });

        batchData[`nama_${index}`] = employeeData.nama || "";
        batchData[`nip_${index}`] = employeeData.nip || "";
        batchData[`pangkat_golongan_${index}`] =
          employeeData.pangkat_golongan || "";
        batchData[`jabatan_${index}`] = employeeData.jabatan || "";
        batchData[`unit_kerja_${index}`] = employeeData.unit_kerja || "";
        batchData[`tanggal_cuti_${index}`] = employeeData.tanggal_cuti || "";
        batchData[`lama_cuti_${index}`] = employeeData.lama_cuti || "";
        batchData[`jatah_cuti_tahun_${index}`] =
          employeeData.jatah_cuti_tahun || new Date().getFullYear();
        batchData[`jenis_cuti_${index}`] = employeeData.jenis_cuti || "";
        batchData[`alamat_selama_cuti_${index}`] =
          employeeData.alamat_selama_cuti || "";
        batchData[`tanggal_formulir_pengajuan_${index}`] =
          employeeData.tanggal_formulir_pengajuan || "";
        batchData[`alasan_${index}`] = employeeData.alasan || "";

        // ADDED: Missing indexed variables for batch mode
        batchData[`pangkat_golongan_${index}`] = employeeData.pangkat_golongan || "Pangkat tidak tersedia";
        batchData[`status_asn_${index}`] = employeeData.status_asn || "Status ASN tidak tersedia";
        batchData[`durasi_hari_terbilang_${index}`] = employeeData.durasi_hari_terbilang || "";
        batchData[`nomor_surat_referensi_${index}`] = employeeData.nomor_surat_referensi || "REF tidak tersedia";
        batchData[`tempat_lahir_${index}`] = employeeData.tempat_lahir || "Tempat lahir tidak tersedia";
        batchData[`tanggal_lahir_${index}`] = employeeData.tanggal_lahir || "Tanggal lahir tidak tersedia";

        console.log(`âœ“ Employee ${index} data filled successfully`);
      } else {
        // No employee for this slot, fill with empty strings
        console.log(
          `Slot ${index}: No employee data - filling with empty strings`,
        );

        batchData[`nama_${index}`] = "";
        batchData[`nip_${index}`] = "";
        batchData[`pangkat_golongan_${index}`] = "";
        batchData[`jabatan_${index}`] = "";
        batchData[`unit_kerja_${index}`] = "";
        batchData[`tanggal_cuti_${index}`] = "";
        batchData[`lama_cuti_${index}`] = "";
        batchData[`jatah_cuti_tahun_${index}`] = "";
        batchData[`jenis_cuti_${index}`] = "";
        batchData[`alamat_selama_cuti_${index}`] = "";
        batchData[`tanggal_formulir_pengajuan_${index}`] = "";
        batchData[`alasan_${index}`] = "";

        // ADDED: Missing indexed variables for empty slots
        batchData[`pangkat_golongan_${index}`] = "";
        batchData[`status_asn_${index}`] = "";
        batchData[`durasi_hari_terbilang_${index}`] = "";
        batchData[`nomor_surat_referensi_${index}`] = "";
        batchData[`tempat_lahir_${index}`] = "";
        batchData[`tanggal_lahir_${index}`] = "";
      }
    }

    // ===================================================================
    // BRIDGE MAPPING: Sinkronisasi variabel flat â†” bertingkat
    //
    // Tujuan: template yang menggunakan {nama} (individu) akan tetap
    // terisi meski pembuatan surat batch; dan template yang menggunakan
    // {nama_1} (batch) akan tetap terisi meski mode individu.
    // ===================================================================

    // Daftar nama variabel per-pegawai yang perlu di-bridge
    // Bridge ini memastikan template yang pakai {nama} atau {nama_1} keduanya berfungsi
    const EMPLOYEE_VAR_KEYS = [
      'nama', 'nama_pegawai', 'nip', 'jabatan', 'pangkat_golongan',
      'departemen', 'unit_kerja', 'jenis_cuti',
      'tanggal_mulai', 'tanggal_selesai', 'tanggal_mulai_lengkap',
      'tanggal_selesai_lengkap', 'tanggal_pelaksanaan_cuti', 'tanggal_cuti',
      'jumlah_hari', 'lama_cuti', 'lamanya_cuti',
      'alasan', 'alamat_cuti', 'alamat_selama_cuti', 'tempat_alamat_cuti',
      'tahun_quota', 'cuti_tahun', 'jatah_cuti_tahun',
      'tanggal_formulir', 'tanggal_formulir_pengajuan', 'formulir_pengajuan_cuti',
      'periode_cuti', 'durasi_hari_terbilang', 'nomor_surat_referensi',
      'status_asn', 'nama_atasan', 'nip_atasan', 'jabatan_atasan',
    ];

    // 1. Dari variabel _1 â†’ isi variabel flat (jika flat belum ada atau kosong)
    EMPLOYEE_VAR_KEYS.forEach((key) => {
      const indexedVal = batchData[`${key}_1`];
      if (indexedVal !== undefined && indexedVal !== null) {
        if (batchData[key] === undefined || batchData[key] === null || batchData[key] === '') {
          batchData[key] = indexedVal;
        }
      }
    });

    // 2. Dari variabel flat â†’ isi _1, _2, dst. jika kosong
    EMPLOYEE_VAR_KEYS.forEach((key) => {
      const flatVal = batchData[key];
      if (flatVal !== undefined && flatVal !== null) {
        // Pastikan _1 selalu terisi
        if (batchData[`${key}_1`] === undefined || batchData[`${key}_1`] === null || batchData[`${key}_1`] === '') {
          batchData[`${key}_1`] = flatVal;
        }
      }
    });

    // 3. Untuk mode individu: tambahkan alias variabel bertingkat _1 hingga _5
    //    agar template dengan {nama_1}, {nip_1} dll. tetap terisi walaupun hanya 1 pegawai
    if (employees.length === 1) {
      for (let n = 2; n <= 5; n++) {
        EMPLOYEE_VAR_KEYS.forEach((key) => {
          if (batchData[`${key}_${n}`] === undefined) {
            batchData[`${key}_${n}`] = '';
          }
        });
      }
    }

    console.log("ðŸ”— Bridge mapping selesai. Contoh variabel:");
    console.log("  nama:", batchData.nama);
    console.log("  nip:", batchData.nip);
    console.log("  jabatan:", batchData.jabatan);
    console.log("  nama_1:", batchData.nama_1);
    console.log("  nip_1:", batchData.nip_1);
    console.log("  jabatan_1:", batchData.jabatan_1);

    console.log(`=== BATCH DATA GENERATION COMPLETE ===`);
    console.log(`Total variables created: ${Object.keys(batchData).length}`);
    console.log(
      `Employee slots filled: ${Math.min(employees.length, maxSlots)}`,
    );
    console.log(`Empty slots: ${Math.max(0, maxSlots - employees.length)}`);

    // Log sample of generated data for verification
    const sampleKeys = Object.keys(batchData).filter(
      (key) => key.includes("_1") || key.includes("_2") || key.includes("_5"),
    );
    console.log(
      "Sample batch data:",
      sampleKeys.reduce((obj, key) => {
        obj[key] = batchData[key];
        return obj;
      }, {}),
    );

    return batchData;
  };

  // Handle batch generation for multiple employees
  const handleBatchGenerate = async () => {
    let successCount = 0;
    let errorCount = 0;
    let errors = [];
    if (!selectedTemplate || selectedEmployees.length === 0) {
      toast({
        title: "Data tidak lengkap",
        description: "Pilih template dan minimal satu pegawai untuk mode batch",
        variant: "destructive",
      });
      return;
    }

    if (mode !== "batch") {
      toast({
        title: "Mode tidak sesuai",
        description:
          "Gunakan mode batch untuk memproses beberapa surat sekaligus",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);

      const { processDocxTemplate, extractDocxVariables } = await import(
        "@/utils/docxTemplates"
      );

      // Check if template is for batch (contains indexed variables like {nama_1}, {nama_2})
      const templateData =
        selectedTemplate.content?.data ||
        selectedTemplate.content ||
        selectedTemplate.template_data;

      console.log("Template data type:", typeof templateData);
      console.log("Template data length:", templateData?.length);

      // For base64 data, we need to decode and check the content
      let templateString = "";
      if (typeof templateData === "string") {
        if (templateData.startsWith("data:")) {
          // It's base64 data, we need to extract variables from the DOCX
          try {
            const variables = await extractDocxVariables(templateData);
            const variableNames = variables.map((v) => v.name);
            console.log("Extracted variables from template:", variableNames);

            // Check if any indexed variables exist
            const hasIndexedVars = variableNames.some(
              (name) =>
                /^\w+_\d+$/.test(name) || // matches pattern like nama_1, nip_2, etc.
                name.includes("_1") ||
                name.includes("_2") ||
                name.includes("_3"),
            );

            console.log("Has indexed variables:", hasIndexedVars);
            templateString = hasIndexedVars
              ? "batch_template_detected"
              : "individual_template";
          } catch (error) {
            console.warn("Could not extract variables from template:", error);
            templateString = templateData;
          }
        } else {
          templateString = templateData;
        }
      }

      const isBatchTemplate =
        templateString.includes("{nama_1}") ||
        templateString.includes("{nip_1}") ||
        templateString.includes("batch_template_detected") ||
        templateString.includes("{jabatan_1}") ||
        templateString.includes("{unit_kerja_1}") ||
        (mode === "batch" && selectedEmployees.length > 1); // fallback: paksa batch jika mode batch dan >1 pegawai

      console.log("Is batch template (with fallback):", isBatchTemplate);

      if (isBatchTemplate) {
        // Template is designed for batch - generate single document with all employees
        toast({
          title: "Membuat surat batch",
          description: `Menggabungkan ${selectedEmployees.length} pegawai dalam satu surat...`,
          variant: "default",
        });

        try {
          // Determine maxSlots dynamically from template variables (fallback to 45)
          let detectedMaxSlots = 45;
          try {
            const variables = await extractDocxVariables(templateData);
            const variableNames = variables.map((v) => v.name);
            const indices = variableNames
              .map((name) => {
                const m = name.match(/_(\d+)$/);
                return m ? parseInt(m[1], 10) : null;
              })
              .filter((n) => Number.isInteger(n));
            if (indices.length > 0) {
              detectedMaxSlots = Math.max(...indices);
            }
            console.log("Detected maxSlots from template:", detectedMaxSlots);
          } catch (e) {
            console.warn("Could not detect maxSlots from template, using fallback 45:", e);
          }

          const batchData = await generateBatchTemplateData(
            selectedEmployees,
            detectedMaxSlots,
          );
          console.log("Generated batch data:", batchData);
          console.log("Number of employees:", selectedEmployees.length);
          console.log("Batch data keys:", Object.keys(batchData));
          // Tambahkan log untuk setiap variabel batch 1-5
          for (let i = 1; i <= 5; i++) {
            console.log(`batchData[nama_${i}]:`, batchData[`nama_${i}`]);
            console.log(`batchData[nip_${i}]:`, batchData[`nip_${i}`]);
          }

          const docxBlob = await processDocxTemplate(templateData, batchData);

          const timestamp = new Date().toISOString().split("T")[0];
          const fileName = `surat-batch-${selectedEmployees.length}-pegawai-${timestamp}.docx`;

          saveAs(docxBlob, fileName);

          toast({
            title: "Surat batch berhasil dibuat",
            description: `Satu surat dengan ${selectedEmployees.length} pegawai telah diunduh`,
            variant: "default",
          });
          successCount = 1;
        } catch (error) {
          console.error("Error creating batch document:", error);
          toast({
            title: "Gagal membuat surat batch",
            description: error.message,
            variant: "destructive",
          });
          errorCount = 1;
          errors.push({ error: error.message });
        }
      } else {
        // Template is for individual - generate separate document for each employee
        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        toast({
          title: "Memulai pembuatan batch individu",
          description: `Memproses ${selectedEmployees.length} surat terpisah...`,
          variant: "default",
        });

        // Process each employee
        for (let i = 0; i < selectedEmployees.length; i++) {
          const employee = selectedEmployees[i];
          try {
            console.log(
              `Processing employee ${i + 1}/${selectedEmployees.length}:`,
              employee,
            );

            // Get letter data for this employee
            const letterData = await getLetterData(employee);
            console.log("Letter data for individual:", letterData);

            // Generate DOCX for this employee
            const docxBlob = await processDocxTemplate(
              templateData,
              letterData,
            );

            // Create filename with employee info and timestamp
            const timestamp = new Date().toISOString().split("T")[0];
            const employeeName =
              letterData.nama?.replace(/[^a-zA-Z0-9]/g, "_") || "pegawai";
            const fileName = `surat-${employeeName}-${timestamp}-${i + 1}.docx`;

            // Save the file
            saveAs(docxBlob, fileName);
            successCount++;

            // Small delay to prevent overwhelming the browser
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch (error) {
            console.error(`Error processing employee ${i + 1}:`, error);
            errorCount++;
            errors.push({
              employee:
                employee.employees?.name || employee.nama || `Pegawai ${i + 1}`,
              error: error.message,
            });
          }
        }

        toast({
          title: "Batch individu selesai",
          description: `Berhasil: ${successCount} surat${errorCount > 0 ? `, Gagal: ${errorCount} surat` : ""}`,
          variant: successCount > 0 ? "default" : "destructive",
        });

        if (errors.length > 0) {
          console.error("Batch errors:", errors);
          // Could show detailed error dialog here if needed
        }
      }

      // Show completion summary
      if (successCount > 0) {
        toast({
          title: "Batch selesai",
          description: `Berhasil: ${successCount} surat${errorCount > 0 ? `, Gagal: ${errorCount} surat` : ""}`,
          variant:
            successCount === selectedEmployees.length
              ? "default"
              : "destructive",
        });
      }

      if (errors.length > 0) {
        console.error("Batch errors:", errors);
        // Could show detailed error dialog here if needed
      }
    } catch (error) {
      console.error("Error in batch generation:", error);
      toast({
        title: "Gagal memproses batch",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      className="container mx-auto p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Buat Surat DOCX</h1>
          <div className="flex items-center gap-4 mt-1">
            <div
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${holidays.size > 0 ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}
            >
              ðŸ“… Hari Libur:{" "}
              {holidays.size > 0
                ? `${holidays.size} hari dimuat`
                : "Belum dimuat"}
            </div>
            {(() => {
              const currentUser = AuthManager.getUserSession();
              if (currentUser?.role === "admin_pusat") {
                return (
                  <div className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-400">
                    <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                    Template Global
                  </div>
                );
              } else if (currentUser?.role === "admin_unit") {
                return (
                  <div className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-400">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    Template Unit: {currentUser.department || "Unit Anda"}
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Configuration */}
        <div className="lg:col-span-1 space-y-6">
          {/* Template Selection */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Template</CardTitle>
            </CardHeader>
            <CardContent>{renderTemplateSelection()}</CardContent>
          </Card>

          {/* Mode Selection */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Mode Pembuatan</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={mode} onValueChange={setMode}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="individu">Individu</TabsTrigger>
                  <TabsTrigger value="batch">Batch</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardContent>
          </Card>

          {/* Data Selection */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center justify-between">
                Data Cuti
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTempSelectedEmployees([...selectedEmployees]);
                      setIsEmployeeDialogOpen(true);
                    }}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Pilih Data
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedEmployees([])}
                    disabled={selectedEmployees.length === 0}
                  >
                    Reset
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedEmployees.length > 0 ? (
                <div className="space-y-2">
                  {selectedEmployees.map((employee, index) => (
                    <div
                      key={employee.id || index}
                      className="p-3 bg-slate-700 rounded-lg"
                    >
                      <h4 className="font-medium text-white">
                        {employee.employees?.name ||
                          employee.nama_pegawai ||
                          employee.nama ||
                          "Nama tidak tersedia"}
                      </h4>
                      <p className="text-sm text-slate-400">
                        NIP:{" "}
                        {employee.employees?.nip ||
                          employee.nip ||
                          "Tidak tersedia"}
                      </p>
                      {employee.leave_types?.name && (
                        <p className="text-sm text-slate-400">
                          Jenis Cuti: {employee.leave_types.name}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-sm">
                  Belum ada data yang dipilih
                </p>
              )}
            </CardContent>
          </Card>

          {/* Signatory Information (Auto-filled) - Only show for individual mode */}
          {mode === "individu" && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">
                  Penandatangan (Otomatis)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedEmployees.length > 0 && autoFillData.nama_atasan ? (
                  <div className="p-3 bg-slate-700 rounded-lg border border-green-600">
                    <div className="flex items-center mb-2">
                      <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                      <span className="text-xs text-green-400">
                        Otomatis dari "Penandatangan Surat Cuti"
                      </span>
                    </div>
                    <h4 className="font-medium text-white">
                      {autoFillData.nama_atasan}
                    </h4>
                    <p className="text-sm text-slate-400">
                      NIP: {autoFillData.nip_atasan || "Mencari..."}
                    </p>
                    <p className="text-sm text-slate-400">
                      {autoFillData.jabatan_atasan || "Mencari..."}
                    </p>
                  </div>
                ) : (
                  <p className="text-slate-400 text-sm">
                    Data akan terisi otomatis setelah memilih pegawai
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Batch Mode Information */}
          {mode === "batch" && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">
                  Info Template Batch
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="p-3 bg-orange-900/30 border border-orange-700/50 rounded-lg">
                    <div className="flex items-start space-x-2">
                      <AlertCircle className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-orange-300">
                        <p className="font-medium mb-1">Template Batch:</p>
                        <p>
                          Template harus menggunakan variabel berindeks seperti{" "}
                          {"{"}nama_1{"}"}, {"{"}nip_1{"}"}, {"{"}jabatan_1{"}"}{" "}
                          untuk pegawai pertama, {"{"}nama_2{"}"}, {"{"}nip_2
                          {"}"} untuk pegawai kedua, dan seterusnya.
                        </p>
                      </div>
                    </div>
                  </div>

                  {selectedEmployees.length > 0 && (
                    <div className="p-3 bg-green-900/30 border border-green-700/50 rounded-lg">
                      <div className="flex items-center mb-2">
                        <CheckCircle className="w-4 h-4 text-green-400 mr-2" />
                        <span className="text-sm font-medium text-green-300">
                          {selectedEmployees.length} pegawai siap diproses
                        </span>
                      </div>
                      <p className="text-xs text-green-200">
                        Data akan diisi ke variabel {"{"}nama_1{"}"}...{"{"}
                        nama_{selectedEmployees.length}
                        {"}"}, {"{"}nip_1{"}"}...{"{"}nip_
                        {selectedEmployees.length}
                        {"}"}, dll.
                      </p>
                    </div>
                  )}

                  <div className="p-3 bg-purple-900/30 border border-purple-700/50 rounded-lg">
                    <div className="flex items-start space-x-2">
                      <div className="text-sm text-purple-300">
                        <p className="font-medium mb-1">âœ“ Support Variabel Berjenjang</p>
                        <p className="text-xs text-purple-200">
                          Sistem juga mendukung template batch dengan variabel flat ({"{"}nama{"}"}).
                          Atau gunakan format berjenjang ({"{"}nama_1{"}"}, {"{"}nama_2{"}"}...) untuk hasil maksimal.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Individual Mode Information */}
          {mode === "individu" && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">
                  Info Template Individu
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg">
                    <div className="text-sm text-blue-300">
                      <p className="font-medium mb-1">âœ“ Mendukung Dua Format Variabel</p>
                      <p className="text-xs text-blue-200 mb-2">
                        Template individu Anda dapat menggunakan:
                      </p>
                      <ul className="space-y-1 text-xs text-blue-200">
                        <li>â€¢ <strong>Flat:</strong> {"{"}nama{"}"}, {"{"}nip{"}"}, {"{"}jabatan{"}"}</li>
                        <li>â€¢ <strong>Berjenjang:</strong> {"{"}nama_1{"}"}, {"{"}nip_1{"}"}, {"{"}jabatan_1{"}"}</li>
                      </ul>
                      <p className="text-xs text-blue-200 mt-2">
                        Sistem secara otomatis akan mengisi kedua format untuk kompatibilitas maksimal.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Panel - Form */}
        <div className="lg:col-span-2">
          <Card className="bg-slate-800 border-slate-700 h-full">
            <CardHeader>
              <CardTitle className="text-white">Form Surat</CardTitle>
            </CardHeader>
            <CardContent className="h-full">
              {selectedTemplate ? (
                mode === "batch" ? (
                  // Batch Mode - Show batch information and direct generation
                  <div className="flex flex-col h-full">
                    <div className="mb-6">
                      <h3 className="text-lg font-semibold text-white mb-2">
                        Mode Batch - Template Gabungan
                      </h3>
                      <p className="text-slate-400 text-sm mb-4">
                        Template ini akan menggabungkan data dari{" "}
                        {selectedEmployees.length} pegawai ke dalam satu
                        dokumen.
                      </p>

                      {selectedEmployees.length > 0 && (
                        <div className="bg-slate-700/50 rounded-lg p-4 mb-4">
                          <h4 className="text-white font-medium mb-3">
                            Data Pegawai yang Akan Digabung:
                          </h4>
                          <div className="space-y-2 max-h-40 overflow-y-auto">
                            {selectedEmployees.map((employee, index) => (
                              <div
                                key={employee.id || index}
                                className="flex items-center justify-between p-2 bg-slate-600/50 rounded text-sm"
                              >
                                <div>
                                  <span className="text-white font-medium">
                                    {index + 1}.{" "}
                                    {employee.employees?.name ||
                                      employee.nama ||
                                      "Nama tidak tersedia"}
                                  </span>
                                  <span className="text-slate-300 ml-2">
                                    (
                                    {employee.employees?.nip ||
                                      employee.nip ||
                                      "NIP tidak tersedia"}
                                    )
                                  </span>
                                </div>
                                <span className="text-slate-400 text-xs">
                                  {employee.leave_types?.name ||
                                    employee.jenis_cuti ||
                                    "Cuti"}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-4">
                        <div className="flex items-start space-x-2">
                          <AlertCircle className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                          <div className="text-sm text-blue-300">
                            <p className="font-medium mb-1">
                              Informasi Template Batch:
                            </p>
                            <ul className="space-y-1 text-blue-200">
                              <li>
                                â€¢ Template harus menggunakan variabel berindeks
                                seperti {"{"}nama_1{"}"}, {"{"}nama_2{"}"}, dst.
                              </li>
                              <li>
                                â€¢ Sistem akan mengisi data pegawai sesuai urutan
                                yang dipilih
                              </li>
                              <li>
                                â€¢ Maksimal 45 pegawai dapat digabung dalam satu
                                template (atau sesuai jumlah variabel di template)
                              </li>
                              <li>
                                â€¢ Variabel kosong akan dibiarkan kosong jika
                                pegawai kurang dari jumlah slot template
                              </li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 flex items-end">
                      <Button
                        onClick={handleBatchGenerate}
                        disabled={isLoading || selectedEmployees.length === 0}
                        className="w-full bg-blue-600 hover:bg-blue-700"
                        size="lg"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Memproses Template Batch...
                          </>
                        ) : (
                          <>
                            <Download className="w-4 h-4 mr-2" />
                            Buat Surat Batch ({selectedEmployees.length}{" "}
                            Pegawai)
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  // Individual Mode - Show form filler
                  <DocxFormFiller
                    templateData={
                      selectedTemplate.content?.data ||
                      selectedTemplate.content ||
                      selectedTemplate.template_data
                    }
                    formData={formData}
                    onFormDataChange={handleFormDataChange}
                    onGenerate={handleGenerate}
                    fileName={`surat-${selectedTemplate.name}-${new Date().toISOString().split("T")[0]
                      }.docx`}
                    autoFillData={autoFillData}
                  />
                )
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <FileDocxIcon className="w-16 h-16 text-slate-400 mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">
                    Pilih Template DOCX
                  </h3>
                  <p className="text-slate-400 max-w-md">
                    Pilih template DOCX dari panel sebelah kiri untuk mulai
                    membuat surat keterangan
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Employee/Leave Request Selection Dialog */}
      <Dialog
        open={isEmployeeDialogOpen}
        onOpenChange={setIsEmployeeDialogOpen}
      >
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Pilih Data Cuti</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col h-full">
            {/* Search */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Cari berdasarkan nama atau NIP..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Data Cuti Content */}
            <div className="flex-1 overflow-auto">
              {isLoadingLeaveRequests ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  <span>Memuat data cuti...</span>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-auto">
                  {filteredLeaveRequests.map((request) => (
                    <div
                      key={request.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${isLeaveRequestSelected(request)
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-300 hover:border-slate-400"
                        }`}
                      onClick={() => toggleLeaveRequestSelection(request)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium">
                            {request.employees?.name || "Nama tidak tersedia"}
                          </h4>
                          <p className="text-sm text-slate-600">
                            NIP: {request.employees?.nip || "Tidak tersedia"}
                          </p>
                          <p className="text-sm text-slate-600">
                            Jenis:{" "}
                            {request.leave_types?.name || "Tidak tersedia"}
                          </p>
                          <p className="text-sm text-slate-600">
                            Periode:{" "}
                            {formatDateRange(
                              request.start_date,
                              request.end_date,
                            )}
                          </p>
                        </div>
                        {isLeaveRequestSelected(request) && (
                          <CheckCircle className="w-5 h-5 text-blue-500" />
                        )}
                      </div>
                    </div>
                  ))}
                  {filteredLeaveRequests.length === 0 && (
                    <p className="text-center text-slate-500 py-8">
                      Tidak ada data cuti yang ditemukan
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeLeaveRequestDialog}>
              Batal
            </Button>
            <Button
              onClick={saveSelectedLeaveRequests}
              disabled={tempSelectedEmployees.length === 0}
            >
              Pilih ({tempSelectedEmployees.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

export default DocxSuratKeterangan;
