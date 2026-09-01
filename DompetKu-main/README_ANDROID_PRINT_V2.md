# DompetKu Android Print v2

Perbaikan tahap 1 untuk PDF laporan keuangan Android.

## Perubahan
- Logo DompetKu diambil dari `public/icons/icon-512.png` dan disematkan ke PDF.
- Header PDF mengikuti tampilan laporan Web: logo, DOMPETKU, subjudul, dan kotak metadata.
- Ringkasan keuangan menggunakan empat kartu.
- Tabel Buku Besar memiliki garis luar dan garis antar kolom/baris.
- Header tabel diulang pada setiap halaman lanjutan.
- Satu baris transaksi tidak boleh dipotong antar halaman; jika tidak cukup ruang, seluruh baris dipindahkan ke halaman berikutnya.
- Footer laporan tetap berada di bagian bawah halaman.

## Catatan
Source ini belum dideploy ke GitHub/Vercel dan belum menggantikan versi produksi.
