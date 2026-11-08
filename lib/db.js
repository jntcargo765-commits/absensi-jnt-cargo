'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'absensi.db');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');

// Definisi kolom tabel absensi. Sengaja TANPA UNIQUE(nama_key, tanggal, tipe):
// absen MASUK dan PULANG boleh dicatat berkali-kali dalam sehari.
const DEFINISI_KOLOM_ABSENSI = `
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nama        TEXT NOT NULL,
  nama_key    TEXT NOT NULL,
  tanggal     TEXT NOT NULL,
  tipe        TEXT NOT NULL CHECK (tipe IN ('MASUK', 'PULANG')),
  jam         TEXT NOT NULL,
  waktu_iso   TEXT NOT NULL,
  latitude    REAL NOT NULL,
  longitude   REAL NOT NULL,
  akurasi     REAL,
  foto_mime   TEXT NOT NULL,
  foto        BLOB NOT NULL,
  foto_ukuran INTEGER NOT NULL,
  user_agent  TEXT,
  dibuat_pada TEXT NOT NULL
`;

db.exec(`
CREATE TABLE IF NOT EXISTS absensi (${DEFINISI_KOLOM_ABSENSI});

CREATE INDEX IF NOT EXISTS idx_absensi_tanggal ON absensi (tanggal);
CREATE INDEX IF NOT EXISTS idx_absensi_nama ON absensi (nama_key);

CREATE TABLE IF NOT EXISTS admin (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nama          TEXT,
  dibuat_pada   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pengaturan (
  kunci TEXT PRIMARY KEY,
  nilai TEXT NOT NULL
);
`);

// Migrasi database lama yang masih memakai UNIQUE(nama_key, tanggal, tipe):
// tabel dibangun ulang tanpa batasan tersebut, seluruh data absensi disalin apa adanya.
function migrasiAbsensiBerulang() {
  const tabel = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'absensi'")
    .get();
  if (!tabel || !/UNIQUE\s*\(\s*nama_key\s*,\s*tanggal\s*,\s*tipe\s*\)/i.test(tabel.sql || '')) {
    return false;
  }

  const kolom =
    'id, nama, nama_key, tanggal, tipe, jam, waktu_iso, latitude, longitude, akurasi, ' +
    'foto_mime, foto, foto_ukuran, user_agent, dibuat_pada';

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.exec('DROP TABLE IF EXISTS absensi_migrasi;');
    db.exec(`CREATE TABLE absensi_migrasi (${DEFINISI_KOLOM_ABSENSI});`);
    db.exec(`INSERT INTO absensi_migrasi (${kolom}) SELECT ${kolom} FROM absensi;`);
    db.exec('DROP TABLE absensi;');
    db.exec('ALTER TABLE absensi_migrasi RENAME TO absensi;');
    db.exec('CREATE INDEX IF NOT EXISTS idx_absensi_tanggal ON absensi (tanggal);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_absensi_nama ON absensi (nama_key);');
    db.exec('COMMIT;');
  } catch (galat) {
    db.exec('ROLLBACK;');
    throw galat;
  }
  return true;
}

migrasiAbsensiBerulang();

function getSetting(kunci) {
  const baris = db.prepare('SELECT nilai FROM pengaturan WHERE kunci = ?').get(kunci);
  return baris ? baris.nilai : null;
}

function setSetting(kunci, nilai) {
  db.prepare(
    'INSERT INTO pengaturan (kunci, nilai) VALUES (?, ?) ON CONFLICT(kunci) DO UPDATE SET nilai = excluded.nilai'
  ).run(kunci, String(nilai));
}

// Kunci tanda tangan sesi disimpan di database agar sesi tidak hilang saat proses restart.
if (!getSetting('session_secret')) {
  setSetting('session_secret', crypto.randomBytes(48).toString('hex'));
}

// Akun admin awal. Dapat diganti lewat variabel lingkungan ADMIN_ID / ADMIN_PASSWORD.
const jumlahAdmin = db.prepare('SELECT COUNT(*) AS n FROM admin').get().n;
if (!jumlahAdmin) {
  const adminId = String(process.env.ADMIN_ID || 'admin').trim() || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'jntcargo2025';
  db.prepare('INSERT INTO admin (admin_id, password_hash, nama, dibuat_pada) VALUES (?, ?, ?, ?)').run(
    adminId,
    bcrypt.hashSync(password, 10),
    'Administrator JNT CARGO',
    new Date().toISOString()
  );
}

module.exports = { db, dataDir, dbPath, getSetting, setSetting };
