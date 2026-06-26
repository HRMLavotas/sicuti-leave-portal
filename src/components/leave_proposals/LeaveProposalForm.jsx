import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import { AuthManager } from "@/lib/auth";
import { supabaseSimpelAdmin } from "@/lib/supabaseSSO";
import { useEmployeeData } from "@/hooks/useEmployeeData";
import { useLeaveTypes } from "@/hooks/useLeaveTypes";
import AutocompleteInput from "@/components/ui/AutocompleteInput";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, Trash2, Users, FileText, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { validateLeaveProposal, validateEmployeeLeaveItem, sanitizeProposalData, checkLeaveConflicts } from "@/utils/leaveProposalValidation";
import { countWorkingDays, fetchNationalHolidaysFromDB } from "@/utils/workingDays";

const LeaveProposalForm = ({ onSubmit, onCancel, initialData = null }) => {
  const { toast } = useToast();
  const currentUser = AuthManager.getUserSession();
  const isEmployee = currentUser?.role === 'employee';

  // Dynamic year calculation
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  // Holidays state for working day calculation
  const [holidays, setHolidays] = useState(new Set());
  const [isLoadingHolidays, setIsLoadingHolidays] = useState(false);

  // Form state
  const [proposalTitle, setProposalTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [isSelfLoading, setIsSelfLoading] = useState(false);
  const [currentLeaveItem, setCurrentLeaveItem] = useState({
    employee_id: "",
    employee_name: "",
    employee_nip: "",
    employee_department: "",
    employee_position: "",
    employee_rank: "",
    leave_type_id: "",
    leave_type_name: "",
    start_date: "",
    end_date: "",
    days_requested: 0,
    leave_quota_year: currentYear,
    reason: "",
    address_during_leave: "",
  });

  // Populate form with initial data when available
  useEffect(() => {
    if (initialData) {
      setProposalTitle(initialData.proposal_title || "");
      setNotes(initialData.notes || "");
      
      if (initialData.leave_proposal_items && initialData.leave_proposal_items.length > 0) {
        setSelectedEmployees(initialData.leave_proposal_items);
      }
    }
  }, [initialData]);

  // Fetch holidays for current and previous year on mount
  useEffect(() => {
    const loadHolidays = async () => {
      setIsLoadingHolidays(true);
      try {
        const [thisYear, lastYear] = await Promise.all([
          fetchNationalHolidaysFromDB(currentYear),
          fetchNationalHolidaysFromDB(currentYear - 1),
        ]);
        const merged = new Set([...thisYear, ...lastYear]);
        setHolidays(merged);
      } catch (err) {
        console.warn("[LeaveProposalForm] Gagal memuat hari libur:", err.message);
      } finally {
        setIsLoadingHolidays(false);
      }
    };
    loadHolidays();
  }, [currentYear]);

  // Load profile data for employee role from SIMPEL
  useEffect(() => {
    if (!isEmployee) return;

    const loadSelfProfile = async () => {
      setIsSelfLoading(true);
      try {
        const nip = currentUser?.nip;
        const userId = currentUser?.id;

        // Try by NIP first, then by SIMPEL user id
        let employee = null;
        if (nip) {
          const { data } = await supabaseSimpelAdmin
            .from("employees")
            .select("id, nip, name, department, position_name, rank_group, asn_status")
            .eq("nip", nip)
            .maybeSingle();
          employee = data;
        }

        if (!employee && userId) {
          const { data } = await supabaseSimpelAdmin
            .from("employees")
            .select("id, nip, name, department, position_name, rank_group, asn_status")
            .eq("id", userId)
            .maybeSingle();
          employee = data;
        }

        if (employee) {
          setCurrentLeaveItem(prev => ({
            ...prev,
            employee_id: employee.id,
            employee_name: employee.name,
            employee_nip: employee.nip || "",
            employee_department: employee.department || "",
            employee_position: employee.position_name || "",
            employee_rank: employee.rank_group || "",
          }));
          setProposalTitle(`Pengajuan Cuti - ${employee.name}`);
        } else {
          // Fallback to session data
          console.warn("[LeaveProposalForm] Profil pegawai tidak ditemukan di SIMPEL, fallback ke sesi.");
          setCurrentLeaveItem(prev => ({
            ...prev,
            employee_name: currentUser.name || "",
            employee_nip: currentUser.nip || "",
            employee_department: currentUser.department || "",
          }));
          setProposalTitle(`Pengajuan Cuti - ${currentUser.name || "Pegawai"}`);
        }
      } catch (err) {
        console.error("[LeaveProposalForm] Error loading self profile:", err);
        toast({
          variant: "destructive",
          title: "Gagal Memuat Profil",
          description: "Tidak dapat memuat data pegawai Anda dari SIMPEL.",
        });
      } finally {
        setIsSelfLoading(false);
      }
    };

    loadSelfProfile();
  }, [isEmployee, currentUser?.id, currentUser?.nip]); // eslint-disable-line react-hooks/exhaustive-deps

  // Data hooks (only used for admin roles)
  const { displayedEmployees, isLoading: loadingEmployees } = useEmployeeData("", "", "", "", "", 1);
  const { leaveTypes, isLoading: loadingLeaveTypes } = useLeaveTypes();

  // Employee autocomplete options
  const employeeOptions = displayedEmployees.map((emp) => ({
    value: emp.id,
    label: `${emp.name} (${emp.nip}) - ${emp.position_name || "-"}`,
    employee: emp,
  }));

  // Leave type options
  const leaveTypeOptions = leaveTypes.map((type) => ({
    value: type.id,
    label: type.name,
    leaveType: type,
  }));

  // Recalculate working days whenever dates or holidays change
  useEffect(() => {
    if (currentLeaveItem.start_date && currentLeaveItem.end_date) {
      const days = countWorkingDays(
        currentLeaveItem.start_date,
        currentLeaveItem.end_date,
        holidays,
      );
      setCurrentLeaveItem(prev => ({ ...prev, days_requested: days > 0 ? days : 0 }));
    } else {
      setCurrentLeaveItem(prev => ({ ...prev, days_requested: 0 }));
    }
  }, [currentLeaveItem.start_date, currentLeaveItem.end_date, holidays]);

  const handleEmployeeSelect = (employeeId) => {
    const employee = displayedEmployees.find(emp => emp.id === employeeId);
    if (employee) {
      setCurrentLeaveItem(prev => ({
        ...prev,
        employee_id: employee.id,
        employee_name: employee.name,
        employee_nip: employee.nip || "",
        employee_department: employee.department || "",
        employee_position: employee.position_name || "",
        employee_rank: employee.rank_group || "",
      }));
    }
  };

  const handleLeaveTypeSelect = (leaveTypeId) => {
    const leaveType = leaveTypes.find(type => type.id === leaveTypeId);
    if (leaveType) {
      setCurrentLeaveItem(prev => ({
        ...prev,
        leave_type_id: leaveType.id,
        leave_type_name: leaveType.name,
      }));
    }
  };

  const addEmployeeToProposal = () => {
    const validationErrors = validateEmployeeLeaveItem(currentLeaveItem);
    if (validationErrors.length > 0) {
      toast({ title: "Error", description: validationErrors[0], variant: "destructive" });
      return;
    }

    const existingEmployee = selectedEmployees.find(emp => emp.employee_id === currentLeaveItem.employee_id);
    if (existingEmployee) {
      toast({ title: "Error", description: "Pegawai sudah ditambahkan ke usulan", variant: "destructive" });
      return;
    }

    const potentialConflicts = checkLeaveConflicts([...selectedEmployees, currentLeaveItem]);
    if (potentialConflicts.length > 0) {
      toast({ title: "Warning", description: potentialConflicts[0].conflict, variant: "destructive" });
      return;
    }

    setSelectedEmployees(prev => [...prev, { ...currentLeaveItem }]);

    // Reset form (keep employee select cleared, keep leave_quota_year)
    setCurrentLeaveItem(prev => ({
      employee_id: "",
      employee_name: "",
      employee_nip: "",
      employee_department: "",
      employee_position: "",
      employee_rank: "",
      leave_type_id: "",
      leave_type_name: "",
      start_date: "",
      end_date: "",
      days_requested: 0,
      leave_quota_year: prev.leave_quota_year,
      reason: "",
      address_during_leave: "",
    }));

    toast({ title: "Berhasil", description: "Pegawai berhasil ditambahkan ke usulan" });
  };

  const removeEmployeeFromProposal = (index) => {
    setSelectedEmployees(prev => prev.filter((_, i) => i !== index));
    toast({ title: "Berhasil", description: "Pegawai dihapus dari usulan" });
  };

  const handleSubmitProposal = async () => {
    try {
      let finalEmployees = selectedEmployees;

      if (isEmployee) {
        const validationErrors = validateEmployeeLeaveItem(currentLeaveItem);
        if (validationErrors.length > 0) {
          toast({ title: "Error", description: validationErrors[0], variant: "destructive" });
          return;
        }
        finalEmployees = [currentLeaveItem];
      }

      const proposerUnit = isEmployee
        ? currentLeaveItem.employee_department
        : (currentUser.department || "Unknown");

      const proposalData = {
        title: proposalTitle || `Pengajuan Cuti - ${currentLeaveItem.employee_name}`,
        notes,
        employees: finalEmployees,
        proposer_unit: proposerUnit,
      };

      const validation = validateLeaveProposal(proposalData);
      if (!validation.isValid) {
        toast({ title: "Error", description: validation.errors[0], variant: "destructive" });
        return;
      }

      const sanitizedData = sanitizeProposalData(proposalData);
      await onSubmit(sanitizedData);

      if (!isEmployee) {
        setProposalTitle("");
        setNotes("");
        setSelectedEmployees([]);
      }
    } catch (error) {
      console.error("Error submitting proposal:", error);
      toast({
        title: "Error",
        description: "Gagal membuat pengajuan/usulan: " + error.message,
        variant: "destructive",
      });
    }
  };

  const isProfileReady = !isEmployee || (!!currentLeaveItem.employee_name && !isSelfLoading);

  return (
    <div className="space-y-6 text-white">
      {/* Header Info */}
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            {isEmployee ? <FileText className="w-5 h-5 mr-2" /> : <Users className="w-5 h-5 mr-2" />}
            {isEmployee ? "Formulir Pengajuan Cuti Mandiri" : `Buat Usulan Cuti - ${currentUser?.department || ""}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEmployee ? (
            <>
              {isSelfLoading ? (
                <div className="p-4 text-center text-slate-400 text-sm">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400 mx-auto mb-2" />
                  Memuat profil pegawai...
                </div>
              ) : !currentLeaveItem.employee_name ? (
                <Alert className="border-amber-600/50 bg-amber-900/20">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <AlertDescription className="text-amber-300">
                    Profil pegawai Anda tidak ditemukan di database SIMPEL. Pengajuan cuti tidak dapat dilanjutkan. Hubungi Admin Pusat.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="p-4 bg-slate-700/40 rounded border border-slate-600/50">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-400">Nama Pegawai:</span>
                      <p className="font-semibold text-white">{currentLeaveItem.employee_name}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">NIP:</span>
                      <p className="font-semibold text-white font-mono">{currentLeaveItem.employee_nip || "-"}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Unit Kerja:</span>
                      <p className="font-semibold text-white">{currentLeaveItem.employee_department || "-"}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Jabatan:</span>
                      <p className="font-semibold text-white">{currentLeaveItem.employee_position || "-"}</p>
                    </div>
                    {currentLeaveItem.employee_rank && (
                      <div>
                        <span className="text-slate-400">Pangkat/Gol:</span>
                        <p className="font-semibold text-white">{currentLeaveItem.employee_rank}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <Label htmlFor="proposal-title" className="text-slate-300">Judul Usulan</Label>
                <Input
                  id="proposal-title"
                  value={proposalTitle}
                  onChange={(e) => setProposalTitle(e.target.value)}
                  placeholder="Contoh: Usulan Cuti Bersama Hari Raya..."
                  className="bg-slate-700/50 border-slate-600/50 text-white"
                />
              </div>
              <div>
                <Label htmlFor="notes" className="text-slate-300">Catatan (Opsional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Catatan tambahan untuk usulan ini..."
                  className="bg-slate-700/50 border-slate-600/50 text-white"
                  rows={2}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Main Leave Details */}
      {isProfileReady && (
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-white flex items-center justify-between">
              <span>Detail Pengajuan Cuti</span>
              {isLoadingHolidays && (
                <span className="text-xs text-slate-400 font-normal flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full border border-slate-400 border-t-transparent animate-spin" />
                  Memuat kalender hari libur...
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {!isEmployee && (
                <div>
                  <Label className="text-slate-300">Pilih Pegawai</Label>
                  <AutocompleteInput
                    value={currentLeaveItem.employee_id}
                    onChange={handleEmployeeSelect}
                    options={employeeOptions}
                    loading={loadingEmployees}
                    placeholder="Cari pegawai..."
                    className="bg-slate-700/50 border-slate-600/50"
                  />
                </div>
              )}
              <div className={isEmployee ? "col-span-2 md:col-span-1" : ""}>
                <Label className="text-slate-300">Jenis Cuti</Label>
                <AutocompleteInput
                  value={currentLeaveItem.leave_type_id}
                  onChange={handleLeaveTypeSelect}
                  options={leaveTypeOptions}
                  loading={loadingLeaveTypes}
                  placeholder="Pilih jenis cuti..."
                  className="bg-slate-700/50 border-slate-600/50"
                />
              </div>
              <div>
                <Label className="text-slate-300">Tahun Jatah Cuti</Label>
                <select
                  value={currentLeaveItem.leave_quota_year}
                  onChange={(e) => setCurrentLeaveItem(prev => ({ ...prev, leave_quota_year: parseInt(e.target.value) }))}
                  className="flex h-10 w-full rounded-md border border-slate-600/50 bg-slate-700/50 px-3 py-2 text-sm text-white focus:outline-none"
                >
                  <option value={currentYear}>{currentYear} (Tahun Berjalan)</option>
                  <option value={currentYear - 1}>{currentYear - 1} (Penangguhan)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-slate-300">Tanggal Mulai</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left bg-slate-700/50 border-slate-600/50 text-white"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {currentLeaveItem.start_date
                        ? format(new Date(currentLeaveItem.start_date), "dd MMM yyyy", { locale: id })
                        : "Pilih tanggal"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-slate-800 border-slate-600">
                    <Calendar
                      mode="single"
                      selected={currentLeaveItem.start_date ? new Date(currentLeaveItem.start_date) : undefined}
                      onSelect={(date) =>
                        setCurrentLeaveItem(prev => ({
                          ...prev,
                          start_date: date ? format(date, "yyyy-MM-dd") : "",
                        }))
                      }
                      initialFocus
                      className="text-white"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-slate-300">Tanggal Selesai</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left bg-slate-700/50 border-slate-600/50 text-white"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {currentLeaveItem.end_date
                        ? format(new Date(currentLeaveItem.end_date), "dd MMM yyyy", { locale: id })
                        : "Pilih tanggal"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-slate-800 border-slate-600">
                    <Calendar
                      mode="single"
                      selected={currentLeaveItem.end_date ? new Date(currentLeaveItem.end_date) : undefined}
                      onSelect={(date) =>
                        setCurrentLeaveItem(prev => ({
                          ...prev,
                          end_date: date ? format(date, "yyyy-MM-dd") : "",
                        }))
                      }
                      disabled={(date) =>
                        currentLeaveItem.start_date ? date < new Date(currentLeaveItem.start_date) : false
                      }
                      initialFocus
                      className="text-white"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-slate-300">Durasi Hari Kerja</Label>
                <div className="flex h-10 w-full items-center rounded-md border border-slate-600/50 bg-slate-600/50 px-3 text-white font-semibold">
                  {currentLeaveItem.days_requested > 0
                    ? `${currentLeaveItem.days_requested} hari kerja`
                    : <span className="text-slate-400 font-normal text-sm">Pilih rentang tanggal</span>}
                </div>
                {currentLeaveItem.start_date && currentLeaveItem.end_date && !isLoadingHolidays && (
                  <p className="text-xs text-slate-400 mt-1">
                    Tidak termasuk Sabtu, Minggu &amp; hari libur nasional
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Alasan Cuti</Label>
                <Textarea
                  value={currentLeaveItem.reason}
                  onChange={(e) => setCurrentLeaveItem(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Jelaskan alasan pengajuan cuti Anda..."
                  className="bg-slate-700/50 border-slate-600/50 text-white"
                  rows={2}
                />
              </div>
              <div>
                <Label className="text-slate-300">Alamat Selama Cuti</Label>
                <Textarea
                  value={currentLeaveItem.address_during_leave}
                  onChange={(e) => setCurrentLeaveItem(prev => ({ ...prev, address_during_leave: e.target.value }))}
                  placeholder="Alamat lengkap / nomor telepon yang aktif selama cuti..."
                  className="bg-slate-700/50 border-slate-600/50 text-white"
                  rows={2}
                />
              </div>
            </div>

            {!isEmployee && (
              <Button onClick={addEmployeeToProposal} className="w-full bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Tambah Pegawai ke Usulan
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Selected Employees List (Admin batch mode) */}
      {!isEmployee && selectedEmployees.length > 0 && (
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-white">
              Daftar Pegawai dalam Usulan ({selectedEmployees.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {selectedEmployees.map((employee, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg border border-slate-600/50"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm font-bold">
                          {employee.employee_name.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <h4 className="text-white font-medium">{employee.employee_name}</h4>
                        <p className="text-slate-400 text-sm">
                          {employee.employee_nip} — {employee.employee_position || "-"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="secondary">{employee.leave_type_name}</Badge>
                      <Badge variant="outline">
                        {format(new Date(employee.start_date), "dd MMM", { locale: id })} -{" "}
                        {format(new Date(employee.end_date), "dd MMM yyyy", { locale: id })}
                      </Badge>
                      <Badge variant="outline">{employee.days_requested} hari kerja</Badge>
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeEmployeeFromProposal(index)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-end space-x-3 pt-4">
        <Button variant="outline" onClick={onCancel} className="bg-slate-700 hover:bg-slate-600 border-slate-600">
          Batal
        </Button>
        <Button
          onClick={handleSubmitProposal}
          disabled={
            (isEmployee && (!isProfileReady || !currentLeaveItem.employee_id)) ||
            (!isEmployee && selectedEmployees.length === 0)
          }
          className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
        >
          {isEmployee
            ? "Kirim Pengajuan Cuti"
            : `Kirim Usulan (${selectedEmployees.length} pegawai)`}
        </Button>
      </div>
    </div>
  );
};

export default LeaveProposalForm;
