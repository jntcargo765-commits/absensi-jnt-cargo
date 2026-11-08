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

db.exec(`
CREATE TABLE IF NOT EXISTS absensi (
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
  dibuat_pada TEXT NOT NULL,
  UNIQUE (nama_key, tanggal, tipe)
);

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
