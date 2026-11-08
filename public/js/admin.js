'use strict';

(function () {
  const $ = (id) => document.getElementById(id);

  const LIMIT = 100;
  const state = {
    admin: null,
    tab: 'absensi',
    halaman: 0,
    total: 0
  };

  // ---------- Util ----------
  function pesan(el, jenis, teks) {
    if (!el) return;
    el.className = 'pesan ' + (jenis || 'info');
    el.textContent = teks;
    el.hidden = false;
  }

  function fmtTanggalIndo(iso) {
    if (!iso) return '—';
    const [t, b, th] = iso.split('-').map(Number);
    if (!t || !b || !th) return iso;
    const nama = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${t} ${nama[b - 1]} ${th}`;
  }

  function fmtBulanIndo(bulan) {
    if (!bulan) return '—';
    const [th, bl] = bulan.split('-').map(Number);
    const nama = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${nama[bl - 1] || ''} ${th}`;
  }

  function hariIniIso() {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' });
    return f.format(new Date());
  }

  function bulanIni() {
    return hariIniIso().slice(0, 7);
  }

  function awalBulan() {
    return bulanIni() + '-01';
  }

  function qs(obj) {
    const p = new URLSearchParams();
    Object.entries(obj).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== '') p.set(k, String(v).trim());
    });
    return p.toString();
  }

  async function api(url, opsi) {
    const res = await fetch(url, Object.assign({ credentials: 'same-origin' }, opsi || {}));
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (res.status === 401) {
      state.admin = null;
      tampilkanLogin();
      throw new Error('Sesi admin berakhir. Silakan login kembali.');
    }
    if (!res.ok || !data || !data.ok) {
      throw new Error((data && data.pesan) || 'Permintaan gagal diproses.');
    }
    return data;
  }

  function kosongkanTbody(tabel) {
    const tbody = tabel.querySelector('tbody');
    if (tbody) tbody.textContent = '';
    return tbody;
  }

  function barisKosong(tbody, kolom, teks) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = kolom;
    td.className = 'kosong';
    td.textContent = teks;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  // ---------- Tampilan login / dashboard ----------
  function tampilkanLogin() {
    $('panelLogin').hidden = false;
    $('panelDashboard').hidden = true;
    $('adminChip').hidden = true;
    $('btnKeluar').hidden = true;
    const pass = $('adminPassword');
    if (pass) pass.value = '';
  }

  function tampilkanDashboard(admin) {
    state.admin = admin;
    $('panelLogin').hidden = true;
    $('panelDashboard').hidden = false;
    $('adminChip').hidden = false;
    $('btnKeluar').hidden = false;
    $('adminChip').textContent = admin.nama ? `${admin.nama} (${admin.admin_id})` : admin.admin_id;
    muatRingkasan();
    muatTabAktif();
  }

  // ---------- Ringkasan ----------
  async function muatRingkasan() {
    try {
      const hasil = await api('/api/admin/ringkasan');
      const d = hasil.data;
      $('statHadir').textContent = String(d.hariIni.karyawan);
      $('statMasuk').textContent = String(d.hariIni.masuk);
      $('statPulang').textContent = String(d.hariIni.pulang);
      $('statBulan').textContent = String(d.bulanIni.karyawan);
      $('statTanggal').textContent = fmtTanggalIndo(d.tanggal);
      $('statBulanLabel').textContent = fmtBulanIndo(d.bulan);
    } catch (err) {
      if (state.admin) pesan($('pesanLogin'), 'galat', err.message);
    }
  }

  // ---------- Tab ----------
  function aktifkanTab(nama) {
    state.tab = nama;
    document.querySelectorAll('.tab-tombol').forEach((btn) => {
      const aktif = btn.dataset.tab === nama;
      btn.classList.toggle('aktif', aktif);
      btn.setAttribute('aria-selected', aktif ? 'true' : 'false');
    });
    ['absensi', 'harian', 'bulanan', 'pengaturan'].forEach((t) => {
      const el = $('tab-' + t);
      if (el) el.hidden = t !== nama;
    });
    muatTabAktif();
  }

  function muatTabAktif() {
    if (!state.admin) return;
    if (state.tab === 'absensi') muatAbsensi();
    else if (state.tab === 'harian') muatHarian();
    else if (state.tab === 'bulanan') muatBulanan();
  }

  // ---------- Data absensi ----------
  function filterAbsensi() {
    return {
      nama: $('filterNama').value,
      dari: $('filterDari').value,
      sampai: $('filterSampai').value,
      tipe: $('filterTipe').value
    };
  }

  async function muatAbsensi() {
    const info = $('infoAbsensi');
    const tabel = $('tabelAbsensi');
    info.textContent = 'Memuat data…';

    try {
      const data = await api('/api/admin/absensi?' + qs(Object.assign(filterAbsensi(), { limit: LIMIT, offset: state.halaman * LIMIT })));
      state.total = data.total;

      const tbody = kosongkanTbody(tabel);
      if (!data.baris.length) {
        barisKosong(tbody, 7, 'Belum ada data absensi untuk filter ini.');
      } else {
        data.baris.forEach((r, i) => {
          const tr = document.createElement('tr');

          const tdNo = document.createElement('td');
          tdNo.textContent = String(state.halaman * LIMIT + i + 1);

          const tdNama = document.createElement('td');
          tdNama.textContent = r.nama;
          tdNama.style.fontWeight = '600';

          const tdTanggal = document.createElement('td');
          tdTanggal.textContent = fmtTanggalIndo(r.tanggal);
          const hari = document.createElement('div');
          hari.className = 'bantuan';
          hari.textContent = r.hari;
          tdTanggal.appendChild(hari);

          const tdJam = document.createElement('td');
          tdJam.textContent = r.jam + ' WIB';
          tdJam.style.fontVariantNumeric = 'tabular-nums';

          const tdTipe = document.createElement('td');
          const pil = document.createElement('span');
          pil.className = 'pil ' + (r.tipe === 'MASUK' ? 'pil-masuk' : 'pil-pulang');
          pil.textContent = r.tipe;
          tdTipe.appendChild(pil);

          const tdLokasi = document.createElement('td');
          const peta = document.createElement('a');
          peta.className = 'mini-peta';
          peta.href = r.peta;
          peta.target = '_blank';
          peta.rel = 'noopener noreferrer';
          peta.textContent = r.latitude.toFixed(5) + ', ' + r.longitude.toFixed(5);
          const akurasi = document.createElement('div');
          akurasi.className = 'bantuan';
          akurasi.textContent = '± ' + Math.round(r.akurasi) + ' m';
          tdLokasi.appendChild(peta);
          tdLokasi.appendChild(akurasi);

          const tdFoto = document.createElement('td');
          const img = document.createElement('img');
          img.className = 'selfie-mini';
          img.loading = 'lazy';
          img.alt = 'Selfie ' + r.nama;
          img.src = '/api/admin/absensi/' + r.id + '/foto';
          img.addEventListener('click', () => bukaModal(img.src, r.nama + ' — ' + r.tipe + ' ' + r.jam + ' WIB'));
          img.addEventListener('error', () => {
            img.replaceWith(document.createTextNode('—'));
          });
          tdFoto.appendChild(img);

          tr.append(tdNo, tdNama, tdTanggal, tdJam, tdTipe, tdLokasi, tdFoto);
          tbody.appendChild(tr);
        });
      }

      const halamanTotal = Math.max(Math.ceil(state.total / LIMIT), 1);
      info.textContent = `${state.total} catatan absensi ditemukan.`;
      $('paginasi').hidden = state.total <= LIMIT;
      $('infoHalaman').textContent = `Halaman ${state.halaman + 1} dari ${halamanTotal}`;
      $('btnSebelum').disabled = state.halaman === 0;
      $('btnSesudah').disabled = state.halaman >= halamanTotal - 1;
    } catch (err) {
      info.textContent = err.message;
    }
  }

  // ---------- Rekap harian ----------
  function filterHarian() {
    return { nama: $('harianNama').value, dari: $('harianDari').value, sampai: $('harianSampai').value };
  }

  async function muatHarian() {
    const info = $('infoHarian');
    const tabel = $('tabelHarian');
    info.textContent = 'Memuat data…';

    try {
      const hasil = await api('/api/admin/rekap/harian?' + qs(filterHarian()));
      const data = hasil.data;
      const tbody = kosongkanTbody(tabel);

      if (!data.length) {
        barisKosong(tbody, 6, 'Belum ada data rekap pada rentang tanggal ini.');
      } else {
        let totalHadir = 0;
        data.forEach((grup) => {
          totalHadir += grup.hadir;
          grup.karyawan.forEach((orang, idx) => {
            const tr = document.createElement('tr');

            if (idx === 0) {
              const tdTanggal = document.createElement('td');
              tdTanggal.rowSpan = grup.karyawan.length;
              tdTanggal.textContent = fmtTanggalIndo(grup.tanggal);
              tdTanggal.style.fontWeight = '600';
              tdTanggal.style.verticalAlign = 'top';

              const tdHari = document.createElement('td');
              tdHari.rowSpan = grup.karyawan.length;
              tdHari.textContent = grup.hari;
              tdHari.style.verticalAlign = 'top';

              tr.append(tdTanggal, tdHari);
            }

            const tdNama = document.createElement('td');
            tdNama.textContent = orang.nama;

            const tdMasuk = document.createElement('td');
            tdMasuk.textContent = orang.masuk ? orang.masuk + ' WIB' : '—';
            if (orang.masuk) tdMasuk.style.color = '#0b3d91';

            const tdPulang = document.createElement('td');
            tdPulang.textContent = orang.pulang ? orang.pulang + ' WIB' : '—';
            if (orang.pulang) tdPulang.style.color = '#ea580c';

            const tdLokasi = document.createElement('td');
            if (orang.peta) {
              const a = document.createElement('a');
              a.className = 'mini-peta';
              a.href = orang.peta;
              a.target = '_blank';
              a.rel = 'noopener noreferrer';
              a.textContent = 'Lihat peta';
              tdLokasi.appendChild(a);
            } else {
              tdLokasi.textContent = '—';
            }

            tr.append(tdNama, tdMasuk, tdPulang, tdLokasi);
            tbody.appendChild(tr);
          });
        });

        info.textContent = `${data.length} hari absensi, ${totalHadir} kehadiran karyawan.`;
      }
    } catch (err) {
      info.textContent = err.message;
    }
  }

  // ---------- Rekap bulanan ----------
  function filterBulanan() {
    return { bulan: $('bulananBulan').value || bulanIni(), nama: $('bulananNama').value };
  }

  async function muatBulanan() {
    const info = $('infoBulanan');
    const tabel = $('tabelBulanan');
    info.textContent = 'Memuat data…';

    try {
      const hasil = await api('/api/admin/rekap/bulanan?' + qs(filterBulanan()));
      const data = hasil.data;
      const tbody = kosongkanTbody(tabel);

      if (!data.length) {
        barisKosong(tbody, 6, 'Belum ada data pada bulan ini.');
      } else {
        data.forEach((o, i) => {
          const tr = document.createElement('tr');
          const tdNo = document.createElement('td');
          tdNo.textContent = String(i + 1);
          const tdNama = document.createElement('td');
          tdNama.textContent = o.nama;
          tdNama.style.fontWeight = '600';
          const tdHadir = document.createElement('td');
          tdHadir.textContent = String(o.hariHadir);
          const tdMasuk = document.createElement('td');
          tdMasuk.textContent = String(o.totalMasuk);
          const tdPulang = document.createElement('td');
          tdPulang.textContent = String(o.totalPulang);
          const tdTanpa = document.createElement('td');
          tdTanpa.textContent = String(o.tanpaPulang);
          if (o.tanpaPulang > 0) tdTanpa.style.color = '#b91c1c';
          tr.append(tdNo, tdNama, tdHadir, tdMasuk, tdPulang, tdTanpa);
          tbody.appendChild(tr);
        });
        info.textContent = `${data.length} karyawan pada ${fmtBulanIndo(hasil.bulan)}.`;
      }
    } catch (err) {
      info.textContent = err.message;
    }
  }

  // ---------- Ekspor Excel ----------
  function unduhExcel(tambahan) {
    const dasar = Object.assign(filterAbsensi(), tambahan || {});
    const url = '/api/admin/export?' + qs(dasar);
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ---------- Modal foto ----------
  function bukaModal(src, judul) {
    $('modalGambar').src = src;
    $('modalJudul').textContent = judul || 'Foto Selfie';
    $('modalFoto').hidden = false;
  }

  function tutupModal() {
    $('modalFoto').hidden = true;
    $('modalGambar').removeAttribute('src');
  }

  // ---------- Inisialisasi ----------
  function inisialisasi() {
    const tahun = $('tahun');
    if (tahun) tahun.textContent = String(new Date().getFullYear());

    // Nilai awal filter.
    $('filterDari').value = awalBulan();
    $('filterSampai').value = hariIniIso();
    $('harianDari').value = awalBulan();
    $('harianSampai').value = hariIniIso();
    $('bulananBulan').value = bulanIni();

    // Login
    $('formLogin').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('btnLogin');
      btn.disabled = true;
      $('pesanLogin').hidden = true;
      try {
        const data = await api('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminId: $('adminId').value.trim(), password: $('adminPassword').value })
        });
        tampilkanDashboard(data.admin);
      } catch (err) {
        pesan($('pesanLogin'), 'galat', err.message);
      } finally {
        btn.disabled = false;
      }
    });

    $('btnKeluar').addEventListener('click', async () => {
      try {
        await api('/api/admin/logout', { method: 'POST' });
      } catch { /* sesi mungkin sudah berakhir */ }
      state.admin = null;
      tampilkanLogin();
    });

    // Tab
    document.querySelectorAll('.tab-tombol').forEach((btn) => {
      btn.addEventListener('click', () => aktifkanTab(btn.dataset.tab));
    });

    // Filter data absensi
    $('formFilter').addEventListener('submit', (e) => {
      e.preventDefault();
      state.halaman = 0;
      muatAbsensi();
    });
    $('btnReset').addEventListener('click', () => {
      $('filterNama').value = '';
      $('filterDari').value = awalBulan();
      $('filterSampai').value = hariIniIso();
      $('filterTipe').value = '';
      state.halaman = 0;
      muatAbsensi();
    });
    $('btnExport').addEventListener('click', () => unduhExcel({}));
    $('btnSebelum').addEventListener('click', () => {
      if (state.halaman > 0) {
        state.halaman -= 1;
        muatAbsensi();
      }
    });
    $('btnSesudah').addEventListener('click', () => {
      if ((state.halaman + 1) * LIMIT < state.total) {
        state.halaman += 1;
        muatAbsensi();
      }
    });

    // Rekap harian
    $('formHarian').addEventListener('submit', (e) => {
      e.preventDefault();
      muatHarian();
    });
    $('btnHarianReset').addEventListener('click', () => {
      $('harianNama').value = '';
      $('harianDari').value = awalBulan();
      $('harianSampai').value = hariIniIso();
      muatHarian();
    });
    $('btnExportHarian').addEventListener('click', () => unduhExcel(filterHarian()));

    // Rekap bulanan
    $('formBulanan').addEventListener('submit', (e) => {
      e.preventDefault();
      muatBulanan();
    });
    $('btnBulananReset').addEventListener('click', () => {
      $('bulananNama').value = '';
      $('bulananBulan').value = bulanIni();
      muatBulanan();
    });
    $('btnExportBulanan').addEventListener('click', () => unduhExcel(filterBulanan()));

    // Ganti password
    $('formPassword').addEventListener('submit', async (e) => {
      e.preventDefault();
      const lama = $('passLama').value;
      const baru = $('passBaru').value;
      const ulang = $('passUlang').value;

      if (baru.length < 8) {
        pesan($('pesanPassword'), 'galat', 'Password baru minimal 8 karakter.');
        return;
      }
      if (baru !== ulang) {
        pesan($('pesanPassword'), 'galat', 'Ulangi password baru dengan benar.');
        return;
      }

      try {
        const data = await api('/api/admin/password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lama, baru })
        });
        pesan($('pesanPassword'), 'sukses', data.pesan);
        $('formPassword').reset();
      } catch (err) {
        pesan($('pesanPassword'), 'galat', err.message);
      }
    });

    // Modal
    $('btnTutupModal').addEventListener('click', tutupModal);
    $('modalFoto').addEventListener('click', (e) => {
      if (e.target === $('modalFoto')) tutupModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('modalFoto').hidden) tutupModal();
    });

    // Pulihkan sesi bila cookie admin masih valid.
    fetch('/api/admin/saya', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.ok && data.admin) tampilkanDashboard(data.admin);
        else tampilkanLogin();
      })
      .catch(() => tampilkanLogin());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inisialisasi);
  } else {
    inisialisasi();
  }
})();
