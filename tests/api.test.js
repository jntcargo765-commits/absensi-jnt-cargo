'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Konfigurasi uji diisolasi ke folder sementara.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'absensi-uji-'));
process.env.DATA_DIR = dataDir;
process.env.ADMIN_ID = 'adminuji';
process.env.ADMIN_PASSWORD = 'RahasiaUji2025!';

const app = require('../server');

let server;
let base;
let cookie = '';

// JPEG 1x1 valid + segmen komentar agar melewati batas ukuran minimum (2 KB).
const jpegKecil = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64'
);

function fotoUji() {
  const isiKomentar = Buffer.alloc(3000, 0x20);
  const panjang = isiKomentar.length + 2;
  const komentar = Buffer.concat([Buffer.from([0xff, 0xfe, (panjang >> 8) & 0xff, panjang & 0xff]), isiKomentar]);
  const jpeg = Buffer.concat([jpegKecil.subarray(0, 2), komentar, jpegKecil.subarray(2)]);
  return 'data:image/jpeg;base64,' + jpeg.toString('base64');
}

const FOTO = fotoUji();

async function kirim(jalur, opsi = {}) {
  const headers = Object.assign({}, opsi.headers);
  if (cookie) headers.Cookie = cookie;
  if (opsi.body && typeof opsi.body !== 'string') {
    headers['Content-Type'] = 'application/json';
    opsi.body = JSON.stringify(opsi.body);
  }
  const res = await fetch(base + jalur, Object.assign({}, opsi, { headers, redirect: 'manual' }));
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  return res;
}

async function json(res) {
  return res.json();
}

function absen(nama, tipe, tambahan = {}) {
  return kirim('/api/absensi', {
    method: 'POST',
    body: Object.assign(
      {
        nama,
        tipe,
        latitude: -6.175392,
        longitude: 106.827153,
        akurasi: 12,
        foto: FOTO
      },
      tambahan
    )
  });
}

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = 'http://127.0.0.1:' + server.address().port;
});

after(() => {
  if (server) server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('healthz melaporkan server hidup', async () => {
  const res = await kirim('/healthz');
  assert.equal(res.status, 200);
  const data = await json(res);
  assert.equal(data.ok, true);
});

test('halaman karyawan dapat dibuka tanpa login', async () => {
  const res = await kirim('/');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /ABSEN MASUK/);
  assert.match(html, /ABSEN PULANG/);
  assert.match(html, /<video[^>]*id="video"/);
});

test('dashboard admin meminta login', async () => {
  const res = await kirim('/admin');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Login Admin/);
});

test('absensi ditolak tanpa selfie', async () => {
  const res = await absen('Budi Santoso', 'MASUK', { foto: '' });
  assert.equal(res.status, 400);
  assert.match((await json(res)).pesan, /Selfie/i);
});

test('absensi ditolak tanpa koordinat GPS', async () => {
  const res = await absen('Budi Santoso', 'MASUK', { latitude: null, longitude: undefined });
  assert.equal(res.status, 400);
  assert.match((await json(res)).pesan, /GPS/i);
});

test('absensi ditolak bila tipe tidak dikenal', async () => {
  const res = await absen('Budi Santoso', 'LIBUR');
  assert.equal(res.status, 400);
});

test('absen masuk tersimpan dengan jam WIB dan koordinat', async () => {
  const res = await absen('Budi Santoso', 'MASUK');
  assert.equal(res.status, 201);
  const data = await json(res);
  assert.equal(data.ok, true);
  assert.equal(data.data.tipe, 'MASUK');
  assert.match(data.data.jam, /^\d{2}:\d{2}:\d{2}$/);
  assert.match(data.data.tanggal, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(data.data.latitude, -6.175392);
  assert.ok(data.data.id > 0);
});

test('absen masuk ganda ditolak', async () => {
  const res = await absen('Budi Santoso', 'MASUK');
  assert.equal(res.status, 409);
  assert.match((await json(res)).pesan, /sudah absen MASUK/i);
});

test('absen pulang tanpa absen masuk ditolak', async () => {
  const res = await absen('Siti Aminah', 'PULANG');
  assert.equal(res.status, 409);
  assert.match((await json(res)).pesan, /MASUK/i);
});

test('absen pulang tersimpan setelah absen masuk', async () => {
  const masuk = await absen('Siti Aminah', 'MASUK');
  assert.equal(masuk.status, 201);
  const res = await absen('Siti Aminah', 'PULANG');
  assert.equal(res.status, 201);
  assert.equal((await json(res)).data.tipe, 'PULANG');
});

test('status hari ini menampilkan jam masuk dan pulang', async () => {
  const res = await kirim('/api/absensi/hari-ini?nama=Siti%20Aminah');
  assert.equal(res.status, 200);
  const data = await json(res);
  assert.ok(data.data.masuk, 'jam masuk harus terisi');
  assert.ok(data.data.pulang, 'jam pulang harus terisi');
});

test('endpoint admin menolak akses tanpa login', async () => {
  for (const jalur of ['/api/admin/absensi', '/api/admin/ringkasan', '/api/admin/rekap/harian', '/api/admin/export']) {
    const res = await kirim(jalur);
    assert.equal(res.status, 401, 'jalur ' + jalur + ' harus 401');
  }
});

test('login admin menolak password salah', async () => {
  const res = await kirim('/api/admin/login', {
    method: 'POST',
    body: { adminId: 'adminuji', password: 'password-salah' }
  });
  assert.equal(res.status, 401);
});

test('login admin berhasil dengan ID dan password benar', async () => {
  const res = await kirim('/api/admin/login', {
    method: 'POST',
    body: { adminId: 'adminuji', password: 'RahasiaUji2025!' }
  });
  assert.equal(res.status, 200);
  const data = await json(res);
  assert.equal(data.ok, true);
  assert.equal(data.admin.admin_id, 'adminuji');
  assert.ok(cookie, 'cookie sesi harus dibuat');

  const saya = await kirim('/api/admin/saya');
  assert.equal(saya.status, 200);
  assert.equal((await json(saya)).admin.admin_id, 'adminuji');
});

test('admin melihat semua data absensi', async () => {
  const res = await kirim('/api/admin/absensi?limit=50');
  assert.equal(res.status, 200);
  const data = await json(res);
  assert.ok(data.total >= 3, 'harus ada minimal 3 catatan absensi');
  const pertama = data.baris[0];
  assert.ok(pertama.nama);
  assert.ok(pertama.jam);
  assert.ok(typeof pertama.latitude === 'number');
  assert.match(pertama.peta, /google\.com\/maps/);
});

test('filter nama dan tanggal berfungsi', async () => {
  const nama = await kirim('/api/admin/absensi?nama=budi');
  const dataNama = await json(nama);
  assert.ok(dataNama.total >= 2);
  assert.ok(dataNama.baris.every((r) => /budi/i.test(r.nama)));

  const tanggalHariIni = (await json(await kirim('/api/admin/absensi?limit=1'))).baris[0].tanggal;
  const cocok = await json(await kirim('/api/admin/absensi?dari=' + tanggalHariIni + '&sampai=' + tanggalHariIni));
  assert.ok(cocok.total >= 3);

  const kosong = await json(await kirim('/api/admin/absensi?dari=2000-01-01&sampai=2000-01-02'));
  assert.equal(kosong.total, 0);
});

test('foto selfie dapat diambil admin dan bukan gambar rusak', async () => {
  const daftar = await json(await kirim('/api/admin/absensi?limit=1'));
  const id = daftar.baris[0].id;
  const res = await kirim('/api/admin/absensi/' + id + '/foto');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /image\/jpeg/);
  const buffer = Buffer.from(await res.arrayBuffer());
  assert.ok(buffer.length > 2048);
  assert.equal(buffer[0], 0xff);
  assert.equal(buffer[1], 0xd8);
});

test('rekap harian memuat jam masuk dan pulang per karyawan', async () => {
  const res = await kirim('/api/admin/rekap/harian');
  assert.equal(res.status, 200);
  const data = await json(res);
  assert.ok(Array.isArray(data.data));
  assert.ok(data.data.length >= 1);
  const grup = data.data[0];
  assert.ok(grup.tanggal);
  assert.ok(grup.karyawan.length >= 1);
  assert.ok(grup.hadir >= 1);
});

test('rekap bulanan menghitung kehadiran per karyawan', async () => {
  const bulan = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
  const res = await kirim('/api/admin/rekap/bulanan?bulan=' + bulan);
  assert.equal(res.status, 200);
  const data = await json(res);
  assert.equal(data.bulan, bulan);
  const siti = data.data.find((o) => /siti/i.test(o.nama));
  assert.ok(siti, 'Siti harus ada pada rekap bulanan');
  assert.equal(siti.totalMasuk, 1);
  assert.equal(siti.totalPulang, 1);
  assert.equal(siti.hariHadir, 1);
});

test('unduh laporan Excel menghasilkan berkas xlsx valid', async () => {
  const res = await kirim('/api/admin/export');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /spreadsheetml\.sheet/);
  assert.match(res.headers.get('content-disposition'), /attachment; filename="Laporan-Absensi-JNT-Cargo-\d{4}-\d{2}-\d{2}\.xlsx"/);
  const buffer = Buffer.from(await res.arrayBuffer());
  assert.ok(buffer.length > 3000, 'berkas Excel harus berisi data');
  assert.equal(buffer.subarray(0, 2).toString(), 'PK');
});

test('admin dapat mengganti password lalu login dengan password baru', async () => {
  const ganti = await kirim('/api/admin/password', {
    method: 'POST',
    body: { lama: 'RahasiaUji2025!', baru: 'PasswordBaru2025!' }
  });
  assert.equal(ganti.status, 200);

  cookie = '';
  const lama = await kirim('/api/admin/login', {
    method: 'POST',
    body: { adminId: 'adminuji', password: 'RahasiaUji2025!' }
  });
  assert.equal(lama.status, 401);

  const baru = await kirim('/api/admin/login', {
    method: 'POST',
    body: { adminId: 'adminuji', password: 'PasswordBaru2025!' }
  });
  assert.equal(baru.status, 200);
});

test('logout menghapus sesi admin', async () => {
  const keluar = await kirim('/api/admin/logout', { method: 'POST' });
  assert.equal(keluar.status, 200);
  cookie = '';
  const saya = await kirim('/api/admin/saya');
  assert.equal(saya.status, 401);
});

test('endpoint API tidak dikenal mengembalikan 404 JSON', async () => {
  const res = await kirim('/api/tidak-ada');
  assert.equal(res.status, 404);
  assert.equal((await json(res)).ok, false);
});
