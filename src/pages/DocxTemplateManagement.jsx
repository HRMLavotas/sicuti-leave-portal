import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  FileText,
  Upload,
  X,
  Loader2,
  Save,
  Trash2,
  Edit,
  Eye,
  Download,
  Copy,
  AlertCircle,
  CheckCircle,
  Info,
  RefreshCw,
  FileArchive as FileDocxIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { extractDocxVariables, validateDocxFile } from "@/utils/docxTemplates";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { copyToClipboard } from "@/utils/clipboardUtils";
import { AuthManager } from "@/lib/auth";
import { useTemplates, invalidateTemplateCache } from "@/hooks/useTemplates";

const DocxTemplateManagement = () => {
  // Use shared template hook
  const { templates, isLoading: templatesLoading, refreshTemplates } = useTemplates({ autoFetch: true });

  // State management
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateContent, setTemplateContent] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentTemplateId, setCurrentTemplateId] = useState(null);
  const [selectedTemplateVariables, setSelectedTemplateVariables] = useState(
    [],
  );
  const [isAnalyzingVariables, setIsAnalyzingVariables] = useState(false);
  const { toast } = useToast();

  // Available data fields that can be used in DOCX templates
  const availableDataFields = {
    // Employee Information
    nama: "Nama Lengkap Pegawai",
    nip: "Nomor Induk Pegawai (NIP)",
    pangkat_golongan: "Pangkat/Golongan",
    jabatan: "Jabatan/Posisi",
    unit_kerja: "Unit Kerja/Departemen",

    // Leave Information
    jenis_cuti: "Jenis Cuti (Tahunan, Sakit, dll)",
    lama_cuti: "Lama Cuti (dalam hari kerja)",
    tanggal_mulai: "Tanggal Mulai Cuti",
    tanggal_selesai: "Tanggal Selesai Cuti",
    tanggal_cuti: "Tanggal Cuti (Format Range)",
    tanggal_formulir_pengajuan: "Tanggal Formulir Pengajuan",
    alamat_selama_cuti: "Alamat Selama Cuti",
    alasan: "Alasan/Keperluan Cuti",
    jatah_cuti_tahun: "Jatah Cuti Tahun (2024/2025)",

    // Document Information
    nomor_surat: "Nomor Surat",
    tanggal_surat: "Tanggal Surat",
    kota: "Kota Penerbitan Surat",
    tahun: "Tahun Penerbitan",

    // Approval Information
    nama_atasan: "Nama Atasan/Pejabat Berwenang",
    nip_atasan: "NIP Atasan",
    jabatan_atasan: "Jabatan Atasan",

    // Batch Template Variables (untuk surat dengan multiple pegawai, hingga 45 pegawai)
    ...Array.from({ length: 45 }, (_, i) => {
      const num = i + 1;
      return {
        [`nama_${num}`]: `Nama Pegawai ke-${num} (untuk template batch)`,
        [`nip_${num}`]: `NIP Pegawai ke-${num} (untuk template batch)`,
        [`jabatan_${num}`]: `Jabatan Pegawai ke-${num} (untuk template batch)`,
        [`unit_kerja_${num}`]: `Unit Kerja Pegawai ke-${num} (untuk template batch)`,
        [`tanggal_cuti_${num}`]: `Tanggal Cuti Pegawai ke-${num} (untuk template batch)`,
        [`lama_cuti_${num}`]: `Lama Cuti Pegawai ke-${num} (untuk template batch)`,
        [`jenis_cuti_${num}`]: `Jenis Cuti Pegawai ke-${num} (untuk template batch)`,
        [`pangkat_golongan_${num}`]: `Pangkat/Golongan Pegawai ke-${num} (untuk template batch)`,
        [`alamat_selama_cuti_${num}`]: `Alamat Selama Cuti Pegawai ke-${num} (untuk template batch)`,
        [`tanggal_formulir_pengajuan_${num}`]: `Tanggal Formulir Pengajuan Pegawai ke-${num} (untuk template batch)`,
        [`jatah_cuti_tahun_${num}`]: `Jatah Cuti Tahun Pegawai ke-${num} (untuk template batch)`,
        [`alasan_${num}`]: `Alasan Cuti Pegawai ke-${num} (untuk template batch)`,
      };
    }).reduce((acc, obj) => ({ ...acc, ...obj }), {}),
  };

  // Load templates on component mount
  useEffect(() => {
    // auto-handled by useTemplates hook
  }, []);

  const loadTemplates = async () => {
    await refreshTemplates();
  };

  // Auto-select first template when templates load
  useEffect(() => {
    if (templates.length > 0 && !selectedTemplate) {
      setSelectedTemplate(templates[0]);
      analyzeTemplateVariables(templates[0]);
    }
  }, [templates]);

  // Analyze DOCX template variables
  const analyzeTemplateVariables = async (template) => {
    if (!template?.content?.data) {
      setSelectedTemplateVariables([]);
      return;
    }

    setIsAnalyzingVariables(true);
    try {
      console.log("Analyzing template:", template.name);
      console.log("Template content type:", template.content.type);
      console.log("Template data length:", template.content.data?.length);

      const variables = await extractDocxVariables(template.content.data);
      setSelectedTemplateVariables(variables);
      console.log(
        `Analyzed ${variables.length} variables in template:`,
        template.name,
        variables,
      );

      // Preview is now handled by DocxPreviewRenderer component
      console.log(
        "Variables extracted, preview will be generated by DocxPreviewRenderer",
      );
    } catch (error) {
      console.error("Error analyzing template variables:", error);
      setSelectedTemplateVariables([]);
      toast({
        title: "Gagal menganalisis template",
        description:
          "Tidak dapat menganalisis variabel dalam template DOCX: " +
          error.message,
        variant: "destructive",
      });
    } finally {
      setIsAnalyzingVariables(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Reset file input
    e.target.value = "";

    // Validate DOCX file
    if (!validateDocxFile(file)) {
      toast({
        title: "Format file tidak didukung",
        description: "Hanya file DOCX yang didukung",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Convert DOCX file to base64 for storage
      const fileReader = new FileReader();
      fileReader.onload = async (event) => {
        const base64Data = event.target.result;

        // Store the DOCX data and metadata
        const newTemplateContent = {
          type: "docx",
          data: base64Data,
          fileName: file.name,
          size: file.size,
          lastModified: file.lastModified,
        };

        setTemplateContent(newTemplateContent);

        // Reset form fields but keep templateContent
        setTemplateName(file.name.replace(/\.[^/.]+$/, "")); // Remove extension
        setTemplateDescription("");
        setIsEditMode(false);
        setCurrentTemplateId(null);

        setIsSaveDialogOpen(true);
        setIsLoading(false);

        console.log("File processed successfully:", {
          fileName: file.name,
          size: file.size,
          type: file.type,
          templateContentSet: !!newTemplateContent,
          templateContentData: !!newTemplateContent.data,
        });
      };

      fileReader.onerror = () => {
        throw new Error("Gagal membaca file DOCX");
      };

      fileReader.readAsDataURL(file);
    } catch (error) {
      console.error("Error processing file:", error);
      toast({
        title: "Gagal memproses file",
        description: "Terjadi kesalahan saat memproses file template DOCX",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast({
        title: "Nama template diperlukan",
        description: "Silakan masukkan nama template",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    const currentUser = AuthManager.getUserSession();
    if (!currentUser) {
      toast({
        title: "Gagal menyimpan template",
        description: "Sesi pengguna tidak valid",
        variant: "destructive"
      });
      setIsLoading(false);
      return;
    }

    // Determine template scope based on user role
    let templateScope = "global";
    let unitScope = null;

    if (currentUser.role === "admin_unit") {
      templateScope = "unit";
      unitScope = currentUser.unit_kerja || currentUser.unitKerja || currentUser.department;

      if (!unitScope) {
        toast({
          title: "Gagal menyimpan template",
          description: "Unit kerja tidak ditemukan untuk user ini",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }
    }

    const templateToSave = {
      id: isEditMode ? currentTemplateId : undefined,
      name: templateName,
      description: templateDescription,
      type: "docx",
      content: templateContent,
      template_scope: templateScope,
      unit_scope: unitScope,
      updated_at: new Date().toISOString(),
      // user_id: (await supabase.auth.getUser()).data.user.id, // Uncomment if you have user auth
    };

    try {
      const { data, error } = await supabase
        .from("templates")
        .upsert(templateToSave)
        .select()
        .single();

      if (error) {
        throw error;
      }

      toast({
        title: "Template Tersimpan",
        description: `${data.name} berhasil disimpan di database.`,
      });

      resetForm();
      invalidateTemplateCache();
      await refreshTemplates(); // Reload templates from database
    } catch (error) {
      console.error("Error saving template to Supabase:", error);
      toast({
        title: "Gagal menyimpan template",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsSaveDialogOpen(false);
    }
  };

  const handleEditTemplate = (template) => {
    setTemplateName(template.name);
    setTemplateDescription(template.description || "");
    setTemplateContent(template.content);
    setCurrentTemplateId(template.id);
    setIsEditMode(true);
    setIsSaveDialogOpen(true);
  };

  const handleDeleteTemplate = async (templateId) => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus template ini?")) {
      return;
    }

    setIsLoading(true);
    try {
      // Permission check for deletion
      const currentUser = AuthManager.getUserSession();
      if (!currentUser) throw new Error("User not authenticated");

      // Verify ownership before delete (double check)
      const templateToDelete = templates.find(t => t.id === templateId);
      if (templateToDelete) {
        if (currentUser.role === "admin_unit") {
          const userUnit = currentUser.unit_kerja || currentUser.unitKerja || currentUser.department;
          if (templateToDelete.template_scope !== "unit" || templateToDelete.unit_scope !== userUnit) {
            throw new Error("Anda hanya dapat menghapus template milik unit Anda sendiri");
          }
        }
      }

      const { error } = await supabase
        .from("templates")
        .delete()
        .eq("id", templateId);

      if (error) {
        throw error;
      }

      toast({
        title: "Template Dihapus",
        description: "Template telah berhasil dihapus dari database.",
      });

      if (selectedTemplate?.id === templateId) {
        setSelectedTemplate(null);
      }
      invalidateTemplateCache();
      await refreshTemplates(); // Reload templates
    } catch (error) {
      console.error("Error deleting template:", error);
      toast({
        title: "Gagal Menghapus Template",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setTemplateName("");
    setTemplateDescription("");
    setTemplateContent("");
    setIsEditMode(false);
    setCurrentTemplateId(null);
    // Don't reset selectedTemplate here as it should persist
    // Don't close dialog here as it's handled in handleSaveTemplate
  };

  return (
    <motion.div
      className="container mx-auto p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Kelola Template DOCX</h1>
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { invalidateTemplateCache(); refreshTemplates(); }}
            disabled={templatesLoading || isLoading}
            className="border-slate-600 text-slate-300 hover:text-white"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${templatesLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              resetForm();
              document.getElementById("template-upload")?.click();
            }}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Memproses...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Unggah Template DOCX
              </>
            )}
            <input
              id="template-upload"
              type="file"
              accept=".docx,.doc"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isLoading}
            />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Template List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-slate-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-white mb-4">
              Daftar Template DOCX
            </h2>
            {templatesLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="p-3 rounded-lg bg-slate-700/40 animate-pulse">
                    <div className="h-4 bg-slate-600 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-slate-600/60 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <FileDocxIcon className="w-8 h-8 mx-auto mb-2 text-slate-500" />
                <p>Belum ada template DOCX yang disimpan</p>
                <p className="text-sm mt-2">
                  Unggah template DOCX baru untuk memulai
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${selectedTemplate?.id === template.id
                        ? "bg-blue-600 text-white"
                        : "bg-slate-700 hover:bg-slate-600 text-slate-200"
                      }`}
                    onClick={() => {
                      setSelectedTemplate(template);
                      analyzeTemplateVariables(template);
                    }}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium">{template.name}</h3>
                        {template.description && (
                          <p className="text-xs mt-1 opacity-80 line-clamp-1">
                            {template.description}
                          </p>
                        )}
                        <p className="text-xs mt-1 opacity-60">
                          Diperbarui:{" "}
                          {template.updated_at
                            ? new Date(template.updated_at).toLocaleDateString("id-ID")
                            : "-"}
                        </p>
                      </div>
                      <div className="flex space-x-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditTemplate(template);
                          }}
                          className="p-1 rounded-full hover:bg-white/20"
                          title="Edit template"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (
                              confirm(
                                `Yakin ingin menghapus template "${template.name}"?`,
                              )
                            ) {
                              handleDeleteTemplate(template.id);
                            }
                          }}
                          className="p-1 rounded-full hover:bg-white/20 text-red-400"
                          title="Hapus template"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Available Data Fields */}
          <div className="bg-slate-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-white mb-3">
              Variabel Tersedia
            </h2>
            <p className="text-sm text-slate-400 mb-3">
              Gunakan variabel berikut dalam template DOCX Anda dengan format{" "}
              <code className="bg-slate-700 px-1 rounded">
                {"{nama_variabel}"}
              </code>
            </p>
            <div className="bg-green-900/20 border border-green-700/30 rounded p-2 mb-3">
              <p className="text-xs text-green-300">
                💡 <strong>Info:</strong> Klik tombol copy untuk menyalin
                variabel format {"{nama}"}
                yang dapat langsung digunakan dalam template DOCX.
              </p>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
              {Object.entries(availableDataFields).map(([key, label]) => (
                <div
                  key={key}
                  className="group flex items-start justify-between p-2 rounded hover:bg-slate-700/50 transition-colors"
                >
                  <div className="flex items-start flex-1">
                    <div className="bg-slate-700/80 text-green-300 px-2 py-1 rounded text-xs font-mono border border-green-500/20">
                      {"{" + key + "}"}
                    </div>
                    <span className="text-xs text-slate-300 ml-2 mt-1 leading-relaxed">
                      {label}
                    </span>
                  </div>
                  <button
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();

                      const variableText = `{${key}}`;

                      try {
                        const result = await copyToClipboard(variableText);

                        toast({
                          title: "✅ Berhasil Disalin!",
                          description: `Variabel "{${key}}" telah disalin ke clipboard`,
                          variant: "default",
                        });

                        console.log(
                          `📋 Variable copied successfully: {${key}} (method: ${result.method})`,
                        );
                      } catch (error) {
                        console.error("���� Copy failed:", error);

                        toast({
                          title: "❌ Gagal Menyalin",
                          description:
                            error.message || `Tidak dapat menyalin "{${key}}"`,
                          variant: "destructive",
                        });
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-green-400 hover:bg-slate-600 px-1 py-1 rounded transition-all duration-200 active:scale-95"
                    title="Klik untuk menyalin variabel ke clipboard"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-blue-900/30 rounded-lg border border-blue-700/30">
              <div className="flex items-start space-x-2">
                <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-blue-300">
                  <p className="font-medium mb-1">Cara Menggunakan:</p>
                  <ul className="space-y-1 text-blue-200">
                    <li>• Buat dokumen Word (.docx)</li>
                    <li>• Gunakan format {"{nama_variabel}"} dalam teks</li>
                    <li>• Simpan sebagai .docx dan unggah di sini</li>
                    <li>
                      • Sistem akan otomatis mengganti variabel dengan data
                    </li>
                    <li className="font-medium text-yellow-200">
                      • Untuk template batch: gunakan {"{nama_1}"}, {"{nama_2}"}
                      , dst.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Template Analysis */}
        <div className="lg:col-span-2">
          <div className="bg-slate-800 rounded-lg p-6 h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-white">
                {selectedTemplate ? "Analisis Template" : "Pilih Template"}
              </h2>
              {selectedTemplate && (
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (selectedTemplate.content?.data) {
                        const link = document.createElement("a");
                        link.href = selectedTemplate.content.data;
                        link.download =
                          selectedTemplate.content.fileName || "template.docx";
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }
                    }}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Unduh
                  </Button>
                  <Link to="/docx-surat-keterangan">
                    <Button size="sm">Buat Surat</Button>
                  </Link>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-lg flex-1 flex flex-col overflow-hidden border border-slate-600">
              {selectedTemplate ? (
                <div className="flex-1 overflow-auto p-6">
                  {/* Template Information */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <FileDocxIcon className="w-8 h-8 text-blue-500" />
                        <div>
                          <h3 className="text-lg font-semibold text-gray-800">
                            {selectedTemplate.name}
                          </h3>
                          <p className="text-sm text-gray-600">
                            {selectedTemplate.description ||
                              "Template DOCX untuk surat keterangan"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-xs text-gray-500">
                        <div>
                          File:{" "}
                          {selectedTemplate.content?.fileName ||
                            "template.docx"}
                        </div>
                        <div>
                          Ukuran:{" "}
                          {selectedTemplate.content?.size
                            ? (selectedTemplate.content.size / 1024).toFixed(
                              1,
                            ) + " KB"
                            : "N/A"}
                        </div>
                        <div>
                          Diperbarui:{" "}
                          {selectedTemplate.updated_at
                            ? new Date(selectedTemplate.updated_at).toLocaleDateString("id-ID")
                            : "-"}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Variables Analysis */}
                  <div className="mb-6">
                    <h4 className="text-md font-semibold text-gray-800 mb-3 flex items-center">
                      <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                      Analisis Variabel
                      {isAnalyzingVariables && (
                        <Loader2 className="w-4 h-4 animate-spin ml-2 text-blue-500" />
                      )}
                    </h4>

                    {selectedTemplateVariables.length > 0 ? (
                      <div className="space-y-4">
                        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                          <div className="flex items-center mb-2">
                            <CheckCircle className="w-4 h-4 text-green-600 mr-2" />
                            <span className="text-sm font-medium text-green-800">
                              Template memiliki{" "}
                              {selectedTemplateVariables.length} variabel
                            </span>
                          </div>
                          <p className="text-xs text-green-700">
                            Template ini siap digunakan untuk mengisi data
                            secara otomatis.
                          </p>
                        </div>

                        <div className="bg-gray-50 p-4 rounded-lg">
                          <h5 className="text-sm font-medium text-gray-700 mb-3">
                            Daftar Variabel:
                          </h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {selectedTemplateVariables.map(
                              (variable, index) => {
                                const isMatched = Object.keys(
                                  availableDataFields,
                                ).includes(variable.name);

                                return (
                                  <div
                                    key={index}
                                    className={`flex items-center justify-between p-2 rounded text-xs ${isMatched
                                        ? "bg-green-100 border border-green-300"
                                        : "bg-yellow-50 border border-yellow-300"
                                      }`}
                                  >
                                    <div className="flex items-center space-x-2">
                                      {isMatched ? (
                                        <CheckCircle className="w-3 h-3 text-green-600" />
                                      ) : (
                                        <AlertCircle className="w-3 h-3 text-yellow-600" />
                                      )}
                                      <code
                                        className={`font-mono ${isMatched
                                            ? "text-green-700"
                                            : "text-yellow-700"
                                          }`}
                                      >
                                        {"{" + variable.name + "}"}
                                      </code>
                                    </div>
                                    <span
                                      className={`text-xs ${isMatched
                                          ? "text-green-600"
                                          : "text-yellow-600"
                                        }`}
                                    >
                                      {isMatched ? "Tersedia" : "Perlu Review"}
                                    </span>
                                  </div>
                                );
                              },
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                          <div className="flex items-center mb-2">
                            <AlertCircle className="w-4 h-4 text-yellow-600 mr-2" />
                            <span className="text-sm font-medium text-yellow-800">
                              Tidak ada variabel terdeteksi
                            </span>
                          </div>
                          <p className="text-xs text-yellow-700 mb-3">
                            Template DOCX ini tidak mengandung variabel dalam
                            format {"{nama_variabel}"} atau terjadi kesalahan
                            saat membaca file.
                          </p>
                        </div>

                        {/* Troubleshooting Guide */}
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                          <div className="flex items-center mb-2">
                            <Info className="w-4 h-4 text-blue-600 mr-2" />
                            <span className="text-sm font-medium text-blue-800">
                              Panduan Pemecahan Masalah
                            </span>
                          </div>
                          <div className="text-xs text-blue-700 space-y-3">
                            <div>
                              <p className="font-medium mb-1">
                                1. Pastikan format variabel benar:
                              </p>
                              <ul className="list-disc list-inside space-y-1 ml-2">
                                <li>Gunakan format {"{nama_variabel}"}</li>
                                <li>Tidak ada spasi di dalam kurung kurawal</li>
                                <li>
                                  Gunakan underscore (_) untuk pemisah kata
                                </li>
                              </ul>
                            </div>

                            <div>
                              <p className="font-medium mb-1">
                                2. Contoh variabel yang benar:
                              </p>
                              <ul className="list-disc list-inside space-y-1 ml-2">
                                <li>{"{nama}"} - untuk nama pegawai</li>
                                <li>{"{nip}"} - untuk NIP</li>
                                <li>
                                  {"{tanggal_mulai}"} - untuk tanggal mulai cuti
                                </li>
                              </ul>
                            </div>

                            <div>
                              <p className="font-medium mb-1">
                                3. Cara membuat template:
                              </p>
                              <ul className="list-disc list-inside space-y-1 ml-2">
                                <li>
                                  Buka Microsoft Word atau LibreOffice Writer
                                </li>
                                <li>
                                  Ketik teks normal dengan variabel {"{nama}"}
                                </li>
                                <li>Simpan sebagai .docx</li>
                                <li>Upload file ke sistem</li>
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <FileDocxIcon className="w-16 h-16 mx-auto mb-6 text-slate-300" />
                  <h3 className="text-xl font-semibold text-slate-700 mb-2">
                    Belum ada template dipilih
                  </h3>
                  <p className="text-slate-500 mb-6 max-w-md">
                    Pilih template dari daftar di samping atau unggah template
                    DOCX baru untuk memulai
                  </p>
                  <div>
                    <Button
                      variant="default"
                      onClick={() => {
                        const fileInput =
                          document.getElementById("template-upload");
                        if (fileInput) {
                          fileInput.value = "";
                          fileInput.click();
                        }
                      }}
                      className="flex items-center gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      Unggah Template DOCX
                    </Button>
                    <p className="mt-2 text-xs text-slate-400">
                      Format yang didukung: .docx dengan variabel {"{nama}"}{" "}
                      (single braces)
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Save Template Dialog */}
      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEditMode ? "Edit Template" : "Simpan Template DOCX Baru"}
            </DialogTitle>
            <DialogDescription>
              {isEditMode
                ? "Perbarui detail template Anda"
                : "Beri nama dan deskripsi untuk template DOCX ini"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">Nama Template</Label>
              <Input
                id="template-name"
                placeholder="Contoh: Surat Keterangan Cuti Tahunan"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-description">Deskripsi (opsional)</Label>
              <Input
                id="template-description"
                placeholder="Contoh: Template untuk cuti tahunan pegawai"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                resetForm();
                setIsSaveDialogOpen(false);
              }}
            >
              Batal
            </Button>
            <Button
              onClick={handleSaveTemplate}
              disabled={!templateName.trim()}
            >
              {isEditMode ? "Perbarui" : "Simpan"} Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default DocxTemplateManagement;
