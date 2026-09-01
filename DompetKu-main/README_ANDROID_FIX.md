# DompetKu v1.0.1 — Android Fix

Perubahan:
- Tombol Pemasukan/Pengeluaran/Transfer menjadi 3 kolom tanpa horizontal scroll di HP.
- Tambah Simpan PDF.
- Simpan Excel menghasilkan .xlsx dengan sheet Transaksi, Saldo Akun, Ringkasan.
- PDF/Excel/Backup JSON pada Android memakai Capacitor Filesystem + Share.
- Web tetap memakai mekanisme browser.
- Backup Data menjadi Backup Data dengan ikon FileJson.
- Print pada Android membuat PDF lalu membuka Android Share Sheet; pengguna dapat memilih printer/Files/Drive/WhatsApp sesuai aplikasi yang tersedia.

Setelah mengganti project:
1. npm install
2. npx cap sync android
3. npm run build
4. npx cap run android

Catatan: ZIP sumber ini mengikuti file yang diunggah dan tidak berisi folder android. Gunakan folder android yang sudah ada pada project lokal Ibu.
