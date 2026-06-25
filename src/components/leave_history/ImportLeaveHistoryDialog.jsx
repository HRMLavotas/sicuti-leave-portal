import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileSpreadsheet, Upload, Loader2, TestTube } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { readExcelFile, createExcelTemplate, validateExcelFile } from '@/utils/excelUtils';

const REQUIRED_LEAVE_HEADERS = [
  "Nama Pegawai",
  "NIP",
  "Jenis Cuti",
  "Tanggal Mulai",
  "Tanggal Selesai",
  "Jumlah Hari",
  "Tahun Kuota Cuti",
];

const ImportLeaveHistoryDialog = ({
  isOpen,
  onOpenChange,
  onImportSuccess,
}) => {
  const { toast } = useToast();
  const [excelFile, setExcelFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState("");

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setExcelFile(file);
      setFileName(file.name);
    }
  };

  const downloadTemplate = async () => {
    try {
      const exampleData = [
        [
          "Ahmad Wijaya",
          "198501012010011001",
          "Cuti Tahunan",
          "2025-01-15",
          "2025-01-20",
          "6",
          "2025",
        ],
        [
          "Siti Nurhaliza",
          "198703152012012002",
          "Cuti Sakit",
          "2025-01-10",
          "2025-01-12",
          "3",
          "2025",
        ],
        [
          "Budi Santoso",
          "NIPK202501001",
          "Cuti Alasan Penting",
          "2025-02-01",
          "2025-02-02",
          "2",
          "2025",
        ],
        [
          "Dewi Lestari",
          "NIPK202501002",
          "Cuti Tahunan",
          "2024-12-20",
          "2024-12-25",
          "6",
          "2024",
        ],
      ];
      
      const templateData = [REQUIRED_LEAVE_HEADERS, ...exampleData].map(row => {
        const obj = {};
        REQUIRED_LEAVE_HEADERS.forEach((header, index) => {
          obj[header] = row[index] || '';
        });
        return obj;
      });
      
      await createExcelTemplate(templateData, "Template_Import_Riwayat_Cuti.xlsx", "Template Riwayat Cuti");
      toast({
        title: "Template Diunduh",
        description: "Template Excel untuk import riwayat cuti berhasil diunduh.",
      });
    } catch (error) {
      toast({
        title: "Gagal Mengunduh Template",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleImportExcel = async () => {
    if (!excelFile) {
      toast({
        variant: "destructive",
        title: "File Excel Belum Dipilih",
        description: "Silakan pilih file Excel untuk diimport.",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Validate file using new utility
      validateExcelFile(excelFile);

      // Read Excel file using new utility
      const jsonData = await readExcelFile(excelFile);
      
      if (jsonData.length < 1) {
        throw new Error(
          "File Excel kosong atau tidak memiliki data. Pastikan file memiliki header dan minimal satu baris data.",
        );
      }

      const headers = Object.keys(jsonData[0]);

      console.log("Headers found:", headers);

      const missingHeaders = REQUIRED_LEAVE_HEADERS.filter(
        (eh) => !headers.includes(eh),
      );
      if (missingHeaders.length > 0) {
        throw new Error(
          `Header kolom tidak sesuai. Kolom yang hilang: ${missingHeaders.join(", ")}. Pastikan header sesuai template.`,
        );
      }

      // Get employees and leave types for validation
      const { data: employees, error: employeesError } = await supabase
        .from("employees")
        .select("id, name, nip");

      if (employeesError)
        throw new Error(
          `Gagal mengambil data pegawai: ${employeesError.message}`,
        );

      const { data: leaveTypes, error: leaveTypesError } = await supabase
        .from("leave_types")
        .select("id, name");

      if (leaveTypesError)
        throw new Error(
          `Gagal mengambil jenis cuti: ${leaveTypesError.message}`,
        );

      // Create lookup maps
      const employeeMap = new Map();
      employees.forEach((emp) => {
        employeeMap.set(emp.nip, emp);
        employeeMap.set(emp.name, emp);
      });

      const leaveTypeMap = new Map();
      leaveTypes.forEach((lt) => {
        leaveTypeMap.set(lt.name, lt);
      });

      const leaveRequestsToInsert = jsonData
        .map((row, rowIndex) => {
          const leave = {};
          headers.forEach((header) => {
            const value = row[header] ? row[header].toString().trim() : null;
            if (header === "Nama Pegawai") leave.employee_name = value;
            else if (header === "NIP") leave.nip = value;
            else if (header === "Jenis Cuti") leave.leave_type_name = value;
            else if (header === "Tanggal Mulai") leave.start_date = value;
            else if (header === "Tanggal Selesai") leave.end_date = value;
            else if (header === "Jumlah Hari")
              leave.days_requested = parseInt(value) || 0;
            else if (header === "Tahun Kuota Cuti")
              leave.leave_quota_year =
                parseInt(value) || new Date().getFullYear();
          });

          // Validate required fields
          if (!leave.employee_name && !leave.nip) {
            console.warn(
              `Baris ${rowIndex + 2} dilewati karena tidak ada identitas pegawai:`,
              leave,
            );
            return null;
          }

          if (
            !leave.leave_type_name ||
            !leave.start_date ||
            !leave.end_date ||
            !leave.days_requested
          ) {
            console.warn(
              `Baris ${rowIndex + 2} dilewati karena data tidak lengkap:`,
              leave,
            );
            return null;
          }

          // Find employee by NIP or name
          const employee =
            employeeMap.get(leave.nip) || employeeMap.get(leave.employee_name);
          if (!employee) {
            console.warn(
              `Baris ${rowIndex + 2} dilewati karena pegawai tidak ditemukan:`,
              leave,
            );
            return null;
          }

          // Find leave type
          const leaveType = leaveTypeMap.get(leave.leave_type_name);
          if (!leaveType) {
            console.warn(
              `Baris ${rowIndex + 2} dilewati karena jenis cuti tidak ditemukan:`,
              leave,
            );
            return null;
          }

          // Format dates
          let startDate, endDate;
          try {
            startDate = new Date(leave.start_date).toISOString().split("T")[0];
            endDate = new Date(leave.end_date).toISOString().split("T")[0];
          } catch (error) {
            console.warn(
              `Baris ${rowIndex + 2} dilewati karena format tanggal tidak valid:`,
              leave,
            );
            return null;
          }

          return {
            employee_id: employee.id,
            leave_type_id: leaveType.id,
            start_date: startDate,
            end_date: endDate,
            days_requested: leave.days_requested,
            leave_quota_year: leave.leave_quota_year,
            status: "approved", // Default status for imported historical data
            address_during_leave: "Imported from Excel",
            created_at: new Date().toISOString(),
          };
        })
        .filter((leave) => leave !== null);

      if (leaveRequestsToInsert.length === 0) {
        throw new Error(
          "Tidak ada data riwayat cuti valid untuk diimport. Pastikan data pegawai dan jenis cuti sudah ada di sistem.",
        );
      }

      console.log("Leave requests to insert:", leaveRequestsToInsert);

      const { error } = await supabase
        .from("leave_requests")
        .insert(leaveRequestsToInsert);

      if (error) {
        console.error("Supabase error:", error);
        throw new Error(`Database error: ${error.message}`);
      }

      toast({
        title: "Sukses Import Data",
        description: `${leaveRequestsToInsert.length} data riwayat cuti berhasil diimport.`,
      });
      onImportSuccess?.();
      onOpenChange(false);
      setExcelFile(null);
      setFileName("");
    } catch (error) {
      console.error("Error importing Excel:", error);
      toast({
        variant: "destructive",
        title: "Gagal Import Data",
        description: error.message || "Terjadi kesalahan saat mengimport data.",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!isUploading) {
          onOpenChange(open);
          if (!open) {
            setExcelFile(null);
            setFileName("");
          }
        }
      }}
    >
      <DialogContent className="bg-slate-800 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle>Import Riwayat Cuti dari Excel</DialogTitle>
          <DialogDescription>
            Pastikan file Excel Anda sesuai dengan template yang disediakan.
            Data pegawai dan jenis cuti harus sudah ada di sistem sebelum import
            riwayat cuti.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Button
            onClick={downloadTemplate}
            variant="outline"
            className="w-full border-slate-600 text-slate-300 hover:text-white"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Download Template
          </Button>

          <div className="flex items-center justify-center w-full">
            <label
              htmlFor="excel-file-leave-history-import"
              className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-600 border-dashed rounded-lg cursor-pointer bg-slate-700/50 hover:bg-slate-700"
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-8 h-8 mb-4 text-slate-400" />
                <p className="mb-2 text-sm text-slate-400">
                  <span className="font-semibold">Klik untuk unggah</span> atau
                  seret file
                </p>
                <p className="text-xs text-slate-500">XLSX, XLS (MAKS. 5MB)</p>
              </div>
              <Input
                id="excel-file-leave-history-import"
                name="excel-file-leave-history-import"
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>
          {fileName && (
            <p className="text-sm text-center text-slate-300">
              File terpilih: {fileName}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              if (!isUploading) {
                onOpenChange(false);
                setExcelFile(null);
                setFileName("");
              }
            }}
            className="text-slate-300 hover:text-white"
            disabled={isUploading}
          >
            Batal
          </Button>
          <Button
            onClick={handleImportExcel}
            disabled={isUploading || !excelFile}
            className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
          >
            {isUploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {isUploading ? "Mengunggah..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportLeaveHistoryDialog;
