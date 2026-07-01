/**
 * LeaveDetailModal
 * 
 * Modal untuk menampilkan detail pengajuan cuti beserta lampiran dokumen
 * Digunakan untuk melihat informasi lengkap cuti dan dokumen yang dilampirkan
 */

import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  FileText, 
  ExternalLink, 
  Calendar, 
  User, 
  Building, 
  Briefcase,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Download
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

/**
 * @param {Object} props
 * @param {boolean} props.open - Dialog open state
 * @param {Function} props.onOpenChange - Handler untuk mengubah open state
 * @param {string} [props.leaveRequestId] - ID dari leave_requests
 * @param {string} [props.proposalItemId] - ID dari leave_proposal_items
 */
export function LeaveDetailModal({ open, onOpenChange, leaveRequestId, proposalItemId }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [leaveData, setLeaveData] = useState(null);
  const [documents, setDocuments] = useState([]);

  useEffect(() => {
    if (open && (leaveRequestId || proposalItemId)) {
      fetchLeaveDetail();
    }
  }, [open, leaveRequestId, proposalItemId]);

  const fetchLeaveDetail = async () => {
    setLoading(true);
    try {
      // Fetch leave data
      if (leaveRequestId) {
        const { data, error } = await supabase
          .from('leave_requests')
          .select(`
            *,
            employees:employee_id (
              name,
              nip,
              department,
              position_name,
              rank_group
            ),
            leave_types (
              name,
              description
            )
          `)
          .eq('id', leaveRequestId)
          .single();

        if (error) throw error;
        setLeaveData(data);

        // Fetch documents
        const { data: docs, error: docsError } = await supabase
          .from('leave_documents')
          .select('*')
          .eq('leave_request_id', leaveRequestId)
          .order('uploaded_at', { ascending: false });

        if (docsError) throw docsError;
        setDocuments(docs || []);

      } else if (proposalItemId) {
        const { data, error } = await supabase
          .from('leave_proposal_items')
          .select(`
            *,
            leave_proposals (
              proposal_title,
              status,
              proposer_unit
            ),
            leave_types (
              name,
              description
            )
          `)
          .eq('id', proposalItemId)
          .single();

        if (error) throw error;
        setLeaveData(data);

        // Fetch documents
        const { data: docs, error: docsError } = await supabase
          .from('leave_documents')
          .select('*')
          .eq('leave_proposal_item_id', proposalItemId)
          .order('uploaded_at', { ascending: false });

        if (docsError) throw docsError;
        setDocuments(docs || []);
      }

    } catch (error) {
      console.error('Error fetching leave detail:', error);
      toast({
        title: 'Gagal memuat detail',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const getVerificationBadge = (status) => {
    const badges = {
      pending: { icon: Clock, label: 'Menunggu Verifikasi', className: 'bg-yellow-600' },
      approved: { icon: CheckCircle2, label: 'Lulus Verifikasi', className: 'bg-green-600' },
      rejected: { icon: XCircle, label: 'Perlu Diperbaiki', className: 'bg-red-600' }
    };

    const badge = badges[status] || badges.pending;
    const Icon = badge.icon;

    return (
      <Badge className={`${badge.className} text-white`}>
        <Icon className="mr-1 h-3 w-3" />
        {badge.label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl bg-slate-800 border-slate-700">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!leaveData) {
    return null;
  }

  const employee = leaveRequestId ? leaveData.employees : {
    name: leaveData.employee_name,
    nip: leaveData.employee_nip,
    department: leaveData.employee_department,
    position_name: leaveData.employee_position,
    rank_group: leaveData.employee_rank
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-400" />
            Detail Pengajuan Cuti
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Informasi lengkap pengajuan cuti dan lampiran dokumen
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Informasi Pegawai */}
          <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-3 flex items-center gap-2">
              <User className="h-4 w-4" />
              Informasi Pegawai
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-400">Nama</p>
                <p className="font-semibold text-white">{employee?.name || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">NIP</p>
                <p className="font-mono text-white">{employee?.nip || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Unit Kerja</p>
                <p className="text-white">{employee?.department || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Jabatan</p>
                <p className="text-white">{employee?.position_name || '-'}</p>
              </div>
              {employee?.rank_group && (
                <div>
                  <p className="text-xs text-slate-400">Pangkat / Golongan</p>
                  <p className="text-white">{employee.rank_group}</p>
                </div>
              )}
            </div>
          </div>

          {/* Informasi Cuti */}
          <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Detail Cuti
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-400">Jenis Cuti</p>
                <p className="font-semibold text-white">{leaveData.leave_types?.name || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Durasi</p>
                <p className="font-semibold text-white">{leaveData.days_requested || 0} hari kerja</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Tanggal Mulai</p>
                <p className="text-white">
                  {leaveData.start_date ? format(new Date(leaveData.start_date), 'dd MMMM yyyy', { locale: id }) : '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Tanggal Selesai</p>
                <p className="text-white">
                  {leaveData.end_date ? format(new Date(leaveData.end_date), 'dd MMMM yyyy', { locale: id }) : '-'}
                </p>
              </div>
              {leaveData.leave_quota_year && (
                <div>
                  <p className="text-xs text-slate-400">Tahun Jatah Cuti</p>
                  <p className="text-white">{leaveData.leave_quota_year}</p>
                </div>
              )}
              {leaveData.leave_period && (
                <div>
                  <p className="text-xs text-slate-400">Periode Cuti</p>
                  <p className="text-white">{leaveData.leave_period}</p>
                </div>
              )}
            </div>

            {leaveData.reason && (
              <div className="mt-4">
                <p className="text-xs text-slate-400">Alasan Cuti</p>
                <p className="text-white mt-1">{leaveData.reason}</p>
              </div>
            )}

            {leaveData.address_during_leave && (
              <div className="mt-4">
                <p className="text-xs text-slate-400">Alamat Selama Cuti</p>
                <p className="text-white mt-1">{leaveData.address_during_leave}</p>
              </div>
            )}
          </div>

          {/* Lampiran Dokumen */}
          <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Lampiran Dokumen ({documents.length})
            </h3>

            {documents.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Tidak ada dokumen yang dilampirkan</p>
              </div>
            ) : (
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div 
                    key={doc.id} 
                    className="bg-slate-600/50 rounded-lg p-3 border border-slate-500"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="h-4 w-4 text-slate-300 flex-shrink-0" />
                          <p className="font-medium text-white text-sm">{doc.slot_label}</p>
                          {getVerificationBadge(doc.verification_status)}
                        </div>
                        
                        {doc.file_name && (
                          <p className="text-xs text-slate-300 truncate mb-1">
                            📄 {doc.file_name}
                          </p>
                        )}
                        
                        {doc.uploaded_at && (
                          <p className="text-xs text-slate-400">
                            Diupload: {format(new Date(doc.uploaded_at), 'dd MMM yyyy HH:mm', { locale: id })}
                          </p>
                        )}

                        {doc.verification_note && doc.verification_status === 'rejected' && (
                          <div className="mt-2 p-2 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-300">
                            <strong>Catatan:</strong> {doc.verification_note}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        {(doc.drive_view_url || doc.external_link) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="bg-blue-600 hover:bg-blue-700 border-blue-500 text-white"
                            onClick={() => window.open(doc.drive_view_url || doc.external_link, '_blank')}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Lihat
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-700">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              className="bg-slate-700 hover:bg-slate-600 border-slate-600 text-white"
            >
              Tutup
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
