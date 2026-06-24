import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FileText, Plus, List, CheckCircle, XCircle, Clock, Calendar as CalendarIcon, User, UserCheck, Check, ChevronsUpDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { AuthManager } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";
import useLeaveProposals from "@/hooks/useLeaveProposals";
import LeaveProposalForm from "@/components/leave_proposals/LeaveProposalForm";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const LeaveProposals = () => {
  const { toast } = useToast();
  const currentUser = AuthManager.getUserSession();
  const isEmployee = currentUser?.role === 'employee';
  const isAdminUnit = currentUser?.role === 'admin_unit';
  
  const { proposals, isLoading, fetchProposals, approveEmployeeProposal, rejectEmployeeProposal } = useLeaveProposals();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [tableExists, setTableExists] = useState(true);
  const [activeTab, setActiveTab] = useState("my-proposals"); // "my-proposals" or "employee-approvals"
  
  // Signer management for approvals
  const [signers, setSigners] = useState([]);
  const [selectedSigner, setSelectedSigner] = useState("");
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [targetProposal, setTargetProposal] = useState(null);
  
  // Approval Form Data
  const [letterNumber, setLetterNumber] = useState("");
  const [letterDate, setLetterDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [approvalNotes, setApprovalNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [submittingApproval, setSubmittingApproval] = useState(false);

  // Check if tables exist on mount
  useEffect(() => {
    const checkTableExists = async () => {
      try {
        const { error } = await supabase
          .from("leave_proposals")
          .select("*")
          .limit(1);

        if (error && error.code === "42P01") {
          setTableExists(false);
        } else {
          setTableExists(true);
        }
      } catch (err) {
        console.error("Error checking table existence:", err);
        setTableExists(false);
      }
    };

    checkTableExists();
  }, []);

  // Fetch signers on mount
  useEffect(() => {
    const loadSigners = () => {
      const saved = localStorage.getItem("saved_signers");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setSigners(parsed);
          if (parsed.length > 0) {
            setSelectedSigner(parsed[0].name);
          }
        } catch (e) {
          console.error("Error parsing saved_signers", e);
        }
      }
    };
    loadSigners();
  }, []);

  // Check user permission
  if (!currentUser || (currentUser.role !== 'admin_unit' && currentUser.role !== 'employee')) {
    return (
      <div className="p-6">
        <Card className="bg-red-900/20 border-red-700/50">
          <CardContent className="p-6">
            <div className="text-center">
              <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Akses Ditolak</h2>
              <p className="text-slate-300">
                Hanya Pegawai dan Admin Unit yang dapat mengakses halaman ini.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleCreateProposal = async (proposalData) => {
    try {
      console.log("🔍 Creating proposal with data:", proposalData);

      const proposerUnit = isEmployee 
        ? proposalData.proposer_unit 
        : (currentUser.unitKerja || currentUser.unit_kerja || "Unknown");

      const proposalPayload = {
        proposal_title: proposalData.title,
        proposed_by: currentUser.id,
        proposer_name: currentUser.name,
        proposer_unit: proposerUnit,
        notes: proposalData.notes || "",
        total_employees: proposalData.employees.length,
        status: "pending"
      };

      // Create proposal
      const { data: proposal, error: proposalError } = await supabase
        .from("leave_proposals")
        .insert(proposalPayload)
        .select()
        .single();

      if (proposalError) throw proposalError;

      // Create proposal items
      const proposalItems = proposalData.employees.map(emp => ({
        proposal_id: proposal.id,
        employee_id: emp.employee_id,
        employee_name: emp.employee_name,
        employee_nip: emp.employee_nip,
        employee_department: emp.employee_department,
        employee_position: emp.employee_position || "",
        leave_type_id: emp.leave_type_id,
        leave_type_name: emp.leave_type_name,
        start_date: emp.start_date,
        end_date: emp.end_date,
        days_requested: emp.days_requested,
        leave_quota_year: emp.leave_quota_year,
        reason: emp.reason || "",
        address_during_leave: emp.address_during_leave || "",
        status: "proposed"
      }));

      const { error: itemsError } = await supabase
        .from("leave_proposal_items")
        .insert(proposalItems);

      if (itemsError) throw itemsError;

      toast({
        title: "Success",
        description: isEmployee 
          ? "Pengajuan cuti berhasil dikirim ke Admin Unit" 
          : "Usulan cuti berhasil dibuat dan dikirim ke Master Admin",
      });

      setShowCreateForm(false);
      fetchProposals();
    } catch (error) {
      console.error("Error creating proposal:", error);
      toast({
        variant: "destructive",
        title: "Gagal Membuat Usulan",
        description: error.message,
      });
    }
  };

  const handleOpenApproveDialog = (proposal) => {
    setTargetProposal(proposal);
    setLetterNumber(`SRT/CUTI/${new Date().getFullYear()}/${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`);
    setApprovalNotes("");
    setShowApprovalDialog(true);
  };

  const handleOpenRejectDialog = (proposal) => {
    setTargetProposal(proposal);
    setRejectionReason("");
    setShowRejectDialog(true);
  };

  const handleApproveSubmit = async () => {
    if (!selectedSigner) {
      toast({
        title: "Peringatan",
        description: "Silakan pilih penandatangan surat terlebih dahulu.",
        variant: "destructive"
      });
      return;
    }
    
    setSubmittingApproval(true);
    try {
      const approvalData = {
        letter_number: letterNumber,
        letter_date: letterDate,
        signed_by: selectedSigner,
        notes: approvalNotes
      };
      
      await approveEmployeeProposal(targetProposal.id, targetProposal.leave_proposal_items, approvalData);
      setShowApprovalDialog(false);
      setTargetProposal(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingApproval(false);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectionReason.trim()) {
      toast({
        title: "Peringatan",
        description: "Alasan penolakan harus diisi.",
        variant: "destructive"
      });
      return;
    }

    setSubmittingApproval(true);
    try {
      await rejectEmployeeProposal(targetProposal.id, rejectionReason);
      setShowRejectDialog(false);
      setTargetProposal(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingApproval(false);
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: { label: "Menunggu", variant: "default", icon: Clock },
      approved: { label: "Disetujui", variant: "success", icon: CheckCircle },
      rejected: { label: "Ditolak", variant: "destructive", icon: XCircle },
      processed: { label: "Diproses", variant: "secondary", icon: FileText },
    };

    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1 w-fit">
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  if (showCreateForm) {
    return (
      <div className="p-6">
        <LeaveProposalForm
          onSubmit={handleCreateProposal}
          onCancel={() => setShowCreateForm(false)}
        />
      </div>
    );
  }

  // Show setup message if tables don't exist
  if (!tableExists) {
    return (
      <div className="p-6">
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-8">
            <div className="text-center text-white">
              <FileText className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-3">Fitur Usulan Cuti Belum Tersedia</h2>
              <p className="text-slate-400 mb-4">
                Sistem usulan cuti belum dikonfigurasi. Tabel database yang diperlukan belum dibuat.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Filter proposals based on active tab and role
  // "my-proposals" shows:
  // - For employee: proposals proposed by them.
  // - For admin_unit: proposals created by them (where proposed_by === currentUser.id).
  // "employee-approvals" shows:
  // - For admin_unit: proposals proposed by employees in their unit (proposed_by !== currentUser.id && proposer_unit === currentUser.unitKerja).
  const displayProposals = proposals.filter((p) => {
    if (isEmployee) {
      return p.proposed_by === currentUser.id;
    }
    
    // Unit admin filters
    if (activeTab === "my-proposals") {
      return p.proposed_by === currentUser.id;
    } else {
      return p.proposed_by !== currentUser.id && p.proposer_unit === currentUser.unitKerja;
    }
  });

  return (
    <div className="p-6 space-y-6 text-white">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center"
      >
        <div>
          <h1 className="text-3xl font-bold mb-2">
            {isEmployee ? "Pengajuan Cuti Mandiri" : "Usulan & Pengajuan Cuti"}
          </h1>
          <p className="text-slate-400">
            {isEmployee 
              ? "Ajukan cuti dan pantau status persetujuan dari Admin Unit Anda" 
              : `Kelola usulan unit dan persetujuan cuti pegawai di lingkungan ${currentUser.unitKerja}`}
          </p>
        </div>
        <Button
          onClick={() => setShowCreateForm(true)}
          className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          {isEmployee ? "Ajukan Cuti Baru" : "Buat Usulan Baru"}
        </Button>
      </motion.div>

      {/* Tabs (Only shown for Admin Unit role) */}
      {isAdminUnit && (
        <div className="flex border-b border-slate-700/50 space-x-4">
          <button
            onClick={() => setActiveTab("my-proposals")}
            className={`pb-3 font-semibold text-sm transition-all relative ${activeTab === "my-proposals" ? "text-blue-400" : "text-slate-400 hover:text-white"}`}
          >
            Usulan Unit (Ke Master Admin)
            {activeTab === "my-proposals" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />}
          </button>
          <button
            onClick={() => setActiveTab("employee-approvals")}
            className={`pb-3 font-semibold text-sm transition-all relative ${activeTab === "employee-approvals" ? "text-blue-400" : "text-slate-400 hover:text-white"}`}
          >
            Persetujuan Cuti Pegawai
            {activeTab === "employee-approvals" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />}
            {proposals.filter(p => p.proposed_by !== currentUser.id && p.proposer_unit === currentUser.unitKerja && p.status === 'pending').length > 0 && (
              <Badge className="ml-2 bg-yellow-500 text-slate-900 w-5 h-5 p-0 flex items-center justify-center rounded-full text-xs inline-flex">
                {proposals.filter(p => p.proposed_by !== currentUser.id && p.proposer_unit === currentUser.unitKerja && p.status === 'pending').length}
              </Badge>
            )}
          </button>
        </div>
      )}

      {/* Proposals List */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardHeader>
            <CardTitle>
              {isEmployee 
                ? "Riwayat Pengajuan Cuti Mandiri" 
                : activeTab === "my-proposals" ? "Daftar Usulan Unit ke Master Admin" : "Daftar Persetujuan Cuti Pegawai"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                <p className="text-slate-400 mt-2">Memuat data...</p>
              </div>
            ) : displayProposals.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Belum Ada Data</h3>
                <p className="text-slate-400 mb-4">
                  {isEmployee 
                    ? "Anda belum pernah mengajukan cuti mandiri." 
                    : activeTab === "my-proposals" ? "Belum ada usulan batch yang dibuat untuk unit Anda." : "Belum ada pegawai yang mengajukan cuti mandiri."}
                </p>
                {isEmployee && (
                  <Button
                    onClick={() => setShowCreateForm(true)}
                    className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Ajukan Cuti Pertama
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {displayProposals.map((proposal) => (
                  <div
                    key={proposal.id}
                    className="p-4 bg-slate-700/30 rounded-lg border border-slate-600/50 hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-3 mb-2">
                          <h3 className="font-semibold text-white text-lg">{proposal.proposal_title}</h3>
                          {getStatusBadge(proposal.status)}
                        </div>
                        
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400 mb-3">
                          <span>📅 {format(new Date(proposal.proposal_date), "dd MMM yyyy", { locale: id })}</span>
                          <span>👥 {proposal.total_employees} pegawai</span>
                          {isAdminUnit && activeTab === "employee-approvals" && (
                            <span className="flex items-center text-blue-400">
                              <User className="w-3.5 h-3.5 mr-1" />
                              Pemohon: {proposal.proposer_name}
                            </span>
                          )}
                        </div>
                        
                        {proposal.notes && (
                          <p className="text-slate-300 text-sm bg-slate-800/40 p-2.5 rounded border border-slate-700/30 mb-2">{proposal.notes}</p>
                        )}
                        
                        {proposal.status === 'rejected' && proposal.rejection_reason && (
                          <div className="p-2.5 bg-red-900/20 border border-red-700/50 rounded text-sm text-red-400">
                            <strong>Alasan Ditolak:</strong> {proposal.rejection_reason}
                          </div>
                        )}

                        {proposal.status === 'approved' && proposal.letter_number && (
                          <div className="p-2.5 bg-green-950/30 border border-green-700/40 rounded text-sm text-green-400">
                            <strong>Nomor Surat Cuti:</strong> {proposal.letter_number} 
                            {proposal.letter_date && ` | Tanggal: ${format(new Date(proposal.letter_date), "dd MMMM yyyy", { locale: id })}`}
                          </div>
                        )}
                      </div>

                      {/* Approvals action buttons (Only for admin unit on employee-approvals tab) */}
                      {isAdminUnit && activeTab === "employee-approvals" && proposal.status === "pending" && (
                        <div className="flex md:flex-col lg:flex-row gap-2 justify-end">
                          <Button
                            onClick={() => handleOpenApproveDialog(proposal)}
                            className="bg-green-600 hover:bg-green-700 text-white size-sm"
                          >
                            <Check className="w-4 h-4 mr-1.5" />
                            Setujui
                          </Button>
                          <Button
                            onClick={() => handleOpenRejectDialog(proposal)}
                            variant="destructive"
                            className="size-sm"
                          >
                            <XCircle className="w-4 h-4 mr-1.5" />
                            Tolak
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Employee List Details Preview */}
                    {proposal.leave_proposal_items && proposal.leave_proposal_items.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-slate-700/50">
                        <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider block mb-2">Detail Pengajuan:</span>
                        <div className="space-y-2">
                          {proposal.leave_proposal_items.map((item, index) => (
                            <div key={index} className="flex flex-col sm:flex-row sm:items-center justify-between text-sm bg-slate-800/25 p-2 rounded">
                              <div>
                                <span className="font-semibold text-white">{item.employee_name} ({item.employee_nip})</span>
                                <p className="text-xs text-slate-400">{item.leave_type_name} | {item.reason || "Tidak ada keterangan"}</p>
                              </div>
                              <div className="text-right sm:text-right mt-1 sm:mt-0">
                                <span className="text-slate-300 block font-medium">
                                  {format(new Date(item.start_date), "dd MMM yyyy", { locale: id })} - {format(new Date(item.end_date), "dd MMM yyyy", { locale: id })}
                                </span>
                                <span className="text-xs text-slate-400">{item.days_requested} hari kerja</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Approval Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Persetujuan Cuti Pegawai</DialogTitle>
            <DialogDescription className="text-slate-400">
              Isi data administrasi surat cuti untuk menyetujui pengajuan cuti ini.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div>
              <Label className="text-slate-300">Pilih Penandatangan (Signer)</Label>
              {signers.length === 0 ? (
                <p className="text-xs text-amber-400 mt-1">
                  ⚠️ Belum ada penandatangan yang disimpan. Silakan atur penandatangan di halaman buat surat atau menu pengaturan terlebih dahulu.
                </p>
              ) : (
                <select
                  value={selectedSigner}
                  onChange={(e) => setSelectedSigner(e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600/50 rounded-md p-2 mt-1 focus:outline-none"
                >
                  {signers.map((s, idx) => (
                    <option key={idx} value={s.name} className="bg-slate-800">{s.name} ({s.position_name})</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <Label className="text-slate-300">Nomor Surat Cuti</Label>
              <Input
                value={letterNumber}
                onChange={(e) => setLetterNumber(e.target.value)}
                placeholder="Contoh: SRT/CUTI/2026/001"
                className="bg-slate-700/50 border-slate-600/50 mt-1 text-white"
              />
            </div>
            <div>
              <Label className="text-slate-300">Tanggal Surat Cuti</Label>
              <Input
                type="date"
                value={letterDate}
                onChange={(e) => setLetterDate(e.target.value)}
                className="bg-slate-700/50 border-slate-600/50 mt-1 text-white"
              />
            </div>
            <div>
              <Label className="text-slate-300">Catatan Persetujuan (Opsional)</Label>
              <Textarea
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder="Catatan tambahan persetujuan..."
                className="bg-slate-700/50 border-slate-600/50 mt-1 text-white"
                rows={2}
              />
            </div>
          </div>
          <div className="flex justify-end space-x-2 pt-4 border-t border-slate-700/50">
            <Button
              variant="outline"
              onClick={() => setShowApprovalDialog(false)}
              className="bg-slate-700 border-slate-600 hover:bg-slate-600 text-white"
            >
              Batal
            </Button>
            <Button
              onClick={handleApproveSubmit}
              disabled={submittingApproval || signers.length === 0}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {submittingApproval ? "Menyetujui..." : "Setujui Pengajuan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Tolak Pengajuan Cuti</DialogTitle>
            <DialogDescription className="text-slate-400">
              Berikan alasan penolakan untuk pengajuan cuti ini agar pegawai dapat melihatnya.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div>
              <Label className="text-slate-300 font-semibold">Alasan Penolakan</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Alasan penolakan pengajuan cuti..."
                className="bg-slate-700/50 border-slate-600/50 mt-1 text-white"
                rows={3}
                required
              />
            </div>
          </div>
          <div className="flex justify-end space-x-2 pt-4 border-t border-slate-700/50">
            <Button
              variant="outline"
              onClick={() => setShowRejectDialog(false)}
              className="bg-slate-700 border-slate-600 hover:bg-slate-600 text-white"
            >
              Batal
            </Button>
            <Button
              onClick={handleRejectSubmit}
              disabled={submittingApproval || !rejectionReason.trim()}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {submittingApproval ? "Menolak..." : "Tolak Pengajuan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeaveProposals;
