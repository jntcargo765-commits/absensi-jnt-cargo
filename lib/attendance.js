'use strict';

const { db } = require('./db');
const { bagianWaktu } = require('./time');
const { httpError } = require('./errors');

const MAKS_FOTO_BYTE = 5 * 1024 * 1024;
const MIN_FOTO_BYTE = 2 * 1024;

function bersihkanNama(nama) {
  if (typeof nama !== 'string') return null;
  const bersih = nama.replace(/\s+/g, ' ').trim();
  if (bersih.length < 2 || bersih.length > 60) return null;
  return bersih;
}

function kunciNama(nama) {
  return nama.toLowerCase();
}

function angkaKoordinat(nilai, min, max) {
  const n = typeof nilai === 'string' && nilai.trim() !== '' ? Number(nilai) : nilai;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function parseFoto(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length < 100) {
    throw httpError(400, 'Selfie wajib diambil langsung dari kamera.');
  }
  const cocok = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl.trim());
  if (!cocok) throw httpError(400, 'Format foto tidak dikenali. Silakan ambil ulang selfie.');

  const mime = cocok[1] === 'image/jpg' ? 'image/jpeg' : cocok[1];
  const buffer = Buffer.from(cocok[2], 'base64');

  if (buffer.length < MIN_FOTO_BYTE) throw httpError(400, 'Foto selfie tidak valid. Silakan ambil ulang.');
  if (buffer.length > MAKS_FOTO_BYTE) throw httpError(413, 'Ukuran foto selfie maksimal 5 MB.');

  return { mime, buffer };
}

function statusHariIni(nama) {
  const namaBersih = bersihkanNama(nama);
  if (!namaBersih) return { tanggal: bagianWaktu().tanggal, masuk: null, pulang: null };

  const { tanggal } = bagianWaktu();
  const baris = db
    .prepare('SELECT tipe, jam FROM absensi WHERE nama_key = ? AND tanggal = ? ORDER BY jam ASC')
    .all(kunciNama(namaBersih), tanggal);

  const hasil = { tanggal, masuk: null, pulang: null };
  for (const r of baris) {
    if (r.tipe === 'MASUK') hasil.masuk = r.jam;
    if (r.tipe === 'PULANG') hasil.pulang = r.jam;
  }
  return hasil;
}

function simpanAbsensi({ nama, tipe, latitude, longitude, akurasi, foto, userAgent }) {
  const namaBersih = bersihkanNama(nama);
  if (!namaBersih) throw httpError(400, 'Nama karyawan wajib diisi (2-60 karakter).');

  const tipeBersih = String(tipe || '').toUpperCase();
  if (tipeBersih !== 'MASUK' && tipeBersih !== 'PULANG') {
    throw httpError(400, 'Jenis absensi harus MASUK atau PULANG.');
  }

  const lat = angkaKoordinat(latitude, -90, 90);
  const lng = angkaKoordinat(longitude, -180, 180);
  if (lat === null || lng === null) {
    throw httpError(400, 'Lokasi GPS wajib aktif. Aktifkan GPS lalu ambil lokasi kembali.');
  }

  let akurasiBersih = angkaKoordinat(akurasi, 0, 100000);
  if (akurasiBersih !== null) akurasiBersih = Math.round(akurasiBersih);

  const fotoData = parseFoto(foto);
  const waktu = bagianWaktu();
  const namaKey = kunciNama(namaBersih);

  const sudah = db
    .prepare('SELECT jam FROM absensi WHERE nama_key = ? AND tanggal = ? AND tipe = ?')
    .get(namaKey, waktu.tanggal, tipeBersih);
  if (sudah) {
    throw httpError(
      409,
      tipeBersih === 'MASUK'
        ? `Anda sudah absen MASUK hari ini pukul ${sudah.jam} WIB.`
        : `Anda sudah absen PULANG hari ini pukul ${sudah.jam} WIB.`
    );
  }

  if (tipeBersih === 'PULANG') {
    const masuk = db
      .prepare('SELECT jam FROM absensi WHERE nama_key = ? AND tanggal = ? AND tipe = ?')
      .get(namaKey, waktu.tanggal, 'MASUK');
    if (!masuk) {
      throw httpError(409, 'Belum ada absen MASUK hari ini. Silakan absen masuk terlebih dahulu.');
    }
  }

  const info = db
    .prepare(
      `INSERT INTO absensi
        (nama, nama_key, tanggal, tipe, jam, waktu_iso, latitude, longitude, akurasi,
         foto_mime, foto, foto_ukuran, user_agent, dibuat_pada)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      namaBersih,
      namaKey,
      waktu.tanggal,
      tipeBersih,
      waktu.jam,
      waktu.iso,
      lat,
      lng,
      akurasiBersih,
      fotoData.mime,
      fotoData.buffer,
      fotoData.buffer.length,
      String(userAgent || '').slice(0, 255),
      new Date().toISOString()
    );

  return {
    id: Number(info.lastInsertRowid),
    nama: namaBersih,
    tipe: tipeBersih,
    tanggal: waktu.tanggal,
    jam: waktu.jam,
    latitude: lat,
    longitude: lng,
    akurasi: akurasiBersih
  };
}

function ambilFoto(id) {
  const nomor = Number(id);
  if (!Number.isInteger(nomor) || nomor <= 0) return null;
  const baris = db.prepare('SELECT foto_mime, foto FROM absensi WHERE id = ?').get(nomor);
  if (!baris) return null;
  return { mime: baris.foto_mime, buffer: Buffer.from(baris.foto) };
}

module.exports = { simpanAbsensi, statusHariIni, ambilFoto, bersihkanNama };
