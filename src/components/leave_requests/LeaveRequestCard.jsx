
import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Clock, FileText, Forward, User, XCircle, Edit2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const LeaveRequestCard = ({ request, index, onEdit, onDelete }) => {
  const statusConfig = {
    pending: {
      label: "Menunggu Persetujuan Admin Unit",
      className: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
      icon: Clock,
    },
    approved: {
      label: "Disetujui",
      className: "bg-green-500/20 text-green-300 border-green-500/40",
      icon: CheckCircle,
    },
    rejected: {
      label: "Ditolak",
      className: "bg-red-500/20 text-red-300 border-red-500/40",
      icon: XCircle,
    },
    forwarded: {
      label: "Diteruskan ke Admin Pusat",
      className: "bg-blue-500/20 text-blue-300 border-blue-500/40",
      icon: Forward,
    },
    processed: {
      label: "Siap Dibuat Surat",
      className: "bg-purple-500/20 text-purple-300 border-purple-500/40",
      icon: FileText,
    },
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const status = request.approval_status || request.status || "approved";
  const badge = statusConfig[status] || statusConfig.approved;
  const StatusIcon = badge.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="p-6 bg-slate-700/30 rounded-lg border border-slate-600/30 hover:bg-slate-700/50 transition-colors"
    >
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between space-y-4 lg:space-y-0">
        <div className="flex-1">
          <div className="flex flex-wrap justify-end gap-2 mb-2">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${badge.className}`}>
              <StatusIcon className="h-3 w-3" />
              {badge.label}
            </span>
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="text-blue-400 hover:bg-blue-900/20 h-8 px-2"
                onClick={() => onEdit(request)}
                disabled={request.isProposal}
              >
                <Edit2 className="w-4 h-4 mr-1" /> Edit
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-400 hover:bg-red-900/20 h-8 px-2"
                onClick={() => onDelete(request.id)}
                disabled={request.isProposal}
              >
                <Trash2 className="w-4 h-4 mr-1" /> Hapus
              </Button>
            )}
          </div>
          <div className="flex items-start space-x-3 mb-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
              <User className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-semibold">{request.employeeName}</h3>
              <p className="text-slate-400 text-sm font-mono mb-1">{request.nip}</p>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 mt-1">
                {request.department && (
                  <div className="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 mr-1.5 flex-shrink-0">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    <span>{request.department}</span>
                  </div>
                )}
                {request.rank_group && (
                  <div className="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 mr-1.5 flex-shrink-0">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                      <circle cx="9" cy="7" r="4"></circle>
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    <span>{request.rank_group}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3 text-sm">
            <div>
              <p className="text-slate-400">Jenis Cuti:</p>
              <p className="text-white font-medium">{request.leaveTypeName}</p>
            </div>
            <div>
              <p className="text-slate-400">Periode Cuti:</p>
              <p className="text-white font-medium">{request.leave_period || '-'}</p>
            </div>
            <div>
              <p className="text-slate-400">Jatah Cuti Tahun:</p>
              <p className="text-white font-medium">{request.leave_quota_year || '-'}</p>
            </div>
            <div>
              <p className="text-slate-400">Tanggal Cuti:</p>
              <p className="text-white font-medium">
                {formatDate(request.start_date)} - {formatDate(request.end_date)}
              </p>
              <p className="text-slate-500 text-xs">{request.days_requested} hari</p>
            </div>
            <div className="md:col-span-2 lg:col-span-1">
              <p className="text-slate-400">Alasan/Keterangan:</p>
              <p className="text-white font-medium truncate" title={request.reason}>{request.reason || '-'}</p>
            </div>

            <div>
              <p className="text-slate-400">No. Surat Cuti:</p>
              <p className="text-white font-medium">{request.leave_letter_number || '-'}</p>
            </div>
            <div>
              <p className="text-slate-400">Tgl. Surat Cuti:</p>
              <p className="text-white font-medium">{request.leave_letter_date ? formatDate(request.leave_letter_date) : '-'}</p>
            </div>
            <div>
              <p className="text-slate-400">Penandatangan:</p>
              <p className="text-white font-medium">{request.signed_by || '-'}</p>
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <p className="text-slate-400">Alamat Selama Cuti:</p>
              <p className="text-white font-medium">{request.address_during_leave || '-'}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-3">Data diinput pada: {formatDate(request.submitted_date)}</p>
        </div>
      </div>
    </motion.div>
  );
};

export default LeaveRequestCard;
