import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  FileText,
  Upload,
  X,
  Loader2,
  Save,
  Trash2,
  Edit,
  FileArchive as FilePdfIcon,
  Eye,
  Download,
  Copy,
  AlertCircle,
  CheckCircle,
  Info,
  ExternalLink,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { extractPdfFormFields } from "@/utils/pdfTemplates";
import { extractDocxVariables, validateDocxFile } from "@/utils/docxTemplates";
import { Link } from "react-router-dom";
import { AuthManager } from "@/auth/AuthManager";
import { supabase } from "@/supabase/supabaseClient";

const TemplateManagement = () => {
  // State management
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateContent, setTemplateContent] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentTemplateId, setCurrentTemplateId] = useState(null);
  const { toast } = useToast();

  // Available data fields that can be filled in PDF templates
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
    tanggal_formulir_pengajuan: "Tanggal Formulir Pengajuan",
    alamat_selama_cuti: "Alamat Selama Cuti",
    alasan: "Alasan/Keperluan Cuti",

    // Document Information
    nomor_surat: "Nomor Surat",
    tanggal_surat: "Tanggal Surat",
    kota: "Kota Penerbitan Surat",
    tahun: "Tahun Penerbitan",

    // Approval Information
    nama_atasan: "Nama Atasan/Pejabat Berwenang",
    nip_atasan: "NIP Atasan",
    jabatan_atasan: "Jabatan Atasan",
  };

  // State for PDF form fields analysis
  const [selectedTemplateFields, setSelectedTemplateFields] = useState([]);
  const [isAnalyzingFields, setIsAnalyzingFields] = useState(false);

  // Load templates from Supabase database
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        console.log("Loading templates from Supabase...");
        
        const currentUser = AuthManager.getUserSession();
        if (!currentUser) {
          throw new Error("User not authenticated");
        }

        console.log("Current user:", { role: currentUser.role, unit: currentUser.department });

        let query = supabase.from("templates").select("*");

        // Apply role-based filtering
        if (currentUser.role === "admin_pusat") {
          // Master admin sees only global templates
          query = query.eq("template_scope", "global");
        } else if (currentUser.role === "admin_unit") {
          // Admin unit sees only their own unit's templates
          const userUnit = currentUser.department;
          if (!userUnit) {
            throw new Error("Admin unit user must have a unit assigned");
          }
          query = query.eq("template_scope", "unit").eq("unit_scope", userUnit);
        } else {
          // Other roles have no access
          throw new Error("Insufficient permissions to access templates");
        }

        const { data, error } = await query
          .eq("type", "docx")
          .order("name", { ascending: true });

        if (error) {
          throw error;
        }

        console.log("Templates loaded from Supabase:", data);
        setTemplates(data || []);

        if (data && data.length > 0 && !selectedTemplate) {
          setSelectedTemplate(data[0]);
        }
      } catch (error) {
        console.error("Error loading templates from Supabase:", error);
        toast({
          title: "Gagal memuat template dari database",
          description: error.message,
          variant: "destructive",
        });

        // Fallback to localStorage if Supabase fails (only for backward compatibility)
        try {
          const savedTemplates =
            JSON.parse(localStorage.getItem("savedTemplates")) || [];
          const docxTemplates = savedTemplates.filter((t) => {
            return t.type === "docx" && t.content?.type === "docx";
          });
          console.log(
            "Fallback: Loaded DOCX templates from localStorage:",
            docxTemplates,
          );
          setTemplates(docxTemplates);

          if (docxTemplates.length > 0 && !selectedTemplate) {
            setSelectedTemplate(docxTemplates[0]);
          }
        } catch (localError) {
          console.error("Error loading from localStorage:", localError);
        }
      }
    };

    loadTemplates();
  }, [toast]);

  // Analyze PDF template form fields
  const analyzeTemplateFields = async (template) => {
    if (!template?.content?.data) {
      setSelectedTemplateFields([]);
      return;
    }

    setIsAnalyzingFields(true);
    try {
      const fields = await extractPdfFormFields(template.content.data);
      setSelectedTemplateFields(fields);
      console.log(
        `Analyzed ${fields.length} form fields in template:`,
        template.name,
      );
    } catch (error) {
      console.error("Error analyzing template fields:", error);
      setSelectedTemplateFields([]);
      toast({
        title: "Gagal menganalisis template",
        description: "Tidak dapat menganalisis form fields dalam template PDF",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzingFields(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Reset file input
    e.target.value = "";

    // Check file type - support both PDF and DOCX
    const isPdf = file.name.endsWith(".pdf");
    const isDocx = file.name.endsWith(".docx") || file.name.endsWith(".doc");

    if (!isPdf && !isDocx) {
      toast({
        title: "Format file tidak didukung",
        description: "Hanya file PDF dan DOCX yang didukung",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Convert file to base64 for storage
      const fileReader = new FileReader();
      fileReader.onload = async (event) => {
        const base64Data = event.target.result;

        // Store the file data and metadata with correct type
        setTemplateContent({
          type: isDocx ? "docx" : "pdf",
          data: base64Data,
          fileName: file.name,
          size: file.size,
          lastModified: file.lastModified,
        });

        // Reset form and open save dialog
        resetForm();
        setTemplateName(file.name.replace(/\.[^/.]+$/, "")); // Remove extension
        setIsSaveDialogOpen(true);
        setIsLoading(false);
      };

      fileReader.onerror = () => {
        throw new Error(`Gagal membaca file ${isDocx ? "DOCX" : "PDF"}`);
      };

      fileReader.readAsDataURL(file);
    } catch (error) {
      console.error("Error processing file:", error);
      toast({
        title: "Gagal memproses file",
        description: `Terjadi kesalahan saat memproses file template ${isDocx ? "DOCX" : "PDF"}`,
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

    try {
      const currentUser = AuthManager.getUserSession();
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      // Determine template scope based on user role
      let templateScope = "global";
      let unitScope = null;

      if (currentUser.role === "admin_unit") {
        templateScope = "unit";
        unitScope = currentUser.department;
        
        if (!unitScope) {
          throw new Error("Admin unit user must have a unit assigned");
        }
      } else if (currentUser.role === "admin_pusat") {
        templateScope = "global";
        unitScope = null;
      } else {
        throw new Error("Insufficient permissions to create templates");
      }

      const templateData = {
        name: templateName.trim(),
        description: templateDescription.trim(),
        type: templateContent.type || "docx",
        template_data: templateContent.data,
        created_by: currentUser.id,
        template_scope: templateScope,
        unit_scope: unitScope,
      };

      console.log("Saving template with scope:", { templateScope, unitScope, userRole: currentUser.role });

      if (isEditMode && currentTemplateId) {
        // Update existing template
        const { data, error } = await supabase
          .from("templates")
          .update({
            name: templateData.name,
            description: templateData.description,
            template_data: templateData.template_data,
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentTemplateId)
          .select()
          .single();

        if (error) throw error;

        // Update local state
        const updatedTemplates = templates.map((t) =>
          t.id === currentTemplateId ? { ...t, ...data } : t
        );
        setTemplates(updatedTemplates);

        toast({
          title: "Template diperbarui",
          description: `Template "${templateName}" berhasil diperbarui`,
          variant: "default",
        });
      } else {
        // Create new template
        const { data, error } = await supabase
          .from("templates")
          .insert(templateData)
          .select()
          .single();

        if (error) throw error;

        // Update local state
        setTemplates([...templates, data]);

        toast({
          title: "Template disimpan",
          description: `Template "${templateName}" berhasil disimpan${templateScope === "unit" ? ` untuk unit ${unitScope}` : " secara global"}`,
          variant: "default",
        });
      }

      resetForm();
    } catch (error) {
      console.error("Error saving template:", error);
      toast({
        title: "Gagal menyimpan template",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
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
    if (!templateId) {
      console.error("Invalid template ID for deletion");
      return;
    }

    const templateToDelete = templates.find((t) => t.id === templateId);
    if (!templateToDelete) {
      console.error("Template not found for deletion:", templateId);
      return;
    }

    if (
      !confirm(`Yakin ingin menghapus template "${templateToDelete.name}"?`)
    ) {
      return;
    }

    try {
      const currentUser = AuthManager.getUserSession();
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      // Check permissions
      if (currentUser.role === "admin_unit") {
        // Admin unit can only delete their own unit's templates
        const userUnit = currentUser.department;
        if (templateToDelete.template_scope !== "unit" || templateToDelete.unit_scope !== userUnit) {
          throw new Error("You can only delete templates from your own unit");
        }
      } else if (currentUser.role === "admin_pusat") {
        // Master admin can only delete global templates
        if (templateToDelete.template_scope !== "global") {
          throw new Error("Master admin can only delete global templates");
        }
      } else {
        throw new Error("Insufficient permissions to delete templates");
      }

      // Delete from database
      const { error } = await supabase
        .from("templates")
        .delete()
        .eq("id", templateId);

      if (error) throw error;

      // Update local state
      const updatedTemplates = templates.filter((t) => t.id !== templateId);
      setSavedTemplates(updatedTemplates);

      if (selectedTemplate?.id === templateId) {
        setSelectedTemplate(null);
      }

      toast({
        title: "Template dihapus",
        description: `Template "${templateToDelete.name}" telah dihapus`,
        variant: "default",
      });
    } catch (error) {
      console.error("Error deleting template:", error);
      toast({
        title: "Gagal menghapus template",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setTemplateName("");
    setTemplateDescription("");
    setTemplateContent("");
    setSelectedTemplate(null);
    setIsEditMode(false);
    setCurrentTemplateId(null);
    setIsSaveDialogOpen(false);
  };

  return (
    <motion.div
      className="container mx-auto p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Kelola Template Surat</h1>
          <div className="mt-2">
            {(() => {
              const currentUser = AuthManager.getUserSession();
              if (currentUser?.role === "admin_pusat") {
                return (
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                    <span className="text-slate-300">Master Admin: Akses template global</span>
                  </div>
                );
              } else if (currentUser?.role === "admin_unit") {
                return (
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <span className="text-slate-300">
                      Admin Unit: Template khusus untuk {currentUser.department || "unit Anda"}
                    </span>
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>
        <div className="flex items-center space-x-4">
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
                Unggah Template Baru
              </>
            )}
            <input
              id="template-upload"
              type="file"
              accept=".pdf,application/pdf"
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
              Daftar Template
            </h2>
            {templates.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <FileText className="w-8 h-8 mx-auto mb-2 text-slate-500" />
                <p>Belum ada template yang disimpan</p>
                <p className="text-sm mt-2">
                  Unggah template baru untuk memulai
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedTemplate?.id === template.id
                        ? "bg-blue-600 text-white"
                        : "bg-slate-700 hover:bg-slate-600 text-slate-200"
                    }`}
                    onClick={() => {
                      setSelectedTemplate(template);
                      analyzeTemplateFields(template);
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
                          {new Date(template.updatedAt).toLocaleDateString(
                            "id-ID",
                          )}
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
              Data Tersedia
            </h2>
            <p className="text-sm text-slate-400 mb-3">
              Data berikut tersedia untuk mengisi form fields dalam template PDF
              Anda.
            </p>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
              {Object.entries(availableDataFields).map(([key, label]) => (
                <div
                  key={key}
                  className="group flex items-start justify-between p-2 rounded hover:bg-slate-700/50"
                >
                  <div className="flex items-start">
                    <div className="bg-slate-700/80 text-green-300 px-2 py-1 rounded text-xs font-mono">
                      {key}
                    </div>
                    <span className="text-xs text-slate-300 ml-2 mt-1">
                      {label}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(key);
                      toast({
                        title: "Disalin!",
                        description: `Field name "${key}" telah disalin`,
                        variant: "default",
                      });
                    }}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white px-1"
                    title="Salin nama field"
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
                  <p className="font-medium mb-1">Tips untuk Template PDF:</p>
                  <ul className="space-y-1 text-blue-200">
                    <li>
                      â€¢ Buat form fields dengan nama yang sesuai dengan data di
                      atas
                    </li>
                    <li>
                      â€¢ Gunakan Adobe Acrobat atau LibreOffice untuk membuat
                      form fields
                    </li>
                    <li>
                      â€¢ Nama field harus persis sama atau mirip dengan nama data
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
                        const byteCharacters = atob(
                          selectedTemplate.content.data.split(",")[1],
                        );
                        const byteNumbers = new Array(byteCharacters.length);
                        for (let i = 0; i < byteCharacters.length; i++) {
                          byteNumbers[i] = byteCharacters.charCodeAt(i);
                        }
                        const byteArray = new Uint8Array(byteNumbers);
                        const blob = new Blob([byteArray], {
                          type: "application/pdf",
                        });
                        const url = URL.createObjectURL(blob);
                        window.open(url, "_blank");
                      }
                    }}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Pratinjau PDF
                  </Button>
                  <Link to="/surat-keterangan">
                    <Button size="sm">
                      <ExternalLink className="w-4 h-4 mr-1" />
                      Buat Surat
                    </Button>
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
                        <FilePdfIcon className="w-8 h-8 text-red-500" />
                        <div>
                          <h3 className="text-lg font-semibold text-gray-800">
                            {selectedTemplate.name}
                          </h3>
                          <p className="text-sm text-gray-600">
                            {selectedTemplate.description ||
                              "Template PDF untuk surat keterangan"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-xs text-gray-500">
                        <div>
                          File:{" "}
                          {selectedTemplate.content?.fileName || "template.pdf"}
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
                          {new Date(
                            selectedTemplate.updatedAt,
                          ).toLocaleDateString("id-ID")}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Form Fields Analysis */}
                  <div className="mb-6">
                    <h4 className="text-md font-semibold text-gray-800 mb-3 flex items-center">
                      <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                      Analisis Form Fields
                      {isAnalyzingFields && (
                        <Loader2 className="w-4 h-4 animate-spin ml-2 text-blue-500" />
                      )}
                    </h4>

                    {selectedTemplateFields.length > 0 ? (
                      <div className="space-y-4">
                        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                          <div className="flex items-center mb-2">
                            <CheckCircle className="w-4 h-4 text-green-600 mr-2" />
                            <span className="text-sm font-medium text-green-800">
                              Template memiliki {selectedTemplateFields.length}{" "}
                              form fields
                            </span>
                          </div>
                          <p className="text-xs text-green-700">
                            Template ini siap digunakan untuk mengisi data
                            secara otomatis.
                          </p>
                        </div>

                        <div className="bg-gray-50 p-4 rounded-lg">
                          <h5 className="text-sm font-medium text-gray-700 mb-3">
                            Daftar Form Fields:
                          </h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                            {selectedTemplateFields.map((field, index) => {
                              const isMatched = Object.keys(
                                availableDataFields,
                              ).some(
                                (dataKey) =>
                                  dataKey.toLowerCase() ===
                                    field.name.toLowerCase() ||
                                  field.name
                                    .toLowerCase()
                                    .includes(dataKey.toLowerCase()) ||
                                  dataKey
                                    .toLowerCase()
                                    .includes(field.name.toLowerCase()),
                              );

                              return (
                                <div
                                  key={index}
                                  className={`flex items-center justify-between p-2 rounded text-xs ${
                                    isMatched
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
                                      className={`font-mono ${
                                        isMatched
                                          ? "text-green-700"
                                          : "text-yellow-700"
                                      }`}
                                    >
                                      {field.name}
                                    </code>
                                  </div>
                                  <span
                                    className={`text-xs ${
                                      isMatched
                                        ? "text-green-600"
                                        : "text-yellow-600"
                                    }`}
                                  >
                                    {field.type}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Field Matching Summary */}
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                          <h5 className="text-sm font-medium text-blue-800 mb-2">
                            Ringkasan Pencocokan:
                          </h5>
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <span className="text-green-600 font-medium">
                                âœ“ Cocok:{" "}
                                {
                                  selectedTemplateFields.filter((field) =>
                                    Object.keys(availableDataFields).some(
                                      (dataKey) =>
                                        dataKey.toLowerCase() ===
                                          field.name.toLowerCase() ||
                                        field.name
                                          .toLowerCase()
                                          .includes(dataKey.toLowerCase()) ||
                                        dataKey
                                          .toLowerCase()
                                          .includes(field.name.toLowerCase()),
                                    ),
                                  ).length
                                }
                              </span>
                            </div>
                            <div>
                              <span className="text-yellow-600 font-medium">
                                âš  Perlu Review:{" "}
                                {
                                  selectedTemplateFields.filter(
                                    (field) =>
                                      !Object.keys(availableDataFields).some(
                                        (dataKey) =>
                                          dataKey.toLowerCase() ===
                                            field.name.toLowerCase() ||
                                          field.name
                                            .toLowerCase()
                                            .includes(dataKey.toLowerCase()) ||
                                          dataKey
                                            .toLowerCase()
                                            .includes(field.name.toLowerCase()),
                                      ),
                                  ).length
                                }
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                          <div className="flex items-center mb-2">
                            <AlertCircle className="w-4 h-4 text-red-600 mr-2" />
                            <span className="text-sm font-medium text-red-800">
                              Tidak ada form fields terdeteksi
                            </span>
                          </div>
                          <p className="text-xs text-red-700 mb-3">
                            Template PDF ini tidak memiliki form fields yang
                            dapat diisi secara otomatis, atau form fields tidak
                            dapat dibaca oleh sistem.
                          </p>
                        </div>

                        {/* Troubleshooting Section */}
                        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                          <div className="flex items-center mb-2">
                            <AlertCircle className="w-4 h-4 text-yellow-600 mr-2" />
                            <span className="text-sm font-medium text-yellow-800">
                              Kemungkinan Penyebab & Solusi
                            </span>
                          </div>
                          <div className="text-xs text-yellow-700 space-y-3">
                            <div>
                              <p className="font-medium mb-1">
                                1. PDF tidak memiliki form fields interaktif:
                              </p>
                              <ul className="list-disc list-inside space-y-1 ml-2">
                                <li>
                                  PDF hanya berisi teks biasa tanpa form fields
                                </li>
                                <li>
                                  Form fields dibuat sebagai gambar/teks statis
                                </li>
                                <li>
                                  <strong>Solusi:</strong> Buat ulang PDF dengan
                                  form fields interaktif
                                </li>
                              </ul>
                            </div>

                            <div>
                              <p className="font-medium mb-1">
                                2. Form fields tidak kompatibel:
                              </p>
                              <ul className="list-disc list-inside space-y-1 ml-2">
                                <li>
                                  Form fields dibuat dengan software yang tidak
                                  standar
                                </li>
                                <li>
                                  PDF menggunakan format lama atau terenkripsi
                                </li>
                                <li>
                                  <strong>Solusi:</strong> Gunakan Adobe Acrobat
                                  atau LibreOffice untuk membuat form
                                </li>
                              </ul>
                            </div>

                            <div>
                              <p className="font-medium mb-1">
                                3. PDF rusak atau tidak dapat dibaca:
                              </p>
                              <ul className="list-disc list-inside space-y-1 ml-2">
                                <li>File PDF corrupt atau tidak lengkap</li>
                                <li>PDF memiliki password atau proteksi</li>
                                <li>
                                  <strong>Solusi:</strong> Coba upload ulang
                                  atau hapus proteksi PDF
                                </li>
                              </ul>
                            </div>
                          </div>
                        </div>

                        {/* Step by Step Guide */}
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                          <div className="flex items-center mb-2">
                            <Info className="w-4 h-4 text-blue-600 mr-2" />
                            <span className="text-sm font-medium text-blue-800">
                              Cara Membuat PDF dengan Form Fields
                            </span>
                          </div>
                          <div className="text-xs text-blue-700 space-y-3">
                            <div>
                              <p className="font-medium mb-1">
                                Menggunakan Adobe Acrobat Pro:
                              </p>
                              <ol className="list-decimal list-inside space-y-1 ml-2">
                                <li>Buka PDF di Adobe Acrobat Pro</li>
                                <li>Pilih Tools â†’ Prepare Form</li>
                                <li>
                                  Klik "Start" untuk deteksi otomatis atau
                                  tambah manual
                                </li>
                                <li>
                                  Beri nama field sesuai data (contoh: "nama",
                                  "nip", "jabatan")
                                </li>
                                <li>Save PDF dengan form fields</li>
                              </ol>
                            </div>

                            <div>
                              <p className="font-medium mb-1">
                                Menggunakan LibreOffice Writer:
                              </p>
                              <ol className="list-decimal list-inside space-y-1 ml-2">
                                <li>Buat dokumen di LibreOffice Writer</li>
                                <li>
                                  Insert â†’ Form â†’ Text Box untuk setiap field
                                </li>
                                <li>Klik kanan field â†’ Control Properties</li>
                                <li>
                                  Set "Name" sesuai data (contoh: "nama", "nip")
                                </li>
                                <li>
                                  Export as PDF â†’ centang "Create PDF form"
                                </li>
                              </ol>
                            </div>

                            <div>
                              <p className="font-medium mb-1">
                                Menggunakan Google Docs/Word:
                              </p>
                              <ol className="list-decimal list-inside space-y-1 ml-2">
                                <li>Buat dokumen dengan placeholder text</li>
                                <li>Export/Download sebagai PDF</li>
                                <li>Buka di Adobe Acrobat Pro</li>
                                <li>
                                  Gunakan "Prepare Form" untuk convert ke form
                                  fields
                                </li>
                              </ol>
                            </div>
                          </div>
                        </div>

                        {/* Testing Section */}
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                          <div className="flex items-center mb-2">
                            <CheckCircle className="w-4 h-4 text-gray-600 mr-2" />
                            <span className="text-sm font-medium text-gray-800">
                              Cara Test Form Fields
                            </span>
                          </div>
                          <div className="text-xs text-gray-700 space-y-2">
                            <p>Untuk memastikan form fields berfungsi:</p>
                            <ul className="list-disc list-inside space-y-1 ml-2">
                              <li>Buka PDF di Adobe Reader atau browser</li>
                              <li>
                                Coba klik pada area yang seharusnya bisa diisi
                              </li>
                              <li>
                                Jika muncul cursor atau highlight, berarti form
                                field aktif
                              </li>
                              <li>
                                Pastikan nama field tidak mengandung spasi atau
                                karakter khusus
                              </li>
                            </ul>
                          </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="flex flex-wrap gap-2 pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => {
                              const fileInput =
                                document.getElementById("template-upload");
                              if (fileInput) {
                                fileInput.value = "";
                                fileInput.click();
                              }
                            }}
                          >
                            <Upload className="w-3 h-3 mr-1" />
                            Coba Upload Ulang
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => {
                              if (selectedTemplate?.content?.data) {
                                const byteCharacters = atob(
                                  selectedTemplate.content.data.split(",")[1],
                                );
                                const byteNumbers = new Array(
                                  byteCharacters.length,
                                );
                                for (
                                  let i = 0;
                                  i < byteCharacters.length;
                                  i++
                                ) {
                                  byteNumbers[i] = byteCharacters.charCodeAt(i);
                                }
                                const byteArray = new Uint8Array(byteNumbers);
                                const blob = new Blob([byteArray], {
                                  type: "application/pdf",
                                });
                                const url = URL.createObjectURL(blob);
                                window.open(url, "_blank");
                              }
                            }}
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            Test Form Fields
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quick Actions */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h5 className="text-sm font-medium text-gray-700 mb-3">
                      Aksi Cepat:
                    </h5>
                    <div className="flex flex-wrap gap-2">
                      <Link to="/surat-keterangan">
                        <Button size="sm" className="text-xs">
                          <ExternalLink className="w-3 h-3 mr-1" />
                          Buat Surat dengan Template Ini
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => handleEditTemplate(selectedTemplate)}
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Edit Template
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          if (selectedTemplate.content?.data) {
                            const link = document.createElement("a");
                            link.href = selectedTemplate.content.data;
                            link.download =
                              selectedTemplate.content.fileName ||
                              "template.pdf";
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }
                        }}
                      >
                        <Download className="w-3 h-3 mr-1" />
                        Unduh Template
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <FileText className="w-16 h-16 mx-auto mb-6 text-slate-300" />
                  <h3 className="text-xl font-semibold text-slate-700 mb-2">
                    Belum ada template dipilih
                  </h3>
                  <p className="text-slate-500 mb-6 max-w-md">
                    Pilih template dari daftar di samping atau unggah template
                    baru untuk memulai
                  </p>
                  <div>
                    <Button
                      variant="default"
                      onClick={() => {
                        const fileInput =
                          document.getElementById("template-upload");
                        if (fileInput) {
                          fileInput.value = "";
                          fileInput.setAttribute(
                            "accept",
                            ".pdf,application/pdf",
                          );
                          fileInput.click();
                        }
                      }}
                      className="flex items-center gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      Unggah Template Baru
                    </Button>
                    <p className="mt-2 text-xs text-slate-400">
                      Format yang didukung: .pdf dengan form fields
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hidden file input for template upload */}
      <input
        type="file"
        id="template-upload"
        accept=".pdf,application/pdf"
        onChange={handleFileUpload}
        className="hidden"
        // Force file dialog to show PDF files by default in Windows
        style={{ display: "none" }}
      />

      {/* Save Template Dialog */}
      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEditMode ? "Edit Template" : "Simpan Template Baru"}
            </DialogTitle>
            <DialogDescription>
              {isEditMode
                ? "Perbarui detail template Anda"
                : "Beri nama dan deskripsi untuk template ini"}
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

export default TemplateManagement;