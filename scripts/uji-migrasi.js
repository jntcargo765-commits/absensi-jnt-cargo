'use strict';

// Uji migrasi skema lama (UNIQUE nama_key+tanggal+tipe) -> skema tanpa batas harian.
// Membuat DB berskema lama, menjalankan lib/db.js, lalu memastikan data utuh dan
// dua entri MASUK pada tanggal yang sama bisa tersimpan.

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { spawnSync } = require('node:child_process');

const dir = '/tmp/db-lama-uji';
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const skemaLama = `CREATE TABLE absensi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL, nama_key TEXT NOT NULL, tanggal TEXT NOT NULL,
  tipe TEXT NOT NULL CHECK (tipe IN ('MASUK','PULANG')),
  jam TEXT NOT NULL, waktu_iso TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL,
  akurasi REAL, foto_mime TEXT NOT NULL, foto BLOB NOT NULL, foto_ukuran INTEGER NOT NULL,
  user_agent TEXT, dibuat_pada TEXT NOT NULL, UNIQUE (nama_key, tanggal, tipe));`;

const isi =
  "INSERT INTO absensi (nama,nama_key,tanggal,tipe,jam,waktu_iso,latitude,longitude," +
  "foto_mime,foto,foto_ukuran,dibuat_pada) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)";
const contoh = (jam) => ['Lama', 'lama', '2026-11-08', 'MASUK', jam, 'x', -6.2, 106.8, 'image/jpeg', Buffer.from([0x00, 0x11]), 10, 'x'];

const lama = new DatabaseSync(path.join(dir, 'absensi.db'));
lama.exec(skemaLama);
lama.prepare(isi).run(...contoh('07:00:00'));
lama.close();

const anak = spawnSync(process.execPath, ['-e', "require('./lib/db')"], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, DATA_DIR: dir },
  encoding: 'utf8'
});
if (anak.status !== 0) {
  console.error('gagal memuat lib/db.js:', anak.stderr);
  process.exit(1);
}

const baru = new DatabaseSync(path.join(dir, 'absensi.db'));
const sql = baru.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='absensi'").get().sql;
const barisAwal = baru.prepare('SELECT COUNT(*) AS n FROM absensi').get().n;
baru.prepare(isi).run(...contoh('08:00:00'));
const masukGanda = baru
  .prepare("SELECT COUNT(*) AS n FROM absensi WHERE nama_key='lama' AND tanggal='2026-11-08' AND tipe='MASUK'")
  .get().n;
const urutanId = baru.prepare('SELECT id FROM absensi ORDER BY id ASC').all().map((r) => r.id);
baru.close();

const uniqueTersisa = /UNIQUE/i.test(sql);
const ok = !uniqueTersisa && barisAwal === 1 && masukGanda === 2;
console.log(JSON.stringify({ uniqueTersisa, barisAwal, masukGanda, urutanId }, null, 2));
console.log(ok ? 'HASIL MIGRASI: LULUS' : 'HASIL MIGRASI: GAGAL');
process.exit(ok ? 0 : 1);
