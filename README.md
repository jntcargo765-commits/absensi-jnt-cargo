# ABSENSI JNT CARGO

Aplikasi web absensi karyawan JNT CARGO: selfie langsung dari kamera HP, GPS, waktu otomatis WIB,
dashboard admin dengan rekap harian/bulanan, dan unduh laporan Excel.

Desain memakai palet biru, putih, dan oranye serta responsif untuk Android dan iPhone.

## Fitur

### Dashboard karyawan (`/`)

- Dibuka tanpa login.
- Nama karyawan diketik bebas (2–60 karakter).
- Tombol **ABSEN MASUK** dan **ABSEN PULANG**.
- **Selfie wajib** dari kamera langsung (`getUserMedia`), tanpa unggah dari galeri.
- **GPS wajib**: koordinat, akurasi, dan tautan Google Maps ikut tersimpan.
- Tanggal dan jam dicatat otomatis memakai zona **WIB (Asia/Jakarta, UTC+7)**.
- Status hari ini (jam masuk/pulang) ditampilkan setelah absen.

### Dashboard admin (`/admin`)

- Login dengan **ID dan password** (cookie sesi HttpOnly, berlaku 8 jam).
- Seluruh data absensi: nama, tanggal, jam, tipe, koordinat GPS, akurasi, dan foto selfie.
- Filter berdasarkan **nama** dan **rentang tanggal**.
- **Rekap harian** dan **rekap bulanan**.
- **Unduh laporan Excel** (.xlsx) berisi 3 sheet: Data Absensi, Rekap Harian, Rekap Bulanan.
- Admin dapat mengganti password sendiri.

## Teknologi

| Bagian | Pilihan |
| --- | --- |
| Runtime | Node.js 24 (LTS) |
| Server | Express 4 |
| Database | SQLite (`node:sqlite` bawaan Node, tanpa layanan berbayar) |
| Foto selfie | Disimpan sebagai BLOB di tabel `absensi` |
| Auth admin | bcryptjs + cookie sesi bertanda tangan HMAC-SHA256 |
| Excel | exceljs |

Semua komponen gratis dan berjalan di dalam satu container, tanpa layanan berbayar.

## Menjalankan lokal

```bash
npm install
ADMIN_ID=admin ADMIN_PASSWORD=passwordku123 npm start
```

Buka `http://localhost:3000` (karyawan) dan `http://localhost:3000/admin` (admin).

> Kamera dan GPS hanya aktif pada `https://` atau `localhost`. Saat aplikasi diakses lewat
> IP jaringan lokal (mis. `http://192.168.1.5:3000`), browser akan memblokir kamera/GPS —
> gunakan domain HTTPS hasil deploy.

## Variabel lingkungan

| Nama | Default | Keterangan |
| --- | --- | --- |
| `PORT` | `3000` | Port HTTP server |
| `DATA_DIR` | `./data` | Lokasi berkas SQLite |
| `ADMIN_ID` | `admin` | ID admin awal (hanya dipakai saat seeding) |
| `ADMIN_PASSWORD` | `jntcargo2025` | Password admin awal |

**Penting:** segera ganti password admin melalui tab **Pengaturan** setelah login pertama.
Jika `ADMIN_PASSWORD` diubah setelah database dibuat, password tidak otomatis berubah —
gunakan tab Pengaturan atau hapus berkas database.

## API

| Metode | Jalur | Akses | Fungsi |
| --- | --- | --- | --- |
| GET | `/healthz` | publik | Cek kesehatan server |
| GET | `/api/absensi/hari-ini?nama=` | publik | Status absen hari ini |
| POST | `/api/absensi` | publik | Simpan absensi `{nama, tipe, latitude, longitude, akurasi, foto}` |
| POST | `/api/admin/login` | publik | Login `{adminId, password}` |
| POST | `/api/admin/logout` | admin | Hapus sesi |
| GET | `/api/admin/saya` | admin | Profil admin aktif |
| POST | `/api/admin/password` | admin | Ganti password `{lama, baru}` |
| GET | `/api/admin/absensi` | admin | Daftar absensi (`nama`, `dari`, `sampai`, `tipe`, `limit`, `offset`) |
| GET | `/api/admin/absensi/:id/foto` | admin | Berkas foto selfie |
| GET | `/api/admin/ringkasan` | admin | Statistik hari ini & bulan ini |
| GET | `/api/admin/rekap/harian` | admin | Rekap harian (`tanggal`) |
| GET | `/api/admin/rekap/bulanan` | admin | Rekap bulanan (`bulan` = `YYYY-MM`) |
| GET | `/api/admin/export` | admin | Unduh laporan Excel |

## Pengujian

```bash
npm test
```

23 pengujian end-to-end mencakup validasi selfie/GPS, pencatatan WIB, penolakan absen ganda,
login admin, proteksi endpoint, filter, rekap harian/bulanan, berkas Excel, ganti password,
dan logout.

## Catatan penyimpanan

Pada paket hosting gratis tanpa persistent disk, database dan foto berada di dalam container.
Data tetap tersimpan selama container berjalan, tetapi **hilang bila aplikasi dibangun ulang
(redeploy)**. Untuk penyimpanan permanen gunakan persistent disk (paket Starter/Pro) atau
hubungkan database eksternal gratis seperti Supabase, lalu ganti lapisan `lib/db.js`.
