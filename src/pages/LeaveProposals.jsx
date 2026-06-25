import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  FileText, Plus, CheckCircle, XCircle, Clock, User,
  Check, Forward, Printer, ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { AuthManager } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";
import useLeaveProposals from "@/hooks/useLeaveProposals";
import LeaveProposalForm from "@/components/leave_proposals/LeaveProposalForm";
import EmployeeLeaveRequestForm from "@/components/leave_proposals/EmployeeLeaveRequestForm";
import { downloadLeaveProposalLetter } from "@/utils/leaveProposalLetterGenerator";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

const STATUS_CONFIG = {
  pending:   { label: "Menunggu",     color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30", icon: Clock },
  approved:  { label: "Disetujui",    color: "bg-green-500/20 text-green-300 border-green-500/30",   icon: CheckCircle },
  rejected:  { label: "Ditolak",      color: "bg-red-500/20 text-red-300 border-red-500/30",         icon: XCircle },
  forwarded: { label: "Diteruskan ke Admin Pusat", color: "bg-blue-500/20 text-blue-300 border-blue-500/30", icon: Forward },
  processed: { label: "Diproses",     color: "bg-slate-500/20 text-slate-300 border-slate-500/30",   icon: FileText },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

const LeaveProposals = () => {
  const { toast } = useToast();
  const currentUser = AuthManager.getUserSession();
  const isEmployee = currentUser?.role === 'employee';
  const isAdminUnit = currentUser?.role === 'admin_unit';

  const {
    proposals, isLoading, fetchProposals,
    approveEmployeeProposal, rejectEmployeeProposal, forwardToAdminPusat,
  } = useLeaveProposals();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [tableExists, setTableExists] = useState(true);
  const [activeTab, setActiveTab] = useState("my-proposals");

  // Signers from localStorage
  const [signers, setSigners] = useState([]);
  const [selectedSigner, setSelectedSigner] = useState("");

  // Dialog state
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog]   = useState(false);
  const [showForwardDialog, setShowForwardDialog] = useState(false);
  const [targetProposal, setTargetProposal] = useState(null);

  const [letterNumber, setLetterNumber] = useState("");
  const [letterDate, setLetterDate]     = useState(format(new Date(), "yyyy-MM-dd"));
  const [approvalNotes, setApprovalNotes]   = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [forwardNote, setForwardNote]       = useState("");
  const [submitting, setSubmitting]         = useState(false);

  // Check table existence
  useEffect(() => {
    supabase.from("leave_proposals").select("id").limit(1)
      .then(({ error }) => {
        setTableExists(!(error && error.code === "42P01"));
      });
  }, []);

  // Load signers from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("saved_signers");
      if (saved) {
        const parsed = JSON.parse(saved);
        setSigners(parsed);
        if (parsed.length > 0) setSelectedSigner(parsed[0].name);
      }
    } catch { /* ignore */ }
  }, []);

  if (!currentUser || (currentUser.role !== 'admin_unit' && currentUser.role !== 'employee')) {
    return (
      <div className="p-6">
        <Card className="bg-red-900/20 border-red-700/50">
          <CardContent className="p-6 text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Akses Ditolak</h2>
            <p className="text-slate-300">Hanya Pegawai dan Admin Unit yang dapat mengakses halaman ini.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleCreateProposal = async (proposalData) => {
    try {
      const proposerUnit = isEmployee
        ? proposalData.proposer_unit
        : (currentUser.department || "Unknown");

      const { data: proposal, error: proposalError } = await supabase
        .from("leave_proposals")
        .insert({
          proposal_title: proposalData.title,
          proposed_by: currentUser.id,
          proposer_name: currentUser.name,
          proposer_unit: proposerUnit,
          notes: proposalData.notes || "",
          total_employees: proposalData.employees.length,
          status: "pending",
        })
        .select()
        .single();
      if (proposalError) throw proposalError;

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
        leave_period: emp.leave_period || emp.leave_quota_year,
        reason: emp.reason || "",
        address_during_leave: emp.address_during_leave || "",
        application_form_date: emp.application_form_date || null,
        status: "proposed",
      }));

      const { error: itemsError } = await supabase.from("leave_proposal_items").insert(proposalItems);
      if (itemsError) throw itemsError;

      toast({
        title: "Berhasil",
        description: isEmployee
          ? "Pengajuan cuti berhasil dikirim ke Admin Unit"
          : "Usulan cuti berhasil dibuat",
      });
      setShowCreateForm(false);
      fetchProposals();
    } catch (error) {
      toast({ variant: "destructive", title: "Gagal Membuat Usulan", description: error.message });
    }
  };

  const openApproveDialog = (proposal) => {
    setTargetProposal(proposal);
    setLetterNumber(`SRT/CUTI/${new Date().getFullYear()}/${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`);
    setLetterDate(format(new Date(), "yyyy-MM-dd"));
    setApprovalNotes("");
    setShowApprovalDialog(true);
  };
  const openRejectDialog  = (proposal) => { setTargetProposal(proposal); setRejectionReason(""); setShowRejectDialog(true); };
  const openForwardDialog = (proposal) => { setTargetProposal(proposal); setForwardNote(""); setShowForwardDialog(true); };

  const handleApproveSubmit = async () => {
    if (!selectedSigner) {
      toast({ title: "Peringatan", description: "Silakan pilih penandatangan terlebih dahulu.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await approveEmployeeProposal(targetProposal.id, targetProposal.leave_proposal_items, {
        letter_number: letterNumber,
        letter_date: letterDate,
        signed_by: selectedSigner,
        notes: approvalNotes,
      });
      setShowApprovalDialog(false);
      setTargetProposal(null);
    } catch { /* handled by hook */ }
    finally { setSubmitting(false); }
  };

  const handleRejectSubmit = async () => {
    if (!rejectionReason.trim()) {
      toast({ title: "Peringatan", description: "Alasan penolakan harus diisi.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await rejectEmployeeProposal(targetProposal.id, rejectionReason);
      setShowRejectDialog(false);
      setTargetProposal(null);
    } catch { /* handled by hook */ }
    finally { setSubmitting(false); }
  };

  const handleForwardSubmit = async () => {
    setSubmitting(true);
    try {
      await forwardToAdminPusat(targetProposal.id, forwardNote);
      setShowForwardDialog(false);
      setTargetProposal(null);
    } catch { /* handled by hook */ }
    finally { setSubmitting(false); }
  };

  const handlePrintApprovedLetter = async (proposal) => {
    try {
      toast({ title: "Menyiapkan dokumen...", description: "Mohon tunggu sebentar." });
      await downloadLeaveProposalLetter({
        proposal: {
          ...proposal,
          letter_number: proposal.letter_number || "",
          letter_date: proposal.letter_date || new Date().toISOString(),
        },
        proposalItems: proposal.leave_proposal_items || [],
        organization: {
          name: currentUser?.department || "UNIT KERJA",
          department: currentUser?.department || "",
          address: "",
          city: "",
          phone: "",
          email: "",
        },
      });
    } catch (err) {
      toast({ variant: "destructive", title: "Gagal Generate Surat", description: err.message });
    }
  };

  // Filter proposals for display
  const displayProposals = proposals.filter((p) => {
    if (isEmployee) return p.proposed_by === currentUser.id;
    if (activeTab === "my-proposals") return p.proposed_by === currentUser.id;
    // employee-approvals: proposals from employees in this unit (not created by admin themselves)
    return p.proposed_by !== currentUser.id && p.proposer_unit === currentUser.department;
  });

  const pendingEmployeeCount = proposals.filter(
    p => p.proposed_by !== currentUser.id && p.proposer_unit === currentUser.department && p.status === 'pending'
  ).length;

  if (showCreateForm) {
    return (
      <div className="p-6">
        {isEmployee ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowCreateForm(false)}
                className="text-slate-400 hover:text-white text-sm flex items-center gap-1"
              >
                ← Kembali
              </button>
              <h2 className="text-xl font-bold text-white">Form Pengajuan Cuti</h2>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
              <EmployeeLeaveRequestForm
                onSubmit={handleCreateProposal}
                onCancel={() => setShowCreateForm(false)}
              />
            </div>
          </div>
        ) : (
          <LeaveProposalForm
            onSubmit={handleCreateProposal}
            onCancel={() => setShowCreateForm(false)}
          />
        )}
      </div>
    );
  }

  if (!tableExists) {
    return (
      <div className="p-6">
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-8 text-center text-white">
            <FileText className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-3">Fitur Usulan Cuti Belum Tersedia</h2>
            <p className="text-slate-400">Tabel database yang diperlukan belum dibuat.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 text-white">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold mb-2">
            {isEmployee ? "Pengajuan Cuti Mandiri" : "Usulan & Pengajuan Cuti"}
          </h1>
          <p className="text-slate-400">
            {isEmployee
              ? "Ajukan cuti dan pantau status persetujuan dari Admin Unit Anda"
              : `Kelola usulan unit dan persetujuan cuti pegawai di ${currentUser.department}`}
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(true)} className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700">
          <Plus className="w-4 h-4 mr-2" />
          {isEmployee ? "Ajukan Cuti Baru" : "Buat Usulan Baru"}
        </Button>
      </motion.div>

      {/* Tabs (Admin Unit only) */}
      {isAdminUnit && (
        <div className="flex border-b border-slate-700/50 space-x-4">
          {[
            { key: "my-proposals", label: "Usulan Unit (ke Admin Pusat)" },
            { key: "employee-approvals", label: "Persetujuan Cuti Pegawai", badge: pendingEmployeeCount },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 font-semibold text-sm transition-all relative flex items-center gap-2 ${activeTab === tab.key ? "text-blue-400" : "text-slate-400 hover:text-white"}`}
            >
              {tab.label}
              {tab.badge > 0 && (
                <span className="bg-yellow-500 text-slate-900 w-5 h-5 rounded-full text-xs flex items-center justify-center">{tab.badge}</span>
              )}
              {activeTab === tab.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />}
            </button>
          ))}
        </div>
      )}

      {/* Proposal List */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardHeader>
            <CardTitle>
              {isEmployee ? "Riwayat Pengajuan Cuti"
                : activeTab === "my-proposals" ? "Daftar Usulan Unit ke Admin Pusat"
                : "Daftar Pengajuan Cuti Pegawai"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto" />
                <p className="text-slate-400 mt-2">Memuat data...</p>
              </div>
            ) : displayProposals.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Belum Ada Data</h3>
                <p className="text-slate-400">
                  {isEmployee ? "Anda belum pernah mengajukan cuti."
                    : activeTab === "my-proposals" ? "Belum ada usulan yang dibuat untuk unit Anda."
                    : "Belum ada pegawai yang mengajukan cuti."}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {displayProposals.map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    isEmployee={isEmployee}
                    isAdminUnit={isAdminUnit}
                    activeTab={activeTab}
                    onApprove={openApproveDialog}
                    onReject={openRejectDialog}
                    onForward={openForwardDialog}
                    onPrint={handlePrintApprovedLetter}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* === Approve Dialog === */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Setujui & Terbitkan Surat Cuti</DialogTitle>
            <DialogDescription className="text-slate-400">Isi data surat cuti. Menyetujui akan langsung membuat record cuti dan memotong saldo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-slate-300">Penandatangan Surat</Label>
              {signers.length === 0 ? (
                <p className="text-xs text-amber-400 mt-1">⚠️ Belum ada penandatangan. Atur di halaman Surat Keterangan terlebih dahulu.</p>
              ) : (
                <select value={selectedSigner} onChange={e => setSelectedSigner(e.target.value)}
                  className="w-full mt-1 bg-slate-700/50 border border-slate-600/50 rounded-md p-2 text-white focus:outline-none">
                  {signers.map((s, i) => (
                    <option key={i} value={s.name} className="bg-slate-800">{s.name} — {s.position_name}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <Label className="text-slate-300">Nomor Surat</Label>
              <Input value={letterNumber} onChange={e => setLetterNumber(e.target.value)}
                placeholder="SRT/CUTI/2026/001" className="bg-slate-700/50 border-slate-600/50 mt-1 text-white" />
            </div>
            <div>
              <Label className="text-slate-300">Tanggal Surat</Label>
              <Input type="date" value={letterDate} onChange={e => setLetterDate(e.target.value)}
                className="bg-slate-700/50 border-slate-600/50 mt-1 text-white" />
            </div>
            <div>
              <Label className="text-slate-300">Catatan (Opsional)</Label>
              <Textarea value={approvalNotes} onChange={e => setApprovalNotes(e.target.value)}
                rows={2} className="bg-slate-700/50 border-slate-600/50 mt-1 text-white" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-700/50">
            <Button variant="outline" onClick={() => setShowApprovalDialog(false)} className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600">Batal</Button>
            <Button onClick={handleApproveSubmit} disabled={submitting || signers.length === 0} className="bg-green-600 hover:bg-green-700">
              {submitting ? "Memproses..." : "Setujui & Terbitkan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* === Reject Dialog === */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Tolak Pengajuan Cuti</DialogTitle>
            <DialogDescription className="text-slate-400">Berikan alasan penolakan agar pegawai dapat melihatnya.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-slate-300 font-semibold">Alasan Penolakan *</Label>
              <Textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)}
                placeholder="Tuliskan alasan penolakan..." rows={3}
                className="bg-slate-700/50 border-slate-600/50 mt-1 text-white" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-700/50">
            <Button variant="outline" onClick={() => setShowRejectDialog(false)} className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600">Batal</Button>
            <Button onClick={handleRejectSubmit} disabled={submitting || !rejectionReason.trim()} className="bg-red-600 hover:bg-red-700">
              {submitting ? "Menolak..." : "Tolak Pengajuan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* === Forward Dialog === */}
      <Dialog open={showForwardDialog} onOpenChange={setShowForwardDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Teruskan ke Admin Pusat</DialogTitle>
            <DialogDescription className="text-slate-400">
              Pengajuan ini akan diteruskan ke Admin Pusat untuk diproses lebih lanjut. Admin Pusat dapat menyetujui atau menolaknya.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-slate-300">Catatan Penerusan (Opsional)</Label>
              <Textarea value={forwardNote} onChange={e => setForwardNote(e.target.value)}
                placeholder="Catatan tambahan untuk Admin Pusat..." rows={3}
                className="bg-slate-700/50 border-slate-600/50 mt-1 text-white" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-700/50">
            <Button variant="outline" onClick={() => setShowForwardDialog(false)} className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600">Batal</Button>
            <Button onClick={handleForwardSubmit} disabled={submitting} className="bg-blue-600 hover:bg-blue-700">
              <Forward className="w-4 h-4 mr-2" />
              {submitting ? "Meneruskan..." : "Teruskan ke Admin Pusat"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── ProposalCard ────────────────────────────────────────────────────────────
function ProposalCard({ proposal, isEmployee, isAdminUnit, activeTab, onApprove, onReject, onForward, onPrint }) {
  const isEmployeeApprovalTab = isAdminUnit && activeTab === "employee-approvals";
  const canAct = isEmployeeApprovalTab && proposal.status === "pending";
  const canPrint = isEmployeeApprovalTab && proposal.status === "approved";

  return (
    <div className="p-4 bg-slate-700/30 rounded-lg border border-slate-600/50 hover:bg-slate-700/50 transition-colors">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="font-semibold text-white text-base">{proposal.proposal_title}</h3>
            <StatusBadge status={proposal.status} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400 mb-2">
            <span>📅 {format(new Date(proposal.proposal_date || proposal.created_at), "dd MMM yyyy", { locale: id })}</span>
            <span>👥 {proposal.total_employees} pegawai</span>
            {isEmployeeApprovalTab && (
              <span className="flex items-center text-blue-400">
                <User className="w-3.5 h-3.5 mr-1" />
                Pemohon: {proposal.proposer_name}
              </span>
            )}
          </div>
          {proposal.notes && (
            <p className="text-slate-300 text-sm bg-slate-800/40 p-2 rounded border border-slate-700/30 mb-2">{proposal.notes}</p>
          )}
          {proposal.status === 'rejected' && proposal.rejection_reason && (
            <div className="p-2 bg-red-900/20 border border-red-700/50 rounded text-sm text-red-400">
              <strong>Alasan Ditolak:</strong> {proposal.rejection_reason}
            </div>
          )}
          {proposal.status === 'approved' && proposal.letter_number && (
            <div className="p-2 bg-green-950/30 border border-green-700/40 rounded text-sm text-green-400">
              <strong>Nomor Surat:</strong> {proposal.letter_number}
              {proposal.letter_date && ` — ${format(new Date(proposal.letter_date), "dd MMMM yyyy", { locale: id })}`}
            </div>
          )}
          {proposal.status === 'forwarded' && (
            <div className="p-2 bg-blue-900/20 border border-blue-700/40 rounded text-sm text-blue-400">
              Diteruskan ke Admin Pusat untuk diproses.
            </div>
          )}
        </div>

        {/* Action buttons for admin_unit on employee-approvals tab */}
        {(canAct || canPrint) && (
          <div className="flex items-center gap-2">
            {canPrint && (
              <Button size="sm" variant="outline" onClick={() => onPrint(proposal)}
                className="border-slate-600 text-slate-300 hover:bg-slate-700">
                <Printer className="w-4 h-4 mr-1" /> Cetak Surat
              </Button>
            )}
            {canAct && (
              <>
                <Button size="sm" onClick={() => onApprove(proposal)} className="bg-green-600 hover:bg-green-700 text-white">
                  <Check className="w-4 h-4 mr-1" /> Setujui
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700 px-2">
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700 text-white">
                    <DropdownMenuItem onClick={() => onForward(proposal)} className="hover:bg-slate-700 cursor-pointer">
                      <Forward className="w-4 h-4 mr-2 text-blue-400" />
                      Teruskan ke Admin Pusat
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onReject(proposal)} className="hover:bg-slate-700 cursor-pointer text-red-400 focus:text-red-400">
                      <XCircle className="w-4 h-4 mr-2" />
                      Tolak Pengajuan
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        )}
      </div>

      {/* Items preview */}
      {proposal.leave_proposal_items?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-700/50">
          <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider block mb-2">Detail:</span>
          <div className="space-y-1.5">
            {proposal.leave_proposal_items.map((item, i) => (
              <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between text-sm bg-slate-800/25 px-3 py-1.5 rounded">
                <div>
                  <span className="font-medium text-white">{item.employee_name}</span>
                  <span className="text-slate-400 ml-1 text-xs">({item.employee_nip})</span>
                  <p className="text-xs text-slate-400">{item.leave_type_name} · {item.reason || "—"}</p>
                </div>
                <div className="text-right mt-1 sm:mt-0">
                  <span className="text-slate-300 text-xs">
                    {format(new Date(item.start_date), "dd MMM", { locale: id })} – {format(new Date(item.end_date), "dd MMM yyyy", { locale: id })}
                  </span>
                  <p className="text-xs text-slate-400">{item.days_requested} hari kerja</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default LeaveProposals;
