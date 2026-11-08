'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { db, getSetting } = require('./db');
const { httpError } = require('./errors');

const COOKIE_NAME = 'absensi_admin';
const SESI_MS = 8 * 60 * 60 * 1000; // 8 jam

function secret() {
  return getSetting('session_secret');
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function buatToken(payload) {
  const isi = { ...payload, exp: Date.now() + SESI_MS };
  const body = base64url(JSON.stringify(isi));
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifikasiToken(token) {
  if (typeof token !== 'string' || token.length < 10 || token.length > 2048) return null;
  const titik = token.lastIndexOf('.');
  if (titik < 1) return null;
  const body = token.slice(0, titik);
  const sig = token.slice(titik + 1);
  const harapan = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(harapan);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    if (!payload.sub || !payload.admin_id) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookie(header) {
  const hasil = {};
  if (typeof header !== 'string') return hasil;
  for (const bagian of header.split(';')) {
    const idx = bagian.indexOf('=');
    if (idx < 0) continue;
    const kunci = bagian.slice(0, idx).trim();
    if (!kunci || kunci in hasil) continue;
    hasil[kunci] = decodeURIComponent(bagian.slice(idx + 1).trim());
  }
  return hasil;
}

function ambilSesi(req) {
  const cookies = parseCookie(req.headers.cookie);
  return verifikasiToken(cookies[COOKIE_NAME]);
}

function simpanSesi(res, req, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: SESI_MS,
    path: '/'
  });
}

function hapusSesi(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', path: '/' });
}

function cariAdmin(adminId) {
  return db.prepare('SELECT id, admin_id, password_hash, nama FROM admin WHERE admin_id = ?').get(adminId);
}

function login(adminId, password) {
  const id = String(adminId || '').trim();
  const sandi = String(password || '');
  if (!id || !sandi) throw httpError(400, 'ID admin dan password wajib diisi.');

  const admin = cariAdmin(id);
  // Tetap jalankan perbandingan agar waktu respons tidak membocorkan keberadaan ID.
  const hash = admin ? admin.password_hash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
  const cocok = bcrypt.compareSync(sandi, hash);
  if (!admin || !cocok) throw httpError(401, 'ID admin atau password salah.');

  return { admin, token: buatToken({ sub: admin.id, admin_id: admin.admin_id, nama: admin.nama }) };
}

function wajibAdmin(req, res, next) {
  const sesi = ambilSesi(req);
  if (!sesi) {
    res.status(401).json({ ok: false, pesan: 'Sesi admin berakhir. Silakan login kembali.' });
    return;
  }
  const admin = db.prepare('SELECT id, admin_id, nama FROM admin WHERE id = ?').get(sesi.sub);
  if (!admin) {
    hapusSesi(res);
    res.status(401).json({ ok: false, pesan: 'Akun admin tidak ditemukan. Silakan login kembali.' });
    return;
  }
  req.admin = admin;
  next();
}

function ubahPassword(adminId, lama, baru) {
  const admin = cariAdmin(adminId);
  if (!admin) throw httpError(401, 'Akun admin tidak ditemukan.');
  if (!bcrypt.compareSync(String(lama || ''), admin.password_hash)) {
    throw httpError(400, 'Password lama tidak sesuai.');
  }
  const sandiBaru = String(baru || '');
  if (sandiBaru.length < 8) throw httpError(400, 'Password baru minimal 8 karakter.');
  db.prepare('UPDATE admin SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(sandiBaru, 10), admin.id);
}

module.exports = {
  COOKIE_NAME,
  SESI_MS,
  login,
  wajibAdmin,
  ambilSesi,
  simpanSesi,
  hapusSesi,
  ubahPassword,
  cariAdmin,
  parseCookie,
  buatToken,
  verifikasiToken
};
