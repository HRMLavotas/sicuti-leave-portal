import { differenceInDays, isValid, parseISO } from "date-fns";

/**
 * Validate leave proposal data
 */
export const validateLeaveProposal = (proposalData) => {
  const errors = [];

  // Basic proposal validation
  if (!proposalData.title || proposalData.title.trim().length === 0) {
    errors.push("Judul usulan harus diisi");
  }

  if (proposalData.title && proposalData.title.length > 255) {
    errors.push("Judul usulan maksimal 255 karakter");
  }

  if (!proposalData.employees || proposalData.employees.length === 0) {
    errors.push("Minimal satu pegawai harus ditambahkan ke usulan");
  }

  if (proposalData.employees && proposalData.employees.length > 50) {
    errors.push("Maksimal 50 pegawai per usulan");
  }

  // Employee data validation
  if (proposalData.employees) {
    proposalData.employees.forEach((employee, index) => {
      const employeeErrors = validateEmployeeLeaveItem(employee, index + 1);
      errors.push(...employeeErrors);
    });

    // Check for duplicate employees
    const employeeIds = proposalData.employees.map(emp => emp.employee_id);
    const duplicates = employeeIds.filter((id, index) => employeeIds.indexOf(id) !== index);
    if (duplicates.length > 0) {
      errors.push("Terdapat pegawai yang duplikat dalam usulan");
    }
  }

  return {
    isValid: errors.length === 0,
    errors: errors
  };
};

/**
 * Validate individual employee leave item
 */
export const validateEmployeeLeaveItem = (employee, employeeNumber = null) => {
  const errors = [];
  const prefix = employeeNumber ? `Pegawai #${employeeNumber}: ` : "";

  // Required fields
  if (!employee.employee_id) {
    errors.push(`${prefix}ID pegawai harus diisi`);
  }

  if (!employee.employee_name || employee.employee_name.trim().length === 0) {
    errors.push(`${prefix}Nama pegawai harus diisi`);
  }

  if (!employee.leave_type_id) {
    errors.push(`${prefix}Jenis cuti harus dipilih`);
  }

  if (!employee.start_date) {
    errors.push(`${prefix}Tanggal mulai cuti harus diisi`);
  }

  if (!employee.end_date) {
    errors.push(`${prefix}Tanggal selesai cuti harus diisi`);
  }

  // Date validation
  if (employee.start_date && employee.end_date) {
    const startDate = parseISO(employee.start_date);
    const endDate = parseISO(employee.end_date);

    if (!isValid(startDate)) {
      errors.push(`${prefix}Format tanggal mulai tidak valid`);
    }

    if (!isValid(endDate)) {
      errors.push(`${prefix}Format tanggal selesai tidak valid`);
    }

    if (isValid(startDate) && isValid(endDate)) {
      if (endDate < startDate) {
        errors.push(`${prefix}Tanggal selesai tidak boleh lebih awal dari tanggal mulai`);
      }

      const daysDiff = differenceInDays(endDate, startDate) + 1;
      if (daysDiff > 365) {
        errors.push(`${prefix}Durasi cuti maksimal 365 hari`);
      }

      if (daysDiff <= 0) {
        errors.push(`${prefix}Durasi cuti harus lebih dari 0 hari`);
      }

      if (employee.days_requested && employee.days_requested !== daysDiff) {
        errors.push(`${prefix}Durasi cuti tidak sesuai dengan rentang tanggal`);
      }
    }
  }

  // Leave quota year validation
  if (employee.leave_quota_year) {
    const currentYear = new Date().getFullYear();
    if (employee.leave_quota_year < currentYear - 1 || employee.leave_quota_year > currentYear + 1) {
      errors.push(`${prefix}Tahun kuota cuti tidak valid`);
    }
  }

  // Optional field length validation
  if (employee.reason && employee.reason.length > 500) {
    errors.push(`${prefix}Alasan cuti maksimal 500 karakter`);
  }

  if (employee.address_during_leave && employee.address_during_leave.length > 500) {
    errors.push(`${prefix}Alamat selama cuti maksimal 500 karakter`);
  }

  return errors;
};

/**
 * Validate approval data
 */
export const validateApprovalData = (approvalData, action) => {
  const errors = [];

  if (action === 'approve') {
    if (!approvalData.letter_number || approvalData.letter_number.trim().length === 0) {
      errors.push("Nomor surat harus diisi");
    }

    if (approvalData.letter_number && approvalData.letter_number.length > 100) {
      errors.push("Nomor surat maksimal 100 karakter");
    }

    if (!approvalData.letter_date) {
      errors.push("Tanggal surat harus diisi");
    }

    if (approvalData.letter_date) {
      const letterDate = parseISO(approvalData.letter_date);
      if (!isValid(letterDate)) {
        errors.push("Format tanggal surat tidak valid");
      }
    }
  }

  if (action === 'reject') {
    if (!approvalData.rejection_reason || approvalData.rejection_reason.trim().length === 0) {
      errors.push("Alasan penolakan harus diisi");
    }

    if (approvalData.rejection_reason && approvalData.rejection_reason.length > 1000) {
      errors.push("Alasan penolakan maksimal 1000 karakter");
    }
  }

  if (approvalData.notes && approvalData.notes.length > 1000) {
    errors.push("Catatan maksimal 1000 karakter");
  }

  return {
    isValid: errors.length === 0,
    errors: errors
  };
};

/**
 * Validate user permissions for proposal actions
 */
export const validateUserPermissions = (user, action, proposal = null) => {
  const errors = [];

  if (!user) {
    errors.push("User tidak terautentikasi");
    return { isValid: false, errors };
  }

  switch (action) {
    case 'create_proposal':
      if (user.role !== 'admin_unit') {
        errors.push("Hanya admin unit yang dapat membuat usulan");
      }
      if (!user.department || user.department.trim().length === 0) {
        errors.push("Unit kerja user tidak valid");
      }
      break;

    case 'view_proposal':
      if (user.role === 'admin_unit') {
        if (!proposal || proposal.proposer_unit !== user.department) {
          errors.push("Anda hanya dapat melihat usulan dari unit kerja sendiri");
        }
      } else if (user.role !== 'admin_pusat') {
        errors.push("Anda tidak memiliki akses untuk melihat usulan");
      }
      break;

    case 'approve_proposal':
    case 'reject_proposal':
      if (user.role !== 'admin_pusat') {
        errors.push("Hanya master admin yang dapat menyetujui/menolak usulan");
      }
      if (proposal && proposal.status !== 'pending') {
        errors.push("Hanya usulan dengan status pending yang dapat diproses");
      }
      break;

    case 'generate_letter':
      if (user.role !== 'admin_pusat') {
        errors.push("Hanya master admin yang dapat membuat surat usulan");
      }
      if (proposal && proposal.status !== 'approved' && proposal.status !== 'processed') {
        errors.push("Hanya usulan yang sudah disetujui yang dapat dibuat suratnya");
      }
      break;

    default:
      errors.push("Aksi tidak valid");
  }

  return {
    isValid: errors.length === 0,
    errors: errors
  };
};

/**
 * Check for potential conflicts in leave dates
 */
export const checkLeaveConflicts = (employees) => {
  const conflicts = [];
  
  for (let i = 0; i < employees.length; i++) {
    for (let j = i + 1; j < employees.length; j++) {
      const emp1 = employees[i];
      const emp2 = employees[j];
      
      // Check if same employee
      if (emp1.employee_id === emp2.employee_id) {
        const start1 = parseISO(emp1.start_date);
        const end1 = parseISO(emp1.end_date);
        const start2 = parseISO(emp2.start_date);
        const end2 = parseISO(emp2.end_date);
        
        // Check for date overlap
        if ((start1 <= end2 && end1 >= start2)) {
          conflicts.push({
            employee_name: emp1.employee_name,
            conflict: "Terdapat overlap tanggal cuti untuk pegawai yang sama"
          });
        }
      }
    }
  }
  
  return conflicts;
};

/**
 * Sanitize input data
 */
export const sanitizeProposalData = (data) => {
  const sanitized = {
    ...data,
    title: data.title?.trim(),
    notes: data.notes?.trim(),
  };

  if (data.employees) {
    sanitized.employees = data.employees.map(emp => ({
      ...emp,
      employee_name: emp.employee_name?.trim(),
      reason: emp.reason?.trim(),
      address_during_leave: emp.address_during_leave?.trim(),
    }));
  }

  return sanitized;
};
