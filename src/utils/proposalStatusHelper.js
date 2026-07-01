/**
 * Helper functions for leave proposal status handling
 * 
 * Status flow: pending → forwarded → approved → awaiting_letter → letter_issued → completed
 */

export const PROPOSAL_STATUS = {
  PENDING: 'pending',
  FORWARDED: 'forwarded',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  AWAITING_LETTER: 'awaiting_letter',
  LETTER_ISSUED: 'letter_issued',
  COMPLETED: 'completed',
  // Legacy status for backward compatibility
  PROCESSED: 'processed', // Same as letter_issued
};

/**
 * Get status configuration (label, color, icon)
 */
export const getStatusConfig = (status) => {
  const statusConfigs = {
    pending: {
      label: 'Menunggu',
      color: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40',
      badgeClass: 'bg-yellow-600',
      icon: 'Clock'
    },
    forwarded: {
      label: 'Diteruskan Admin Unit',
      color: 'bg-blue-500/20 text-blue-300 border border-blue-500/40',
      badgeClass: 'bg-blue-600',
      icon: 'Forward'
    },
    approved: {
      label: 'Disetujui',
      color: 'bg-green-500/20 text-green-300 border border-green-500/40',
      badgeClass: 'bg-green-600',
      icon: 'CheckCircle'
    },
    rejected: {
      label: 'Ditolak',
      color: 'bg-red-500/20 text-red-300 border border-red-500/40',
      badgeClass: 'bg-red-600',
      icon: 'XCircle'
    },
    awaiting_letter: {
      label: 'Disetujui & Menunggu Surat Keterangan',
      color: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40',
      badgeClass: 'bg-indigo-600',
      icon: 'FileText'
    },
    letter_issued: {
      label: 'Surat Keterangan Sudah Diterbitkan',
      color: 'bg-purple-500/20 text-purple-300 border border-purple-500/40',
      badgeClass: 'bg-purple-600',
      icon: 'FileCheck'
    },
    completed: {
      label: 'Selesai',
      color: 'bg-slate-500/20 text-slate-300 border border-slate-500/40',
      badgeClass: 'bg-slate-600',
      icon: 'CheckCircle'
    },
    // Legacy
    processed: {
      label: 'Surat Keterangan Sudah Diterbitkan',
      color: 'bg-purple-500/20 text-purple-300 border border-purple-500/40',
      badgeClass: 'bg-purple-600',
      icon: 'FileCheck'
    },
  };

  return statusConfigs[status] || statusConfigs.pending;
};

/**
 * Check if proposal can be approved (pending or forwarded)
 */
export const canApprove = (status) => {
  return status === PROPOSAL_STATUS.PENDING || status === PROPOSAL_STATUS.FORWARDED;
};

/**
 * Check if proposal can generate letter (awaiting_letter status)
 */
export const canGenerateLetter = (status) => {
  return status === PROPOSAL_STATUS.AWAITING_LETTER || 
         status === PROPOSAL_STATUS.LETTER_ISSUED ||
         status === PROPOSAL_STATUS.PROCESSED; // Legacy support
};

/**
 * Check if letter has been issued
 */
export const isLetterIssued = (status) => {
  return status === PROPOSAL_STATUS.LETTER_ISSUED || 
         status === PROPOSAL_STATUS.PROCESSED; // Legacy support
};

/**
 * Get next status after approval
 */
export const getNextStatusAfterApproval = () => {
  return PROPOSAL_STATUS.AWAITING_LETTER;
};

/**
 * Get next status after letter generation
 */
export const getNextStatusAfterLetterGeneration = () => {
  return PROPOSAL_STATUS.LETTER_ISSUED;
};
