import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { Search } from "lucide-react";

const EmployeeForm = ({
  employee,
  onFormSubmit,
  onCancel,
  departments = [],
  isLoadingDepartments = false,
}) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    nip: "",
    rank_group: "",
    position_name: "",
    position_type: "",
    asn_status: "",
    department: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [departmentSearchTerm, setDepartmentSearchTerm] = useState("");
  const [showDepartmentDropdown, setShowDepartmentDropdown] = useState(false);

  useEffect(() => {
    if (employee) {
      setFormData({
        name: employee.name || "",
        nip: employee.nip || "",
        rank_group: employee.rank_group || "",
        position_name: employee.position_name || "",
        position_type: employee.position_type || "",
        asn_status: employee.asn_status || "",
        department: employee.department || "",
      });
      setDepartmentSearchTerm(employee.department || "");
    } else {
      setFormData({
        name: "",
        nip: "",
        rank_group: "",
        position_name: "",
        position_type: "",
        asn_status: "",
        department: "",
      });
      setDepartmentSearchTerm("");
    }
  }, [employee]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleDepartmentChange = (value) => {
    setDepartmentSearchTerm(value);
    setFormData((prev) => ({ ...prev, department: value }));
  };

  const handleSelectDepartment = (department) => {
    setFormData((prev) => ({ ...prev, department: department.name }));
    setDepartmentSearchTerm(department.name);
    setShowDepartmentDropdown(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Validasi field mandatory
    if (!formData.name.trim()) {
      toast({
        variant: "destructive",
        title: "Nama Lengkap wajib diisi",
        description: "Silakan masukkan nama lengkap pegawai.",
      });
      setIsSubmitting(false);
      return;
    }

    if (!formData.position_name.trim()) {
      toast({
        variant: "destructive",
        title: "Jabatan wajib diisi",
        description: "Silakan masukkan jabatan pegawai.",
      });
      setIsSubmitting(false);
      return;
    }

    if (!formData.department.trim()) {
      toast({
        variant: "destructive",
        title: "Unit Penempatan wajib diisi",
        description: "Silakan pilih atau masukkan unit penempatan pegawai.",
      });
      setIsSubmitting(false);
      return;
    }

    if (!formData.position_type) {
      toast({
        variant: "destructive",
        title: "Jenis Jabatan wajib dipilih",
        description: "Silakan pilih jenis jabatan pegawai.",
      });
      setIsSubmitting(false);
      return;
    }

    if (!formData.asn_status) {
      toast({
        variant: "destructive",
        title: "Status ASN wajib dipilih",
        description: "Silakan pilih status ASN pegawai.",
      });
      setIsSubmitting(false);
      return;
    }

    const dataToSubmit = { ...formData };
    // Pastikan NIP tidak kosong, jika iya, set ke null
    if (dataToSubmit.nip === "") {
      dataToSubmit.nip = null;
    }

    const { data, error } = employee
      ? await supabase
          .from("employees")
          .update(dataToSubmit)
          .eq("id", employee.id)
      : await supabaseSimpelAdmin.from("employees").insert([dataToSubmit]);

    setIsSubmitting(false);

    if (error) {
      console.error("Error submitting form:", error);
      toast({
        variant: "destructive",
        title: "Gagal menyimpan data",
        description: error.message,
      });
    } else {
      toast({
        title: "Berhasil!",
        description: "Data pegawai berhasil disimpan.",
      });
      onFormSubmit();
    }
  };

  const filteredDepartments = Array.isArray(departments)
    ? departments.filter(
        (d) =>
          d &&
          typeof d.name === "string" &&
          d.name.toLowerCase().includes(departmentSearchTerm.toLowerCase()),
      )
    : [];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Label htmlFor="name" className="text-slate-300">
            Nama Lengkap <span className="text-red-400">*</span>
          </Label>
          <Input
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className="bg-slate-700 border-slate-600 text-white"
            required
            placeholder="Masukkan nama lengkap pegawai"
          />
        </div>
        <div>
          <Label htmlFor="nip" className="text-slate-300">
            NIP <span className="text-slate-500 text-sm">(opsional)</span>
          </Label>
          <Input
            id="nip"
            name="nip"
            value={formData.nip}
            onChange={handleChange}
            className="bg-slate-700 border-slate-600 text-white"
            placeholder="18 digit NIP atau kosongkan jika belum ada"
          />
        </div>
        <div>
          <Label htmlFor="rank_group" className="text-slate-300">
            Pangkat/Golongan{" "}
            <span className="text-slate-500 text-sm">(opsional)</span>
          </Label>
          <Input
            id="rank_group"
            name="rank_group"
            value={formData.rank_group}
            onChange={handleChange}
            className="bg-slate-700 border-slate-600 text-white"
            placeholder="Contoh: IV/a, III/d, atau kosongkan"
          />
        </div>
        <div>
          <Label htmlFor="position_name" className="text-slate-300">
            Jabatan <span className="text-red-400">*</span>
          </Label>
          <Input
            id="position_name"
            name="position_name"
            value={formData.position_name}
            onChange={handleChange}
            className="bg-slate-700 border-slate-600 text-white"
            required
            placeholder="Masukkan jabatan pegawai"
          />
        </div>
      </div>

      {/* Row 2 - Jenis Jabatan dan Status ASN */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Label htmlFor="position_type" className="text-slate-300">
            Jenis Jabatan <span className="text-red-400">*</span>
          </Label>
          <Select
            value={formData.position_type}
            onValueChange={(value) =>
              setFormData((prev) => ({ ...prev, position_type: value }))
            }
          >
            <SelectTrigger id="position_type" className="bg-slate-700 border-slate-600 text-white">
              <SelectValue placeholder="Pilih jenis jabatan" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="Jabatan Struktural">
                Jabatan Struktural
              </SelectItem>
              <SelectItem value="Jabatan Fungsional">
                Jabatan Fungsional
              </SelectItem>
              <SelectItem value="Jabatan Pelaksana">
                Jabatan Pelaksana
              </SelectItem>
              <SelectItem value="Outsourcing">Outsourcing</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-500 mt-1">
            Kategori jabatan berdasarkan jenis pekerjaan
          </p>
        </div>
        <div>
          <Label htmlFor="asn_status" className="text-slate-300">
            Status ASN <span className="text-red-400">*</span>
          </Label>
          <Select
            value={formData.asn_status}
            onValueChange={(value) =>
              setFormData((prev) => ({ ...prev, asn_status: value }))
            }
          >
            <SelectTrigger id="asn_status" className="bg-slate-700 border-slate-600 text-white">
              <SelectValue placeholder="Pilih status ASN" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="PNS">PNS</SelectItem>
              <SelectItem value="PPPK">PPPK</SelectItem>
              <SelectItem value="Non ASN">Non ASN</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-500 mt-1">
            Status kepegawaian sesuai regulasi ASN
          </p>
        </div>
      </div>

      {/* Autocomplete for Department */}
      <div className="space-y-2">
        <Label htmlFor="department_search" className="text-slate-300">
          Unit Penempatan <span className="text-red-400">*</span>
        </Label>
        <div
          className="relative"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              setShowDepartmentDropdown(false);
            }
          }}
        >
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <Input
            id="department_search"
            type="text"
            placeholder={
              isLoadingDepartments
                ? "Memuat unit..."
                : "Cari atau ketik unit penempatan..."
            }
            className="pl-10 bg-slate-700 border-slate-600 text-white"
            value={departmentSearchTerm}
            onChange={(e) => handleDepartmentChange(e.target.value)}
            onFocus={() => setShowDepartmentDropdown(true)}
            autoComplete="off"
            disabled={isLoadingDepartments}
            required
          />
          {showDepartmentDropdown && departmentSearchTerm && (
            <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
              {filteredDepartments.length > 0 ? (
                filteredDepartments.map((dept) => (
                  <div
                    key={dept.id}
                    className="px-4 py-2 cursor-pointer hover:bg-slate-700"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectDepartment(dept);
                    }}
                  >
                    <p className="text-white">{dept.name}</p>
                  </div>
                ))
              ) : (
                <div className="px-4 py-2 text-center text-slate-400">
                  Unit tidak ditemukan. Tetap gunakan "{departmentSearchTerm}"?
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Info tentang field mandatory */}
      <div className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-4 text-sm">
        <div className="flex items-start gap-2">
          <span className="text-red-400 mt-0.5">*</span>
          <div className="text-slate-300">
            <strong>Field wajib diisi:</strong>
            <ul className="mt-1 space-y-1 text-slate-400">
              <li>â€¢ Nama Lengkap - Nama lengkap pegawai</li>
              <li>â€¢ Jabatan - Posisi/jabatan pegawai</li>
              <li>
                â€¢ Jenis Jabatan - Kategori jabatan
                (Struktural/Fungsional/Pelaksana/Outsourcing)
              </li>
              <li>â€¢ Status ASN - Status kepegawaian (PNS/PPPK/Non ASN)</li>
              <li>â€¢ Unit Penempatan - Unit kerja/departemen pegawai</li>
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              Field lain (NIP, Pangkat/Golongan) bersifat opsional dan dapat
              diisi kemudian.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Batal
        </Button>
        <Button
          type="submit"
          disabled={
            isSubmitting ||
            !formData.name.trim() ||
            !formData.position_name.trim() ||
            !formData.position_type ||
            !formData.asn_status ||
            !formData.department.trim()
          }
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? "Menyimpan..." : "Simpan Data"}
        </Button>
      </div>
    </form>
  );
};

export default EmployeeForm;
