import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabaseClient";
import {
  Edit,
  Trash2,
  Download,
  Calendar,
  Tag,
  FileText,
  Loader2,
  XCircle,
} from "lucide-react";
import LeaveRequestForm from '@/components/leave_requests/LeaveRequestForm';

const EmployeeLeaveHistoryModal = ({
  isOpen,
  onOpenChange,
  employee,
  year,
  onDataChange,
  readOnly = false,
}) => {
  const { toast } = useToast();
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!employee?.id) return;
    setIsLoading(true);
    try {
      console.log(`Fetching leave history for employee ID: ${employee.id} year: ${year}`);

      let query = supabase
        .from("leave_requests")
        .select(`
          *,
          leave_types ( name )
        `)
        .eq("employee_id", employee.id)
        .order("start_date", { ascending: false });

      // Apply year filter if year is provided
      if (year) {
        const startOfYear = `${year}-01-01`;
        const endOfYear = `${year}-12-31`;
        query = query.gte('start_date', startOfYear).lte('start_date', endOfYear);
      }

      const { data, error } = await query;

      if (error) throw error;
      console.log(
        `Found ${data?.length || 0} leave records for employee ${employee.id} in ${year}`,
      );
      setHistory(data || []);
    } catch (error) {
      console.error("Error fetching leave history:", error);
      toast({
        variant: "destructive",
        title: "Gagal memuat riwayat cuti",
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [employee?.id, year, toast]);

  useEffect(() => {
    if (isOpen && employee?.id) {
      fetchHistory();
    } else if (!isOpen) {
      setHistory([]);
    }
  }, [isOpen, employee?.id, fetchHistory]);

  const handleAction = (action, recordId) => {
    if (action === 'Edit') {
      const record = history.find((h) => h.id === recordId);
      if (record) {
        setEditingRecord(record);
        setIsEditDialogOpen(true);
      }
      return;
    }
    toast({
      title: `🚀 Aksi: ${action}`,
      description: `Fungsi untuk ${action.toLowerCase()} data cuti ID ${recordId} belum diimplementasikan. Silakan minta di prompt berikutnya!`,
    });
  };

  const handleDelete = async (recordId) => {
    if (
      !window.confirm(
        "Apakah Anda yakin ingin menghapus data cuti ini? Saldo cuti akan disesuaikan.",
      )
    ) {
      return;
    }
    setIsLoading(true);
    try {
      const recordToDelete = history.find((h) => h.id === recordId);
      if (!recordToDelete)
        throw new Error("Data cuti tidak ditemukan untuk dihapus.");

      const { error } = await supabase
        .from("leave_requests")
        .delete()
        .eq("id", recordId);
      if (error) throw error;

      const requestPeriodYear =
        parseInt(recordToDelete.leave_period) ||
        new Date(recordToDelete.start_date).getFullYear();

      const { error: rpcError } = await supabase.rpc(
        "update_leave_balance_with_splitting",
        {
          p_employee_id: recordToDelete.employee_id,
          p_leave_type_id: recordToDelete.leave_type_id,
          p_requested_year: requestPeriodYear,
          p_days: -recordToDelete.days_requested,
        },
      );

      if (rpcError) {
        console.error(
          "Gagal menyesuaikan saldo cuti setelah penghapusan:",
          rpcError,
        );
        toast({
          variant: "destructive",
          title: "Peringatan",
          description:
            "Data cuti dihapus, namun gagal menyesuaikan saldo cuti secara otomatis. Harap periksa manual.",
        });
      } else {
        toast({
          title: "✅ Berhasil",
          description:
            "Data cuti berhasil dihapus dan saldo telah disesuaikan.",
        });
      }

      fetchHistory();
      if (onDataChange) onDataChange();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Gagal menghapus data",
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!employee) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-3xl">
          <DialogHeader>
            <DialogTitle>Riwayat Cuti {year ? `Tahun ${year}` : ''} - {employee.employeeName}</DialogTitle>
            <DialogDescription>
              Berikut adalah daftar semua cuti yang diambil oleh{" "}
              {employee.employeeName} {year ? `pada tahun ${year}` : ''}.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-4 -mr-4 mt-4">
            {isLoading ? (
              <div className="flex justify-center items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-10">
                <XCircle className="mx-auto h-12 w-12 text-slate-500" />
                <h3 className="mt-2 text-sm font-medium text-white">
                  Tidak ada data
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  Pegawai ini belum memiliki riwayat pengajuan cuti.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {history.map((record) => (
                  <motion.div
                    key={record.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                    className="p-4 bg-slate-700/50 rounded-lg border border-slate-600/50"
                  >
                    <div className="flex flex-col sm:flex-row justify-between sm:items-start">
                      <div className="flex-1 mb-4 sm:mb-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Tag className="w-4 h-4 text-purple-400" />
                          <h3 className="font-semibold text-white">
                            {record.leave_types.name}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-300 mb-2">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          <span>
                            {new Date(record.start_date).toLocaleDateString(
                              "id-ID",
                              { day: "numeric", month: "long", year: "numeric" },
                            )}{" "}
                            -{" "}
                            {new Date(record.end_date).toLocaleDateString(
                              "id-ID",
                              { day: "numeric", month: "long", year: "numeric" },
                            )}
                          </span>
                          <span className="text-xs bg-slate-600 px-2 py-0.5 rounded-full">
                            {record.days_requested} hari
                          </span>
                        </div>
                        <div className="flex items-start gap-2 text-sm text-slate-400">
                          <FileText className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0" />
                          <p>{record.reason || "Tidak ada alasan."}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!readOnly && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-slate-400 hover:text-yellow-400"
                              onClick={() => handleAction("Edit", record.id)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-slate-400 hover:text-red-400"
                              onClick={() => handleDelete(record.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {/* Dialog Edit Data Cuti */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
        setIsEditDialogOpen(open);
        if (!open) setEditingRecord(null);
      }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Data Cuti</DialogTitle>
          </DialogHeader>
          {editingRecord && (
            <LeaveRequestForm
              employees={[]}
              leaveTypes={[]}
              initialData={editingRecord}
              onSubmitSuccess={() => {
                setIsEditDialogOpen(false);
                setEditingRecord(null);
                fetchHistory();
                if (onDataChange) onDataChange();
              }}
              onCancel={() => {
                setIsEditDialogOpen(false);
                setEditingRecord(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EmployeeLeaveHistoryModal;
