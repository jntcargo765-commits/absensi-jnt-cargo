'use strict';

const ExcelJS = require('exceljs');
const { labelTanggal, labelBulan, namaHari } = require('./time');

const BIRU = 'FF0B3D91';
const BIRU_MUDA = 'FFE8EEF9';
const ORANYE = 'FFF97316';
const PUTIH = 'FFFFFFFF';

function judulSheet(sheet, judul, subjudul, jumlahKolom) {
  sheet.mergeCells(1, 1, 1, jumlahKolom);
  const selJudul = sheet.getCell(1, 1);
  selJudul.value = judul;
  selJudul.font = { bold: true, size: 14, color: { argb: PUTIH } };
  selJudul.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BIRU } };
  selJudul.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 26;

  sheet.mergeCells(2, 1, 2, jumlahKolom);
  const selSub = sheet.getCell(2, 1);
  selSub.value = subjudul;
  selSub.font = { size: 10, color: { argb: 'FF444444' } };
  selSub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(2).height = 18;
}

function tulisHeader(sheet, baris, kolom) {
  const row = sheet.getRow(baris);
  kolom.forEach((teks, i) => {
    const sel = row.getCell(i + 1);
    sel.value = teks;
    sel.font = { bold: true, color: { argb: PUTIH }, size: 11 };
    sel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANYE } };
    sel.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    sel.border = {
      top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
    };
  });
  row.height = 24;
}

function tulisBaris(sheet, baris, nilai, rata) {
  const row = sheet.getRow(baris);
  nilai.forEach((v, i) => {
    const sel = row.getCell(i + 1);
    sel.value = v === null || v === undefined ? '' : v;
    sel.alignment = { vertical: 'middle', horizontal: rata[i] || 'left', wrapText: false };
    sel.border = {
      top: { style: 'thin', color: { argb: 'FFEDEDED' } },
      left: { style: 'thin', color: { argb: 'FFEDEDED' } },
      bottom: { style: 'thin', color: { argb: 'FFEDEDED' } },
      right: { style: 'thin', color: { argb: 'FFEDEDED' } }
    };
    if (baris % 2 === 0) {
      sel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BIRU_MUDA } };
    }
  });
}

function aturLebar(sheet, lebar) {
  lebar.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });
}

/**
 * Membuat file Excel berisi detail absensi, rekap harian, dan rekap bulanan.
 * @returns {Promise<Buffer>}
 */
async function buatLaporanExcel({ detail, harian, bulanan, keterangan }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ABSENSI JNT CARGO';
  wb.created = new Date();

  // Sheet 1: detail absensi
  const s1 = wb.addWorksheet('Detail Absensi', { views: [{ state: 'frozen', ySplit: 4 }] });
  const kolom1 = ['No', 'Nama Karyawan', 'Tanggal', 'Hari', 'Tipe', 'Jam (WIB)', 'Latitude', 'Longitude', 'Akurasi GPS (m)', 'Tautan Peta'];
  judulSheet(s1, 'LAPORAN ABSENSI JNT CARGO', keterangan, kolom1.length);
  tulisHeader(s1, 4, kolom1);
  detail.forEach((r, i) => {
    tulisBaris(
      s1,
      5 + i,
      [
        i + 1,
        r.nama,
        r.tanggal,
        namaHari(r.tanggal),
        r.tipe,
        r.jam,
        r.latitude,
        r.longitude,
        r.akurasi === null || r.akurasi === undefined ? '' : r.akurasi,
        `https://www.google.com/maps?q=${r.latitude},${r.longitude}`
      ],
      ['center', 'left', 'center', 'left', 'center', 'center', 'right', 'right', 'right', 'left']
    );
  });
  if (!detail.length) {
    s1.mergeCells(5, 1, 5, kolom1.length);
    s1.getCell(5, 1).value = 'Tidak ada data absensi pada filter ini.';
    s1.getCell(5, 1).alignment = { horizontal: 'center' };
  }
  aturLebar(s1, [6, 26, 13, 11, 9, 11, 13, 13, 14, 46]);

  // Sheet 2: rekap harian
  const s2 = wb.addWorksheet('Rekap Harian', { views: [{ state: 'frozen', ySplit: 4 }] });
  const kolom2 = ['Tanggal', 'Hari', 'Nama Karyawan', 'Jam Masuk', 'Jam Pulang', 'Latitude Masuk', 'Longitude Masuk'];
  judulSheet(s2, 'REKAP HARIAN', keterangan, kolom2.length);
  tulisHeader(s2, 4, kolom2);
  let baris2 = 5;
  for (const hari of harian) {
    for (const orang of hari.karyawan) {
      tulisBaris(
        s2,
        baris2,
        [
          hari.tanggal,
          hari.hari,
          orang.nama,
          orang.masuk || '-',
          orang.pulang || '-',
          orang.lokasi ? orang.lokasi.latitude : '',
          orang.lokasi ? orang.lokasi.longitude : ''
        ],
        ['center', 'left', 'left', 'center', 'center', 'right', 'right']
      );
      baris2 += 1;
    }
  }
  if (baris2 === 5) {
    s2.mergeCells(5, 1, 5, kolom2.length);
    s2.getCell(5, 1).value = 'Tidak ada data absensi pada filter ini.';
    s2.getCell(5, 1).alignment = { horizontal: 'center' };
  }
  aturLebar(s2, [13, 11, 26, 12, 12, 16, 16]);

  // Sheet 3: rekap bulanan
  const s3 = wb.addWorksheet('Rekap Bulanan', { views: [{ state: 'frozen', ySplit: 4 }] });
  const kolom3 = ['No', 'Nama Karyawan', 'Hari Hadir', 'Total Absen Masuk', 'Total Absen Pulang', 'Belum Absen Pulang'];
  judulSheet(s3, 'REKAP BULANAN', keterangan, kolom3.length);
  tulisHeader(s3, 4, kolom3);
  bulanan.forEach((o, i) => {
    tulisBaris(
      s3,
      5 + i,
      [i + 1, o.nama, o.hariHadir, o.totalMasuk, o.totalPulang, o.tanpaPulang],
      ['center', 'left', 'center', 'center', 'center', 'center']
    );
  });
  if (!bulanan.length) {
    s3.mergeCells(5, 1, 5, kolom3.length);
    s3.getCell(5, 1).value = 'Tidak ada data absensi pada filter ini.';
    s3.getCell(5, 1).alignment = { horizontal: 'center' };
  }
  aturLebar(s3, [6, 28, 12, 18, 19, 19]);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function keteranganFilter({ nama, dari, sampai, bulan }) {
  const bagian = [];
  if (nama) bagian.push(`Nama: ${nama}`);
  if (dari) bagian.push(`Dari: ${labelTanggal(dari)}`);
  if (sampai) bagian.push(`Sampai: ${labelTanggal(sampai)}`);
  if (!dari && !sampai && bulan) bagian.push(`Periode: ${labelBulan(bulan)}`);
  bagian.push(`Dicetak: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`);
  return bagian.join('  |  ');
}

module.exports = { buatLaporanExcel, keteranganFilter };
