import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  Download,
  RefreshCw,
  Info
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';
import EmployeeTable from '@/components/employees/EmployeeTable';
import { useSimpelEmployeeData } from '@/hooks/useSimpelEmployees';
import { Label } from '@/components/ui/label';
import { exportEmployeesToExcel } from '@/utils/excelUtils';
import { AuthManager } from '@/lib/auth';
import { supabaseSimpelAdmin } from '@/lib/supabaseSSO';

const Employees = () => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedUnitPenempatan, setSelectedUnitPenempatan] = useState('ALL');
  const [selectedPositionType, setSelectedPositionType] = useState('ALL');
  const [selectedAsnStatus, setSelectedAsnStatus] = useState('ALL');
  const [selectedRankGroup, setSelectedRankGroup] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);

  const {
    displayedEmployees,
    totalEmployeeCount,
    overallTotalEmployeeCount,
    totalPages,
    isLoading,
    departments: unitPenempatanOptions,
    positionTypes,
    asnStatuses,
    rankGroups,
    refreshData
  } = useSimpelEmployeeData(
    debouncedSearchTerm,
    selectedUnitPenempatan,
    selectedPositionType,
    selectedAsnStatus,
    selectedRankGroup,
    currentPage
  );

  const [isSyncing, setIsSyncing] = useState(false);

  const currentUser = AuthManager.getUserSession();
  const isMasterAdmin = currentUser?.role === 'admin_pusat';

  const handleSyncFromSimpel = async () => {
    setIsSyncing(true);
    toast({
      title: "â³ Memulai Sinkronisasi...",
      description: "Menghubungkan ke database SIMPEL untuk mengambil data pegawai.",
    });

    try {
      // 1. Ambil SEMUA data pegawai dari SIMPEL (pagination untuk mengatasi limit Supabase)
      let allSimpelEmployees = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: batch, error: fetchErr } = await supabaseSimpelAdmin
          .from("employees")
          .select("*")
          .range(from, from + pageSize - 1);

        if (fetchErr) throw fetchErr;

        if (batch && batch.length > 0) {
          allSimpelEmployees = allSimpelEmployees.concat(batch);
          from += pageSize;
          hasMore = batch.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      if (allSimpelEmployees.length === 0) {
        toast({
          variant: "destructive",
          title: "âŒ Gagal Sinkronisasi",
          description: "Tidak ada data pegawai yang ditemukan di aplikasi SIMPEL.",
        });
        setIsSyncing(false);
        return;
      }

      toast({
        title: "ðŸ”„ Memproses Data...",
        description: `Ditemukan ${allSimpelEmployees.length} pegawai dari SIMPEL. Memulai deduplikasi & upsert.`,
      });

      // 2. Deduplikasi berdasarkan NIP (jika ada NIP ganda di SIMPEL, ambil yang terbaru)
      const nipMap = new Map();
      let duplicateCount = 0;
      let skippedNoNip = 0;

      for (const emp of allSimpelEmployees) {
        const nip = emp.nip ? String(emp.nip).trim() : null;
        
        // Skip pegawai tanpa NIP
        if (!nip || nip === '' || nip === 'null') {
          skippedNoNip++;
          continue;
        }

        if (nipMap.has(nip)) {
          duplicateCount++;
          // Simpan yang terbaru (berdasarkan updated_at atau created_at)
          const existing = nipMap.get(nip);
          const existingDate = new Date(existing.updated_at || existing.created_at || 0);
          const currentDate = new Date(emp.updated_at || emp.created_at || 0);
          if (currentDate > existingDate) {
            nipMap.set(nip, emp);
          }
        } else {
          nipMap.set(nip, emp);
        }
      }

      console.log(`[Sync] Total SIMPEL: ${allSimpelEmployees.length}, Unik NIP: ${nipMap.size}, Duplikat: ${duplicateCount}, Tanpa NIP: ${skippedNoNip}`);

      // 3. Format data sesuai kolom SiCuti â€” JANGAN salin 'id' dari SIMPEL!
      //    Biarkan SiCuti menggunakan ID-nya sendiri. NIP adalah penghubung utama.
      const formattedEmployees = Array.from(nipMap.values()).map(emp => ({
        nip: String(emp.nip).trim(),
        name: emp.name,
        old_position: emp.old_position || null,
        department: emp.department || null,
        join_date: emp.join_date || null,
        position_type: emp.position_type || null,
        position_name: emp.position_name || null,
        asn_status: emp.asn_status || null,
        rank_group: emp.rank_group || null,
        updated_at: new Date().toISOString()
      }));

      // 4. Upsert secara bertahap (chunking) per 50 record, menggunakan NIP sebagai conflict key
      const chunkSize = 50;
      let successCount = 0;
      let errorCount = 0;
      const errorDetails = [];

      for (let i = 0; i < formattedEmployees.length; i += chunkSize) {
        const chunk = formattedEmployees.slice(i, i + chunkSize);
        
        try {
          const { error: upsertErr } = await supabase
            .from("employees")
            .upsert(chunk, { 
              onConflict: 'nip',
              ignoreDuplicates: false  // Update existing records
            });

          if (upsertErr) {
            console.error(`[Sync] Chunk ${Math.floor(i/chunkSize)+1} error:`, upsertErr.message);
            errorCount += chunk.length;
            errorDetails.push(upsertErr.message);
          } else {
            successCount += chunk.length;
          }
        } catch (chunkErr) {
          console.error(`[Sync] Chunk ${Math.floor(i/chunkSize)+1} exception:`, chunkErr);
          errorCount += chunk.length;
          errorDetails.push(chunkErr.message);
        }

        // Progress toast setiap 5 chunk
        if ((i / chunkSize) % 5 === 4) {
          toast({
            title: "ðŸ”„ Progres Sinkronisasi...",
            description: `${successCount} dari ${formattedEmployees.length} pegawai telah diproses.`,
          });
        }
      }

      console.log(`[Sync] Upsert selesai: ${successCount} sukses, ${errorCount} gagal`);

      // 5. Inisialisasi saldo cuti tahun berjalan
      toast({
        title: "ðŸ”„ Menginisialisasi Saldo Cuti...",
        description: "Menyiapkan kuota saldo cuti tahun berjalan untuk pegawai baru.",
      });

      const currentYear = new Date().getFullYear();
      const { initializeYearBalances } = await import('@/utils/leaveBalanceCalculator');
      const initResult = await initializeYearBalances(supabase, currentYear);
      console.log(`[Sync] Initialized balances: ${initResult.initialized} records, errors: ${initResult.errors?.length || 0}`);

      // 6. Tampilkan hasil akhir
      if (errorCount === 0) {
        toast({
          title: "âœ… Sinkronisasi Berhasil",
          description: `${successCount} pegawai berhasil disinkronkan dari SIMPEL ke SiCuti.${duplicateCount > 0 ? ` (${duplicateCount} NIP duplikat di-skip)` : ''}${skippedNoNip > 0 ? ` (${skippedNoNip} tanpa NIP di-skip)` : ''}`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "âš ï¸ Sinkronisasi Sebagian",
          description: `${successCount} sukses, ${errorCount} gagal. Error: ${errorDetails[0]}`,
        });
      }
      
      handleRefreshData();
    } catch (error) {
      console.error("[Sync] Fatal error:", error);
      toast({
        variant: "destructive",
        title: "âŒ Gagal Sinkronisasi",
        description: error.message || "Terjadi kesalahan saat menyinkronkan data pegawai.",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1); // Reset to first page when search changes
    }, 500);
    return () => clearTimeout(timerId);
  }, [searchTerm]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedUnitPenempatan, selectedPositionType, selectedAsnStatus, selectedRankGroup]);

  const handleRefreshData = () => {
    setSearchTerm('');
    setDebouncedSearchTerm('');
    setSelectedUnitPenempatan('ALL');
    setSelectedPositionType('ALL');
    setSelectedAsnStatus('ALL');
    setSelectedRankGroup('ALL');
    setCurrentPage(1);
    refreshData();
  };

  const handleResetFilters = () => {
    setSelectedUnitPenempatan('ALL');
    setSelectedPositionType('ALL');
    setSelectedAsnStatus('ALL');
    setSelectedRankGroup('ALL');
    setCurrentPage(1);
  };



  const handleExportData = async () => {
    try {
      toast({
        title: "â³ Sedang Mengunduh...",
        description: "Mohon tunggu, sedang menyiapkan file Excel.",
      });

      let query = supabase
        .from("employees")
        .select("id, nip, name, position_name, department, asn_status, rank_group, position_type");

      // Apply unit-based filtering for admin_unit users
      const currentUser = AuthManager.getUserSession();
      const userUnit = currentUser?.unit_kerja || currentUser?.unitKerja || currentUser?.department;

      if (currentUser && currentUser.role === 'admin_unit' && userUnit) {
        query = query.eq("department", userUnit);
      }

      // Apply all active filters
      if (debouncedSearchTerm) {
        query = query.or(
          `name.ilike.%${debouncedSearchTerm}%,` +
          `nip.ilike.%${debouncedSearchTerm}%,` +
          `department.ilike.%${debouncedSearchTerm}%,` +
          `position_name.ilike.%${debouncedSearchTerm}%,` +
          `position_type.ilike.%${debouncedSearchTerm}%,` +
          `asn_status.ilike.%${debouncedSearchTerm}%,` +
          `rank_group.ilike.%${debouncedSearchTerm}%`
        );
      }

      if (selectedUnitPenempatan && selectedUnitPenempatan !== "ALL") {
        query = query.ilike("department", `%${selectedUnitPenempatan}%`);
      }

      if (selectedPositionType && selectedPositionType !== "ALL") {
        query = query.eq("position_type", selectedPositionType);
      }

      if (selectedAsnStatus && selectedAsnStatus !== "ALL") {
        query = query.eq("asn_status", selectedAsnStatus);
      }

      if (selectedRankGroup && selectedRankGroup !== "ALL") {
        query = query.eq("rank_group", selectedRankGroup);
      }

      const { data, error } = await query.order("name", { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        toast({
          variant: "destructive",
          title: "âŒ Data Kosong",
          description: "Tidak ada data pegawai yang sesuai untuk diexport.",
        });
        return;
      }

      const dateStr = new Date().toISOString().split('T')[0];
      await exportEmployeesToExcel(data, `Data_Pegawai_${dateStr}.xlsx`);

      toast({
        title: "âœ… Export Berhasil",
        description: "File Excel data pegawai berhasil diunduh.",
      });

    } catch (error) {
      console.error("Export error:", error);
      toast({
        variant: "destructive",
        title: "âŒ Gagal Export",
        description: "Terjadi kesalahan saat mengunduh data pegawai.",
      });
    }
  };



  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Data Pegawai</h1>
          <p className="text-slate-300">Data {overallTotalEmployeeCount} pegawai â€” tersinkronisasi otomatis dari SIMPEL</p>
          <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg w-fit">
            <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <span className="text-xs text-blue-300">Data pegawai bersifat <strong>read-only</strong>. Untuk menambah atau mengubah data, silakan gunakan aplikasi <strong>SIMPEL</strong>.</span>
          </div>
        </div>
        <div className="flex space-x-2 mt-4 sm:mt-0">
          {isMasterAdmin && (
            <Button 
              onClick={handleSyncFromSimpel} 
              disabled={isSyncing}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Sinkronisasi...' : 'Sync dari SIMPEL'}
            </Button>
          )}
        </div>
      </motion.div>

      {/* Main Content */}
      <Card className="bg-slate-800/50 backdrop-blur-xl border-slate-700/50">
        <CardContent className="p-6">
          <div>
            {/* Search and Actions Row */}
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <Input
                    id="search-employees"
                    name="search-employees"
                    placeholder="Cari pegawai berdasarkan nama, NIP, unit, atau jabatan..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-slate-700/50 border-slate-600/50 text-white"
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleExportData}
                  className="border-slate-600 text-slate-300 hover:text-white"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export Data
                </Button>
              </div>
            </div>
            {/* Filter Fields Langsung Tampil */}
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="filter-unit-penempatan" className="text-sm font-medium text-slate-300">Unit Penempatan</Label>
                <Input
                  id="filter-unit-penempatan"
                  name="unitPenempatan"
                  type="text"
                  placeholder="Ketik nama unit penempatan..."
                  className="w-full bg-slate-800 border-slate-700 text-slate-300"
                  value={selectedUnitPenempatan === 'ALL' ? '' : selectedUnitPenempatan}
                  onChange={e => setSelectedUnitPenempatan(e.target.value.trim() === '' ? 'ALL' : e.target.value)}
                  autoComplete="off"
                />
              </div>
              {/* Filter lain tetap Select */}
              <div className="space-y-2">
                <Label htmlFor="filter-jenis-jabatan" className="text-sm font-medium text-slate-300">Jenis Jabatan</Label>
                <Select value={selectedPositionType} onValueChange={setSelectedPositionType} name="jenisJabatan" id="filter-jenis-jabatan">
                  <SelectTrigger className="w-full bg-slate-800 border-slate-700 text-slate-300" id="filter-jenis-jabatan-trigger" name="jenisJabatan">
                    <SelectValue placeholder="Semua Jenis Jabatan" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="ALL">Semua Jenis Jabatan</SelectItem>
                    {(positionTypes || []).map(opt =>
                      typeof opt === 'string'
                        ? <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        : <SelectItem key={opt.value} value={opt.value}>{opt.label ?? opt.value}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="filter-status-asn" className="text-sm font-medium text-slate-300">Status ASN</Label>
                <Select value={selectedAsnStatus} onValueChange={setSelectedAsnStatus} name="statusASN" id="filter-status-asn">
                  <SelectTrigger className="w-full bg-slate-800 border-slate-700 text-slate-300" id="filter-status-asn-trigger" name="statusASN">
                    <SelectValue placeholder="Semua Status ASN" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="ALL">Semua Status ASN</SelectItem>
                    {(asnStatuses || []).map(opt =>
                      typeof opt === 'string'
                        ? <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        : <SelectItem key={opt.value} value={opt.value}>{opt.label ?? opt.value}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="filter-golongan" className="text-sm font-medium text-slate-300">Golongan</Label>
                <Select value={selectedRankGroup} onValueChange={setSelectedRankGroup} name="golongan" id="filter-golongan">
                  <SelectTrigger className="w-full bg-slate-800 border-slate-700 text-slate-300" id="filter-golongan-trigger" name="golongan">
                    <SelectValue placeholder="Semua Golongan" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="ALL">Semua Golongan</SelectItem>
                    {(rankGroups || []).map(opt =>
                      typeof opt === 'string'
                        ? <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        : <SelectItem key={opt.value} value={opt.value}>{opt.label ?? opt.value}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Employee Table (Read-Only) */}
            <EmployeeTable
              employees={displayedEmployees}
              isLoading={isLoading}
              isSearchActive={!!debouncedSearchTerm || !!selectedUnitPenempatan || !!selectedPositionType || !!selectedAsnStatus || !!selectedRankGroup}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Employees;

// ErrorBoundary component
function ErrorBoundary({ children }) {
  const [error, setError] = React.useState(null);
  if (error) {
    return <div className="text-red-500 bg-slate-900 p-2 rounded">{error.toString()}</div>;
  }
  return React.Children.map(children, child => {
    try {
      return child;
    } catch (e) {
      setError(e);
      return null;
    }
  });
}
