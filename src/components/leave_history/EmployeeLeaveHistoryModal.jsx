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
          leave_types ( name ),
          leave_proposals ( id, proposal_title, letter_number, letter_date, signed_by, status, completed_at )
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
    if (readOnly) return;
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
    if (readOnly) return;
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
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Riwayat Cuti {year ? `Tahun ${year}` : ''} - {employee.employeeName || employee.name}</DialogTitle>
            <DialogDescription>
              Daftar lengkap riwayat cuti pegawai, status usulan, nomor surat resmi, dan detail pemanfaatan cuti.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto pr-2 mt-4 space-y-4 flex-1">
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
                {history.map((record) => {
                  const letterNumber = record.leave_letter_number || record.leave_proposals?.letter_number;
                  const letterDate = record.leave_letter_date || record.leave_proposals?.letter_date;
                  const signer = record.signed_by || record.leave_proposals?.signed_by;
                  const isFinished = !!letterNumber || record.status === 'completed' || record.leave_proposals?.status === 'completed' || record.leave_proposals?.status === 'letter_issued';
                  const isAwaitingLetter = record.leave_proposals?.status === 'awaiting_letter' || (!letterNumber && record.status === 'approved');

                  return (
                    <motion.div
                      key={record.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3 }}
                      className={`p-4 rounded-xl border ${
                        isFinished
                          ? "bg-slate-700/50 border-emerald-500/30"
                          : "bg-slate-700/40 border-slate-600/50"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-3">
                        <div className="flex-1 space-y-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-1.5 font-semibold text-white">
                              <Tag className="w-4 h-4 text-purple-400" />
                              <span>{record.leave_types?.name || "Cuti"}</span>
                            </div>

                            {/* Status Badge */}
                            {isFinished ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                ✓ Selesai (Surat Terbit)
                              </span>
                            ) : isAwaitingLetter ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                ⏳ Menunggu Surat
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                                {record.status || "Diproses"}
                              </span>
                            )}

                            {record.leave_quota_year && (
                              <span className="text-xs bg-slate-800 text-slate-300 border border-slate-600 px-2 py-0.5 rounded-full">
                                Jatah Cuti: {record.leave_quota_year}
                              </span>
                            )}
                          </div>

                          {/* Date & Duration */}
                          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-4 h-4 text-slate-400" />
                              <span>
                                {new Date(record.start_date).toLocaleDateString("id-ID", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })}
                                {" "}-{" "}
                                {new Date(record.end_date).toLocaleDateString("id-ID", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </span>
                            </div>
                            <span className="text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2.5 py-0.5 rounded-full">
                              {record.days_requested} hari kerja
                            </span>
                          </div>

                          {/* Grid info: Letter info, signer, reason, address */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2 border-t border-slate-600/40 text-xs">
                            <div className="space-y-1">
                              <p className="text-slate-400 font-medium">Surat Cuti Resmi:</p>
                              {letterNumber ? (
                                <div className="space-y-0.5 bg-slate-800/80 p-2 rounded border border-slate-700">
                                  <div className="text-white font-mono font-medium">{letterNumber}</div>
                                  {letterDate && (
                                    <div className="text-slate-300">
                                      Tgl: {new Date(letterDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                                    </div>
                                  )}
                                  {signer && (
                                    <div className="text-slate-400">
                                      Ttd: <span className="text-slate-200">{signer}</span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <p className="text-amber-400/80 italic">Surat keputusan cuti belum diterbitkan</p>
                              )}
                            </div>

                            <div className="space-y-1">
                              <p className="text-slate-400 font-medium">Alasan & Alamat Cuti:</p>
                              <div className="bg-slate-800/80 p-2 rounded border border-slate-700 space-y-1">
                                <p className="text-slate-200">
                                  <span className="text-slate-400">Alasan: </span>
                                  {record.reason || "Tidak ada alasan."}
                                </p>
                                {record.address_during_leave && (
                                  <p className="text-slate-300">
                                    <span className="text-slate-400">Alamat: </span>
                                    {record.address_during_leave}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Associated Proposal if any */}
                          {record.leave_proposals?.proposal_title && (
                            <div className="text-xs text-slate-400 flex items-center gap-1.5 pt-1">
                              <FileText className="w-3.5 h-3.5 text-slate-500" />
                              <span>Usulan: <span className="text-slate-300">{record.leave_proposals.proposal_title}</span></span>
                            </div>
                          )}
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
                  );
                })}
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
