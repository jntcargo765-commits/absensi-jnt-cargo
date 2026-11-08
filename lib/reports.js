'use strict';

const { db } = require('./db');
const { validTanggal, validBulan, namaHari } = require('./time');

const MAKS_BARIS = 5000;

/** Normalisasi filter nama/tanggal/tipe menjadi klausa SQL parameter. */
function filterAbsensi({ nama, dari, sampai, tipe } = {}) {
  const klausa = [];
  const params = [];

  if (typeof nama === 'string' && nama.trim()) {
    klausa.push('nama_key LIKE ?');
    params.push('%' + nama.trim().toLowerCase() + '%');
  }
  if (validTanggal(dari)) {
    klausa.push('tanggal >= ?');
    params.push(dari);
  }
  if (validTanggal(sampai)) {
    klausa.push('tanggal <= ?');
    params.push(sampai);
  }
  const tipeBersih = String(tipe || '').toUpperCase();
  if (tipeBersih === 'MASUK' || tipeBersih === 'PULANG') {
    klausa.push('tipe = ?');
    params.push(tipeBersih);
  }

  return {
    where: klausa.length ? 'WHERE ' + klausa.join(' AND ') : '',
    params
  };
}

function daftarAbsensi(filter = {}) {
  const { where, params } = filterAbsensi(filter);
  const batas = Math.min(Math.max(Number(filter.limit) || 300, 1), MAKS_BARIS);
  const offset = Math.max(Number(filter.offset) || 0, 0);

  const baris = db
    .prepare(
      `SELECT id, nama, tanggal, tipe, jam, waktu_iso, latitude, longitude, akurasi,
              foto_ukuran, dibuat_pada
         FROM absensi
         ${where}
        ORDER BY tanggal DESC, jam DESC, nama ASC
        LIMIT ? OFFSET ?`
    )
    .all(...params, batas, offset);

  const total = db.prepare(`SELECT COUNT(*) AS n FROM absensi ${where}`).get(...params).n;

  return {
    total,
    baris: baris.map((r) => ({
      id: r.id,
      nama: r.nama,
      tanggal: r.tanggal,
      hari: namaHari(r.tanggal),
      tipe: r.tipe,
      jam: r.jam,
      waktu_iso: r.waktu_iso,
      latitude: r.latitude,
      longitude: r.longitude,
      akurasi: r.akurasi,
      foto_ukuran: r.foto_ukuran,
      peta: `https://www.google.com/maps?q=${r.latitude},${r.longitude}`
    }))
  };
}

function ambilSemuaBaris(filter = {}) {
  const { where, params } = filterAbsensi(filter);
  return db
    .prepare(
      `SELECT nama, nama_key, tanggal, tipe, jam, latitude, longitude, akurasi
         FROM absensi
         ${where}
        ORDER BY tanggal ASC, nama ASC, jam ASC
        LIMIT ?`
    )
    .all(...params, MAKS_BARIS);
}

/** Rekap per tanggal: siapa yang masuk/pulang dan jamnya. */
function rekapHarian(filter = {}) {
  const baris = ambilSemuaBaris(filter);
  const perTanggal = new Map();

  for (const r of baris) {
    if (!perTanggal.has(r.tanggal)) {
      perTanggal.set(r.tanggal, {
        tanggal: r.tanggal,
        hari: namaHari(r.tanggal),
        karyawan: new Map()
      });
    }
    const grup = perTanggal.get(r.tanggal);
    const kunci = r.nama_key;
    if (!grup.karyawan.has(kunci)) {
      grup.karyawan.set(kunci, {
        nama: r.nama,
        masuk: null,
        pulang: null,
        jumlahMasuk: 0,
        jumlahPulang: 0,
        lokasi: null,
        akurasi: null
      });
    }
    const orang = grup.karyawan.get(kunci);
    // Absen boleh berkali-kali sehari: simpan MASUK pertama, PULANG terakhir, dan jumlah entri.
    if (r.tipe === 'MASUK') {
      if (!orang.masuk) orang.masuk = r.jam;
      orang.jumlahMasuk += 1;
      if (!orang.lokasi) {
        orang.lokasi = { latitude: r.latitude, longitude: r.longitude };
        orang.akurasi = r.akurasi;
      }
    }
    if (r.tipe === 'PULANG') {
      orang.pulang = r.jam;
      orang.jumlahPulang += 1;
    }
  }

  return [...perTanggal.values()]
    .map((g) => {
      const karyawan = [...g.karyawan.values()].map((o) => ({
        ...o,
        peta: o.lokasi ? `https://www.google.com/maps?q=${o.lokasi.latitude},${o.lokasi.longitude}` : null
      }));
      return {
        tanggal: g.tanggal,
        hari: g.hari,
        hadir: karyawan.length,
        lengkap: karyawan.filter((o) => o.masuk && o.pulang).length,
        entri: karyawan.reduce((n, o) => n + o.jumlahMasuk + o.jumlahPulang, 0),
        karyawan
      };
    })
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal));
}

/** Rekap per karyawan dalam satu bulan (format bulan: YYYY-MM). */
function rekapBulanan({ bulan, nama } = {}) {
  const filter = { nama };
  if (validBulan(bulan)) {
    filter.dari = `${bulan}-01`;
    filter.sampai = `${bulan}-31`;
  }

  const baris = ambilSemuaBaris(filter);
  const perOrang = new Map();

  for (const r of baris) {
    if (!perOrang.has(r.nama_key)) {
      perOrang.set(r.nama_key, {
        nama: r.nama,
        hariHadir: new Set(),
        totalMasuk: 0,
        totalPulang: 0,
        tanggal: []
      });
    }
    const orang = perOrang.get(r.nama_key);
    orang.nama = r.nama;
    if (r.tipe === 'MASUK') {
      orang.totalMasuk += 1;
      orang.hariHadir.add(r.tanggal);
      orang.tanggal.push(r.tanggal);
    }
    if (r.tipe === 'PULANG') orang.totalPulang += 1;
  }

  return [...perOrang.values()]
    .map((o) => ({
      nama: o.nama,
      hariHadir: o.hariHadir.size,
      totalMasuk: o.totalMasuk,
      totalPulang: o.totalPulang,
      tanpaPulang: Math.max(o.totalMasuk - o.totalPulang, 0),
      tanggal: [...o.hariHadir].sort()
    }))
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
}

module.exports = { daftarAbsensi, rekapHarian, rekapBulanan, ambilSemuaBaris, filterAbsensi };
