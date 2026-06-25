import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Settings as SettingsIcon,
  Users,
  Calendar,
  Database,
  Upload,
  Download,
  Save,
  RefreshCw,
  Shield,
  Bell,
  Globe,
  Palette,
  Calendar as CalendarIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { withErrorHandling, formatErrorMessage } from "@/utils/errorHandler";
import { readExcelFile, createExcelTemplate, exportToExcel, validateExcelFile } from '@/utils/excelUtils';
import { format } from "date-fns";
import idLocale from "date-fns/locale/id";
import { Calendar as DayPicker } from "@/components/ui/calendar";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

const Settings = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState({
    annualLeave: 12,
    sickLeave: 12,
    importantLeave: 30,
    bigLeave: 60,
    maternityLeave: 90,
    deferralEnabled: true,
    deferralMonth: 12,
    autoApproval: false,
    emailNotifications: true,
    systemLanguage: "id",
    dateFormat: "dd/mm/yyyy",
    timezone: "Asia/Jakarta",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState({
    totalEmployees: 0,
    leaveTypes: 5,
    databaseStatus: "Aktif",
    lastBackup: "Hari ini",
  });

  // Load settings from localStorage on component mount
  useEffect(() => {
    const loadSettings = () => {
      const savedSettings = localStorage.getItem("appSettings");
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          setSettings((prev) => ({ ...prev, ...parsed }));
        } catch (error) {
          console.error("Error loading settings:", error);
        }
      }
    };

    const loadStats = withErrorHandling(async () => {
      try {
        // Get total employees count
        const { count: employeeCount, error: employeeError } = await supabase
          .from("employees")
          .select("id", { count: "exact", head: true });

        if (employeeError) throw employeeError;

        setStats((prev) => ({
          ...prev,
          totalEmployees: employeeCount || 0,
        }));
      } catch (error) {
        console.error("Error loading stats:", error);
      }
    });

    loadSettings();
    loadStats();
  }, []);

  const handleSaveSettings = withErrorHandling(async () => {
    setIsLoading(true);
    try {
      // Save settings to localStorage
      localStorage.setItem("appSettings", JSON.stringify(settings));

      toast({
        title: "âœ… Pengaturan Disimpan",
        description: "Pengaturan sistem berhasil disimpan dan akan diterapkan.",
      });
    } catch (error) {
      const errorInfo = formatErrorMessage(error);
      toast({
        variant: "destructive",
        title: errorInfo.title,
        description: errorInfo.description,
      });
    } finally {
      setIsLoading(false);
    }
  });

  const handleResetSettings = () => {
    const defaultSettings = {
      annualLeave: 12,
      sickLeave: 12,
      importantLeave: 30,
      bigLeave: 60,
      maternityLeave: 90,
      deferralEnabled: true,
      deferralMonth: 12,
      autoApproval: false,
      emailNotifications: true,
      systemLanguage: "id",
      dateFormat: "dd/mm/yyyy",
      timezone: "Asia/Jakarta",
    };

    setSettings(defaultSettings);
    localStorage.removeItem("appSettings");

    toast({
      title: "ðŸ”„ Pengaturan Direset",
      description: "Semua pengaturan telah dikembalikan ke nilai default.",
    });
  };

  const handleDownloadTemplate = async () => {
    const templateData = [
      {
        NIP: "123456789012345678",
        Nama: "Contoh Nama",
        Jabatan: "Contoh Jabatan",
        "Unit Penempatan": "Contoh Unit",
        "Status ASN": "PNS",
        Golongan: "III/a",
        "Jenis Jabatan": "Fungsional",
      },
    ];

    try {
      await createExcelTemplate(templateData, "Template_Data_Pegawai.xlsx", "Template Data Pegawai");
      
      toast({
        title: "ðŸ“¥ Template Berhasil Diunduh",
        description:
          "File template Excel telah diunduh. Silakan isi data sesuai format yang disediakan.",
      });
    } catch (error) {
      toast({
        title: "Gagal Mengunduh Template",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleExportEmployees = withErrorHandling(async () => {
    setIsLoading(true);
    try {
      // Fetch all employees using pagination to bypass 1000 record limit
      let allEmployees = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: employees, error } = await supabase
          .from("employees")
          .select(
            "nip, name, position_name, department, asn_status, rank_group, position_type",
          )
          .order("name")
          .range(from, from + batchSize - 1);

        if (error) throw error;

        if (employees && employees.length > 0) {
          allEmployees = [...allEmployees, ...employees];
          hasMore = employees.length === batchSize;
          from += batchSize;
        } else {
          hasMore = false;
        }
      }

      if (allEmployees.length === 0) {
        toast({
          title: "âš ï¸ Tidak Ada Data",
          description: "Tidak ada data pegawai untuk diekspor.",
        });
        return;
      }

      // Format data for export
      const exportData = allEmployees.map((emp) => ({
        NIP: emp.nip || "",
        Nama: emp.name || "",
        Jabatan: emp.position_name || "",
        "Unit Penempatan": emp.department || "",
        "Status ASN": emp.asn_status || "",
        Golongan: emp.rank_group || "",
        "Jenis Jabatan": emp.position_type || "",
      }));

      const fileName = `Data_Pegawai_${new Date().toISOString().split("T")[0]}.xlsx`;
      await exportToExcel(exportData, fileName, "Data Pegawai");

      toast({
        title: "ðŸ“¤ Export Berhasil",
        description: `Data ${allEmployees.length} pegawai berhasil diekspor ke file ${fileName}.`,
      });
    } catch (error) {
      const errorInfo = formatErrorMessage(error);
      toast({
        variant: "destructive",
        title: errorInfo.title,
        description: errorInfo.description,
      });
    } finally {
      setIsLoading(false);
    }
  });

  const handleExportLeaveHistory = withErrorHandling(async () => {
    setIsLoading(true);
    try {
      // Fetch all leave history using pagination to bypass 1000 record limit
      let allLeaveHistory = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: leaveHistory, error } = await supabase
          .from("leave_history")
          .select(
            `
            id,
            employee_id,
            leave_type,
            start_date,
            end_date,
            days_taken,
            description,
            leave_date,
            status,
            leave_year,
            created_at,
            updated_at,
            employees(
              nip,
              name,
              department
            )
          `,
          )
          .order("created_at", { ascending: false })
          .range(from, from + batchSize - 1);

        if (error) {
          console.error("Error fetching leave history:", error);
          throw error;
        }

        if (leaveHistory && leaveHistory.length > 0) {
          allLeaveHistory = [...allLeaveHistory, ...leaveHistory];
          hasMore = leaveHistory.length === batchSize;
          from += batchSize;
        } else {
          hasMore = false;
        }
      }

      if (allLeaveHistory.length === 0) {
        toast({
          title: "âš ï¸ Tidak Ada Data",
          description: "Tidak ada riwayat cuti untuk diekspor.",
        });
        return;
      }

      // Format data for export
      const exportData = allLeaveHistory.map((leave) => ({
        NIP: leave.employees?.nip || "",
        Nama: leave.employees?.name || "",
        "Unit Penempatan": leave.employees?.department || "",
        "Jenis Cuti": leave.leave_type || "",
        "Tanggal Mulai": leave.start_date || "",
        "Tanggal Selesai": leave.end_date || "",
        "Jumlah Hari": leave.days_taken || 0,
        Keterangan: leave.description || "",
        "Tanggal Input":
          leave.leave_date || leave.created_at?.split("T")[0] || "",
        Status: leave.status || "",
        "Tahun Cuti": leave.leave_year || "",
        "Tanggal Dibuat": leave.created_at?.split("T")[0] || "",
        "Terakhir Update": leave.updated_at?.split("T")[0] || "",
      }));

      const fileName = `Riwayat_Cuti_${new Date().toISOString().split("T")[0]}.xlsx`;
      await exportToExcel(exportData, fileName, "Riwayat Cuti");

      toast({
        title: "ðŸ“¤ Export Berhasil",
        description: `Data ${allLeaveHistory.length} riwayat cuti berhasil diekspor ke file ${fileName}.`,
      });
    } catch (error) {
      console.error("Export leave history error:", error);
      const errorInfo = formatErrorMessage(error);
      toast({
        variant: "destructive",
        title: errorInfo.title,
        description: errorInfo.description,
      });
    } finally {
      setIsLoading(false);
    }
  });

  const handleBackupDatabase = withErrorHandling(async () => {
    setIsLoading(true);
    try {
      // Get all table data for backup
      const tables = ["employees", "leave_history", "leave_requests"];
      const backupData = {};

      for (const table of tables) {
        try {
          let allData = [];
          let from = 0;
          const batchSize = 1000;
          let hasMore = true;

          while (hasMore) {
            const { data, error } = await supabase
              .from(table)
              .select("*")
              .order("created_at", { ascending: false })
              .range(from, from + batchSize - 1);

            if (error) {
              console.error(`Error fetching ${table}:`, error);
              // Continue with other tables even if one fails
              break;
            }

            if (data && data.length > 0) {
              allData = [...allData, ...data];
              hasMore = data.length === batchSize;
              from += batchSize;
            } else {
              hasMore = false;
            }
          }

          backupData[table] = allData;
          console.log(`Fetched ${allData.length} records from ${table}`);
        } catch (tableError) {
          console.error(`Error processing table ${table}:`, tableError);
          backupData[table] = [];
        }
      }

      // Create Excel workbook with multiple sheets using ExcelJS
      const workbook = new ExcelJS.Workbook();

      // Add employees sheet
      if (backupData.employees && backupData.employees.length > 0) {
        const employeesData = backupData.employees.map((emp) => ({
          ID: emp.id || "",
          NIP: emp.nip || "",
          Nama: emp.name || "",
          Jabatan: emp.position_name || "",
          "Unit Penempatan": emp.department || "",
          "Status ASN": emp.asn_status || "",
          Golongan: emp.rank_group || "",
          "Jenis Jabatan": emp.position_type || "",
          "Tanggal Dibuat": emp.created_at || "",
          "Terakhir Update": emp.updated_at || "",
        }));
        const worksheet = workbook.addWorksheet("Data Pegawai");
        worksheet.addRow(Object.keys(employeesData[0]));
        employeesData.forEach(row => worksheet.addRow(Object.values(row)));
      } else {
        const worksheet = workbook.addWorksheet("Data Pegawai");
        worksheet.addRow(["Info"]);
        worksheet.addRow(["Tidak ada data pegawai"]);
      }

      // Add leave history sheet
      if (backupData.leave_history && backupData.leave_history.length > 0) {
        const leaveHistoryData = backupData.leave_history.map((leave) => ({
          ID: leave.id || "",
          "Employee ID": leave.employee_id || "",
          "Jenis Cuti": leave.leave_type || "",
          "Tanggal Mulai": leave.start_date || "",
          "Tanggal Selesai": leave.end_date || "",
          "Jumlah Hari": leave.days_taken || 0,
          Keterangan: leave.description || "",
          "Tanggal Input": leave.leave_date || "",
          Status: leave.status || "",
          "Tahun Cuti": leave.leave_year || "",
          "Tanggal Dibuat": leave.created_at || "",
          "Terakhir Update": leave.updated_at || "",
        }));
        const worksheet = workbook.addWorksheet("Riwayat Cuti");
        worksheet.addRow(Object.keys(leaveHistoryData[0]));
        leaveHistoryData.forEach(row => worksheet.addRow(Object.values(row)));
      } else {
        const worksheet = workbook.addWorksheet("Riwayat Cuti");
        worksheet.addRow(["Info"]);
        worksheet.addRow(["Tidak ada riwayat cuti"]);
      }

      // Add leave requests sheet
      if (backupData.leave_requests && backupData.leave_requests.length > 0) {
        const leaveRequestsData = backupData.leave_requests.map((req) => ({
          ID: req.id || "",
          "Employee ID": req.employee_id || "",
          "Jenis Cuti": req.leave_type || "",
          "Tanggal Mulai": req.start_date || "",
          "Tanggal Selesai": req.end_date || "",
          "Jumlah Hari": req.days_requested || 0,
          Alasan: req.reason || "",
          Status: req.status || "",
          "Tanggal Pengajuan": req.request_date || "",
          "Tanggal Dibuat": req.created_at || "",
          "Terakhir Update": req.updated_at || "",
        }));
        const worksheet = workbook.addWorksheet("Pengajuan Cuti");
        worksheet.addRow(Object.keys(leaveRequestsData[0]));
        leaveRequestsData.forEach(row => worksheet.addRow(Object.values(row)));
      } else {
        const worksheet = workbook.addWorksheet("Pengajuan Cuti");
        worksheet.addRow(["Info"]);
        worksheet.addRow(["Tidak ada pengajuan cuti"]);
      }

      // Add backup info sheet
      const backupInfo = [
        {
          "Tanggal Backup": new Date().toLocaleString("id-ID"),
          "Total Pegawai": backupData.employees?.length || 0,
          "Total Riwayat Cuti": backupData.leave_history?.length || 0,
          "Total Pengajuan Cuti": backupData.leave_requests?.length || 0,
          "Versi Sistem": "SiCuti v1.0.0",
        },
      ];
      const worksheet = workbook.addWorksheet("Info Backup");
      worksheet.addRow(Object.keys(backupInfo[0]));
      backupInfo.forEach(row => worksheet.addRow(Object.values(row)));

      const fileName = `Backup_Database_${new Date().toISOString().split("T")[0]}_${new Date().toTimeString().split(" ")[0].replace(/:/g, "")}.xlsx`;
      
      // Generate and download file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      saveAs(blob, fileName);

      const totalRecords =
        (backupData.employees?.length || 0) +
        (backupData.leave_history?.length || 0) +
        (backupData.leave_requests?.length || 0);

      toast({
        title: "ðŸ’¾ Backup Berhasil",
        description: `Database berhasil dibackup dengan ${totalRecords} total record ke file ${fileName}.`,
      });
    } catch (error) {
      console.error("Backup database error:", error);
      const errorInfo = formatErrorMessage(error);
      toast({
        variant: "destructive",
        title: errorInfo.title,
        description: errorInfo.description,
      });
    } finally {
      setIsLoading(false);
    }
  });

  const handleImportEmployees = async () => {
    // Create file input element
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      setIsLoading(true);
      try {
        // Validate file using new utility
        validateExcelFile(file);

        // Read Excel file using new utility
        const jsonData = await readExcelFile(file);

        if (jsonData.length === 0) {
          toast({
            variant: "destructive",
            title: "âŒ File Kosong",
            description:
              "File Excel tidak berisi data atau format tidak sesuai.",
          });
          return;
        }

        toast({
          title: "ðŸ“¥ Import Berhasil",
          description: `Berhasil membaca ${jsonData.length} baris data. Fitur import otomatis akan segera tersedia.`,
        });
      } catch (error) {
        toast({
          variant: "destructive",
          title: "âŒ Error Import",
          description:
            "Gagal membaca file Excel. Pastikan format file sesuai template.",
        });
      } finally {
        setIsLoading(false);
      }
    };
    input.click();
  };

  function NationalHolidaysSection() {
    const { toast } = useToast();
    const currentYear = new Date().getFullYear();
    const [year, setYear] = React.useState(currentYear);
    const [holidays, setHolidays] = React.useState([]); // Array of YYYY-MM-DD
    const [loading, setLoading] = React.useState(false);
    const [month, setMonth] = React.useState(new Date(currentYear, 0, 1)); // State bulan pertama yang ditampilkan

    // Fetch holidays from DB
    const fetchHolidays = useCallback(async (y) => {
      setLoading(true);
      const { data, error } = await supabase
        .from("national_holidays")
        .select("date")
        .eq("year", y);
      if (error) {
        toast({ variant: "destructive", title: "Gagal memuat hari libur", description: error.message });
        setHolidays([]);
      } else {
        setHolidays((data || []).map((d) => d.date));
      }
      setLoading(false);
    }, [toast]);

    React.useEffect(() => {
      fetchHolidays(year);
      setMonth(new Date(year, 0, 1)); // Reset ke Januari saat tahun diganti
    }, [year, fetchHolidays]);

    // Navigasi custom: geser 4 bulan sekaligus
    const handlePrev = () => {
      setMonth((prev) => {
        const m = new Date(prev);
        m.setMonth(m.getMonth() - 4);
        if (m.getFullYear() < year) return new Date(year, 0, 1);
        return m;
      });
    };
    const handleNext = () => {
      setMonth((prev) => {
        const m = new Date(prev);
        m.setMonth(m.getMonth() + 4);
        if (m.getFullYear() > year) return new Date(year, 8, 1); // September (bulan ke-9, index 8)
        return m;
      });
    };

    // Helper: cek apakah tanggal adalah Sabtu/Minggu
    function isWeekend(date) {
      const day = date.getDay();
      return day === 0 || day === 6;
    }

    // Toggle holiday on calendar, abaikan jika Sabtu/Minggu
    const handleDayClick = async (date) => {
      if (isWeekend(date)) return; // Tidak bisa toggle Sabtu/Minggu
      const ymd = format(date, "yyyy-MM-dd");
      const isHoliday = holidays.includes(ymd);
      setLoading(true);
      if (isHoliday) {
        // Remove from DB
        const { error } = await supabase
          .from("national_holidays")
          .delete()
          .eq("date", ymd);
        if (error) {
          toast({ variant: "destructive", title: "Gagal menghapus hari libur", description: error.message });
        } else {
          setHolidays((prev) => prev.filter((d) => d !== ymd));
        }
      } else {
        // Add to DB
        const { error } = await supabase
          .from("national_holidays")
          .insert([{ date: ymd, name: "Libur Nasional" }]);
        if (error) {
          toast({ variant: "destructive", title: "Gagal menambah hari libur", description: error.message });
        } else {
          setHolidays((prev) => [...prev, ymd]);
        }
      }
      setLoading(false);
    };

    // Generate year options (5 years before and after current year)
    const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);

    return (
      <div>
        <h3 className="text-lg font-semibold mb-2">Daftar Hari Libur Nasional</h3>
        <p className="text-slate-400 mb-4 text-sm">Klik tanggal pada kalender untuk menandai/menghapus hari libur nasional. Data otomatis tersimpan ke database.</p>
        <div className="flex items-center mb-4 gap-2">
          <span className="text-slate-400">Tahun:</span>
          <select
            className="bg-slate-800 text-white rounded px-2 py-1 border border-slate-600 focus:outline-none"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {loading && <span className="ml-2 text-xs text-slate-400">Memuat...</span>}
        </div>
        <div className="overflow-x-auto pb-2">
          <div className="min-w-[1200px]">
            <DayPicker
              mode="multiple"
              selected={holidays.map((d) => new Date(d))}
              onDayClick={handleDayClick}
              month={new Date(year, 0, 1)}
              numberOfMonths={12}
              fromMonth={new Date(year, 0, 1)}
              toMonth={new Date(year, 11, 1)}
              locale={idLocale}
              modifiers={{
                holiday: (date) => holidays.includes(format(date, "yyyy-MM-dd")),
                weekend: (date) => isWeekend(date),
              }}
              modifiersClassNames={{
                holiday: "bg-red-500 text-white rounded-full",
                weekend: "bg-red-400 text-white rounded-full opacity-80 cursor-not-allowed",
              }}
              disabled={(date) => isWeekend(date)}
            />
          </div>
        </div>
      </div>
    );
  }

  const settingsSections = [
    {
      title: "Pengaturan Cuti",
      icon: Calendar,
      color: "from-blue-500 to-cyan-500",
      items: [
        { key: "annualLeave", label: "Cuti Tahunan (hari)", type: "number" },
        { key: "sickLeave", label: "Cuti Sakit (hari)", type: "number" },
        {
          key: "importantLeave",
          label: "Cuti Alasan Penting (hari)",
          type: "number",
        },
        { key: "bigLeave", label: "Cuti Besar (hari)", type: "number" },
        {
          key: "maternityLeave",
          label: "Cuti Melahirkan (hari)",
          type: "number",
        },
      ],
    },
    {
      title: "Pengaturan Penangguhan",
      icon: RefreshCw,
      color: "from-green-500 to-emerald-500",
      items: [
        {
          key: "deferralEnabled",
          label: "Aktifkan Penangguhan Cuti",
          type: "boolean",
        },
        {
          key: "deferralMonth",
          label: "Bulan Pengajuan Penangguhan",
          type: "select",
          options: [
            { value: 11, label: "November" },
            { value: 12, label: "Desember" },
          ],
        },
      ],
    },
    {
      title: "Pengaturan Sistem",
      icon: SettingsIcon,
      color: "from-purple-500 to-pink-500",
      items: [
        { key: "autoApproval", label: "Persetujuan Otomatis", type: "boolean" },
        {
          key: "emailNotifications",
          label: "Notifikasi Email",
          type: "boolean",
        },
        {
          key: "systemLanguage",
          label: "Bahasa Sistem",
          type: "select",
          options: [
            { value: "id", label: "Bahasa Indonesia" },
            { value: "en", label: "English" },
          ],
        },
        {
          key: "dateFormat",
          label: "Format Tanggal",
          type: "select",
          options: [
            { value: "dd/mm/yyyy", label: "DD/MM/YYYY" },
            { value: "mm/dd/yyyy", label: "MM/DD/YYYY" },
            { value: "yyyy-mm-dd", label: "YYYY-MM-DD" },
          ],
        },
        {
          key: "timezone",
          label: "Zona Waktu",
          type: "select",
          options: [
            { value: "Asia/Jakarta", label: "WIB (Asia/Jakarta)" },
            { value: "Asia/Makassar", label: "WITA (Asia/Makassar)" },
            { value: "Asia/Jayapura", label: "WIT (Asia/Jayapura)" },
          ],
        },
      ],
    },
    {
      title: "Hari Libur Nasional",
      icon: CalendarIcon,
      color: "from-red-500 to-orange-500",
      customComponent: <NationalHolidaysSection />,
      items: [],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Pengaturan Sistem
          </h1>
          <p className="text-slate-300">
            Konfigurasi sistem manajemen cuti pegawai
          </p>
        </div>
        <div className="flex space-x-2 mt-4 sm:mt-0">
          <Button
            onClick={handleResetSettings}
            variant="outline"
            className="border-slate-600 text-slate-300 hover:text-white"
            disabled={isLoading}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button
            onClick={handleSaveSettings}
            className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
            disabled={isLoading}
          >
            <Save className="w-4 h-4 mr-2" />
            {isLoading ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </motion.div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card className="bg-slate-800/50 backdrop-blur-xl border-slate-700/50 card-hover">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm font-medium">
                    Total Pegawai
                  </p>
                  <p className="text-2xl font-bold text-white mt-1">
                    {stats.totalEmployees.toLocaleString()}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center">
                  <Users className="w-6 h-6 text-white" />
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
          <Card className="bg-slate-800/50 backdrop-blur-xl border-slate-700/50 card-hover">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm font-medium">
                    Jenis Cuti
                  </p>
                  <p className="text-2xl font-bold text-white mt-1">
                    {stats.leaveTypes}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Card className="bg-slate-800/50 backdrop-blur-xl border-slate-700/50 card-hover">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm font-medium">Database</p>
                  <p className="text-2xl font-bold text-white mt-1">
                    {stats.databaseStatus}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                  <Database className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <Card className="bg-slate-800/50 backdrop-blur-xl border-slate-700/50 card-hover">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm font-medium">
                    Backup Terakhir
                  </p>
                  <p className="text-2xl font-bold text-white mt-1">
                    {stats.lastBackup}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 flex items-center justify-center">
                  <Shield className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Settings Sections */}
      <div className="space-y-6">
        {settingsSections.map((section, sectionIndex) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 + sectionIndex * 0.1 }}
          >
            <Card className="bg-slate-800/50 backdrop-blur-xl border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <div
                    className={`w-8 h-8 rounded-lg bg-gradient-to-r ${section.color} flex items-center justify-center mr-3`}
                  >
                    <section.icon className="w-5 h-5 text-white" />
                  </div>
                  {section.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {section.customComponent ? (
                  <div>{section.customComponent}</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {section.items.map((item) => (
                      <div key={item.key} className="space-y-2">
                        <Label htmlFor={item.key} className="text-slate-300">
                          {item.label}
                        </Label>

                        {item.type === "number" && (
                          <Input
                            id={item.key}
                            name={item.key}
                            type="number"
                            value={settings[item.key]}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                [item.key]: parseInt(e.target.value) || 0,
                              })
                            }
                            className="bg-slate-700/50 border-slate-600/50 text-white"
                            min="0"
                            max="365"
                          />
                        )}

                        {item.type === "boolean" && (
                          <div className="flex items-center space-x-2">
                            <input
                              id={item.key}
                              name={item.key}
                              type="checkbox"
                              checked={settings[item.key]}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  [item.key]: e.target.checked,
                                })
                              }
                              className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                            />
                            <span className="text-slate-400 text-sm">
                              {settings[item.key] ? "Aktif" : "Nonaktif"}
                            </span>
                          </div>
                        )}

                        {item.type === "select" && (
                          <Select
                            value={settings[item.key].toString()}
                            onValueChange={(value) => {
                              setSettings({
                                ...settings,
                                [item.key]: isNaN(value)
                                  ? value
                                  : parseInt(value),
                              });
                            }}
                          >
                            <SelectTrigger id={item.key} className="bg-slate-700/50 border-slate-600/50 text-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-700 border-slate-600">
                              {item.options.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value.toString()}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Data Management */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.8 }}
      >
        <Card className="bg-slate-800/50 backdrop-blur-xl border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-white flex items-center">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center mr-3">
                <Database className="w-5 h-5 text-white" />
              </div>
              Manajemen Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Import Section */}
              <div className="space-y-4">
                <h3 className="text-white font-semibold mb-4">Import Data</h3>
                <div className="space-y-3">
                  <Button
                    onClick={handleImportEmployees}
                    className="w-full justify-start bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
                    disabled={isLoading}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Import Data Pegawai (.xlsx)
                  </Button>

                  <Button
                    onClick={handleDownloadTemplate}
                    variant="outline"
                    className="w-full justify-start border-slate-600 text-slate-300 hover:text-white"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Template Excel
                  </Button>
                </div>
              </div>

              {/* Export Section */}
              <div className="space-y-4">
                <h3 className="text-white font-semibold mb-4">Export Data</h3>
                <div className="space-y-3">
                  <Button
                    onClick={handleExportEmployees}
                    variant="outline"
                    className="w-full justify-start border-slate-600 text-slate-300 hover:text-white"
                    disabled={isLoading}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export Data Pegawai
                  </Button>
                  <Button
                    onClick={handleExportLeaveHistory}
                    variant="outline"
                    className="w-full justify-start border-slate-600 text-slate-300 hover:text-white"
                    disabled={isLoading}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export Riwayat Cuti
                  </Button>
                  <Button
                    onClick={handleBackupDatabase}
                    variant="outline"
                    className="w-full justify-start border-slate-600 text-slate-300 hover:text-white"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Backup Database
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* System Information */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.9 }}
      >
        <Card className="bg-gradient-to-r from-slate-800/50 to-slate-700/50 backdrop-blur-xl border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-white flex items-center">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 flex items-center justify-center mr-3">
                <Globe className="w-5 h-5 text-white" />
              </div>
              Informasi Sistem
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-slate-400 text-sm">Versi Sistem</p>
                <p className="text-white font-semibold">SiCuti v1.0.0</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Database</p>
                <p className="text-white font-semibold">PostgreSQL 14.2</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Terakhir Update</p>
                <p className="text-white font-semibold">11 Januari 2024</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default Settings;
