import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  FileText, Plus, CheckCircle, XCircle, Clock, User,
  Check, Forward, Printer, ChevronDown, Edit, Trash2,
  Eye, Download, Layers, Building2
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
  processed: { label: "Siap Buat Surat",     color: "bg-purple-500/20 text-purple-300 border-purple-500/30",   icon: FileText },
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

const LeaveProposals = () => {
  const { toast } = useToast();
  const currentUser = AuthManager.getUserSession();
  const isEmployee = currentUser?.role === 'employee';
  const isAdminUnit = currentUser?.role === 'admin_unit';

  const {
    proposals, isLoading, fetchProposals,
    approveEmployeeProposal, rejectEmployeeProposal, forwardToAdminPusat,
    deleteProposal, updateProposal,
  } = useLeaveProposals();

  // Templates hook
  const { templates: availableTemplates, isLoading: loadingTemplates } = useTemplates({ autoFetch: true });

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingProposal, setEditingProposal] = useState(null);
  const [tableExists, setTableExists] = useState(true);
  const [activeTab, setActiveTab] = useState("my-proposals");

  // Signers from localStorage
  const [signers, setSigners] = useState([]);
  const [selectedSigner, setSelectedSigner] = useState("");

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
      if (editingProposal) {
        // Update existing proposal
        await updateProposal(editingProposal.id, proposalData);
        setEditingProposal(null);
        setShowCreateForm(false);
      } else {
        // Use the hook's createProposal which already handles inserting items
        await createProposal(proposalData);
        toast({
          title: "Berhasil",
          description: isEmployee
            ? "Pengajuan cuti berhasil dikirim ke Admin Unit"
            : "Usulan cuti berhasil dibuat",
        });
        setShowCreateForm(false);
      }
    } catch (error) {
      toast({ variant: "destructive", title: editingProposal ? "Gagal Memperbarui Usulan" : "Gagal Membuat Usulan", description: error.message });
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

  const handleApproveSubmit = async (approvalType) => {
    if (approvalType === "issue_letter" && !selectedSigner) {
      toast({ title: "Peringatan", description: "Silakan pilih penandatangan terlebih dahulu.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await approveEmployeeProposal(targetProposal.id, targetProposal.leave_proposal_items, {
        letter_number: letterNumber,
        letter_date: letterDate,
        signed_by: approvalType === "issue_letter" ? selectedSigner : "",
        notes: approvalNotes,
      }, approvalType);
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

  const handleOpenBatchDialog = (proposal) => {
    setSelectedProposalForBatch(proposal);
    
    // First, analyze and group leave requests by type
    const leaveTypeGroups = {};
    proposal.leave_proposal_items.forEach(item => {
      const leaveType = item.leave_type_name || "Jenis cuti tidak diketahui";
      if (!leaveTypeGroups[leaveType]) {
        leaveTypeGroups[leaveType] = [];
      }
      leaveTypeGroups[leaveType].push({
        id: item.id,
        employee_id: item.employee_id,
        employee_name: item.employee_name,
        employee_nip: item.employee_nip,
        employee_position: item.employee_position,
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
    
    // Default: semua jenis cuti mode batch (all)
    const defaultSelection = {};
    Object.keys(leaveTypeGroups).forEach(lt => {
      defaultSelection[lt] = 'all';
    });
    setSelectedEmployeeForLetter(defaultSelection);
    
    setShowBatchDialog(true);
  };

  const handleGenerateBatchLetter = async (leaveType, items, templateId = null, individualItemId = null) => {
    try {
      setGeneratingLetter(true);

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

      // Prepare variables for template with complete data
      const variables = {
        // General information
        unit_kerja: currentUser?.department || "UNIT KERJA",
        jenis_cuti: leaveType,
        tanggal_usulan: format(new Date(selectedProposalForBatch.created_at), "dd MMMM yyyy", { locale: id }),
        tanggal_surat: format(new Date(), "dd MMMM yyyy", { locale: id }),
        jumlah_pegawai: completeItems.length,
        total_hari: completeItems.reduce((sum, item) => sum + (item.days_requested || 0), 0),
        tahun: new Date().getFullYear(),
        bulan: format(new Date(), "MMMM", { locale: id }),
        kota: "Jayapura", // Default city, can be configurable

        // Letter numbering
        nomor_surat: selectedProposalForBatch.letter_number || `SRT/${leaveType.toUpperCase().replace(/\s+/g, '')}/${new Date().getFullYear()}/${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,

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
          nomor_surat_cuti: selectedProposalForBatch.letter_number || "-",
          tanggal_surat_cuti: selectedProposalForBatch.letter_date ? format(new Date(selectedProposalForBatch.letter_date), "dd MMMM yyyy", { locale: id }) : "-",
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
      
      toast({
        title: "Berhasil",
        description: `Surat ${leaveType} berhasil di-generate dan diunduh!`,
      });
      
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

  // Filter proposals for display
  const displayProposals = proposals.filter((p) => {
    if (isEmployee) return p.proposed_by === currentUser.id;
    if (activeTab === "my-proposals") return p.proposed_by === currentUser.id;
    if (activeTab === "create-letters") return p.status === "processed";
    // employee-approvals: proposals from employees in this unit (not created by admin themselves)
    return p.proposed_by !== currentUser.id && p.proposer_unit === currentUser.department;
  });

  const pendingEmployeeCount = proposals.filter(
    p => p.proposed_by !== currentUser.id && p.proposer_unit === currentUser.department && p.status === 'pending'
  ).length;
  const readyForLettersCount = proposals.filter(p => p.status === 'processed').length;

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
              onClick={() => setActiveTab(tab.key)}
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
                    onCreateLetter={handleOpenBatchDialog}
                    onEdit={(proposal) => {
                      setEditingProposal(proposal);
                      setShowCreateForm(true);
                    }}
                    onDelete={deleteProposal}
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
            <DialogTitle>Setujui Pengajuan Cuti</DialogTitle>
            <DialogDescription className="text-slate-400">Pilih opsi persetujuan di bawah ini.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-slate-300">Penandatangan Surat</Label>
              {signers.length === 0 ? (
                <p className="text-xs text-slate-400 mt-1">Belum ada penandatangan.</p>
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
          <div className="flex justify-between pt-3 border-t border-slate-700/50">
            <Button variant="outline" onClick={async () => {
                try {
                  toast({ title: "Menyiapkan dokumen...", description: "Mohon tunggu sebentar." });
                  await downloadLeaveProposalLetter({
                    proposal: {
                      ...targetProposal,
                      letter_number: letterNumber,
                      letter_date: letterDate,
                    },
                    proposalItems: targetProposal.leave_proposal_items || [],
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
            }} className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600">
              <Printer className="w-4 h-4 mr-2" /> Pratinjau Surat
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowApprovalDialog(false)} className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600">Batal</Button>
              <Button onClick={() => handleApproveSubmit("batch")} disabled={submitting} className="bg-purple-600 hover:bg-purple-700">
                {submitting ? "Memproses..." : "Setujui & Buat Surat Nanti"}
              </Button>
              <Button onClick={() => handleApproveSubmit("issue_letter")} disabled={submitting || signers.length === 0} className="bg-green-600 hover:bg-green-700">
                {submitting ? "Memproses..." : "Setujui & Terbitkan"}
              </Button>
            </div>
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
                    
                    <div className="flex-1" />
                    
                    {items.map((item) => (
                      <Button
                        key={item.id}
                        size="sm"
                        variant="outline"
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                        onClick={() => handleGenerateBatchLetter(leaveType, items, selectedTemplate?.id || availableTemplates[0]?.id, item.id)}
                        disabled={generatingLetter}
                      >
                        <FileText className="w-4 h-4 mr-1" />
                        {item.employee_name.split(' ')[0]}
                      </Button>
                    ))}
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
function ProposalCard({ proposal, isEmployee, isAdminUnit, activeTab, onApprove, onReject, onForward, onPrint, onEdit, onDelete, onCreateLetter }) {
  const isEmployeeApprovalTab = isAdminUnit && activeTab === "employee-approvals";
  const isCreateLettersTab = isAdminUnit && activeTab === "create-letters";
  const canAct = isEmployeeApprovalTab && proposal.status === "pending";
  const canPrint = isEmployeeApprovalTab && proposal.status === "approved";
  const canCreateLetter = isCreateLettersTab && proposal.status === "processed";
  const canEditOrDelete = isEmployee && proposal.status === "rejected";

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

        {/* Action buttons */}
        {(canAct || canPrint || canEditOrDelete || canCreateLetter) && (
          <div className="flex items-center gap-2">
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
                <Button size="sm" variant="destructive" onClick={() => onDelete(proposal.id)}>
                  <Trash2 className="w-4 h-4 mr-1" /> Hapus
                </Button>
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
