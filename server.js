'use strict';

const path = require('node:path');
const express = require('express');

const auth = require('./lib/auth');
const { simpanAbsensi, statusHariIni, ambilFoto } = require('./lib/attendance');
const { daftarAbsensi, rekapHarian, rekapBulanan, ambilSemuaBaris } = require('./lib/reports');
const { buatLaporanExcel, keteranganFilter } = require('./lib/excel');
const { httpError, asinkron } = require('./lib/errors');
const { bagianWaktu, validBulan, bulanBerjalan } = require('./lib/time');
const { db } = require('./lib/db');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '8mb' }));

// Header keamanan dasar.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "connect-src 'self'",
      "font-src 'self'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'"
    ].join('; ')
  );
  next();
});

app.use(
  express.static(path.join(__dirname, 'public'), {
    extensions: ['html'],
    setHeaders(res, filePath) {
      if (/\.(css|js)$/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=300');
    }
  })
);

app.get('/healthz', (req, res) => {
  res.json({ ok: true, waktu: bagianWaktu().iso });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ---------- Pembatas percobaan (in-memory) ----------
function buatPembatas({ jendelaMs, maks }) {
  const catatan = new Map();
  return function periksa(kunci) {
    const sekarang = Date.now();
    const data = catatan.get(kunci);
    if (!data || data.mulai + jendelaMs < sekarang) {
      catatan.set(kunci, { mulai: sekarang, jumlah: 1 });
      return;
    }
    data.jumlah += 1;
    if (catatan.size > 5000) {
      for (const [k, v] of catatan) {
        if (v.mulai + jendelaMs < sekarang) catatan.delete(k);
      }
    }
    if (data.jumlah > maks) {
      throw httpError(429, 'Terlalu banyak percobaan. Mohon tunggu beberapa menit lalu coba lagi.');
    }
  };
}

const batasLogin = buatPembatas({ jendelaMs: 10 * 60 * 1000, maks: 10 });
const batasAbsensi = buatPembatas({ jendelaMs: 60 * 1000, maks: 30 });

function ipKlien(req) {
  return String(req.ip || req.socket.remoteAddress || 'unknown');
}

// ---------- API karyawan (tanpa login) ----------

app.get(
  '/api/absensi/hari-ini',
  asinkron(async (req, res) => {
    res.json({ ok: true, data: statusHariIni(req.query.nama) });
  })
);

app.post(
  '/api/absensi',
  asinkron(async (req, res) => {
    batasAbsensi(ipKlien(req));
    const body = req.body || {};
    const data = simpanAbsensi({
      nama: body.nama,
      tipe: body.tipe,
      latitude: body.latitude,
      longitude: body.longitude,
      akurasi: body.akurasi,
      foto: body.foto,
      userAgent: req.headers['user-agent']
    });
    res.status(201).json({
      ok: true,
      pesan: `Absen ${data.tipe} berhasil dicatat pukul ${data.jam} WIB.`,
      data
    });
  })
);

// ---------- API admin ----------

app.post(
  '/api/admin/login',
  asinkron(async (req, res) => {
    batasLogin(ipKlien(req));
    const body = req.body || {};
    const { admin, token } = auth.login(body.adminId, body.password);
    auth.simpanSesi(res, req, token);
    res.json({ ok: true, admin: { admin_id: admin.admin_id, nama: admin.nama } });
  })
);

app.post('/api/admin/logout', (req, res) => {
  auth.hapusSesi(res);
  res.json({ ok: true });
});

app.get('/api/admin/saya', auth.wajibAdmin, (req, res) => {
  res.json({ ok: true, admin: { admin_id: req.admin.admin_id, nama: req.admin.nama } });
});

app.post(
  '/api/admin/password',
  auth.wajibAdmin,
  asinkron(async (req, res) => {
    const body = req.body || {};
    auth.ubahPassword(req.admin.admin_id, body.lama, body.baru);
    res.json({ ok: true, pesan: 'Password admin berhasil diperbarui.' });
  })
);

app.get(
  '/api/admin/absensi',
  auth.wajibAdmin,
  asinkron(async (req, res) => {
    const hasil = daftarAbsensi({
      nama: req.query.nama,
      dari: req.query.dari,
      sampai: req.query.sampai,
      tipe: req.query.tipe,
      limit: req.query.limit,
      offset: req.query.offset
    });
    res.json({ ok: true, ...hasil });
  })
);

app.get(
  '/api/admin/absensi/:id/foto',
  auth.wajibAdmin,
  asinkron(async (req, res) => {
    const foto = ambilFoto(req.params.id);
    if (!foto) throw httpError(404, 'Foto selfie tidak ditemukan.');
    res.setHeader('Content-Type', foto.mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Disposition', `inline; filename="selfie-${req.params.id}.jpg"`);
    res.end(foto.buffer);
  })
);

app.get(
  '/api/admin/ringkasan',
  auth.wajibAdmin,
  asinkron(async (req, res) => {
    const { tanggal } = bagianWaktu();
    const bulan = validBulan(req.query.bulan) ? req.query.bulan : bulanBerjalan();
    const awalBulan = `${bulan}-01`;
    const akhirBulan = `${bulan}-31`;

    const hitung = (sql, ...params) => db.prepare(sql).get(...params).n;

    res.json({
      ok: true,
      data: {
        tanggal,
        bulan,
        hariIni: {
          masuk: hitung("SELECT COUNT(*) AS n FROM absensi WHERE tanggal = ? AND tipe = 'MASUK'", tanggal),
          pulang: hitung("SELECT COUNT(*) AS n FROM absensi WHERE tanggal = ? AND tipe = 'PULANG'", tanggal),
          karyawan: hitung("SELECT COUNT(DISTINCT nama_key) AS n FROM absensi WHERE tanggal = ? AND tipe = 'MASUK'", tanggal)
        },
        bulanIni: {
          karyawan: hitung(
            "SELECT COUNT(DISTINCT nama_key) AS n FROM absensi WHERE tanggal BETWEEN ? AND ? AND tipe = 'MASUK'",
            awalBulan,
            akhirBulan
          ),
          totalAbsensi: hitung('SELECT COUNT(*) AS n FROM absensi WHERE tanggal BETWEEN ? AND ?', awalBulan, akhirBulan),
          hariAdaAbsensi: hitung(
            'SELECT COUNT(DISTINCT tanggal) AS n FROM absensi WHERE tanggal BETWEEN ? AND ?',
            awalBulan,
            akhirBulan
          )
        }
      }
    });
  })
);

app.get(
  '/api/admin/rekap/harian',
  auth.wajibAdmin,
  asinkron(async (req, res) => {
    const data = rekapHarian({
      nama: req.query.nama,
      dari: req.query.dari,
      sampai: req.query.sampai
    });
    res.json({ ok: true, data });
  })
);

app.get(
  '/api/admin/rekap/bulanan',
  auth.wajibAdmin,
  asinkron(async (req, res) => {
    const bulan = validBulan(req.query.bulan) ? req.query.bulan : bulanBerjalan();
    const data = rekapBulanan({ bulan, nama: req.query.nama });
    res.json({ ok: true, bulan, data });
  })
);

app.get(
  '/api/admin/export',
  auth.wajibAdmin,
  asinkron(async (req, res) => {
    const { nama, dari, sampai, tipe } = req.query;
    const filter = { nama, dari, sampai, tipe };
    const bulan = validBulan(req.query.bulan) ? req.query.bulan : null;

    const detail = ambilSemuaBaris(filter);
    const harian = rekapHarian(filter);
    const bulanan = rekapBulanan({ bulan, nama });

    const excel = await buatLaporanExcel({
      detail,
      harian,
      bulanan,
      keterangan: keteranganFilter({ nama, dari, sampai, bulan })
    });

    const stempel = bagianWaktu().tanggal;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Laporan-Absensi-JNT-Cargo-${stempel}.xlsx"`);
    res.setHeader('Content-Length', excel.length);
    res.end(excel);
  })
);

// ---------- 404 & penanganan error ----------
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ ok: false, pesan: 'Endpoint tidak ditemukan.' });
    return;
  }
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.use((err, req, res, next) => {
  const status = err && err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error('[server]', err);
  const pesan = status >= 500 ? 'Terjadi kesalahan pada server. Silakan coba lagi.' : err.message;
  if (req.path.startsWith('/api/')) {
    res.status(status).json({ ok: false, pesan });
    return;
  }
  res.status(status).type('text/plain; charset=utf-8').send(pesan);
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ABSENSI JNT CARGO berjalan di http://0.0.0.0:${PORT}`);
  });
}

module.exports = app;
