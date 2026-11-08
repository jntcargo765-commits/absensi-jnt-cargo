'use strict';

// WIB (Asia/Jakarta) selalu UTC+7 tanpa daylight saving.
const OFFSET_MS = 7 * 60 * 60 * 1000;

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

/** Bagian waktu dalam zona WIB untuk sebuah Date (default: sekarang). */
function bagianWaktu(date = new Date()) {
  const wib = new Date(date.getTime() + OFFSET_MS);
  const iso = wib.toISOString();
  return {
    tanggal: iso.slice(0, 10),
    jam: iso.slice(11, 19),
    menit: iso.slice(11, 16),
    iso: date.toISOString()
  };
}

function validTanggal(nilai) {
  if (typeof nilai !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(nilai)) return false;
  const [t, b, h] = nilai.split('-').map(Number);
  if (b < 1 || b > 12 || h < 1 || h > 31) return false;
  const uji = new Date(Date.UTC(t, b - 1, h));
  return uji.getUTCFullYear() === t && uji.getUTCMonth() === b - 1 && uji.getUTCDate() === h;
}

function validBulan(nilai) {
  return typeof nilai === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(nilai);
}

function namaHari(tanggal) {
  if (!validTanggal(tanggal)) return '';
  const d = new Date(tanggal + 'T00:00:00Z');
  return HARI[d.getUTCDay()];
}

function labelTanggal(tanggal) {
  if (!validTanggal(tanggal)) return tanggal || '';
  const [t, b, h] = tanggal.split('-').map(Number);
  return `${h} ${BULAN[b - 1]} ${t}`;
}

function labelBulan(bulan) {
  if (!validBulan(bulan)) return bulan || '';
  const [t, b] = bulan.split('-').map(Number);
  return `${BULAN[b - 1]} ${t}`;
}

function tanggalHariIni() {
  return bagianWaktu().tanggal;
}

function bulanBerjalan() {
  return bagianWaktu().tanggal.slice(0, 7);
}

module.exports = {
  OFFSET_MS,
  bagianWaktu,
  validTanggal,
  validBulan,
  namaHari,
  labelTanggal,
  labelBulan,
  tanggalHariIni,
  bulanBerjalan
};
