import { createFileRoute, Link } from "@tanstack/react-router";
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
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SICUTI — Sistem Informasi Cuti Pegawai PNS" },
      {
        name: "description",
        content:
          "SICUTI adalah platform pengajuan cuti pegawai PNS yang cepat, transparan, dan paperless. Ajukan, setujui, dan pantau cuti dalam satu sistem.",
      },
      { property: "og:title", content: "SICUTI — Sistem Informasi Cuti Pegawai PNS" },
      {
        property: "og:description",
        content: "Digitalisasi pengajuan cuti PNS. Cepat, transparan, dan sesuai regulasi BKN.",
      },
      { property: "og:url", content: "/" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
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

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="#" className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-primary shadow-soft">
            <CalendarCheck className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-display text-lg font-semibold tracking-tight">SICUTI</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Sistem Cuti PNS
            </span>
          </div>
        </a>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#fitur" className="transition-colors hover:text-foreground">Fitur</a>
          <a href="#cara-kerja" className="transition-colors hover:text-foreground">Cara Kerja</a>
          <a href="#jenis-cuti" className="transition-colors hover:text-foreground">Jenis Cuti</a>
        </nav>
        <div className="flex items-center gap-2">
          <a
            href="#"
            className="hidden rounded-md px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent sm:inline-flex"
          >
            Masuk
          </a>
          <a
            href="#"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft transition-all hover:bg-primary/90 hover:shadow-elegant"
          >
            Ajukan Cuti
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-hero">
      <div className="absolute inset-0 grid-bg" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-20 md:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-gold" />
            Solusi resmi pengelolaan cuti pegawai negeri sipil
          </div>

          <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-foreground md:text-6xl lg:text-7xl">
            Pengajuan cuti PNS,
            <span className="block bg-gradient-to-r from-primary via-primary-glow to-primary bg-clip-text text-transparent">
              tanpa antre, tanpa kertas.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-balance text-base leading-relaxed text-muted-foreground md:text-lg">
            SICUTI menggantikan formulir manual dengan alur digital yang transparan —
            dari pengajuan, persetujuan atasan, hingga pencatatan saldo cuti, semuanya
            dalam satu sistem yang sesuai regulasi BKN.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="#"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-elegant transition-all hover:translate-y-[-1px] hover:bg-primary/90"
            >
              Mulai Ajukan Cuti
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#cara-kerja"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
            >
              Lihat cara kerja
            </a>
          </div>

          <p className="mt-5 text-xs text-muted-foreground">
            Digunakan oleh instansi pemerintah di seluruh Indonesia · Sesuai PP No. 11/2017
          </p>
        </div>

        {/* Mock dashboard card */}
        <div className="relative mx-auto mt-16 max-w-4xl">
          <div className="absolute -inset-x-8 -inset-y-6 rounded-3xl bg-gradient-primary opacity-10 blur-2xl" aria-hidden />
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-elegant">
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-gold/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-primary-glow/50" />
              </div>
              <span className="text-xs text-muted-foreground">sicuti.go.id/dashboard</span>
              <span className="w-12" />
            </div>
            <div className="grid gap-4 p-6 md:grid-cols-3">
              <StatCard label="Sisa Cuti Tahunan" value="9" unit="hari" tone="primary" />
              <StatCard label="Pengajuan Aktif" value="2" unit="berkas" tone="gold" />
              <StatCard label="Disetujui Bulan Ini" value="14" unit="cuti" tone="muted" />
              <div className="md:col-span-3">
                <div className="rounded-xl border border-border bg-background/60 p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold">Riwayat Pengajuan Terbaru</p>
                    <span className="text-xs text-muted-foreground">3 entri</span>
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

function StatCard({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone: "primary" | "gold" | "muted";
}) {
  const toneClass =
    tone === "primary"
      ? "bg-gradient-primary text-primary-foreground"
      : tone === "gold"
        ? "bg-gradient-gold text-gold-foreground"
        : "bg-card border border-border text-foreground";
  return (
    <div className={`rounded-xl p-5 shadow-soft ${toneClass}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="font-display text-4xl font-semibold leading-none">{value}</span>
        <span className="text-sm opacity-80">{unit}</span>
      </div>
    </div>
  );
}

function RowItem({ name, date, status }: { name: string; date: string; status: string }) {
  const isApproved = status === "Disetujui";
  return (
    <li className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2.5">
      <div>
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{date}</p>
      </div>
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
          isApproved
            ? "bg-primary/10 text-primary"
            : "bg-gold/15 text-gold-foreground"
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
    <section className="border-y border-border bg-card/50">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-10 md:grid-cols-4">
        {items.map((i) => (
          <div key={i.l} className="text-center md:text-left">
            <p className="font-display text-3xl font-semibold text-foreground">{i.v}</p>
            <p className="mt-1 text-sm text-muted-foreground">{i.l}</p>
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
    <section id="fitur" className="mx-auto max-w-6xl px-6 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Fitur Unggulan</p>
        <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight md:text-5xl">
          Semua yang dibutuhkan untuk
          <span className="block text-primary">mengelola cuti pegawai</span>
        </h2>
        <p className="mt-4 text-muted-foreground">
          Dirancang khusus untuk kebutuhan instansi pemerintah — sederhana untuk pegawai,
          terkendali untuk pimpinan.
        </p>
      </div>

      <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div
            key={f.title}
            className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-elegant"
          >
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-gradient-primary text-primary-foreground shadow-soft">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
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
    <section id="cara-kerja" className="border-y border-border bg-secondary/40">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Cara Kerja</p>
          <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight md:text-5xl">
            Empat langkah, cuti Anda selesai
          </h2>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <div key={s.n} className="relative rounded-2xl border border-border bg-card p-6 shadow-soft">
              <span className="font-display text-5xl font-semibold text-primary/15">{s.n}</span>
              <h3 className="mt-2 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
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
    <section id="jenis-cuti" className="mx-auto max-w-6xl px-6 py-24">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Jenis Cuti</p>
          <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight md:text-5xl">
            Mendukung seluruh jenis cuti PNS
          </h2>
          <p className="mt-4 max-w-md text-muted-foreground">
            Sistem otomatis mengenali hak cuti Anda berdasarkan masa kerja dan jenis cuti yang dipilih,
            sesuai ketentuan peraturan perundang-undangan.
          </p>
          <a
            href="#"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition-colors hover:bg-primary/90"
          >
            Lihat panduan lengkap
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {types.map((t) => (
            <div
              key={t.name}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-md bg-accent text-accent-foreground">
                  <CalendarCheck className="h-4 w-4" />
                </div>
                <p className="text-sm font-medium">{t.name}</p>
              </div>
              <span className="text-xs text-muted-foreground">{t.days}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="px-6 pb-24">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-primary p-10 shadow-elegant md:p-16">
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
          <h2 className="font-display text-4xl font-semibold leading-tight text-primary-foreground md:text-5xl">
            Siap memodernisasi pengelolaan cuti di instansi Anda?
          </h2>
          <p className="mt-4 text-base text-primary-foreground/85">
            Bergabunglah dengan ratusan instansi yang sudah beralih ke SICUTI. Implementasi cepat,
            pendampingan teknis, dan migrasi data ditangani oleh tim kami.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="#"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gold px-6 py-3 text-sm font-semibold text-gold-foreground shadow-gold transition-transform hover:-translate-y-0.5"
            >
              Hubungi Tim Kami
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary-foreground/30 bg-primary-foreground/5 px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-foreground/10"
            >
              Jadwalkan demo gratis
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-card/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-gradient-primary">
            <CalendarCheck className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="text-sm">
            <p className="font-semibold">SICUTI</p>
            <p className="text-xs text-muted-foreground">Sistem Informasi Cuti Pegawai PNS</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} SICUTI. Dikembangkan untuk mendukung digitalisasi ASN Indonesia.
        </p>
      </div>
    </footer>
  );
}
