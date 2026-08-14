# DompetKu

DompetKu v1.0 — aplikasi pencatatan keuangan pribadi, offline-first, tanpa Firebase/Supabase dan tanpa login/registrasi.

## Jalankan lokal

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy Vercel

Import repository/project ini ke Vercel. Framework Preset: **Vite**. Build Command: `npm run build`. Output Directory: `dist`.

Data transaksi disimpan di browser menggunakan IndexedDB. Data tidak otomatis tersinkron antarperangkat.
