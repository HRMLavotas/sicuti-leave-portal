/**
 * EmployeeLeaveRequestForm
 *
 * Wrapper yang membungkus LeaveRequestForm untuk digunakan oleh role 'employee'
 * di menu Usulan Cuti. Bedanya dengan penggunaan normal:
 *
 * 1. Profil pegawai di-detect otomatis dari SIMPEL berdasarkan sesi user yang login.
 * 2. Kolom pencarian pegawai disembunyikan — employee tidak perlu memilih dirinya sendiri.
 * 3. Submit TIDAK langsung ke leave_requests, melainkan membuat leave_proposal
 *    (status 'pending') yang kemudian menunggu persetujuan Admin Unit.
 */

import React, { useState, useEffect, useMemo } from "react";
import { AuthManager } from "@/lib/auth";
import { supabaseSimpelAdmin } from "@/lib/supabaseSSO";
import { supabase } from "@/lib/supabaseClient";
import { useLeaveTypes } from "@/hooks/useLeaveTypes";
import { useToast } from "@/components/ui/use-toast";
import { countWorkingDays, fetchNationalHolidaysFromDB } from "@/utils/workingDays";
import { calculateLeaveBalance, ensureLeaveBalance } from "@/utils/leaveBalanceCalculator";
import { attachSicutiEmployeeIds, resolveSicutiEmployeeIds } from "@/utils/sicutiEmployeeResolver";
import { Loader2, AlertTriangle, Upload, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { LeaveDocumentUploader } from "@/components/leave_documents/LeaveDocumentUploader";

// ─── Main Component ───────────────────────────────────────────────────────────
const EmployeeLeaveRequestForm = ({ onSubmit, onCancel, initialData = null }) => {
  const { toast } = useToast();
  const currentUser = AuthManager.getUserSession();
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  // ── Profile state ──────────────────────────────────────────────────────────
  const [profile, setProfile] = useState(null);       // data pegawai dari SIMPEL
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");

  // ── Form state ─────────────────────────────────────────────────────────────
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [addressDuringLeave, setAddressDuringLeave] = useState("");
  const [leaveQuotaYear, setLeaveQuotaYear] = useState(currentYear.toString());
  const [leavePeriod, setLeavePeriod] = useState(currentYear.toString());
  const [appFormDate, setAppFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Document upload state
  const [proposalItemId, setProposalItemId] = useState(null);
  const [documentsRefresh, setDocumentsRefresh] = useState(0);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);

  // Populate form with initial data when available
  useEffect(() => {
    if (initialData && initialData.leave_proposal_items && initialData.leave_proposal_items.length > 0) {
      const item = initialData.leave_proposal_items[0];
      setLeaveTypeId(item.leave_type_id);
      setStartDate(item.start_date);
      setEndDate(item.end_date);
      setReason(item.reason || "");
      setAddressDuringLeave(item.address_during_leave || "");
      setLeaveQuotaYear(item.leave_quota_year?.toString() || currentYear.toString());
      setLeavePeriod(item.leave_period?.toString() || currentYear.toString());
      setAppFormDate(item.application_form_date || new Date().toISOString().split("T")[0]);
      
      // Set proposal item ID for document upload
      setProposalItemId(item.id);
    }
  }, [initialData, currentYear]);

  // ── Derived / computed ─────────────────────────────────────────────────────
  const [holidays, setHolidays] = useState(new Set());
  const [holidaysLoading, setHolidaysLoading] = useState(false);
  const [daysRequested, setDaysRequested] = useState(0);
  const [overlapWarning, setOverlapWarning] = useState("");
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState("");

  const { leaveTypes, isLoadingLeaveTypes } = useLeaveTypes();
  const selectedLeaveType = useMemo(
    () => leaveTypes.find(t => t.id === leaveTypeId) || null,
    [leaveTypes, leaveTypeId],
  );

  // Quota year options depend on selected period
  const quotaYears = useMemo(() => [
    { value: leavePeriod, label: `${leavePeriod} (Tahun Berjalan)` },
    { value: (parseInt(leavePeriod) - 1).toString(), label: `${parseInt(leavePeriod) - 1} (Penangguhan)` },
  ], [leavePeriod]);

  // ── 1. Auto-detect profil dari SIMPEL ──────────────────────────────────────
  useEffect(() => {
    const loadProfile = async () => {
      setProfileLoading(true);
      setProfileError("");
      try {
        let emp = null;

        // Coba by NIP dulu
        if (currentUser?.nip) {
          const { data } = await supabaseSimpelAdmin
            .from("employees")
            .select("id, nip, name, department, position_name, rank_group, asn_status")
            .eq("nip", currentUser.nip)
            .maybeSingle();
          emp = data;
        }

        // Fallback by user UUID dari SIMPEL
        if (!emp && currentUser?.id) {
          const { data } = await supabaseSimpelAdmin
            .from("employees")
            .select("id, nip, name, department, position_name, rank_group, asn_status")
            .eq("id", currentUser.id)
            .maybeSingle();
          emp = data;
        }

        if (emp) {
          const nipToLocalId = await resolveSicutiEmployeeIds([emp]);
          const [resolvedEmp] = attachSicutiEmployeeIds([emp], nipToLocalId);

          if (!resolvedEmp) {
            setProfileError(
              "Profil ditemukan di SIMPEL, tetapi belum dapat dipetakan ke data pegawai SiCuti. Hubungi Admin Unit/Admin Pusat.",
            );
            return;
          }

          setProfile(resolvedEmp);
        } else {
          // Fallback ke data sesi jika tidak ada di SIMPEL
          if (currentUser?.name) {
            setProfile({
              id: currentUser.id,
              nip: currentUser.nip || "",
              name: currentUser.name,
              department: currentUser.department || "",
              position_name: "",
              rank_group: "",
            });
            setProfileError(
              "Profil lengkap tidak ditemukan di SIMPEL. Data diambil dari sesi login — beberapa informasi mungkin tidak lengkap.",
            );
          } else {
            setProfileError(
              "Profil pegawai tidak ditemukan. Pastikan akun Anda terdaftar di SIMPEL atau hubungi Admin Pusat.",
            );
          }
        }
      } catch (err) {
        console.error("[EmployeeLeaveRequestForm] loadProfile error:", err);
        setProfileError("Gagal memuat profil pegawai: " + err.message);
      } finally {
        setProfileLoading(false);
      }
    };

    loadProfile();
  }, [currentUser?.id, currentUser?.nip]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2. Load holidays ───────────────────────────────────────────────────────
  useEffect(() => {
    const loadHolidays = async () => {
      if (!startDate && !endDate) return;
      setHolidaysLoading(true);
      try {
        const startYear = startDate ? new Date(startDate).getFullYear() : currentYear;
        const endYear = endDate ? new Date(endDate).getFullYear() : startYear;
        const years = startYear === endYear ? [startYear] : [startYear, endYear];
        const sets = await Promise.all(years.map(y => fetchNationalHolidaysFromDB(y)));
        const merged = new Set();
        sets.forEach(s => s.forEach(d => merged.add(d)));
        setHolidays(merged);
      } catch (err) {
        console.warn("Gagal memuat hari libur:", err.message);
      } finally {
        setHolidaysLoading(false);
      }
    };
    loadHolidays();
  }, [startDate, endDate, currentYear]);

  // ── 3. Hitung hari kerja ───────────────────────────────────────────────────
  useEffect(() => {
    if (startDate && endDate) {
      const days = countWorkingDays(startDate, endDate, holidays);
      setDaysRequested(days > 0 ? days : 0);
    } else {
      setDaysRequested(0);
    }
  }, [startDate, endDate, holidays]);

  // ── 4. Cek overlap ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.id || !startDate || !endDate) { setOverlapWarning(""); return; }
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("leave_requests")
          .select("id, start_date, end_date, leave_types(name)")
          .eq("employee_id", profile.id)
          .lte("start_date", endDate)
          .gte("end_date", startDate);
        if (error) throw error;
        if (data?.length > 0) {
          const c = data[0];
          setOverlapWarning(
            `⚠️ Terdapat pengajuan cuti lain (${c.leave_types?.name || "?"}) pada tanggal yang beririsan: ${c.start_date} s.d. ${c.end_date}`,
          );
        } else {
          setOverlapWarning("");
        }
      } catch { setOverlapWarning(""); }
    }, 500);
    return () => clearTimeout(timer);
  }, [profile?.id, startDate, endDate]);

  // ── 5. Load saldo cuti ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.id || !selectedLeaveType) {
      setLeaveBalance(null); setBalanceError(""); return;
    }
    let cancelled = false;
    (async () => {
      setBalanceLoading(true); setBalanceError("");
      try {
        const year = parseInt(leavePeriod) || currentYear;
        const dbBalance = await ensureLeaveBalance(supabase, profile.id, selectedLeaveType.id, year, selectedLeaveType);
        const { data: reqs } = await supabase
          .from("leave_requests")
          .select("days_requested, leave_quota_year, leave_period, start_date, leave_type_id")
          .eq("employee_id", profile.id)
          .eq("leave_type_id", selectedLeaveType.id);

        const calc = calculateLeaveBalance({
          dbBalance, leaveRequests: reqs || [], leaveType: selectedLeaveType, year, currentYear,
        });
        if (!cancelled) setLeaveBalance({
          ...calc,
          periodYear: year,
          remaining_current: Math.max(0, (calc.total || 0) - (calc.used_current || 0)),
          remaining_deferred: Math.max(0, (calc.deferred || 0) - (calc.used_deferred || 0)),
        });
      } catch (err) {
        if (!cancelled) { setLeaveBalance(null); setBalanceError(err.message); }
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.id, selectedLeaveType, leavePeriod, currentYear]);

  // ── Helper functions ───────────────────────────────────────────────────────
  const uploadDocument = async (proposalItemId, file) => {
    try {
      const formData = new FormData();
      formData.append('leave_proposal_item_id', proposalItemId);
      formData.append('slot_code', 'formulir_cuti');
      formData.append('slot_label', 'Formulir Cuti & Dokumen Pendukung');
      formData.append('file', file);

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/leave-doc-upload`;
      
      const resp = await fetch(url, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `HTTP ${resp.status}`);
      }

      console.log('Document uploaded successfully');
    } catch (error) {
      console.error('Upload document error:', error);
      toast({
        title: 'Dokumen gagal diupload',
        description: 'Pengajuan cuti berhasil, tapi dokumen gagal diupload. Anda bisa upload ulang nanti.',
        variant: 'destructive'
      });
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      toast({ title: 'File terlalu besar', description: 'Maksimal 20MB', variant: 'destructive' });
      return;
    }

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 
                          'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: 'Format tidak didukung', description: 'Hanya PDF, JPG, PNG, DOC, DOCX', variant: 'destructive' });
      return;
    }

    setUploadedFile(file);
    setFilePreview(file.name);
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setFilePreview(null);
  };

  // ── 6. Submit → buat leave_proposal ───────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!profile?.id) {
      toast({ variant: "destructive", title: "Profil tidak ditemukan", description: "Tidak dapat membuat pengajuan tanpa data pegawai." });
      return;
    }
    if (!leaveTypeId || !startDate || !endDate) {
      toast({ variant: "destructive", title: "Data Tidak Lengkap", description: "Jenis cuti, tanggal mulai, dan tanggal selesai wajib diisi." });
      return;
    }
    if (daysRequested <= 0) {
      toast({ variant: "destructive", title: "Tanggal Tidak Valid", description: "Tanggal selesai harus setelah tanggal mulai." });
      return;
    }
    if (overlapWarning) {
      toast({ variant: "destructive", title: "Tanggal Bertabrakan", description: "Mohon ganti tanggal karena bertabrakan dengan pengajuan lain." });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onSubmit({
        title: `Pengajuan Cuti - ${profile.name}`,
        notes: reason || "",
        proposer_id: profile.id,
        proposer_unit: profile.department || currentUser?.department || "Unknown",
        employees: [{
          employee_id: profile.id,
          employee_name: profile.name,
          employee_nip: profile.nip || "",
          employee_department: profile.department || "",
          employee_position: profile.position_name || "",
          employee_rank: profile.rank_group || "",
          leave_type_id: leaveTypeId,
          leave_type_name: selectedLeaveType?.name || "",
          start_date: startDate,
          end_date: endDate,
          days_requested: daysRequested,
          leave_quota_year: parseInt(leaveQuotaYear) || currentYear,
          leave_period: parseInt(leavePeriod) || currentYear,
          reason: reason || "",
          address_during_leave: addressDuringLeave || "",
          application_form_date: appFormDate,
        }],
      });
      
      // Store proposal item ID for document upload
      if (result && result.leave_proposal_items && result.leave_proposal_items.length > 0) {
        const itemId = result.leave_proposal_items[0].id;
        setProposalItemId(itemId);
        
        // Upload dokumen jika ada file yang dipilih
        if (uploadedFile) {
          await uploadDocument(itemId, uploadedFile);
        }
        
        // Show success toast
        toast({
          title: "Pengajuan Cuti Berhasil Dibuat",
          description: uploadedFile 
            ? "Pengajuan cuti berhasil dibuat. Dokumen yang dilampirkan sudah tersimpan."
            : "Pengajuan cuti berhasil dibuat.",
        });
      }
      
      // Call onSubmitSuccess to close form
      onSubmitSuccess();
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  if (profileLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        <p className="text-sm">Memuat profil pegawai dari SIMPEL...</p>
      </div>
    );
  }

  const canSubmit = !!profile?.id && !profileError.includes("tidak ditemukan");

  return (
    <form onSubmit={handleSubmit} className="space-y-5 text-white">

      {/* ── Profil Pegawai ── */}
      {profileError && (
        <Alert className="border-amber-600/50 bg-amber-900/20">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <AlertDescription className="text-amber-300 text-sm">{profileError}</AlertDescription>
        </Alert>
      )}

      {profile && (
        <div className="p-4 bg-slate-700/40 rounded-lg border border-slate-600/50">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Identitas Pemohon (otomatis dari SIMPEL)</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-slate-400">Nama</span>
              <p className="font-semibold text-white">{profile.name}</p>
            </div>
            <div>
              <span className="text-slate-400">NIP</span>
              <p className="font-mono text-white">{profile.nip || "—"}</p>
            </div>
            <div>
              <span className="text-slate-400">Unit Kerja</span>
              <p className="text-white">{profile.department || "—"}</p>
            </div>
            <div>
              <span className="text-slate-400">Jabatan</span>
              <p className="text-white">{profile.position_name || "—"}</p>
            </div>
            {profile.rank_group && (
              <div>
                <span className="text-slate-400">Pangkat / Gol.</span>
                <p className="text-white">{profile.rank_group}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Jenis Cuti ── */}
      <div>
        <Label className="text-slate-300">Jenis Cuti *</Label>
        <Select value={leaveTypeId} onValueChange={setLeaveTypeId} required disabled={!canSubmit}>
          <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-white">
            <SelectValue placeholder={isLoadingLeaveTypes ? "Memuat..." : "Pilih jenis cuti"} />
          </SelectTrigger>
          <SelectContent className="bg-slate-700 border-slate-600">
            {leaveTypes.map(t => (
              <SelectItem key={t.id} value={t.id} className="text-white hover:bg-slate-600">{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Tanggal ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label className="text-slate-300">Tanggal Mulai *</Label>
          <Input
            type="date" value={startDate} required disabled={!canSubmit}
            onChange={e => {
              const v = e.target.value;
              setStartDate(v);
              if (v) {
                const y = new Date(v).getFullYear().toString();
                setLeavePeriod(y);
                setLeaveQuotaYear(y);
              }
            }}
            className="mt-1 bg-slate-700 border-slate-600 text-white"
          />
        </div>
        <div>
          <Label className="text-slate-300">Tanggal Selesai *</Label>
          <Input
            type="date" value={endDate} required disabled={!canSubmit}
            min={startDate}
            onChange={e => setEndDate(e.target.value)}
            className="mt-1 bg-slate-700 border-slate-600 text-white"
          />
        </div>
        <div>
          <Label className="text-slate-300">Durasi Hari Kerja</Label>
          <div className="mt-1 flex h-10 items-center rounded-md border border-slate-600 bg-slate-600/50 px-3 font-semibold">
            {holidaysLoading ? (
              <span className="text-slate-400 text-sm font-normal flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> menghitung...
              </span>
            ) : daysRequested > 0 ? (
              `${daysRequested} hari kerja`
            ) : (
              <span className="text-slate-400 text-sm font-normal">Pilih tanggal</span>
            )}
          </div>
          {startDate && endDate && !holidaysLoading && (
            <p className="text-xs text-slate-400 mt-1">Tidak termasuk Sabtu, Minggu &amp; hari libur nasional</p>
          )}
        </div>
      </div>

      {/* ── Overlap warning ── */}
      {overlapWarning && (
        <div className="p-3 bg-red-900/40 border border-red-500/50 rounded text-red-300 text-sm">
          {overlapWarning}
        </div>
      )}

      {/* ── Periode & Jatah ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label className="text-slate-300">
            Periode Cuti
            <span className="text-xs text-slate-400 block">Tahun periode cuti yang diajukan</span>
          </Label>
          <Select
            value={leavePeriod}
            onValueChange={v => { setLeavePeriod(v); setLeaveQuotaYear(v); }}
            disabled={!canSubmit}
          >
            <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-700 border-slate-600">
              {Array.from({ length: currentYear - 2023 }, (_, i) => (currentYear - i).toString()).map(y => (
                <SelectItem key={y} value={y} className="text-white hover:bg-slate-600">{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Saldo cuti */}
          <div className="mt-2 p-2 rounded border border-slate-600/50 bg-slate-800/30">
            {!profile?.id || !selectedLeaveType ? (
              <p className="text-xs text-slate-400">Pilih jenis cuti untuk melihat saldo.</p>
            ) : balanceLoading ? (
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Memuat saldo...
              </p>
            ) : balanceError ? (
              <p className="text-xs text-red-300">{balanceError}</p>
            ) : leaveBalance ? (
              <div className="text-xs text-slate-300 space-y-0.5">
                <p><strong>Saldo {leaveBalance.periodYear}</strong>: {leaveBalance.remaining ?? leaveBalance.remaining_current} hari</p>
                <p className="text-slate-400">Tahun berjalan: {leaveBalance.remaining_current} hari</p>
                <p className="text-slate-400">Penangguhan: {leaveBalance.remaining_deferred} hari</p>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Saldo tidak tersedia.</p>
            )}
          </div>
        </div>

        <div>
          <Label className="text-slate-300">
            Jatah Cuti Tahun
            <span className="text-xs text-slate-400 block">Saldo mana yang digunakan</span>
          </Label>
          <Select value={leaveQuotaYear} onValueChange={setLeaveQuotaYear} disabled={!canSubmit}>
            <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-700 border-slate-600">
              {quotaYears.map(y => (
                <SelectItem key={y.value} value={y.value} className="text-white hover:bg-slate-600">{y.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mt-2 p-2 rounded border border-slate-600/50 bg-slate-800/30 text-xs">
            {parseInt(leaveQuotaYear) < currentYear ? (
              <p className="text-yellow-400">⚠️ Menggunakan saldo penangguhan tahun {leaveQuotaYear}.</p>
            ) : (
              <p className="text-green-400">✓ Menggunakan saldo tahun berjalan {leaveQuotaYear}.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Tanggal formulir & Upload Dokumen ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label className="text-slate-300">
            Tanggal Formulir Pengajuan
            <span className="text-xs text-slate-400 block">Tanggal Anda mengisi formulir ini</span>
          </Label>
          <Input
            type="date" value={appFormDate}
            onChange={e => setAppFormDate(e.target.value)}
            className="mt-1 bg-slate-700 border-slate-600 text-white"
            disabled={!canSubmit}
          />
        </div>
        
        {/* Upload Dokumen Formulir Cuti */}
        <div>
          <Label className="text-slate-300">
            Lampiran Formulir Cuti
            <span className="text-xs text-slate-400 block">(Formulir & dokumen pendukung - Opsional)</span>
          </Label>
          <div className="mt-1">
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload-employee"
            />
            <div className="rounded-md border border-slate-600 bg-slate-700 p-3 space-y-3">
              {filePreview ? (
                <div className="flex items-center justify-between gap-2 rounded bg-slate-600/50 p-2 text-xs text-white">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <FileText className="h-4 w-4 text-slate-300 flex-shrink-0" />
                    <span className="truncate">{filePreview}</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleRemoveFile}
                    className="h-6 w-6 p-0 text-slate-300 hover:text-white hover:bg-slate-600"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('file-upload-employee').click()}
                  className="w-full bg-slate-600 border-slate-500 text-white hover:bg-slate-500"
                  disabled={!canSubmit}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Pilih File (PDF, JPG, PNG, DOC, DOCX)
                </Button>
              )}
              <p className="text-xs text-slate-400">
                💡 File akan otomatis diupload ke Google Drive saat pengajuan disimpan
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Alasan & Alamat ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label className="text-slate-300">Alasan Cuti</Label>
          <Textarea
            value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Jelaskan alasan pengajuan cuti Anda..."
            rows={3} disabled={!canSubmit}
            className="mt-1 bg-slate-700 border-slate-600 text-white"
          />
        </div>
        <div>
          <Label className="text-slate-300">Alamat Selama Cuti</Label>
          <Textarea
            value={addressDuringLeave} onChange={e => setAddressDuringLeave(e.target.value)}
            placeholder="Alamat lengkap / nomor telepon aktif selama cuti..."
            rows={3} disabled={!canSubmit}
            className="mt-1 bg-slate-700 border-slate-600 text-white"
          />
        </div>
      </div>

      {/* ── Catatan alur ── */}
      {!proposalItemId && (
        <div className="p-3 bg-blue-900/20 border border-blue-700/40 rounded text-xs text-blue-300">
          <strong>Alur Pengajuan:</strong> Pengajuan ini akan dikirim ke Admin Unit untuk ditinjau.
          Admin Unit dapat menyetujui, menolak, atau meneruskan ke Admin Pusat.
          Status persetujuan dapat dipantau di halaman ini.
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}
          className="bg-slate-700 hover:bg-slate-600 border-slate-600 text-white">
          Batal
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || !canSubmit || !leaveTypeId || !startDate || !endDate || daysRequested <= 0}
          className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
        >
          {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Mengirim...</> : "Kirim Pengajuan Cuti"}
        </Button>
      </div>
    </form>
  );
};

export default EmployeeLeaveRequestForm;
