import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { redirectToSimpelLogin, getAuthSession, isSSOConfigured, getConfigStatus } from "@/lib/supabaseSSO";
import { AuthManager } from "@/lib/auth";
import {
  CalendarCheck,
  ShieldCheck,
  Clock,
  FileText,
  BellRing,
  Users,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
} from "lucide-react";

import { useToast } from "@/components/ui/use-toast";

export default function Landing() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showConfigWarning, setShowConfigWarning] = useState(false);

  useEffect(() => {
    // Cek konfigurasi SSO
    if (!isSSOConfigured()) {
      setShowConfigWarning(true);
      const configStatus = getConfigStatus();
      console.error("[Landing] Konfigurasi SSO tidak lengkap:", configStatus);
    }

    // Cek error dari query parameter (seperti user_not_found dari AuthCallback)
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    if (errorParam === "user_not_found") {
      toast({
        variant: "destructive",
        title: "Login SSO Gagal",
        description: "Akun SIMPEL Anda berhasil divalidasi, tetapi email Anda belum terdaftar di aplikasi SiCuti. Silakan hubungi administrator.",
      });
      // Bersihkan URL query param tanpa reload page
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const checkSession = async () => {
      const session = await getAuthSession();
      const hasLocalSession = AuthManager.isAuthenticated();
      if (session || hasLocalSession) {
        const user = AuthManager.getUserSession();
        if (user && user.role === "employee") {
          navigate("/leave-requests", { replace: true });
        } else {
          navigate("/employees", { replace: true });
        }
      }
    };
    checkSession();
  }, [navigate, toast]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {showConfigWarning && <ConfigWarningBanner />}
      <Header />
      <main>
        <Hero />
        <Stats />
        <Features />
        <HowItWorks />
        <CutiTypes />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}

function ConfigWarningBanner() {
  const configStatus = getConfigStatus();
  const missing = Object.entries(configStatus)
    .filter(([key, value]) => !value)
    .map(([key]) => key);

  return (
    <div className="bg-yellow-900/20 border-b border-yellow-700/50">
      <div className="mx-auto max-w-6xl px-6 py-3">
        <div className="flex items-center gap-3 text-sm">
          <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-yellow-200 font-medium">
              ⚠️ Konfigurasi SSO Tidak Lengkap
            </p>
            <p className="text-yellow-300/80 text-xs mt-0.5">
              Environment variables yang hilang: {missing.join(", ")}
            </p>
          </div>
          <a
            href="https://github.com/HRMLavotas/sicuti-leave-portal/blob/main/VERCEL_SETUP_CEPAT.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-yellow-200 hover:text-yellow-100 underline whitespace-nowrap"
          >
            Panduan Setup
          </a>
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 shadow-soft">
            <CalendarCheck className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-display text-lg font-semibold tracking-tight text-white">SICUTI</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
              Sistem Cuti PNS
            </span>
          </div>
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-slate-400 md:flex">
          <a href="#fitur" className="transition-colors hover:text-white">Fitur</a>
          <a href="#cara-kerja" className="transition-colors hover:text-white">Cara Kerja</a>
          <a href="#jenis-cuti" className="transition-colors hover:text-white">Jenis Cuti</a>
        </nav>
        <div className="flex items-center gap-2">
          <button
            onClick={redirectToSimpelLogin}
            className="hidden rounded-md px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white sm:inline-flex cursor-pointer"
          >
            Masuk
          </button>
          <button
            onClick={redirectToSimpelLogin}
            className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-blue-500 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-soft transition-all hover:opacity-90 cursor-pointer"
          >
            Ajukan Cuti
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-slate-900">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-purple-900/20 to-slate-900" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-20 md:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/60 px-3.5 py-1.5 text-xs font-medium text-slate-300 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-yellow-500" />
            Solusi resmi pengelolaan cuti pegawai negeri sipil
          </div>

          <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-white md:text-6xl lg:text-7xl">
            Pengajuan cuti PNS,
            <span className="block bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">
              tanpa antre, tanpa kertas.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-balance text-base leading-relaxed text-slate-400 md:text-lg">
            SICUTI menggantikan formulir manual dengan alur digital yang transparan —
            dari pengajuan, persetujuan atasan, hingga pencatatan saldo cuti, semuanya
            dalam satu sistem yang sesuai regulasi BKN.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              onClick={redirectToSimpelLogin}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:opacity-90 cursor-pointer"
            >
              Mulai Ajukan Cuti
              <ArrowRight className="h-4 w-4" />
            </button>
            <a
              href="#cara-kerja"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
            >
              Lihat cara kerja
            </a>
          </div>

          <p className="mt-5 text-xs text-slate-500">
            Digunakan oleh instansi pemerintah di seluruh Indonesia · Sesuai PP No. 11/2017
          </p>
        </div>

        {/* Mock dashboard card */}
        <div className="relative mx-auto mt-16 max-w-4xl">
          <div className="absolute -inset-x-8 -inset-y-6 rounded-3xl bg-purple-500/10 blur-2xl" aria-hidden />
          <div className="relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-800 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-700 bg-slate-900/50 px-5 py-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-500/50" />
              </div>
              <span className="text-xs text-slate-400">sicuti.go.id/dashboard</span>
              <span className="w-12" />
            </div>
            <div className="grid gap-4 p-6 md:grid-cols-3">
              <StatCard label="Sisa Cuti Tahunan" value="9" unit="hari" tone="primary" />
              <StatCard label="Pengajuan Aktif" value="2" unit="berkas" tone="gold" />
              <StatCard label="Disetujui Bulan Ini" value="14" unit="cuti" tone="muted" />
              <div className="md:col-span-3">
                <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">Riwayat Pengajuan Terbaru</p>
                    <span className="text-xs text-slate-400">3 entri</span>
                  </div>
                  <ul className="space-y-2.5">
                    <RowItem name="Cuti Tahunan" date="12–16 Des 2024" status="Disetujui" />
                    <RowItem name="Cuti Sakit" date="04 Des 2024" status="Disetujui" />
                    <RowItem name="Cuti Alasan Penting" date="20–21 Nov 2024" status="Diproses" />
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatCard({ label, value, unit, tone }) {
  const toneClass =
    tone === "primary"
      ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white"
      : tone === "gold"
        ? "bg-yellow-500/20 text-yellow-500 border border-yellow-500/20"
        : "bg-slate-800 border border-slate-700 text-white";
  return (
    <div className={`rounded-xl p-5 shadow-sm ${toneClass}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="font-display text-4xl font-semibold leading-none">{value}</span>
        <span className="text-sm opacity-80">{unit}</span>
      </div>
    </div>
  );
}

function RowItem({ name, date, status }) {
  const isApproved = status === "Disetujui";
  return (
    <li className="flex items-center justify-between rounded-lg bg-slate-800/50 px-3 py-2.5 border border-slate-700/50">
      <div>
        <p className="text-sm font-medium text-white">{name}</p>
        <p className="text-xs text-slate-400">{date}</p>
      </div>
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
          isApproved
            ? "bg-green-500/10 text-green-400 border border-green-500/20"
            : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
        }`}
      >
        {isApproved && <CheckCircle2 className="h-3 w-3" />}
        {status}
      </span>
    </li>
  );
}

function Stats() {
  const items = [
    { v: "120+", l: "Instansi terhubung" },
    { v: "85.000", l: "Pegawai aktif" },
    { v: "< 24 jam", l: "Rata-rata persetujuan" },
    { v: "99,9%", l: "Uptime layanan" },
  ];
  return (
    <section className="border-y border-slate-800 bg-slate-900/50">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-10 md:grid-cols-4">
        {items.map((i) => (
          <div key={i.l} className="text-center md:text-left">
            <p className="font-display text-3xl font-semibold text-white">{i.v}</p>
            <p className="mt-1 text-sm text-slate-400">{i.l}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Features() {
  const features = [
    {
      icon: FileText,
      title: "Pengajuan Digital",
      desc: "Isi formulir cuti dalam hitungan menit, lampirkan dokumen pendukung, dan kirim langsung ke atasan.",
    },
    {
      icon: ShieldCheck,
      title: "Sesuai Regulasi BKN",
      desc: "Mengikuti PP No. 11/2017 dan Perka BKN tentang cuti PNS, lengkap dengan perhitungan saldo otomatis.",
    },
    {
      icon: Clock,
      title: "Persetujuan Cepat",
      desc: "Alur approval berjenjang dengan notifikasi real-time. Tidak ada lagi berkas tertinggal di meja.",
    },
    {
      icon: BellRing,
      title: "Notifikasi Real-time",
      desc: "Pemberitahuan via email dan dashboard setiap kali status pengajuan berubah.",
    },
    {
      icon: Users,
      title: "Manajemen Tim",
      desc: "Kepala unit dapat memantau ketersediaan pegawai dan menghindari tumpang tindih cuti.",
    },
    {
      icon: CalendarCheck,
      title: "Riwayat Lengkap",
      desc: "Semua data cuti tersimpan rapi dan dapat diunduh sebagai laporan resmi kapan saja.",
    },
  ];
  return (
    <section id="fitur" className="mx-auto max-w-6xl px-6 py-24 bg-slate-900">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Fitur Unggulan</p>
        <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight text-white md:text-5xl">
          Semua yang dibutuhkan untuk
          <span className="block text-purple-400">mengelola cuti pegawai</span>
        </h2>
        <p className="mt-4 text-slate-400">
          Dirancang khusus untuk kebutuhan instansi pemerintah — sederhana untuk pegawai,
          terkendali untuk pimpinan.
        </p>
      </div>

      <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div
            key={f.title}
            className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-800/50 p-6 transition-all hover:-translate-y-1 hover:border-purple-500/30"
          >
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 text-blue-400 border border-blue-500/20">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-5 text-lg font-semibold text-white">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Login dengan NIP",
      desc: "Masuk menggunakan Nomor Induk Pegawai dan kata sandi yang terintegrasi dengan SIMPEG instansi Anda.",
    },
    {
      n: "02",
      title: "Pilih jenis cuti & tanggal",
      desc: "Sistem otomatis menghitung sisa hak cuti Anda dan memvalidasi ketersediaan tanggal.",
    },
    {
      n: "03",
      title: "Disetujui atasan",
      desc: "Pengajuan diteruskan ke atasan langsung dan pejabat berwenang sesuai struktur organisasi.",
    },
    {
      n: "04",
      title: "Unduh surat cuti resmi",
      desc: "Surat cuti elektronik berlogo instansi siap diunduh dan dijadikan bukti resmi.",
    },
  ];
  return (
    <section id="cara-kerja" className="border-y border-slate-800 bg-slate-900/80">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Cara Kerja</p>
          <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight text-white md:text-5xl">
            Empat langkah, cuti Anda selesai
          </h2>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <div key={s.n} className="relative rounded-2xl border border-slate-800 bg-slate-800/50 p-6">
              <span className="font-display text-5xl font-semibold text-white/5">{s.n}</span>
              <h3 className="mt-2 text-lg font-semibold text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CutiTypes() {
  const types = [
    { name: "Cuti Tahunan", days: "12 hari/tahun" },
    { name: "Cuti Sakit", days: "Hingga 1,5 tahun" },
    { name: "Cuti Besar", days: "3 bulan" },
    { name: "Cuti Melahirkan", days: "3 bulan" },
    { name: "Cuti Alasan Penting", days: "Maks. 1 bulan" },
    { name: "Cuti di Luar Tanggungan Negara", days: "Hingga 3 tahun" },
  ];
  return (
    <section id="jenis-cuti" className="mx-auto max-w-6xl px-6 py-24 bg-slate-900">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Jenis Cuti</p>
          <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight text-white md:text-5xl">
            Mendukung seluruh jenis cuti PNS
          </h2>
          <p className="mt-4 max-w-md text-slate-400">
            Sistem otomatis mengenali hak cuti Anda berdasarkan masa kerja dan jenis cuti yang dipilih,
            sesuai ketentuan peraturan perundang-undangan.
          </p>
          <button
            onClick={redirectToSimpelLogin}
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white border border-slate-700 transition-colors hover:bg-slate-700 cursor-pointer"
          >
            Mulai Pengajuan
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {types.map((t) => (
            <div
              key={t.name}
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-800/50 p-4 transition-colors hover:border-purple-500/30"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-md bg-slate-700/50 text-slate-300">
                  <CalendarCheck className="h-4 w-4" />
                </div>
                <p className="text-sm font-medium text-white">{t.name}</p>
              </div>
              <span className="text-xs text-slate-400">{t.days}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="px-6 pb-24 bg-slate-900">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 to-purple-600 p-10 md:p-16">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 80% 60%, white 1px, transparent 1px)",
            backgroundSize: "32px 32px, 48px 48px",
          }}
          aria-hidden
        />
        <div className="relative max-w-2xl">
          <h2 className="font-display text-4xl font-semibold leading-tight text-white md:text-5xl">
            Siap memodernisasi pengelolaan cuti di instansi Anda?
          </h2>
          <p className="mt-4 text-base text-white/80">
            Bergabunglah dengan ratusan instansi yang sudah beralih ke SICUTI. Implementasi cepat,
            pendampingan teknis, dan migrasi data ditangani oleh tim kami.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={redirectToSimpelLogin}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-yellow-500 px-6 py-3 text-sm font-semibold text-slate-900 transition-transform hover:-translate-y-0.5 cursor-pointer"
            >
              Login via SIMPEL
              <ArrowRight className="h-4 w-4" />
            </button>
            <a
              href="#"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/30 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Hubungi Tim Teknis
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-800 bg-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-r from-blue-500 to-purple-600">
            <CalendarCheck className="h-4 w-4 text-white" />
          </div>
          <div className="text-sm">
            <p className="font-semibold text-white">SICUTI</p>
            <p className="text-xs text-slate-400">Sistem Informasi Cuti Pegawai PNS</p>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          © {new Date().getFullYear()} SICUTI. Dikembangkan untuk mendukung digitalisasi ASN Indonesia.
        </p>
      </div>
    </footer>
  );
}
