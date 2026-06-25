import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Info, ExternalLink } from "lucide-react";

/**
 * ImportEmployeeDialog
 * 
 * Data pegawai sekarang diambil langsung dari SIMPEL secara real-time.
 * Import manual via Excel tidak diperlukan lagi.
 * Untuk menambah/update data pegawai, lakukan melalui aplikasi SIMPEL.
 */
const ImportEmployeeDialog = ({ isOpen, onOpenChange }) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-400" />
            Data Pegawai dari SIMPEL
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Data pegawai sekarang diambil secara real-time dari aplikasi SIMPEL.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-3">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-sm text-blue-300">
            <p className="font-semibold mb-1">Tidak perlu import manual lagi</p>
            <p className="text-blue-400">
              Data pegawai di aplikasi ini bersumber langsung dari database SIMPEL.
              Setiap perubahan data pegawai di SIMPEL akan otomatis tersedia di sini.
            </p>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-sm text-slate-300">
            <p className="font-semibold text-white mb-2">Cara menambah/mengubah data pegawai:</p>
            <ol className="space-y-1 text-slate-400 list-decimal list-inside">
              <li>Login ke Portal SIPANDAI</li>
              <li>Masuk ke aplikasi SIMPEL</li>
              <li>Tambah atau update data pegawai di sana</li>
              <li>Data akan langsung tersedia di SiCuti</li>
            </ol>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Tutup
          </Button>
          <Button
            onClick={() => window.open("https://simpel.sipandai.site/portal", "_blank")}
            className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Buka Portal SIMPEL
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportEmployeeDialog;