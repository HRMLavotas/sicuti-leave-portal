import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  FileText, Plus, CheckCircle, XCircle, Clock, User,
  Check, Forward, Printer, ChevronDown, Edit, Trash2,
  Eye, Download, Layers, Building2, Search
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { processDocxTemplate } from "@/utils/docxTemplates";
import { saveAs } from "file-saver";
import { useTemplates } from "@/hooks/useTemplates";
import { useSimpelEmployeeData } from "@/hooks/useSimpelEmployees";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { getStatusConfig, canGenerateLetter, isLetterIssued } from "@/utils/proposalStatusHelper";

const STATUS_CONFIG = {
  pending:   { label: "Menunggu",     color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30", icon: Clock },
  approved:  { label: "Disetujui (Legacy)",    color: "bg-green-500/20 text-green-300 border-green-500/30",   icon: CheckCircle },
  awaiting_letter: { label: "Disetujui & Menunggu Surat", color: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30", icon: FileText },
  letter_issued: { label: "Surat Sudah Diterbitkan", color: "bg-purple-500/20 text-purple-300 border-purple-500/30", icon: CheckCircle },
  completed: { label: "Selesai", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", icon: CheckCircle },
  rejected:  { label: "Ditolak",      color: "bg-red-500/20 text-red-300 border-red-500/30",         icon: XCircle },
  forwarded: { label: "Diteruskan ke Admin Pusat", color: "bg-blue-500/20 text-blue-300 border-blue-500/30", icon: Forward },
  processed: { label: "Surat Sudah Diterbitkan (Legacy)",     color: "bg-purple-500/20 text-purple-300 border-purple-500/30",   icon: FileText },
};

const LETTER_ITEMS_PER_PAGE = 25;

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

// Convert number to Indonesian words
const safeFormatDate = (dateVal, pattern = "dd MMM yyyy", fallback = "-") => {
  if (!dateVal) return fallback;
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return fallback;
    return format(d, pattern, { locale: id });
  } catch {
    return fallback;
  }
};

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

const LeaveProposals = () => {
  const { toast } = useToast();
  const currentUser = AuthManager.getUserSession();
  const isEmployee = currentUser?.role === 'employee';
  const isAdminUnit = currentUser?.role === 'admin_unit';

  const {
    proposals, isLoading, fetchProposals,
    createProposal,
    approveEmployeeProposal, rejectEmployeeProposal, forwardToAdminPusat,
    markProposalCompleted,
    deleteProposal, updateProposal,
  } = useLeaveProposals();

  // Templates hook
  const { templates: availableTemplates, isLoading: loadingTemplates } = useTemplates({ autoFetch: true });

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingProposal, setEditingProposal] = useState(null);
  const [tableExists, setTableExists] = useState(true);
  const [activeTab, setActiveTab] = useState("my-proposals");

  // Search & Filter & Pagination state for main proposal lists
  const [proposalSearchTerm, setProposalSearchTerm] = useState("");
  const [debouncedProposalSearchTerm, setDebouncedProposalSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createLetterSubFilter, setCreateLetterSubFilter] = useState("pending_letter"); // 'pending_letter' | 'completed_letter' | 'all'
  const [proposalPage, setProposalPage] = useState(1);
  const PROPOSALS_PER_PAGE = 10;

  // Complete Dialog state
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [targetProposalForComplete, setTargetProposalForComplete] = useState(null);
  const [completeDetails, setCompleteDetails] = useState({
    letter_number: "",
    letter_date: format(new Date(), "yyyy-MM-dd"),
    signed_by: "",
  });

  // Dialog state
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog]   = useState(false);
  const [showForwardDialog, setShowForwardDialog] = useState(false);
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [targetProposal, setTargetProposal] = useState(null);
  const [selectedProposalForBatch, setSelectedProposalForBatch] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedEmployeeForLetter, setSelectedEmployeeForLetter] = useState({}); // { [leaveType]: requestId | 'all' }
  const [leaveTypeClassification, setLeaveTypeClassification] = useState({});
  const [generatingLetter, setGeneratingLetter] = useState(false);
  const [letterSearchTerm, setLetterSearchTerm] = useState("");
  const [debouncedLetterSearchTerm, setDebouncedLetterSearchTerm] = useState("");
  const [letterItemsPage, setLetterItemsPage] = useState(1);
  const [signerSearchTerm, setSignerSearchTerm] = useState("");
  const [debouncedSignerSearchTerm, setDebouncedSignerSearchTerm] = useState("");
  const [selectedBatchItemIds, setSelectedBatchItemIds] = useState([]);
  const [showLetterEdit, setShowLetterEdit] = useState(false);
  const [letterDetails, setLetterDetails] = useState({
    letter_number: "",
    letter_date: format(new Date(), "yyyy-MM-dd"),
    signed_by: "",
  });

  const [approvalNotes, setApprovalNotes]   = useState("");
  const [approvalLetterNumber, setApprovalLetterNumber] = useState("");
  const [approvalLetterDate, setApprovalLetterDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [approvalSignedBy, setApprovalSignedBy] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [forwardNote, setForwardNote]       = useState("");
  const [submitting, setSubmitting]         = useState(false);

  const {
    displayedEmployees: signerOptions,
    isLoading: loadingSigners,
  } = useSimpelEmployeeData(
    debouncedSignerSearchTerm,
    currentUser?.department || "",
    "",
    "",
    "",
    1
  );

  // Check table existence
  useEffect(() => {
    supabase.from("leave_proposals").select("id").limit(1)
      .then(({ error }) => {
        setTableExists(!(error && error.code === "42P01"));
      });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedProposalSearchTerm(proposalSearchTerm);
      setProposalPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [proposalSearchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedLetterSearchTerm(letterSearchTerm);
      setLetterItemsPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [letterSearchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSignerSearchTerm(signerSearchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [signerSearchTerm]);

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
      if (editingProposal) {
        // Update existing proposal
        await updateProposal(editingProposal.id, proposalData);
        setEditingProposal(null);
        setShowCreateForm(false);
      } else {
        // Use the hook's createProposal which already handles inserting items
        const res = await createProposal(proposalData);
        toast({
          title: "Berhasil",
          description: isEmployee
            ? "Pengajuan cuti berhasil dikirim ke Admin Unit"
            : "Usulan cuti berhasil dibuat",
        });
        setShowCreateForm(false);
        return res;
      }
    } catch (error) {
      toast({ variant: "destructive", title: editingProposal ? "Gagal Memperbarui Usulan" : "Gagal Membuat Usulan", description: error.message });
    }
  };

  const openApproveDialog = (proposal) => {
    setTargetProposal(proposal);
    setApprovalNotes("");
    setApprovalLetterNumber("");
    setApprovalLetterDate(format(new Date(), "yyyy-MM-dd"));
    setApprovalSignedBy("");
    setSignerSearchTerm("");
    setDebouncedSignerSearchTerm("");
    setShowApprovalDialog(true);
  };
  const openRejectDialog  = (proposal) => { setTargetProposal(proposal); setRejectionReason(""); setShowRejectDialog(true); };
  const openForwardDialog = (proposal) => { setTargetProposal(proposal); setForwardNote(""); setShowForwardDialog(true); };

  const handleApproveSubmit = async () => {
    setSubmitting(true);
    try {
      await approveEmployeeProposal(targetProposal.id, targetProposal.leave_proposal_items, {
        notes: approvalNotes,
        letter_number: approvalLetterNumber,
        letter_date: approvalLetterDate || null,
        signed_by: approvalSignedBy,
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

  const handleDeleteProposal = async (proposal) => {
    const statusLabels = {
      pending: "usulan cuti yang masuk",
      rejected: "usulan cuti yang ditolak",
      processed: "usulan cuti yang siap dibuatkan surat",
    };
    const label = statusLabels[proposal.status] || "usulan cuti";

    if (!window.confirm(`Hapus ${label} "${proposal.proposal_title}"? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }

    await deleteProposal(proposal.id);
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

      // Jika usulan masih awaiting_letter atau approved, perbarui status menjadi letter_issued
      if (proposal.status === "awaiting_letter" || proposal.status === "approved") {
        await supabase
          .from("leave_proposals")
          .update({
            status: "letter_issued",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", proposal.id);
        await fetchProposals();
        toast({
          title: "Surat Berhasil Dicetak",
          description: "Usulan telah ditandai dengan status Surat Diterbitkan.",
        });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Gagal Generate Surat", description: err.message });
    }
  };

  const handleOpenCompleteDialog = (proposal) => {
    setTargetProposalForComplete(proposal);
    setCompleteDetails({
      letter_number: proposal.letter_number || "",
      letter_date: proposal.letter_date || format(new Date(), "yyyy-MM-dd"),
      signed_by: proposal.signed_by || "",
    });
    setShowCompleteDialog(true);
  };

  const handleConfirmComplete = async () => {
    if (!targetProposalForComplete) return;
    setSubmitting(true);
    try {
      await markProposalCompleted(targetProposalForComplete.id, completeDetails);
      setShowCompleteDialog(false);
      setTargetProposalForComplete(null);
    } catch (e) {
      console.error("Gagal menyelesaikan usulan:", e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenBatchDialog = async (proposal) => {
    setSelectedProposalForBatch(proposal);

    // Load letter details dari leave_proposals (disimpan saat approval)
    // dengan fallback ke leave_requests untuk data lama
    let fetchedLetterNumber = proposal.letter_number || "";
    let fetchedLetterDate = proposal.letter_date || format(new Date(), "yyyy-MM-dd");
    let fetchedSignedBy = proposal.signed_by || "";

    // Jika proposal belum punya signed_by (data lama sebelum kolom ditambah),
    // fallback query ke leave_requests
    if (!fetchedSignedBy) {
      try {
        const { data: leaveReqs } = await supabase
          .from("leave_requests")
          .select("leave_letter_number, leave_letter_date, signed_by")
          .eq("proposal_id", proposal.id)
          .limit(1);

        if (leaveReqs && leaveReqs.length > 0) {
          const lr = leaveReqs[0];
          if (!fetchedLetterNumber && lr.leave_letter_number) fetchedLetterNumber = lr.leave_letter_number;
          if (!fetchedLetterDate && lr.leave_letter_date) fetchedLetterDate = lr.leave_letter_date;
          if (lr.signed_by) fetchedSignedBy = lr.signed_by;
        }
      } catch (e) {
        console.warn("Could not fetch letter details from leave_requests:", e);
      }
    }

    setLetterDetails({
      letter_number: fetchedLetterNumber,
      letter_date: fetchedLetterDate,
      signed_by: fetchedSignedBy,
    });
    setSignerSearchTerm(fetchedSignedBy);
    setDebouncedSignerSearchTerm("");

    // Analyze and group leave requests by type
    const leaveTypeGroups = {};
    proposal.leave_proposal_items.forEach(item => {
      const leaveType = item.leave_type_name || "Jenis cuti tidak diketahui";
      if (!leaveTypeGroups[leaveType]) leaveTypeGroups[leaveType] = [];
      leaveTypeGroups[leaveType].push({
        id: item.id,
        proposal_id: item.proposal_id || proposal.id,
        employee_id: item.employee_id,
        employee_name: item.employee_name,
        employee_nip: item.employee_nip,
        employee_position: item.employee_position,
        employee_rank: item.employee_rank,
        leave_type_name: item.leave_type_name,
        leave_type_id: item.leave_type_id,
        start_date: item.start_date,
        end_date: item.end_date,
        days_requested: item.days_requested,
        reason: item.reason,
        address_during_leave: item.address_during_leave,
        leave_quota_year: item.leave_quota_year,
        application_form_date: item.application_form_date,
      });
    });

    setLeaveTypeClassification(leaveTypeGroups);

    const defaultSelection = {};
    Object.keys(leaveTypeGroups).forEach(lt => { defaultSelection[lt] = 'all'; });
    setSelectedEmployeeForLetter(defaultSelection);
    setShowLetterEdit(false);
    setShowBatchDialog(true);
  };

  const openCrossDateBatchDialog = () => {
    setLetterSearchTerm("");
    setDebouncedLetterSearchTerm("");
    setLetterItemsPage(1);
    setSelectedBatchItemIds(readyLetterItems.map((item) => item.id));
    setLetterDetails({
      letter_number: "",
      letter_date: format(new Date(), "yyyy-MM-dd"),
      signed_by: "",
    });
    setSignerSearchTerm("");
    setDebouncedSignerSearchTerm("");
  };

  const handleOpenSelectedBatchDialog = () => {
    const selectedItems = readyLetterItems.filter((item) => selectedBatchItemIds.includes(item.id));
    if (selectedItems.length === 0) {
      toast({
        title: "Pilih Data Cuti",
        description: "Pilih minimal satu data cuti pegawai untuk dibuatkan surat.",
        variant: "destructive",
      });
      return;
    }

    const syntheticProposal = {
      id: "batch-lintas-tanggal",
      proposal_title: "Batch lintas tanggal",
      created_at: new Date().toISOString(),
      leave_proposal_items: selectedItems,
    };
    handleOpenBatchDialog(syntheticProposal);
  };

  const updateGeneratedLetterDetails = async (items, details) => {
    const proposalIds = Array.from(new Set(items.map((item) => item.proposal_id).filter(Boolean)));

    for (const item of items) {
      const { data: existingRequest, error: existingErr } = await supabase
        .from("leave_requests")
        .select("id")
        .eq("proposal_id", item.proposal_id)
        .eq("employee_id", item.employee_id)
        .eq("leave_type_id", item.leave_type_id)
        .eq("start_date", item.start_date)
        .eq("end_date", item.end_date)
        .maybeSingle();
      if (existingErr) throw existingErr;

      if (existingRequest?.id) {
        const { error: requestUpdateErr } = await supabase
          .from("leave_requests")
          .update({
            leave_letter_number: details.letter_number,
            leave_letter_date: details.letter_date,
            signed_by: details.signed_by,
          })
          .eq("id", existingRequest.id);
        if (requestUpdateErr) throw requestUpdateErr;
      }

      const { error: itemUpdateErr } = await supabase
        .from("leave_proposal_items")
        .update({ status: "approved" })
        .eq("id", item.id);
      if (itemUpdateErr) throw itemUpdateErr;
    }

    if (proposalIds.length > 0) {
      const { error: proposalUpdateErr } = await supabase
        .from("leave_proposals")
        .update({
          letter_number: details.letter_number,
          letter_date: details.letter_date,
          signed_by: details.signed_by,
          status: "letter_issued",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in("id", proposalIds);
      if (proposalUpdateErr) throw proposalUpdateErr;
    }
  };

  const handleGenerateBatchLetter = async (leaveType, items, templateId = null, individualItemId = null) => {
    try {
      setGeneratingLetter(true);
      const normalizedLetterDetails = {
        letter_number: letterDetails.letter_number.trim(),
        letter_date: letterDetails.letter_date,
        signed_by: letterDetails.signed_by.trim(),
      };

      if (!normalizedLetterDetails.letter_number || !normalizedLetterDetails.letter_date || !normalizedLetterDetails.signed_by) {
        toast({
          title: "Lengkapi Detail Surat",
          description: "No. Surat Cuti, Tgl. Surat Cuti, dan Penandatangan wajib diisi sebelum generate surat.",
          variant: "destructive",
        });
        return;
      }

      // Check if we have a template
      if (!templateId && availableTemplates.length === 0) {
        toast({
          title: "Template Tidak Tersedia",
          description: "Tidak ada template DOCX yang tersedia. Periksa koneksi atau buat template terlebih dahulu.",
          variant: "destructive",
        });
        return;
      }

      // Use the first template if no specific template is selected
      const template = templateId
        ? availableTemplates.find(t => t.id === templateId)
        : availableTemplates[0];

      if (!template) {
        toast({
          title: "Template Tidak Ditemukan",
          description: "Template yang dipilih tidak ditemukan.",
          variant: "destructive",
        });
        return;
      }

      // Validate template has content
      if (!template.content && !template.template_data) {
        toast({
          title: "Template Tidak Valid",
          description: "Template tidak memiliki konten. Coba upload ulang template.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Info",
        description: `Sedang mempersiapkan surat batch untuk ${leaveType}...`,
      });

      // Use complete data for variables — filter to single employee if perorangan mode
      let completeItems = items;
      if (individualItemId && individualItemId !== 'all') {
        completeItems = items.filter(item => item.id === individualItemId);
        if (completeItems.length === 0) {
          // Fallback: search in original items array
          const found = items.find(item => item.id === individualItemId);
          if (found) completeItems = [found];
        }
      }
      if (completeItems.length === 0) {
        toast({
          title: "Data Cuti Kosong",
          description: "Tidak ada data cuti pegawai yang dipilih untuk dibuatkan surat.",
          variant: "destructive",
        });
        return;
      }

      // Prepare variables for template with complete data
      const variables = {
        // General information
        unit_kerja: currentUser?.department || "UNIT KERJA",
        jenis_cuti: leaveType,
        tanggal_usulan: format(new Date(selectedProposalForBatch.created_at), "dd MMMM yyyy", { locale: id }),
        tanggal_surat: format(new Date(normalizedLetterDetails.letter_date), "dd MMMM yyyy", { locale: id }),
        tanggal_surat_cuti: format(new Date(normalizedLetterDetails.letter_date), "dd MMMM yyyy", { locale: id }),
        jumlah_pegawai: completeItems.length,
        total_hari: completeItems.reduce((sum, item) => sum + (item.days_requested || 0), 0),
        tahun: new Date().getFullYear(),
        bulan: format(new Date(), "MMMM", { locale: id }),
        kota: "Jayapura", // Default city, can be configurable

        // Letter numbering
        nomor_surat: normalizedLetterDetails.letter_number,
        nomor_surat_cuti: normalizedLetterDetails.letter_number,
        penandatangan: normalizedLetterDetails.signed_by,

        // Missing variables that user reported as empty - FIXED
        tanggal_pelaksanaan_cuti: completeItems.length > 0
          ? `${format(new Date(completeItems[0].start_date), "dd MMMM yyyy", { locale: id })} s.d. ${format(new Date(completeItems[completeItems.length - 1].end_date), "dd MMMM yyyy", { locale: id })}`
          : "-",
        lamanya_cuti: `${completeItems.reduce((sum, item) => sum + (item.days_requested || 0), 0)} hari`,
        cuti_tahun: completeItems.length > 0 ? (completeItems[0].leave_quota_year || new Date().getFullYear()) : new Date().getFullYear(),
        alamat_cuti: completeItems.length > 0 ? (completeItems[0].address_during_leave || "-") : "-",
        formulir_pengajuan_cuti: completeItems.length > 0 && completeItems[0].application_form_date
          ? format(new Date(completeItems[0].application_form_date), "dd MMMM yyyy", { locale: id })
          : format(new Date(selectedProposalForBatch.created_at), "dd MMMM yyyy", { locale: id }),

        // USER REPORTED MISSING VARIABLES - ADDED:
        tanggal_formulir_pengajuan: completeItems.length > 0 && completeItems[0].application_form_date
          ? format(new Date(completeItems[0].application_form_date), "dd MMMM yyyy", { locale: id })
          : format(new Date(selectedProposalForBatch.created_at), "dd MMMM yyyy", { locale: id }),
        tanggal_cuti: completeItems.length > 0
          ? `${format(new Date(completeItems[0].start_date), "dd MMMM yyyy", { locale: id })} s.d. ${format(new Date(completeItems[completeItems.length - 1].end_date), "dd MMMM yyyy", { locale: id })}`
          : "-",
        jatah_cuti_tahun: completeItems.length > 0 ? (completeItems[0].leave_quota_year || new Date().getFullYear()) : new Date().getFullYear(),

        // Additional common template variables
        departemen: currentUser?.department || "UNIT KERJA",
        instansi: "Pemerintah Kota Jayapura", // Can be made configurable
        nama_kepala_instansi: "Kepala Dinas", // Can be made configurable
        jabatan_kepala_instansi: "Kepala Dinas", // Can be made configurable

        // Additional comprehensive variables for complete coverage
        total_pegawai_asn: completeItems.length,
        total_pegawai_non_asn: 0,
        rata_rata_hari_cuti: completeItems.length > 0 ? Math.round(completeItems.reduce((sum, item) => sum + (item.days_requested || 0), 0) / completeItems.length) : 0,

        // ---------------------------------------------------------------
        // Variabel flat individu dari pegawai pertama (digunakan oleh
        // template yang hanya punya {nama}, {nip}, {jabatan}, dsb.)
        // Pada mode batch, ini berisi data pegawai pertama.
        // Pada mode perorangan, ini berisi data pegawai yang dipilih.
        // ---------------------------------------------------------------
        nama: completeItems[0]?.employee_name || "-",
        nama_pegawai: completeItems[0]?.employee_name || "-",
        nip: completeItems[0]?.employee_nip || "-",
        jabatan: completeItems[0]?.employee_position || "-",
        pangkat_golongan: completeItems[0]?.employee_rank || "-",
        status_asn: "ASN",
        tanggal_mulai: completeItems[0]?.start_date ? format(new Date(completeItems[0].start_date), "dd/MM/yyyy") : "-",
        tanggal_selesai: completeItems[0]?.end_date ? format(new Date(completeItems[0].end_date), "dd/MM/yyyy") : "-",
        tanggal_mulai_lengkap: completeItems[0]?.start_date ? format(new Date(completeItems[0].start_date), "dd MMMM yyyy", { locale: id }) : "-",
        tanggal_selesai_lengkap: completeItems[0]?.end_date ? format(new Date(completeItems[0].end_date), "dd MMMM yyyy", { locale: id }) : "-",
        jumlah_hari: completeItems[0]?.days_requested || 0,
        lama_cuti: `${completeItems[0]?.days_requested || 0} hari`,
        alasan: completeItems[0]?.reason || "-",
        alamat_selama_cuti: completeItems[0]?.address_during_leave || "-",
        tempat_alamat_cuti: completeItems[0]?.address_during_leave || "-",
        periode_cuti: completeItems[0]?.start_date && completeItems[0]?.end_date
          ? `${format(new Date(completeItems[0].start_date), "dd/MM/yyyy")} - ${format(new Date(completeItems[0].end_date), "dd/MM/yyyy")}`
          : "-",
        durasi_hari_terbilang: numberToWords(completeItems[0]?.days_requested || 0),
        // Variabel atasan (umumnya di template individu)
        nama_atasan: "-",
        nip_atasan: "-",
        jabatan_atasan: "-",

        // Employee list variables for table/loop processing
        pegawai_list: completeItems.map((item, index) => ({
          no: index + 1,
          nama: item.employee_name || "Nama tidak diketahui",
          nama_pegawai: item.employee_name || "Nama tidak diketahui",
          nip: item.employee_nip || "-",
          jabatan: item.employee_position || "-",
          departemen: currentUser?.department || "UNIT KERJA",
          unit_kerja: currentUser?.department || "UNIT KERJA",
          pangkat_golongan: item.employee_rank || "-",
          status_asn: "ASN",
          jenis_cuti: item.leave_type_name || leaveType,
          tanggal_mulai: format(new Date(item.start_date), "dd/MM/yyyy"),
          tanggal_selesai: format(new Date(item.end_date), "dd/MM/yyyy"),
          tanggal_mulai_lengkap: format(new Date(item.start_date), "dd MMMM yyyy", { locale: id }),
          tanggal_selesai_lengkap: format(new Date(item.end_date), "dd MMMM yyyy", { locale: id }),
          tanggal_pelaksanaan_cuti: `${format(new Date(item.start_date), "dd MMMM yyyy", { locale: id })} s.d. ${format(new Date(item.end_date), "dd MMMM yyyy", { locale: id })}`,
          periode_cuti: `${format(new Date(item.start_date), "dd/MM/yyyy")} - ${format(new Date(item.end_date), "dd/MM/yyyy")}`,
          jumlah_hari: item.days_requested || 0,
          lama_cuti: `${item.days_requested || 0} hari`,
          lamanya_cuti: `${item.days_requested || 0} hari`,
          alasan: item.reason || "-",
          alamat_cuti: item.address_during_leave || "-",
          alamat_selama_cuti: item.address_during_leave || "-",
          tempat_alamat_cuti: item.address_during_leave || "-",
          tahun_quota: item.leave_quota_year || new Date().getFullYear(),
          cuti_tahun: item.leave_quota_year || new Date().getFullYear(),
          tanggal_formulir: item.application_form_date ? format(new Date(item.application_form_date), "dd MMMM yyyy", { locale: id }) : "-",
          formulir_pengajuan_cuti: item.application_form_date ? format(new Date(item.application_form_date), "dd MMMM yyyy", { locale: id }) : "-",
          nomor_surat_cuti: normalizedLetterDetails.letter_number,
          tanggal_surat_cuti: format(new Date(normalizedLetterDetails.letter_date), "dd MMMM yyyy", { locale: id }),
          penandatangan: normalizedLetterDetails.signed_by,
          // Additional comprehensive variables
          durasi_hari_terbilang: numberToWords(item.days_requested || 0),
          nomor_surat_referensi: selectedProposalForBatch.id || "-"
        }))
      };

      // Create indexed variables for template loops with complete data
      completeItems.forEach((item, index) => {
        const num = index + 1;
        variables[`nama_${num}`] = item.employee_name || "Nama tidak diketahui";
        variables[`nip_${num}`] = item.employee_nip || "-";
        variables[`jabatan_${num}`] = item.employee_position || "-";
        variables[`pangkat_golongan_${num}`] = item.employee_rank || "-";
        variables[`departemen_${num}`] = currentUser?.department || "UNIT KERJA";
        variables[`unit_kerja_${num}`] = currentUser?.department || "UNIT KERJA";
        variables[`jenis_cuti_${num}`] = item.leave_type_name || leaveType;
        variables[`tanggal_mulai_${num}`] = format(new Date(item.start_date), "dd/MM/yyyy");
        variables[`tanggal_selesai_${num}`] = format(new Date(item.end_date), "dd/MM/yyyy");
        variables[`tanggal_mulai_lengkap_${num}`] = format(new Date(item.start_date), "dd MMMM yyyy", { locale: id });
        variables[`tanggal_selesai_lengkap_${num}`] = format(new Date(item.end_date), "dd MMMM yyyy", { locale: id });
        variables[`tanggal_pelaksanaan_cuti_${num}`] = `${format(new Date(item.start_date), "dd MMMM yyyy", { locale: id })} s.d. ${format(new Date(item.end_date), "dd MMMM yyyy", { locale: id })}`;
        variables[`jumlah_hari_${num}`] = item.days_requested || 0;
        variables[`lama_cuti_${num}`] = `${item.days_requested || 0} hari`;
        variables[`lamanya_cuti_${num}`] = `${item.days_requested || 0} hari`;
        variables[`alasan_${num}`] = item.reason || "-";
        variables[`alamat_cuti_${num}`] = item.address_during_leave || "-";
        variables[`alamat_selama_cuti_${num}`] = item.address_during_leave || "-";
        variables[`tahun_quota_${num}`] = item.leave_quota_year || new Date().getFullYear();
        variables[`cuti_tahun_${num}`] = item.leave_quota_year || new Date().getFullYear();
        variables[`tanggal_formulir_${num}`] = item.application_form_date ? format(new Date(item.application_form_date), "dd MMMM yyyy", { locale: id }) : "-";
        variables[`formulir_pengajuan_cuti_${num}`] = item.application_form_date ? format(new Date(item.application_form_date), "dd MMMM yyyy", { locale: id }) : "-";

        // USER REPORTED MISSING VARIABLES - ADDED FOR INDEXED:
        variables[`tanggal_formulir_pengajuan_${num}`] = item.application_form_date ? format(new Date(item.application_form_date), "dd MMMM yyyy", { locale: id }) : "-";
        variables[`tanggal_cuti_${num}`] = `${format(new Date(item.start_date), "dd MMMM yyyy", { locale: id })} s.d. ${format(new Date(item.end_date), "dd MMMM yyyy", { locale: id })}`;
        variables[`jatah_cuti_tahun_${num}`] = item.leave_quota_year || new Date().getFullYear();

        // Additional variations for common template patterns
        variables[`nama_pegawai_${num}`] = item.employee_name || "Nama tidak diketahui";
        variables[`tempat_alamat_cuti_${num}`] = item.address_during_leave || "-";
        variables[`periode_cuti_${num}`] = `${format(new Date(item.start_date), "dd/MM/yyyy")} - ${format(new Date(item.end_date), "dd/MM/yyyy")}`;
        // Additional indexed variables for complete coverage
        variables[`durasi_hari_terbilang_${num}`] = numberToWords(item.days_requested || 0);
        variables[`nomor_surat_referensi_${num}`] = selectedProposalForBatch.id || "-";
        variables[`status_asn_${num}`] = "ASN";
        variables[`nomor_surat_cuti_${num}`] = normalizedLetterDetails.letter_number;
        variables[`tanggal_surat_cuti_${num}`] = format(new Date(normalizedLetterDetails.letter_date), "dd MMMM yyyy", { locale: id });
        variables[`penandatangan_${num}`] = normalizedLetterDetails.signed_by;
      });

      // =====================================================================
      // BRIDGE MAPPING: Sinkronisasi variabel flat ↔ bertingkat
      //
      // Tujuan: template yang menggunakan {nama} (individu) akan tetap
      // terisi meskipun pembuatan surat batch; dan template yang menggunakan
      // {nama_1} (batch) akan tetap terisi meskipun mode perorangan.
      // =====================================================================

      // Daftar nama variabel per-pegawai yang perlu di-bridge
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
        'nomor_surat_cuti', 'tanggal_surat_cuti', 'penandatangan',
      ];

      // 1. Dari variabel _1 → isi variabel flat (jika flat belum ada atau kosong)
      //    Berguna agar template individu ({nama}) terisi dari data indexed pertama
      EMPLOYEE_VAR_KEYS.forEach((key) => {
        const indexedVal = variables[`${key}_1`];
        if (indexedVal !== undefined && indexedVal !== null) {
          if (variables[key] === undefined || variables[key] === null || variables[key] === '') {
            variables[key] = indexedVal;
          }
        }
      });

      // 2. Dari variabel flat → isi _1, _2, dst. jika kosong
      //    Berguna agar template batch ({nama_1}) terisi dari variabel flat
      //    terutama pada mode individu di mana hanya ada 1 pegawai
      EMPLOYEE_VAR_KEYS.forEach((key) => {
        const flatVal = variables[key];
        if (flatVal !== undefined && flatVal !== null) {
          // Pastikan _1 selalu terisi
          if (variables[`${key}_1`] === undefined || variables[`${key}_1`] === null || variables[`${key}_1`] === '') {
            variables[`${key}_1`] = flatVal;
          }
        }
      });

      // 3. Khusus mode perorangan: tambahkan alias variabel bertingkat _1 hingga _5
      //    agar template dengan {nama_1}, {nip_1} dsb. tetap terisi walaupun hanya 1 pegawai
      const _isIndividualMode = individualItemId && individualItemId !== 'all';
      if (_isIndividualMode && completeItems.length === 1) {
        // _1 sudah dihandle di atas, tambahkan _2 - _5 sebagai empty string agar tidak error
        for (let n = 2; n <= 5; n++) {
          EMPLOYEE_VAR_KEYS.forEach((key) => {
            if (variables[`${key}_${n}`] === undefined) {
              variables[`${key}_${n}`] = '';
            }
          });
        }
      }

      console.log("Bridge mapping selesai. Contoh variabel individu:");
      console.log("  nama:", variables.nama);
      console.log("  nip:", variables.nip);
      console.log("  jabatan:", variables.jabatan);

      // Generate the document
      const blob = await processDocxTemplate(template, variables);
      
      // Create filename
      const filename = `${leaveType.toUpperCase().replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.docx`;
      
      // Download the file
      saveAs(blob, filename);
      await updateGeneratedLetterDetails(completeItems, normalizedLetterDetails);
      
      toast({
        title: "Berhasil",
        description: `Surat ${leaveType} berhasil dibuat dan detail cuti ${completeItems.length} pegawai sudah diperbarui.`,
      });
      await fetchProposals();
      
    } catch (error) {
      console.error("Error generating batch letter:", error);
      toast({
        title: "Gagal Generate Surat",
        description: "Terjadi kesalahan saat membuat surat: " + safeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setGeneratingLetter(false);
    }
  };

  // Helper for safe error message
  const safeErrorMessage = (error) => {
    if (typeof error === 'string') return error;
    if (error?.message) return error.message;
    if (error?.error_description) return error.error_description;
    return String(error);
  };

  // Filter proposals based on active tab and subfilters
  const displayProposals = proposals.filter((p) => {
    const isOwn = String(p.proposed_by) === String(currentUser?.id) || (currentUser?.employee_id && String(p.proposed_by) === String(currentUser.employee_id));
    if (isEmployee) return isOwn;
    if (activeTab === "my-proposals") return isOwn;
    if (activeTab === "create-letters") {
      if (createLetterSubFilter === "pending_letter") {
        return p.status === "awaiting_letter" || p.status === "approved";
      } else if (createLetterSubFilter === "completed_letter") {
        return p.status === "letter_issued" || p.status === "completed" || p.status === "processed";
      }
      return canGenerateLetter(p.status) || p.status === "completed";
    }
    // employee-approvals: proposals from employees in this unit (not created by admin themselves)
    const userDept = (currentUser?.department || "").trim().toLowerCase();
    const propUnit = (p.proposer_unit || "").trim().toLowerCase();
    const isSameUnit = propUnit && userDept ? propUnit === userDept : (!userDept || p.proposer_unit === currentUser?.department);
    return !isOwn && isSameUnit;
  });

  // Filter with debounced search term and status filter
  const filteredProposals = displayProposals.filter((p) => {
    if (activeTab !== "create-letters" && statusFilter !== "all" && p.status !== statusFilter) {
      return false;
    }
    const term = debouncedProposalSearchTerm.trim().toLowerCase();
    if (!term) return true;
    return [
      p.proposal_title,
      p.proposer_name,
      p.letter_number,
      p.notes,
      p.status,
      ...(p.leave_proposal_items || []).flatMap(item => [item.employee_name, item.employee_nip, item.leave_type_name, item.reason])
    ].some(v => String(v || "").toLowerCase().includes(term));
  });

  const totalProposalPages = Math.max(1, Math.ceil(filteredProposals.length / PROPOSALS_PER_PAGE));
  const currentProposalPage = Math.min(proposalPage, totalProposalPages);
  const paginatedProposals = filteredProposals.slice(
    (currentProposalPage - 1) * PROPOSALS_PER_PAGE,
    currentProposalPage * PROPOSALS_PER_PAGE
  );

  const readyLetterItems = displayProposals.flatMap((proposal) =>
    (proposal.leave_proposal_items || []).map((item) => ({
      ...item,
      proposal_id: item.proposal_id || proposal.id,
      proposal_title: proposal.proposal_title,
      proposal_date: proposal.proposal_date,
      approved_date: proposal.approved_date,
      created_at: proposal.created_at,
    }))
  );

  const filteredReadyLetterItems = readyLetterItems.filter((item) => {
    const search = debouncedLetterSearchTerm.trim().toLowerCase();
    if (!search) return true;
    return [
      item.employee_name,
      item.employee_nip,
      item.leave_type_name,
      item.proposal_title,
      item.reason,
    ].some((value) => String(value || "").toLowerCase().includes(search));
  });

  const totalLetterItemPages = Math.max(1, Math.ceil(filteredReadyLetterItems.length / LETTER_ITEMS_PER_PAGE));
  const currentLetterItemsPage = Math.min(letterItemsPage, totalLetterItemPages);
  const paginatedReadyLetterItems = filteredReadyLetterItems.slice(
    (currentLetterItemsPage - 1) * LETTER_ITEMS_PER_PAGE,
    currentLetterItemsPage * LETTER_ITEMS_PER_PAGE
  );

  const pendingEmployeeCount = proposals.filter(p => {
    const isOwn = String(p.proposed_by) === String(currentUser?.id) || (currentUser?.employee_id && String(p.proposed_by) === String(currentUser.employee_id));
    const userDept = (currentUser?.department || "").trim().toLowerCase();
    const propUnit = (p.proposer_unit || "").trim().toLowerCase();
    const isSameUnit = propUnit && userDept ? propUnit === userDept : (!userDept || p.proposer_unit === currentUser?.department);
    return !isOwn && isSameUnit && p.status === 'pending';
  }).length;

  const readyForLettersCount = proposals.filter(p => p.status === 'awaiting_letter' || p.status === 'approved').length;
  const completedLettersCount = proposals.filter(p => p.status === 'letter_issued' || p.status === 'completed' || p.status === 'processed').length;

  const groupedLetterProposals = paginatedProposals.reduce((groups, proposal) => {
    const rawDate = proposal.approved_date || proposal.proposal_date || proposal.created_at;
    let dateKey = "tanpa-tanggal";
    let validDate = new Date();
    if (rawDate) {
      const parsed = new Date(rawDate);
      if (!isNaN(parsed.getTime())) {
        validDate = parsed;
        dateKey = format(parsed, "yyyy-MM-dd");
      }
    }
    if (!groups[dateKey]) {
      groups[dateKey] = {
        date: validDate,
        proposals: [],
      };
    }
    groups[dateKey].proposals.push(proposal);
    return groups;
  }, {});

  const letterProposalGroups = Object.entries(groupedLetterProposals)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, group]) => ({ dateKey, ...group }));

  if (showCreateForm) {
    return (
      <div className="p-6">
        {isEmployee ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setEditingProposal(null);
                }}
                className="text-slate-400 hover:text-white text-sm flex items-center gap-1"
              >
                ← Kembali
              </button>
              <h2 className="text-xl font-bold text-white">
                {editingProposal ? "Edit Pengajuan Cuti" : "Form Pengajuan Cuti"}
              </h2>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
              <EmployeeLeaveRequestForm
                onSubmit={handleCreateProposal}
                onCancel={() => {
                  setShowCreateForm(false);
                  setEditingProposal(null);
                }}
                initialData={editingProposal}
              />
            </div>
          </div>
        ) : (
          <LeaveProposalForm
            onSubmit={handleCreateProposal}
            onCancel={() => {
              setShowCreateForm(false);
              setEditingProposal(null);
            }}
            initialData={editingProposal}
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
            { key: "create-letters", label: "Buat Surat Keterangan", badge: readyForLettersCount },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setProposalPage(1);
                setLetterItemsPage(1);
              }}
              className={`pb-3 font-semibold text-sm transition-all relative flex items-center gap-2 ${activeTab === tab.key ? "text-blue-400" : "text-slate-400 hover:text-white"}`}
            >
              {tab.label}
              {tab.badge > 0 && (
                <span className="bg-purple-500 text-slate-900 w-5 h-5 rounded-full text-xs flex items-center justify-center">{tab.badge}</span>
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
                : activeTab === "create-letters" ? "Daftar Pengajuan Siap Buat Surat"
                : "Daftar Pengajuan Cuti Pegawai"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Search and Filters Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  value={proposalSearchTerm}
                  onChange={(e) => setProposalSearchTerm(e.target.value)}
                  placeholder="Cari judul, nama pegawai, NIP, no. surat, atau alasan..."
                  className="pl-9 bg-slate-700/50 border-slate-600/50 text-white placeholder:text-slate-400"
                />
              </div>
              <div className="flex items-center gap-2">
                {activeTab !== "create-letters" ? (
                  <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setProposalPage(1); }}>
                    <SelectTrigger className="w-[180px] bg-slate-700/50 border-slate-600/50 text-white">
                      <SelectValue placeholder="Semua Status" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-white">
                      <SelectItem value="all">Semua Status</SelectItem>
                      <SelectItem value="pending">Menunggu</SelectItem>
                      <SelectItem value="awaiting_letter">Menunggu Surat</SelectItem>
                      <SelectItem value="letter_issued">Surat Diterbitkan</SelectItem>
                      <SelectItem value="completed">Selesai</SelectItem>
                      <SelectItem value="forwarded">Diteruskan</SelectItem>
                      <SelectItem value="rejected">Ditolak</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex bg-slate-900/60 p-1 rounded-lg border border-slate-700/50 text-xs">
                    <button
                      type="button"
                      onClick={() => { setCreateLetterSubFilter("pending_letter"); setProposalPage(1); }}
                      className={`px-3 py-1.5 rounded-md font-medium transition-all ${createLetterSubFilter === 'pending_letter' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                      Menunggu Surat ({readyForLettersCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => { setCreateLetterSubFilter("completed_letter"); setProposalPage(1); }}
                      className={`px-3 py-1.5 rounded-md font-medium transition-all ${createLetterSubFilter === 'completed_letter' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                      Sudah Selesai / Terbit ({completedLettersCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => { setCreateLetterSubFilter("all"); setProposalPage(1); }}
                      className={`px-3 py-1.5 rounded-md font-medium transition-all ${createLetterSubFilter === 'all' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                      Semua
                    </button>
                  </div>
                )}
              </div>
            </div>

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
                    : activeTab === "create-letters" ? "Belum ada pengajuan yang siap dibuatkan surat keterangan."
                    : "Belum ada pegawai yang mengajukan cuti."}
                </p>
              </div>
            ) : filteredProposals.length === 0 ? (
              <div className="text-center py-8">
                <Search className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-medium mb-1">Tidak Ada Data Ditemukan</h3>
                <p className="text-slate-400 text-sm">Tidak ada usulan cuti yang cocok dengan filter atau kata kunci pencarian.</p>
              </div>
            ) : activeTab === "create-letters" ? (
              <div className="space-y-5">
                <div className="rounded-lg border border-slate-600/50 bg-slate-900/30 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-1">
                      <h3 className="font-semibold text-white">Buat Surat Keterangan Batch</h3>
                      <p className="text-sm text-slate-400">
                        Pilih data cuti lintas tanggal pengajuan, lalu buat surat batch dari data terpilih.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={openCrossDateBatchDialog}
                        className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
                      >
                        Pilih Semua
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setSelectedBatchItemIds([])}
                        className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
                      >
                        Bersihkan
                      </Button>
                      <Button
                        onClick={handleOpenSelectedBatchDialog}
                        className="bg-purple-600 hover:bg-purple-700"
                        disabled={selectedBatchItemIds.length === 0}
                      >
                        <Layers className="w-4 h-4 mr-2" />
                        Buat Surat Batch Terpilih ({selectedBatchItemIds.length})
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4">
                    <Label className="text-slate-300">Cari Data Cuti</Label>
                    <Input
                      value={letterSearchTerm}
                      onChange={(event) => setLetterSearchTerm(event.target.value)}
                      placeholder="Cari nama, NIP, jenis cuti, alasan, atau judul pengajuan..."
                      className="mt-1 bg-slate-700/50 border-slate-600/50 text-white"
                    />
                  </div>
                  <div className="mt-4 max-h-72 overflow-y-auto rounded-lg border border-slate-700/50">
                    {filteredReadyLetterItems.length === 0 ? (
                      <div className="p-4 text-sm text-slate-400">Tidak ada data cuti yang cocok dengan pencarian.</div>
                    ) : (
                      <div className="divide-y divide-slate-700/50">
                        {paginatedReadyLetterItems.map((item) => {
                          const checked = selectedBatchItemIds.includes(item.id);
                          return (
                            <label key={item.id} className="flex cursor-pointer items-start gap-3 p-3 hover:bg-slate-800/50">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => {
                                  setSelectedBatchItemIds((prev) => event.target.checked
                                    ? Array.from(new Set([...prev, item.id]))
                                    : prev.filter((id) => id !== item.id));
                                }}
                                className="mt-1 h-4 w-4"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-white">{item.employee_name}</span>
                                  <span className="text-xs text-slate-400">{item.employee_nip}</span>
                                  <Badge className="bg-purple-500/20 text-purple-200 border border-purple-500/30">
                                    {item.leave_type_name || "Jenis cuti"}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-xs text-slate-400">
                                  {safeFormatDate(item.start_date, "dd MMM yyyy")} - {safeFormatDate(item.end_date, "dd MMM yyyy")}
                                  {" "}• {item.days_requested || 0} hari
                                  {" "}• Pengajuan: {safeFormatDate(item.approved_date || item.proposal_date || item.created_at, "dd MMM yyyy")}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {filteredReadyLetterItems.length > LETTER_ITEMS_PER_PAGE && (
                    <div className="mt-3 flex flex-col gap-2 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                      <span>
                        Menampilkan {(currentLetterItemsPage - 1) * LETTER_ITEMS_PER_PAGE + 1} - {Math.min(currentLetterItemsPage * LETTER_ITEMS_PER_PAGE, filteredReadyLetterItems.length)} dari {filteredReadyLetterItems.length} data
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLetterItemsPage((page) => Math.max(1, page - 1))}
                          disabled={currentLetterItemsPage === 1}
                          className="border-slate-600 text-slate-300 hover:bg-slate-700"
                        >
                          Sebelumnya
                        </Button>
                        <span className="text-slate-300">{currentLetterItemsPage} / {totalLetterItemPages}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLetterItemsPage((page) => Math.min(totalLetterItemPages, page + 1))}
                          disabled={currentLetterItemsPage === totalLetterItemPages}
                          className="border-slate-600 text-slate-300 hover:bg-slate-700"
                        >
                          Berikutnya
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                {letterProposalGroups.map((group) => {
                  const totalEmployees = group.proposals.reduce((sum, proposal) => sum + (proposal.total_employees || 0), 0);
                  return (
                    <div key={group.dateKey} className="space-y-3">
                      <div className="flex flex-col gap-2 rounded-lg border border-slate-600/50 bg-slate-700/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-white font-semibold">
                            {safeFormatDate(group.date, "dd MMMM yyyy")}
                          </h3>
                          <p className="text-sm text-slate-400">
                            {group.proposals.length} pengajuan siap dibuatkan surat
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">{totalEmployees} pegawai</Badge>
                          <Badge className="bg-purple-500/20 text-purple-200 border border-purple-500/30">
                            Siap surat
                          </Badge>
                        </div>
                      </div>
                      <div className="space-y-3">
                        {group.proposals.map((proposal) => (
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
                            onCreateLetter={handleOpenBatchDialog}
                            onMarkComplete={handleOpenCompleteDialog}
                            onEdit={(proposal) => {
                              setEditingProposal(proposal);
                              setShowCreateForm(true);
                            }}
                            onDelete={handleDeleteProposal}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Pagination for create-letters */}
                {filteredProposals.length > PROPOSALS_PER_PAGE && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-700/50 text-sm text-slate-400">
                    <span>
                      Menampilkan {(currentProposalPage - 1) * PROPOSALS_PER_PAGE + 1} - {Math.min(currentProposalPage * PROPOSALS_PER_PAGE, filteredProposals.length)} dari {filteredProposals.length} usulan
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setProposalPage(p => Math.max(1, p - 1))}
                        disabled={currentProposalPage === 1}
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      >
                        Sebelumnya
                      </Button>
                      <span className="text-slate-300 font-medium px-2">
                        {currentProposalPage} / {totalProposalPages}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setProposalPage(p => Math.min(totalProposalPages, p + 1))}
                        disabled={currentProposalPage === totalProposalPages}
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      >
                        Berikutnya
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {paginatedProposals.map((proposal) => (
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
                    onCreateLetter={handleOpenBatchDialog}
                    onMarkComplete={handleOpenCompleteDialog}
                    onEdit={(proposal) => {
                      setEditingProposal(proposal);
                      setShowCreateForm(true);
                    }}
                    onDelete={handleDeleteProposal}
                  />
                ))}

                {/* Pagination for standard tabs */}
                {filteredProposals.length > PROPOSALS_PER_PAGE && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-700/50 text-sm text-slate-400">
                    <span>
                      Menampilkan {(currentProposalPage - 1) * PROPOSALS_PER_PAGE + 1} - {Math.min(currentProposalPage * PROPOSALS_PER_PAGE, filteredProposals.length)} dari {filteredProposals.length} usulan
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setProposalPage(p => Math.max(1, p - 1))}
                        disabled={currentProposalPage === 1}
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      >
                        Sebelumnya
                      </Button>
                      <span className="text-slate-300 font-medium px-2">
                        {currentProposalPage} / {totalProposalPages}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setProposalPage(p => Math.min(totalProposalPages, p + 1))}
                        disabled={currentProposalPage === totalProposalPages}
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      >
                        Berikutnya
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* === Approve Dialog === */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Setujui Pengajuan Cuti</DialogTitle>
            <DialogDescription className="text-slate-400">
              Pengajuan yang disetujui akan masuk ke tab Buat Surat Keterangan untuk dibuat secara batch atau perorangan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-slate-300">No. Surat Cuti</Label>
                <Input
                  value={approvalLetterNumber}
                  onChange={e => setApprovalLetterNumber(e.target.value)}
                  placeholder="Contoh: 800/123/BKD/2026"
                  className="bg-slate-700/50 border-slate-600/50 mt-1 text-white placeholder:text-slate-500"
                />
              </div>
              <div>
                <Label className="text-slate-300">Tgl. Surat Cuti</Label>
                <Input
                  type="date"
                  value={approvalLetterDate}
                  onChange={e => setApprovalLetterDate(e.target.value)}
                  className="bg-slate-700/50 border-slate-600/50 mt-1 text-white"
                />
              </div>
            </div>
            <div>
              <Label className="text-slate-300">Penandatangan</Label>
              <Input
                value={signerSearchTerm}
                onChange={e => {
                  setSignerSearchTerm(e.target.value);
                  setDebouncedSignerSearchTerm(e.target.value);
                  setApprovalSignedBy(e.target.value);
                }}
                placeholder="Cari nama atau NIP pegawai..."
                className="bg-slate-700/50 border-slate-600/50 mt-1 text-white placeholder:text-slate-500"
              />
              {signerSearchTerm && (
                <div className="mt-1 max-h-36 overflow-y-auto rounded-md border border-slate-700/50 bg-slate-900/60">
                  {loadingSigners ? (
                    <div className="px-3 py-2 text-sm text-slate-400">Mencari...</div>
                  ) : signerOptions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-400">Tidak ada pegawai ditemukan.</div>
                  ) : (
                    signerOptions.slice(0, 8).map((emp) => (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => {
                          setApprovalSignedBy(emp.name || "");
                          setSignerSearchTerm(emp.name || "");
                          setDebouncedSignerSearchTerm("");
                        }}
                        className="block w-full border-b border-slate-700/40 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-700/60"
                      >
                        <span className="block font-medium text-white">{emp.name}</span>
                        <span className="text-xs text-slate-400">{emp.nip || "-"} • {emp.position_name || "-"}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <div>
              <Label className="text-slate-300">Catatan (Opsional)</Label>
              <Textarea
                value={approvalNotes}
                onChange={e => setApprovalNotes(e.target.value)}
                placeholder="Catatan persetujuan untuk pengajuan ini..."
                rows={2}
                className="bg-slate-700/50 border-slate-600/50 mt-1 text-white placeholder:text-slate-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-700/50">
            <Button variant="outline" onClick={() => setShowApprovalDialog(false)} className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600">Batal</Button>
            <Button onClick={handleApproveSubmit} disabled={submitting} className="bg-green-600 hover:bg-green-700">
              <Check className="w-4 h-4 mr-2" />
              {submitting ? "Memproses..." : "Setujui"}
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

      {/* === Complete Proposal Dialog === */}
      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Tandai Usulan Cuti Selesai</DialogTitle>
            <DialogDescription className="text-slate-400">
              Usulan yang ditandai selesai memastikan surat cuti telah dibuat/dicetak dan data akan termuat penuh di menu Riwayat Cuti.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-slate-300">Nomor Surat Cuti</Label>
                <Input
                  value={completeDetails.letter_number}
                  onChange={e => setCompleteDetails(prev => ({ ...prev, letter_number: e.target.value }))}
                  placeholder="Contoh: 800/123/BKD/2026"
                  className="bg-slate-700/50 border-slate-600/50 mt-1 text-white placeholder:text-slate-500"
                />
              </div>
              <div>
                <Label className="text-slate-300">Tanggal Surat Cuti</Label>
                <Input
                  type="date"
                  value={completeDetails.letter_date}
                  onChange={e => setCompleteDetails(prev => ({ ...prev, letter_date: e.target.value }))}
                  className="bg-slate-700/50 border-slate-600/50 mt-1 text-white"
                />
              </div>
            </div>
            <div>
              <Label className="text-slate-300">Pejabat Penandatangan</Label>
              <Input
                value={completeDetails.signed_by}
                onChange={e => setCompleteDetails(prev => ({ ...prev, signed_by: e.target.value }))}
                placeholder="Nama pejabat penandatangan surat..."
                className="bg-slate-700/50 border-slate-600/50 mt-1 text-white placeholder:text-slate-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-700/50">
            <Button variant="outline" onClick={() => setShowCompleteDialog(false)} className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600">
              Batal
            </Button>
            <Button onClick={handleConfirmComplete} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <CheckCircle className="w-4 h-4 mr-2" />
              {submitting ? "Menyimpan..." : "Konfirmasi Selesai"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* === Batch Letter Dialog === */}
      <Dialog open={showBatchDialog} onOpenChange={setShowBatchDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Buat Surat Keterangan Cuti</DialogTitle>
            <DialogDescription className="text-slate-400">
              Pilih jenis cuti dan opsi pembuatan surat (batch atau perorangan).
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Template Selection */}
            <div>
              <Label className="text-slate-300">Pilih Template Surat</Label>
              {loadingTemplates ? (
                <div className="text-sm text-slate-400 mt-2">Memuat template...</div>
              ) : availableTemplates.length === 0 ? (
                <div className="text-sm text-amber-400 mt-2">⚠️ Belum ada template surat. Silakan buat template terlebih dahulu di halaman Surat Keterangan.</div>
              ) : (
                <select 
                  value={selectedTemplate?.id || availableTemplates[0]?.id} 
                  onChange={(e) => setSelectedTemplate(availableTemplates.find(t => t.id === e.target.value))}
                  className="w-full mt-2 bg-slate-700/50 border border-slate-600/50 rounded-md p-2 text-white focus:outline-none"
                >
                  {availableTemplates.map((template) => (
                    <option key={template.id} value={template.id} className="bg-slate-800">
                      {template.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Letter Details - auto-populated from approval phase */}
            <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <Label className="text-slate-200 font-medium">Detail Surat (diisi saat persetujuan)</Label>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLetterEdit(prev => !prev)}
                  className="text-xs px-2 py-1 rounded bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 transition-colors"
                >
                  {showLetterEdit ? "Tutup" : "Edit"}
                </button>
              </div>

              {!showLetterEdit ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-slate-800/50 rounded-md px-3 py-2">
                    <p className="text-xs text-slate-400 mb-1">No. Surat Cuti</p>
                    <p className="text-sm text-white font-medium">{letterDetails.letter_number || <span className="text-amber-400 italic">Belum diisi</span>}</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-md px-3 py-2">
                    <p className="text-xs text-slate-400 mb-1">Tgl. Surat Cuti</p>
                    <p className="text-sm text-white font-medium">
                      {letterDetails.letter_date 
                        ? format(new Date(letterDetails.letter_date), "dd MMMM yyyy", { locale: id }) 
                        : <span className="text-amber-400 italic">Belum diisi</span>}
                    </p>
                  </div>
                  <div className="bg-slate-800/50 rounded-md px-3 py-2">
                    <p className="text-xs text-slate-400 mb-1">Penandatangan</p>
                    <p className="text-sm text-white font-medium">{letterDetails.signed_by || <span className="text-amber-400 italic">Belum diisi</span>}</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-slate-300">No. Surat Cuti *</Label>
                    <Input
                      value={letterDetails.letter_number}
                      onChange={(event) => setLetterDetails((prev) => ({ ...prev, letter_number: event.target.value }))}
                      placeholder="Nomor surat cuti"
                      className="mt-1 bg-slate-700/50 border-slate-600/50 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300">Tgl. Surat Cuti *</Label>
                    <Input
                      type="date"
                      value={letterDetails.letter_date}
                      onChange={(event) => setLetterDetails((prev) => ({ ...prev, letter_date: event.target.value }))}
                      className="mt-1 bg-slate-700/50 border-slate-600/50 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300">Penandatangan *</Label>
                    <Input
                      value={signerSearchTerm}
                      onChange={(event) => {
                        setSignerSearchTerm(event.target.value);
                        setLetterDetails((prev) => ({ ...prev, signed_by: event.target.value }));
                      }}
                      placeholder="Cari nama atau NIP pegawai SIMPEL..."
                      className="mt-1 bg-slate-700/50 border-slate-600/50 text-white"
                    />
                    <div className="mt-2 max-h-36 overflow-y-auto rounded-md border border-slate-700/50 bg-slate-900/60">
                      {loadingSigners ? (
                        <div className="px-3 py-2 text-sm text-slate-400">Mencari pegawai...</div>
                      ) : signerOptions.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-slate-400">Tidak ada pegawai ditemukan.</div>
                      ) : (
                        signerOptions.slice(0, 8).map((employee) => (
                          <button
                            key={employee.id}
                            type="button"
                            onClick={() => {
                              setSignerSearchTerm(employee.name || "");
                              setLetterDetails((prev) => ({ ...prev, signed_by: employee.name || "" }));
                            }}
                            className="block w-full border-b border-slate-700/40 px-3 py-2 text-left text-sm text-slate-200 last:border-b-0 hover:bg-slate-700/60"
                          >
                            <span className="block font-medium text-white">{employee.name}</span>
                            <span className="text-xs text-slate-400">
                              {employee.nip || "-"} • {employee.position_name || "-"}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Leave Type Groups */}
            <div className="space-y-4">
              {Object.entries(leaveTypeClassification).map(([leaveType, items]) => (
                <div key={leaveType} className="border border-slate-700/50 rounded-lg p-4 bg-slate-900/30">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-white">{leaveType}</h4>
                    <Badge className="bg-purple-600/20 text-purple-300 border-purple-600/30">
                      {items.length} orang
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    {items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-2 rounded bg-slate-800/30">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm font-medium">
                            {item.employee_name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">{item.employee_name}</p>
                            <p className="text-xs text-slate-400">{item.employee_nip} • {format(new Date(item.start_date), 'dd/MM/yyyy')} - {format(new Date(item.end_date), 'dd/MM/yyyy')}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      className="bg-purple-600 hover:bg-purple-700"
                      onClick={() => handleGenerateBatchLetter(leaveType, items, selectedTemplate?.id || availableTemplates[0]?.id, 'all')}
                      disabled={generatingLetter}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      {generatingLetter ? 'Membuat...' : 'Buat Surat Batch'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-700/50">
            <Button variant="outline" onClick={() => setShowBatchDialog(false)} className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600">
              Tutup
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── ProposalCard ───────────────────────────────────────────────────────────
function ProposalCard({ proposal, isEmployee, isAdminUnit, activeTab, onApprove, onReject, onForward, onPrint, onEdit, onDelete, onCreateLetter, onMarkComplete }) {
  const [documents, setDocuments] = React.useState([]);
  const [loadingDocs, setLoadingDocs] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(false);

  const isEmployeeApprovalTab = isAdminUnit && activeTab === "employee-approvals";
  const isCreateLettersTab = isAdminUnit && activeTab === "create-letters";
  const canAct = isEmployeeApprovalTab && proposal.status === "pending";
  const canPrint = (isEmployeeApprovalTab || isCreateLettersTab) && (proposal.status === "awaiting_letter" || proposal.status === "approved" || proposal.status === "letter_issued" || proposal.status === "completed");
  const canCreateLetter = isCreateLettersTab && canGenerateLetter(proposal.status);
  const canMarkComplete = isAdminUnit && (proposal.status === "awaiting_letter" || proposal.status === "letter_issued" || proposal.status === "approved");
  const canEditOrDelete = isEmployee && proposal.status === "rejected";
  const canDeleteByAdminUnit =
    isAdminUnit && ["pending", "rejected", "processed", "completed", "letter_issued"].includes(proposal.status);
  const canDelete = canEditOrDelete || canDeleteByAdminUnit;

  // Fetch documents for proposal items
  React.useEffect(() => {
    const fetchDocuments = async () => {
      if (!proposal.leave_proposal_items?.length) return;
      
      setLoadingDocs(true);
      try {
        const itemIds = proposal.leave_proposal_items.map(item => item.id);
        
        const { data, error } = await supabase
          .from('leave_documents')
          .select('*')
          .in('leave_proposal_item_id', itemIds)
          .order('uploaded_at', { ascending: false });

        if (error) throw error;
        setDocuments(data || []);
      } catch (error) {
        console.error('Error fetching documents:', error);
      } finally {
        setLoadingDocs(false);
      }
    };

    if (showDetails) {
      fetchDocuments();
    }
  }, [proposal.leave_proposal_items, showDetails]);

  return (
    <div className="p-4 bg-slate-700/30 rounded-lg border border-slate-600/50 hover:bg-slate-700/50 transition-colors">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div 
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => setShowDetails(!showDetails)}
        >
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="font-semibold text-white text-base">{proposal.proposal_title}</h3>
            <StatusBadge status={proposal.status} />
            <button 
              className="ml-auto text-slate-400 hover:text-white transition-colors"
              onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
            >
              <Eye className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400 mb-2">
            <span>📅 {safeFormatDate(proposal.proposal_date || proposal.created_at, "dd MMM yyyy")}</span>
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
          {proposal.status === 'completed' && (
            <div className="p-2 bg-emerald-950/30 border border-emerald-700/40 rounded text-sm text-emerald-300">
              <strong>Usulan Selesai:</strong> {proposal.letter_number ? `No. Surat: ${proposal.letter_number}` : 'Surat cuti telah diproses'}
              {proposal.letter_date && ` — ${safeFormatDate(proposal.letter_date, "dd MMMM yyyy")}`}
              {proposal.completed_at && ` (Diselesaikan ${safeFormatDate(proposal.completed_at, "dd MMM yyyy")})`}
            </div>
          )}
          {(proposal.status === 'awaiting_letter' || proposal.status === 'approved' || proposal.status === 'letter_issued') && proposal.letter_number && (
            <div className="p-2 bg-green-950/30 border border-green-700/40 rounded text-sm text-green-400">
              <strong>Nomor Surat:</strong> {proposal.letter_number}
              {proposal.letter_date && ` — ${safeFormatDate(proposal.letter_date, "dd MMMM yyyy")}`}
            </div>
          )}
          {proposal.status === 'forwarded' && (
            <div className="p-2 bg-blue-900/20 border border-blue-700/40 rounded text-sm text-blue-400">
              Diteruskan ke Admin Pusat untuk diproses.
            </div>
          )}
        </div>

        {/* Action buttons */}
        {(canAct || canPrint || canEditOrDelete || canCreateLetter || canDelete || (canMarkComplete && onMarkComplete)) && (
          <div className="flex flex-wrap items-center gap-2">
            {canMarkComplete && onMarkComplete && (
              <Button
                size="sm"
                onClick={() => onMarkComplete(proposal)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle className="w-4 h-4 mr-1" /> Tandai Selesai
              </Button>
            )}
            {canPrint && (
              <Button size="sm" variant="outline" onClick={() => onPrint(proposal)}
                className="border-slate-600 text-slate-300 hover:bg-slate-700">
                <Printer className="w-4 h-4 mr-1" /> Cetak Surat
              </Button>
            )}
            {canCreateLetter && (
              <Button size="sm" onClick={() => onCreateLetter(proposal)} className="bg-purple-600 hover:bg-purple-700 text-white">
                <Layers className="w-4 h-4 mr-1" /> Buat Surat
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
            {canEditOrDelete && (
              <>
                <Button size="sm" variant="outline" onClick={() => onEdit(proposal)}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700">
                  <Edit className="w-4 h-4 mr-1" /> Edit
                </Button>
              </>
            )}
            {canDelete && (
              <Button size="sm" variant="destructive" onClick={() => onDelete(proposal)}>
                <Trash2 className="w-4 h-4 mr-1" /> Hapus
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Items preview */}
      {showDetails && proposal.leave_proposal_items?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-700/50">
          <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider block mb-2">Detail Pegawai:</span>
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
                    {safeFormatDate(item.start_date, "dd MMM")} – {safeFormatDate(item.end_date, "dd MMM yyyy")}
                  </span>
                  <p className="text-xs text-slate-400">{item.days_requested} hari kerja</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents section */}
      {showDetails && (
        <div className="mt-3 pt-3 border-t border-slate-700/50">
          <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider block mb-2">
            Lampiran Dokumen ({documents.length})
          </span>
          {loadingDocs ? (
            <div className="text-center py-4 text-slate-400 text-sm">
              <Clock className="w-4 h-4 animate-spin mx-auto mb-2" />
              Memuat dokumen...
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-4 text-slate-400 text-sm">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
              Tidak ada dokumen yang dilampirkan
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div 
                  key={doc.id} 
                  className="flex items-start justify-between gap-3 bg-slate-800/40 px-3 py-2 rounded border border-slate-700/30"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-white truncate">{doc.slot_label}</span>
                      {doc.verification_status === 'approved' && (
                        <Badge className="bg-green-600 text-white text-xs px-1.5 py-0">
                          <CheckCircle className="w-3 h-3 mr-0.5" />
                          Verified
                        </Badge>
                      )}
                      {doc.verification_status === 'rejected' && (
                        <Badge className="bg-red-600 text-white text-xs px-1.5 py-0">
                          <XCircle className="w-3 h-3 mr-0.5" />
                          Rejected
                        </Badge>
                      )}
                    </div>
                    {doc.file_name && (
                      <p className="text-xs text-slate-400 truncate">{doc.file_name}</p>
                    )}
                    {doc.uploaded_at && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {format(new Date(doc.uploaded_at), 'dd MMM yyyy HH:mm', { locale: id })}
                      </p>
                    )}
                  </div>
                  {(doc.drive_view_url || doc.external_link) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-blue-600 hover:bg-blue-700 border-blue-500 text-white flex-shrink-0 px-2 py-1 h-auto"
                      onClick={() => window.open(doc.drive_view_url || doc.external_link, '_blank')}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      Lihat
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default LeaveProposals;
