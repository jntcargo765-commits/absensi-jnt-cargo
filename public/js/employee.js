'use strict';

(function () {
  const $ = (id) => document.getElementById(id);

  const state = {
    stream: null,
    foto: null,
    lokasi: null,
    sibuk: false,
    kameraAktif: false
  };

  const fmtJam = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const fmtTanggal = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const fmtTanggalPendek = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  // ---------- Jam WIB ----------
  function perbaruiJam() {
    const sekarang = new Date();
    const jam = fmtJam.format(sekarang).replace(/\./g, ':');
    const tanggal = fmtTanggal.format(sekarang);
    const elJam = $('jamWib');
    const elTanggal = $('tanggalWib');
    if (elJam) elJam.textContent = jam + ' WIB';
    if (elTanggal) elTanggal.textContent = tanggal;
  }

  // ---------- Pesan ----------
  function pesan(jenis, teks) {
    const el = $('pesan');
    if (!el) return;
    el.className = 'pesan ' + (jenis || 'info');
    el.textContent = teks;
    el.hidden = false;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function sembunyikanPesan() {
    const el = $('pesan');
    if (el) el.hidden = true;
  }

  function setBadge(id, teks, kelas) {
    const el = $(id);
    if (!el) return;
    el.textContent = teks;
    el.className = 'badge-status' + (kelas ? ' ' + kelas : '');
  }

  function setSibuk(sibuk, labelTombol) {
    state.sibuk = sibuk;
    ['btnMasuk', 'btnPulang', 'btnAmbil', 'btnKamera', 'btnLokasi'].forEach((id) => {
      const el = $(id);
      if (el) el.disabled = sibuk;
    });
    if (!sibuk) {
      const ambil = $('btnAmbil');
      if (ambil) ambil.disabled = !state.kameraAktif || !!state.foto;
    }
    if (sibuk && labelTombol) {
      const el = $('btnMasuk');
      if (el) el.dataset.labelAsli = el.innerHTML;
    }
  }

  // ---------- Kamera ----------
  function tampilkanFallback(teksAlasan) {
    const input = $('inputFallback');
    if (input) input.classList.remove('tersembunyi');
    const info = $('statusKamera');
    if (info) {
      info.textContent =
        teksAlasan +
        ' Gunakan tombol "Ambil dari Kamera HP" di bawah untuk mengambil selfie lewat aplikasi kamera perangkat.';
    }
  }

  async function aktifkanKamera() {
    if (state.kameraAktif) return true;

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setBadge('badgeKamera', 'Tidak didukung', 'galat');
      tampilkanFallback('Browser ini belum mendukung kamera langsung.');
      return false;
    }

    setBadge('badgeKamera', 'Meminta izin', '');
    const info = $('statusKamera');
    if (info) info.textContent = 'Menunggu izin kamera dari browser…';

    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 1280 }
        },
        audio: false
      });

      const video = $('video');
      video.srcObject = state.stream;
      video.classList.add('aktif');
      await video.play().catch(() => {});

      const kosong = $('kameraKosong');
      if (kosong) kosong.hidden = true;

      state.kameraAktif = true;
      setBadge('badgeKamera', 'Aktif', 'aktif');
      const btnAmbil = $('btnAmbil');
      if (btnAmbil) btnAmbil.disabled = false;
      const btnKamera = $('btnKamera');
      if (btnKamera) btnKamera.textContent = 'Kamera Aktif';
      if (info) info.textContent = 'Posisikan wajah di tengah, lalu tekan “Ambil Selfie”.';
      return true;
    } catch (err) {
      const nama = err && err.name;
      let alasan = 'Kamera tidak dapat diaktifkan.';
      if (nama === 'NotAllowedError' || nama === 'SecurityError') {
        alasan = 'Izin kamera ditolak. Aktifkan izin kamera pada pengaturan browser.';
      } else if (nama === 'NotFoundError' || nama === 'OverconstrainedError') {
        alasan = 'Kamera tidak ditemukan pada perangkat ini.';
      } else if (nama === 'NotReadableError') {
        alasan = 'Kamera sedang dipakai aplikasi lain.';
      }
      setBadge('badgeKamera', 'Tidak aktif', 'galat');
      tampilkanFallback(alasan);
      return false;
    }
  }

  function hentikanKamera() {
    if (state.stream) {
      state.stream.getTracks().forEach((t) => t.stop());
      state.stream = null;
    }
    state.kameraAktif = false;
  }

  function gambarKeKanvas(sumber, sumberW, sumberH) {
    const ukuran = 720;
    const kanvas = $('kanvas');
    kanvas.width = ukuran;
    kanvas.height = ukuran;
    const ctx = kanvas.getContext('2d');
    const sisi = Math.min(sumberW, sumberH);
    const sx = (sumberW - sisi) / 2;
    const sy = (sumberH - sisi) / 2;
    ctx.save();
    ctx.translate(ukuran, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(sumber, sx, sy, sisi, sisi, 0, 0, ukuran, ukuran);
    ctx.restore();
    return kanvas.toDataURL('image/jpeg', 0.82);
  }

  function pakaiFoto(dataUrl) {
    state.foto = dataUrl;
    const pratinjau = $('pratinjau');
    pratinjau.src = dataUrl;
    pratinjau.classList.add('aktif');
    const video = $('video');
    video.classList.remove('aktif');
    const kosong = $('kameraKosong');
    if (kosong) kosong.hidden = true;
    const btnAmbil = $('btnAmbil');
    if (btnAmbil) btnAmbil.hidden = true;
    const btnUlang = $('btnUlang');
    if (btnUlang) btnUlang.hidden = false;
    setBadge('badgeKamera', 'Selfie siap', 'aktif');
    const info = $('statusKamera');
    if (info) info.textContent = 'Selfie berhasil diambil. Tekan “Ulangi” jika hasilnya kurang jelas.';
    sembunyikanPesan();
  }

  function ambilSelfie() {
    const video = $('video');
    if (!state.stream || !video.videoWidth) {
      pesan('peringatan', 'Kamera belum siap. Tekan “Aktifkan Kamera” lalu coba lagi.');
      return;
    }
    const dataUrl = gambarKeKanvas(video, video.videoWidth, video.videoHeight);
    pakaiFoto(dataUrl);
  }

  function ulangiFoto() {
    state.foto = null;
    const pratinjau = $('pratinjau');
    pratinjau.classList.remove('aktif');
    pratinjau.removeAttribute('src');
    const btnAmbil = $('btnAmbil');
    btnAmbil.hidden = false;
    btnAmbil.disabled = !state.kameraAktif;
    const btnUlang = $('btnUlang');
    btnUlang.hidden = true;
    if (state.kameraAktif) {
      $('video').classList.add('aktif');
      setBadge('badgeKamera', 'Aktif', 'aktif');
      const info = $('statusKamera');
      if (info) info.textContent = 'Posisikan wajah di tengah, lalu tekan “Ambil Selfie”.';
    } else {
      setBadge('badgeKamera', 'Belum aktif', '');
    }
  }

  function berkasKeFoto(file) {
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      pesan('galat', 'Berkas yang dipilih harus berupa foto.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      pesan('galat', 'Ukuran foto terlalu besar (maksimal 8 MB).');
      return;
    }
    const pembaca = new FileReader();
    pembaca.onload = () => {
      const gambar = new Image();
      gambar.onload = () => {
        const sisi = Math.min(gambar.width, gambar.height);
        const kanvas = $('kanvas');
        const ukuran = 720;
        kanvas.width = ukuran;
        kanvas.height = ukuran;
        const ctx = kanvas.getContext('2d');
        ctx.drawImage(gambar, (gambar.width - sisi) / 2, (gambar.height - sisi) / 2, sisi, sisi, 0, 0, ukuran, ukuran);
        pakaiFoto(kanvas.toDataURL('image/jpeg', 0.82));
        setBadge('badgeKamera', 'Foto siap', 'aktif');
      };
      gambar.onerror = () => pesan('galat', 'Foto tidak dapat dibaca. Silakan ambil ulang.');
      gambar.src = pembaca.result;
    };
    pembaca.onerror = () => pesan('galat', 'Gagal membaca berkas foto.');
    pembaca.readAsDataURL(file);
  }

  // ---------- GPS ----------
  function ambilLokasi() {
    return new Promise((resolve) => {
      const status = $('statusLokasi');

      if (!navigator.geolocation) {
        setBadge('badgeGps', 'Tidak didukung', 'galat');
        if (status) status.textContent = 'Perangkat tidak mendukung GPS.';
        resolve(false);
        return;
      }

      setBadge('badgeGps', 'Memproses', '');
      if (status) status.textContent = 'Mengambil koordinat GPS…';

      navigator.geolocation.getCurrentPosition(
        (posisi) => {
          const { latitude, longitude, accuracy } = posisi.coords;
          state.lokasi = {
            latitude,
            longitude,
            akurasi: accuracy,
            waktu: Date.now()
          };
          const koordinat = $('koordinat');
          if (koordinat) koordinat.textContent = latitude.toFixed(6) + ', ' + longitude.toFixed(6);
          const akurasi = $('akurasi');
          if (akurasi) akurasi.textContent = Math.round(accuracy) + ' meter';
          if (status) status.textContent = 'Lokasi berhasil diambil';
          setBadge('badgeGps', 'Aktif', 'aktif');

          const peta = $('petaLink');
          if (peta) {
            peta.href = 'https://www.google.com/maps?q=' + latitude + ',' + longitude;
            peta.hidden = false;
          }
          resolve(true);
        },
        (err) => {
          let teks = 'Gagal mengambil lokasi.';
          if (err && err.code === 1) teks = 'Izin lokasi ditolak. Aktifkan GPS dan izin lokasi pada browser.';
          else if (err && err.code === 2) teks = 'Lokasi tidak tersedia. Pastikan GPS aktif dan sinyal memadai.';
          else if (err && err.code === 3) teks = 'Pengambilan lokasi melebihi batas waktu. Coba lagi.';
          if (status) status.textContent = teks;
          setBadge('badgeGps', 'Gagal', 'galat');
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    });
  }

  // ---------- Status hari ini ----------
  let timerStatus = null;

  async function perbaruiStatus() {
    const el = $('statusHari');
    const nama = ($('nama').value || '').trim();
    if (!el) return;

    if (nama.length < 2) {
      el.textContent = '';
      const p = document.createElement('p');
      p.className = 'bantuan';
      p.textContent = 'Isi nama karyawan untuk melihat status absensi hari ini.';
      el.appendChild(p);
      return;
    }

    try {
      const res = await fetch('/api/absensi/hari-ini?nama=' + encodeURIComponent(nama));
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error('gagal');
      renderStatus(el, data.data, nama);
    } catch {
      el.textContent = '';
      const p = document.createElement('p');
      p.className = 'bantuan';
      p.textContent = 'Status absensi belum dapat dimuat.';
      el.appendChild(p);
    }
  }

  function renderStatus(wadah, data, nama) {
    wadah.textContent = '';

    const buatKotak = (judul, jam) => {
      const kotak = document.createElement('div');
      kotak.className = 'status-kotak ' + (jam ? 'sudah' : 'belum');
      const j = document.createElement('span');
      j.className = 'judul';
      j.textContent = judul;
      const i = document.createElement('span');
      i.className = 'isi';
      i.textContent = jam ? jam + ' WIB' : 'Belum absen';
      kotak.appendChild(j);
      kotak.appendChild(i);
      return kotak;
    };

    wadah.appendChild(buatKotak('Absen Masuk', data.masuk));
    wadah.appendChild(buatKotak('Absen Pulang', data.pulang));

    const info = document.createElement('p');
    info.className = 'bantuan';
    info.style.gridColumn = '1 / -1';
    const tanggalTeks = fmtTanggalPendek.format(new Date());
    info.textContent =
      data.masuk && data.pulang
        ? `${nama} sudah menyelesaikan absensi hari ini (${tanggalTeks}).`
        : `${nama} — status absensi ${tanggalTeks}.`;
    wadah.appendChild(info);
  }

  // ---------- Kirim absensi ----------
  async function kirimAbsensi(tipe) {
    if (state.sibuk) return;
    sembunyikanPesan();

    const nama = ($('nama').value || '').trim();
    if (nama.length < 2) {
      pesan('galat', 'Nama karyawan wajib diisi minimal 2 karakter.');
      $('nama').focus();
      return;
    }
    if (!state.foto) {
      pesan('galat', 'Selfie wajib diambil langsung dari kamera sebelum melakukan absensi.');
      return;
    }
    if (!state.lokasi || Date.now() - state.lokasi.waktu > 2 * 60 * 1000) {
      pesan('info', 'Mengambil koordinat GPS terbaru…');
      const ok = await ambilLokasi();
      if (!ok) {
        pesan('galat', 'GPS wajib aktif dan koordinat lokasi harus berhasil diambil sebelum absen.');
        return;
      }
    }

    setSibuk(true);
    pesan('info', `Menyimpan absen ${tipe}…`);

    try {
      const res = await fetch('/api/absensi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama,
          tipe,
          latitude: state.lokasi.latitude,
          longitude: state.lokasi.longitude,
          akurasi: state.lokasi.akurasi,
          foto: state.foto
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        throw new Error((data && data.pesan) || 'Absensi gagal disimpan. Silakan coba lagi.');
      }

      pesan(
        'sukses',
        `${data.pesan}\nNama: ${data.data.nama}\nTanggal: ${fmtTanggalPendek.format(new Date())}\nLokasi: ${data.data.latitude.toFixed(6)}, ${data.data.longitude.toFixed(6)}`
      );

      try {
        localStorage.setItem('absensi_nama', nama);
      } catch { /* penyimpanan lokal tidak wajib */ }

      state.foto = null;
      const pratinjau = $('pratinjau');
      pratinjau.classList.remove('aktif');
      pratinjau.removeAttribute('src');
      const btnAmbil = $('btnAmbil');
      btnAmbil.hidden = false;
      const btnUlang = $('btnUlang');
      btnUlang.hidden = true;
      if (state.kameraAktif) {
        $('video').classList.add('aktif');
        setBadge('badgeKamera', 'Aktif', 'aktif');
      }
      perbaruiStatus();
    } catch (err) {
      pesan('galat', err && err.message ? err.message : 'Absensi gagal disimpan.');
    } finally {
      setSibuk(false);
    }
  }

  // ---------- Inisialisasi ----------
  function inisialisasi() {
    perbaruiJam();
    setInterval(perbaruiJam, 1000);

    const tahun = $('tahun');
    if (tahun) tahun.textContent = String(new Date().getFullYear());

    try {
      const tersimpan = localStorage.getItem('absensi_nama');
      if (tersimpan && !$('nama').value) $('nama').value = tersimpan;
    } catch { /* abaikan */ }

    $('btnKamera').addEventListener('click', aktifkanKamera);
    $('btnAmbil').addEventListener('click', ambilSelfie);
    $('btnUlang').addEventListener('click', ulangiFoto);
    $('btnLokasi').addEventListener('click', ambilLokasi);
    $('btnMasuk').addEventListener('click', () => kirimAbsensi('MASUK'));
    $('btnPulang').addEventListener('click', () => kirimAbsensi('PULANG'));
    $('inputFallback').addEventListener('change', (e) => berkasKeFoto(e.target.files && e.target.files[0]));

    $('nama').addEventListener('input', () => {
      clearTimeout(timerStatus);
      timerStatus = setTimeout(perbaruiStatus, 450);
    });
    $('nama').addEventListener('blur', perbaruiStatus);

    // Coba aktifkan kamera setelah interaksi pertama pengguna (kebijakan browser seluler).
    $('nama').addEventListener(
      'change',
      () => {
        if (!state.kameraAktif && !state.foto) aktifkanKamera();
      },
      { once: true }
    );

    window.addEventListener('pagehide', hentikanKamera);

    if ($('nama').value.trim().length >= 2) perbaruiStatus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inisialisasi);
  } else {
    inisialisasi();
  }
})();
