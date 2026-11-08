'use strict';

// Verifikasi alur selfie karyawan dengan kamera palsu Chromium:
// Aktifkan Kamera -> Ambil Selfie -> pratinjau terlihat -> Absen Masuk tersimpan.
// Jalankan: node scripts/verify-selfie.js (butuh Node >= 22.5 untuk node:sqlite).

const { spawn } = require('node:child_process');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { chromium } = require('/opt/appjet/browser/node_modules/playwright');

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
const DATA_DIR = '/tmp/data-selfie-verify';
const PORT = 3123;

(async () => {
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATA_DIR, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logSrv = '';
  srv.stdout.on('data', (d) => { logSrv += d; });
  srv.stderr.on('data', (d) => { logSrv += d; });
  await tidur(2500);

  const hasil = { serverLog: logSrv.trim().split('\n').slice(-2).join(' | ') };
  const browser = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--no-sandbox']
  });
  try {
    const ctx = await browser.newContext({
      permissions: ['camera', 'geolocation'],
      geolocation: { latitude: -6.2, longitude: 106.8, accuracy: 10 },
      viewport: { width: 420, height: 900 }
    });
    const page = await ctx.newPage();
    const kiriman = [];
    const galat = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/absensi') && r.method() === 'POST') {
        const body = r.postData() || '';
        const cocok = /"foto":"(data:image\/[a-z]+;base64,)/.exec(body);
        kiriman.push({ panjangBody: body.length, fotoDikirim: Boolean(cocok) });
      }
    });
    page.on('pageerror', (e) => galat.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') galat.push(m.text()); });

    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.fill('#nama', 'UJI SELFIE');
    await page.click('#btnKamera');
    await page.waitForFunction(() => {
      const v = document.getElementById('video');
      return v && v.videoWidth > 0;
    }, null, { timeout: 20000 });
    hasil.video = await page.evaluate(() => {
      const v = document.getElementById('video');
      return v.videoWidth + 'x' + v.videoHeight;
    });

    await page.click('#btnAmbil');
    await page.waitForFunction(() => {
      const i = document.getElementById('pratinjau');
      return i && i.src.startsWith('data:image/');
    }, null, { timeout: 15000 });

    hasil.pratinjau = await page.evaluate(() => {
      const i = document.getElementById('pratinjau');
      const r = i.getBoundingClientRect();
      return {
        awalSrc: i.src.slice(0, 23),
        panjangSrc: i.src.length,
        atributHidden: i.hasAttribute('hidden'),
        display: getComputedStyle(i).display,
        tinggiTampil: Math.round(r.height),
        terlihat: r.height > 50 && getComputedStyle(i).display !== 'none',
        badge: (document.getElementById('badgeKamera') || {}).textContent,
        btnAmbilDisabled: document.getElementById('btnAmbil').disabled,
        btnUlangTampil: !document.getElementById('btnUlang').hidden
      };
    });

    await page.click('#btnMasuk');
    await page.waitForFunction(() => {
      const p = document.getElementById('pesan');
      return p && !p.hidden && p.className.indexOf('sukses') >= 0;
    }, null, { timeout: 30000 });
    hasil.pesan = (await page.textContent('#pesan')).replace(/\s+/g, ' ').trim();
    hasil.kiriman = kiriman;
    hasil.galatHalaman = galat.slice(0, 4);
    hasil.pratinjauTersembunyiSetelahSimpan = await page.evaluate(
      () => document.getElementById('pratinjau').hasAttribute('hidden')
    );
  } finally {
    await browser.close();
    srv.kill();
  }

  await tidur(500);
  const db = new DatabaseSync(path.join(DATA_DIR, 'absensi.db'));
  hasil.database = db
    .prepare('SELECT id, nama, tipe, jam, foto_mime, foto_ukuran, length(foto) AS byte FROM absensi ORDER BY id DESC LIMIT 1')
    .all();
  db.close();

  console.log(JSON.stringify(hasil, null, 2));
  const ok = hasil.pratinjau && hasil.pratinjau.terlihat && hasil.pratinjau.panjangSrc > 2048
    && hasil.database[0] && hasil.database[0].foto_ukuran > 2048
    && hasil.kiriman.length === 1 && hasil.kiriman[0].fotoDikirim;
  console.log(ok ? 'HASIL: LULUS' : 'HASIL: GAGAL');
  process.exit(ok ? 0 : 1);
})();
