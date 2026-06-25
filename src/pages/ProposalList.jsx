import React, { useState } from "react";
import { motion } from "framer-motion";
import { 
  List, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Eye, 
  FileText,
  Filter,
  Building2,
  User,
  Calendar as CalendarIcon,
  Download
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { AuthManager } from "@/lib/auth";
import useLeaveProposals from "@/hooks/useLeaveProposals";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { downloadLeaveProposalLetter, generateProposalSummary } from "@/utils/leaveProposalLetterGenerator";
import { supabase } from "@/lib/supabaseClient";

const ProposalList = () => {
  const { toast } = useToast();
  const currentUser = AuthManager.getUserSession();
  const { proposals, isLoading, updateProposalStatus } = useLeaveProposals();
  
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [approvalAction, setApprovalAction] = useState(null); // 'approve' or 'reject'
  const [approvalNotes, setApprovalNotes] = useState("");
  const [letterNumber, setLetterNumber] = useState("");
  const [letterDate, setLetterDate] = useState(format(new Date(), "yyyy-MM-dd"));

  // Bulk actions
  const [selectedProposals, setSelectedProposals] = useState([]);
  const [showBulkActions, setShowBulkActions] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Check user permission
  if (!currentUser || currentUser.role !== 'admin_pusat') {
    return (
      <div className="p-6">
        <Card className="bg-red-900/20 border-red-700/50">
          <CardContent className="p-6">
            <div className="text-center">
              <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Akses Ditolak</h2>
              <p className="text-slate-300">
                Hanya Master Admin yang dapat mengakses halaman ini.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Filter proposals
  const filteredProposals = proposals.filter(proposal => {
    const matchesStatus = statusFilter === "all" || proposal.status === statusFilter;
    const matchesUnit = unitFilter === "all" || proposal.proposer_unit === unitFilter;
    const matchesSearch = searchTerm === "" || 
      proposal.proposal_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proposal.proposer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proposal.proposer_unit.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesStatus && matchesUnit && matchesSearch;
  });

  // Get unique units
  const units = [...new Set(proposals.map(p => p.proposer_unit))];

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
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const handleViewDetail = (proposal) => {
    setSelectedProposal(proposal);
    setShowDetailDialog(true);
  };

  const handleApprovalAction = (proposal, action) => {
    setSelectedProposal(proposal);
    setApprovalAction(action);
    setApprovalNotes("");
    if (action === 'approve') {
      setLetterNumber(`SRT/CUTI/${new Date().getFullYear()}/${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`);
    }
    setShowApprovalDialog(true);
  };

  const handleSubmitApproval = async () => {
    try {
      const updateData = {};

      if (approvalAction === 'approve') {
        updateData.letter_number = letterNumber;
        updateData.letter_date = letterDate;
        updateData.notes = approvalNotes;
      } else if (approvalAction === 'reject') {
        updateData.rejection_reason = approvalNotes;
      }

      await updateProposalStatus(selectedProposal.id, approvalAction === 'approve' ? 'approved' : 'rejected', updateData);

      setShowApprovalDialog(false);
      setSelectedProposal(null);
      setApprovalAction(null);
      setApprovalNotes("");

      toast({
        title: "Success",
        description: `Usulan berhasil ${approvalAction === 'approve' ? 'disetujui' : 'ditolak'}`,
      });
    } catch (error) {
      console.error("Error updating proposal:", error);
      toast({
        title: "Error",
        description: "Gagal memperbarui status usulan",
        variant: "destructive",
      });
    }
  };

  const handleGenerateLetter = async (proposal) => {
    try {
      toast({
        title: "Info",
        description: "Sedang membuat surat usulan...",
      });

      // Fetch proposal items
      const { data: proposalItems, error } = await supabase
        .from("leave_proposal_items")
        .select("*")
        .eq("proposal_id", proposal.id)
        .order("employee_name");

      if (error) throw error;

      if (!proposalItems || proposalItems.length === 0) {
        throw new Error("Tidak ada data pegawai dalam usulan");
      }

      // Prepare data for letter generation
      const proposalData = {
        proposal: proposal,
        proposalItems: proposalItems,
      };

      // Generate and download letter
      const filename = `Usulan_Cuti_${proposal.proposer_unit}_${proposal.letter_number?.replace(/\//g, '_') || 'Draft'}.docx`;
      await downloadLeaveProposalLetter(proposalData, filename);

      // Update proposal status to processed
      await updateProposalStatus(proposal.id, 'processed', {});

      toast({
        title: "Success",
        description: "Surat usulan berhasil dibuat dan diunduh",
      });
    } catch (error) {
      console.error("Error generating letter:", error);
      toast({
        title: "Error",
        description: "Gagal membuat surat usulan: " + error.message,
        variant: "destructive",
      });
    }
  };

  const handleBulkApprove = async () => {
    try {
      const pendingProposals = selectedProposals.filter(id => {
        const proposal = proposals.find(p => p.id === id);
        return proposal && proposal.status === 'pending';
      });

      if (pendingProposals.length === 0) {
        toast({
          title: "Info",
          description: "Tidak ada usulan yang bisa disetujui",
        });
        return;
      }

      toast({
        title: "Info",
        description: `Sedang memproses ${pendingProposals.length} usulan...`,
      });

      // Approve each selected proposal
      for (const proposalId of pendingProposals) {
        const proposal = proposals.find(p => p.id === proposalId);
        const letterNum = `SRT/CUTI/${new Date().getFullYear()}/${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

        await updateProposalStatus(proposalId, 'approved', {
          letter_number: letterNum,
          letter_date: format(new Date(), "yyyy-MM-dd"),
          notes: "Approved via bulk action"
        });
      }

      setSelectedProposals([]);
      setShowBulkActions(false);

      toast({
        title: "Success",
        description: `${pendingProposals.length} usulan berhasil disetujui`,
      });
    } catch (error) {
      console.error("Error bulk approving:", error);
      toast({
        title: "Error",
        description: "Gagal menyetujui usulan secara massal",
        variant: "destructive",
      });
    }
  };

  const handleSelectProposal = (proposalId, checked) => {
    if (checked) {
      setSelectedProposals(prev => [...prev, proposalId]);
    } else {
      setSelectedProposals(prev => prev.filter(id => id !== proposalId));
    }
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      const selectableProposals = filteredProposals
        .filter(p => p.status === 'pending')
        .map(p => p.id);
      setSelectedProposals(selectableProposals);
    } else {
      setSelectedProposals([]);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center"
      >
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Daftar Usulan Cuti</h1>
          <p className="text-slate-400">
            Kelola dan setujui usulan cuti dari semua unit kerja
          </p>
        </div>
      </motion.div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                  <List className="w-6 h-6 text-blue-400" />
                </div>
                <div className="ml-4">
                  <p className="text-slate-400 text-sm">Total Usulan</p>
                  <p className="text-2xl font-bold text-white">{proposals.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                  <Clock className="w-6 h-6 text-yellow-400" />
                </div>
                <div className="ml-4">
                  <p className="text-slate-400 text-sm">Menunggu Review</p>
                  <p className="text-2xl font-bold text-white">
                    {proposals.filter(p => p.status === 'pending').length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-400" />
                </div>
                <div className="ml-4">
                  <p className="text-slate-400 text-sm">Disetujui</p>
                  <p className="text-2xl font-bold text-white">
                    {proposals.filter(p => p.status === 'approved').length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-red-500/20 rounded-lg flex items-center justify-center">
                  <XCircle className="w-6 h-6 text-red-400" />
                </div>
                <div className="ml-4">
                  <p className="text-slate-400 text-sm">Ditolak</p>
                  <p className="text-2xl font-bold text-white">
                    {proposals.filter(p => p.status === 'rejected').length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-white flex items-center">
              <Filter className="w-5 h-5 mr-2" />
              Filter Usulan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-slate-300">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-slate-700/50 border-slate-600/50 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-700 border-slate-600">
                    <SelectItem value="all">Semua Status</SelectItem>
                    <SelectItem value="pending">Menunggu</SelectItem>
                    <SelectItem value="approved">Disetujui</SelectItem>
                    <SelectItem value="rejected">Ditolak</SelectItem>
                    <SelectItem value="processed">Diproses</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-300">Unit Kerja</Label>
                <Select value={unitFilter} onValueChange={setUnitFilter}>
                  <SelectTrigger className="bg-slate-700/50 border-slate-600/50 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-700 border-slate-600">
                    <SelectItem value="all">Semua Unit</SelectItem>
                    {units.map(unit => (
                      <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-300">Cari</Label>
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Cari judul atau nama..."
                  className="bg-slate-700/50 border-slate-600/50 text-white"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Proposals List */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-white">
              Daftar Usulan ({filteredProposals.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                <p className="text-slate-400 mt-2">Memuat data...</p>
              </div>
            ) : filteredProposals.length === 0 ? (
              <div className="text-center py-8">
                <List className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Tidak Ada Usulan</h3>
                <p className="text-slate-400">
                  Belum ada usulan cuti yang sesuai dengan filter
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredProposals.map((proposal) => (
                  <div
                    key={proposal.id}
                    className="p-4 bg-slate-700/30 rounded-lg border border-slate-600/50 hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-white font-medium">{proposal.proposal_title}</h3>
                          {getStatusBadge(proposal.status)}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-slate-400 mb-3">
                          <div className="flex items-center">
                            <User className="w-4 h-4 mr-1" />
                            {proposal.proposer_name}
                          </div>
                          <div className="flex items-center">
                            <Building2 className="w-4 h-4 mr-1" />
                            {proposal.proposer_unit}
                          </div>
                          <div className="flex items-center">
                            <CalendarIcon className="w-4 h-4 mr-1" />
                            {format(new Date(proposal.proposal_date), "dd MMM yyyy", { locale: id })}
                          </div>
                          <div className="flex items-center">
                            <User className="w-4 h-4 mr-1" />
                            {proposal.total_employees} pegawai
                          </div>
                        </div>
                        {proposal.notes && (
                          <p className="text-slate-300 text-sm mb-3">{proposal.notes}</p>
                        )}
                        {proposal.status === 'rejected' && proposal.rejection_reason && (
                          <div className="mt-2 p-2 bg-red-900/20 border border-red-700/50 rounded">
                            <p className="text-red-400 text-sm">
                              <strong>Alasan ditolak:</strong> {proposal.rejection_reason}
                            </p>
                          </div>
                        )}
                        {proposal.status === 'approved' && proposal.letter_number && (
                          <div className="mt-2 p-2 bg-green-900/20 border border-green-700/50 rounded">
                            <p className="text-green-400 text-sm">
                              <strong>No. Surat:</strong> {proposal.letter_number} 
                              {proposal.letter_date && ` | Tanggal: ${format(new Date(proposal.letter_date), "dd MMM yyyy", { locale: id })}`}
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="flex space-x-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDetail(proposal)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {proposal.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleApprovalAction(proposal, 'approve')}
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Setujui
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleApprovalAction(proposal, 'reject')}
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Tolak
                            </Button>
                          </>
                        )}
                        {proposal.status === 'approved' && (
                          <Button
                            size="sm"
                            onClick={() => handleGenerateLetter(proposal)}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            <Download className="w-4 h-4 mr-1" />
                            Generate Surat
                          </Button>
                        )}
                        {proposal.status === 'processed' && (
                          <Button
                            size="sm"
                            onClick={() => handleGenerateLetter(proposal)}
                            variant="outline"
                            className="border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white"
                          >
                            <Download className="w-4 h-4 mr-1" />
                            Download Ulang
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-4xl bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Detail Usulan Cuti</DialogTitle>
            <DialogDescription className="text-slate-400">
              Informasi lengkap usulan cuti
            </DialogDescription>
          </DialogHeader>
          {selectedProposal && (
            <div className="space-y-4 max-h-96 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-300">Judul Usulan</Label>
                  <p className="text-white font-medium">{selectedProposal.proposal_title}</p>
                </div>
                <div>
                  <Label className="text-slate-300">Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedProposal.status)}</div>
                </div>
                <div>
                  <Label className="text-slate-300">Diusulkan Oleh</Label>
                  <p className="text-white">{selectedProposal.proposer_name}</p>
                </div>
                <div>
                  <Label className="text-slate-300">Unit Kerja</Label>
                  <p className="text-white">{selectedProposal.proposer_unit}</p>
                </div>
                <div>
                  <Label className="text-slate-300">Tanggal Usulan</Label>
                  <p className="text-white">{format(new Date(selectedProposal.proposal_date), "dd MMMM yyyy", { locale: id })}</p>
                </div>
                <div>
                  <Label className="text-slate-300">Total Pegawai</Label>
                  <p className="text-white">{selectedProposal.total_employees} pegawai</p>
                </div>
              </div>
              
              {selectedProposal.notes && (
                <div>
                  <Label className="text-slate-300">Catatan</Label>
                  <p className="text-white">{selectedProposal.notes}</p>
                </div>
              )}

              {/* Proposal Summary */}
              {selectedProposal.leave_proposal_items && selectedProposal.leave_proposal_items.length > 0 && (
                <>
                  <div>
                    <Label className="text-slate-300">Ringkasan Usulan</Label>
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4">
                      {(() => {
                        const summary = generateProposalSummary(selectedProposal.leave_proposal_items);
                        return (
                          <>
                            <div className="p-3 bg-blue-500/20 rounded border border-blue-500/50">
                              <p className="text-blue-400 text-sm">Total Pegawai</p>
                              <p className="text-white font-bold text-lg">{summary.totalEmployees}</p>
                            </div>
                            <div className="p-3 bg-green-500/20 rounded border border-green-500/50">
                              <p className="text-green-400 text-sm">Total Hari</p>
                              <p className="text-white font-bold text-lg">{summary.totalDays}</p>
                            </div>
                            <div className="p-3 bg-purple-500/20 rounded border border-purple-500/50">
                              <p className="text-purple-400 text-sm">Jenis Cuti</p>
                              <p className="text-white font-bold text-lg">{Object.keys(summary.leaveTypes).length}</p>
                            </div>
                            <div className="p-3 bg-orange-500/20 rounded border border-orange-500/50">
                              <p className="text-orange-400 text-sm">Rentang Tanggal</p>
                              <p className="text-white font-bold text-xs">
                                {summary.dateRange.earliest && summary.dateRange.latest &&
                                  `${format(summary.dateRange.earliest, "dd/MM", { locale: id })} - ${format(summary.dateRange.latest, "dd/MM", { locale: id })}`
                                }
                              </p>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Employee List */}
                  <div>
                    <Label className="text-slate-300">Daftar Pegawai ({selectedProposal.leave_proposal_items.length})</Label>
                    <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                      {selectedProposal.leave_proposal_items.map((item, index) => (
                        <div key={index} className="p-3 bg-slate-700/50 rounded border border-slate-600/50">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-white font-medium">{item.employee_name}</h4>
                              <p className="text-slate-400 text-sm">{item.employee_nip} - {item.employee_position}</p>
                            </div>
                            <div className="text-right">
                              <Badge variant="outline">{item.leave_type_name}</Badge>
                              <p className="text-slate-400 text-sm mt-1">{item.days_requested} hari</p>
                            </div>
                          </div>
                          <div className="mt-2 text-sm text-slate-300">
                            ðŸ“… {format(new Date(item.start_date), "dd MMM", { locale: id })} - {format(new Date(item.end_date), "dd MMM yyyy", { locale: id })}
                            {item.reason && (
                              <div className="mt-1 text-slate-400">
                                ðŸ’¬ {item.reason}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          {selectedProposal && selectedProposal.status === 'approved' && (
            <div className="flex justify-end space-x-2 pt-4 border-t border-slate-600/50">
              <Button
                onClick={() => {
                  setShowDetailDialog(false);
                  handleGenerateLetter(selectedProposal);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Download className="w-4 h-4 mr-2" />
                Generate & Download Surat
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Approval Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">
              {approvalAction === 'approve' ? 'Setujui Usulan' : 'Tolak Usulan'}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {approvalAction === 'approve'
                ? 'Masukkan informasi surat untuk menyetujui usulan ini.'
                : 'Masukkan alasan penolakan usulan ini.'
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {approvalAction === 'approve' && (
              <>
                <div>
                  <Label className="text-slate-300">Nomor Surat</Label>
                  <Input
                    value={letterNumber}
                    onChange={(e) => setLetterNumber(e.target.value)}
                    placeholder="Contoh: SRT/CUTI/2024/001"
                    className="bg-slate-700/50 border-slate-600/50 text-white"
                  />
                </div>
                <div>
                  <Label className="text-slate-300">Tanggal Surat</Label>
                  <Input
                    type="date"
                    value={letterDate}
                    onChange={(e) => setLetterDate(e.target.value)}
                    className="bg-slate-700/50 border-slate-600/50 text-white"
                  />
                </div>
              </>
            )}
            <div>
              <Label className="text-slate-300">
                {approvalAction === 'approve' ? 'Catatan (Opsional)' : 'Alasan Penolakan'}
              </Label>
              <Textarea
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder={approvalAction === 'approve' 
                  ? 'Catatan tambahan...' 
                  : 'Jelaskan alasan penolakan...'
                }
                className="bg-slate-700/50 border-slate-600/50 text-white"
                rows={3}
                required={approvalAction === 'reject'}
              />
            </div>
          </div>
          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowApprovalDialog(false)}
              className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
            >
              Batal
            </Button>
            <Button
              onClick={handleSubmitApproval}
              disabled={approvalAction === 'reject' && !approvalNotes.trim()}
              className={approvalAction === 'approve'
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-red-600 hover:bg-red-700 text-white"
              }
            >
              {approvalAction === 'approve' ? 'Setujui' : 'Tolak'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProposalList;
