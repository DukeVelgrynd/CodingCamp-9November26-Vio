// ============================================================
//   PENCATAT PENGELUARAN — LOGIKA UTAMA
//   Fitur:
//     1. Tambah / hapus transaksi
//     2. Highlight pengeluaran melebihi batas
//     3. Ringkasan bulanan dengan bar progres
//     4. Toggle mode gelap / terang
// ============================================================


// ============================================================
// BAGIAN 1 — KONSTANTA & STATUS GLOBAL
// ============================================================

// Kunci penyimpanan di localStorage
const KUNCI_TRANSAKSI = 'pencatat_transaksi';
const KUNCI_BATAS     = 'pencatat_batas';
const KUNCI_TEMA      = 'pencatat_tema';

// Kategori bawaan beserta warnanya
const KATEGORI_BAWAAN = {
  Makanan:      '#f97316',
  Transportasi: '#3b82f6',
  Hiburan:      '#a855f7',
};

// Data aplikasi (akan diisi dari localStorage saat inisialisasi)
let transaksi  = [];   // Array semua transaksi
let batasBatas = 0;    // Batas total pengeluaran keseluruhan (0 = nonaktif)


// ============================================================
// BAGIAN 2 — REFERENSI ELEMEN HTML
// ============================================================

// Form tambah pengeluaran
const form          = document.getElementById('transactionForm');
const inputNama     = document.getElementById('itemName');
const inputJumlah   = document.getElementById('itemAmount');
const inputKategori = document.getElementById('itemCategory');
const errorNama     = document.getElementById('nameError');
const errorJumlah   = document.getElementById('amountError');
const errorKategori = document.getElementById('categoryError');

// Header
const elTotalSaldo = document.getElementById('totalBalance');
const btnTema      = document.getElementById('btnTema');

// Daftar transaksi
const elDaftar = document.getElementById('transactionList');
const elKosong = document.getElementById('listEmpty');

// Grafik
const elGrafikKosong = document.getElementById('chartEmpty');

// Fitur batas pengeluaran
const inputBatas    = document.getElementById('inputBatas');
const btnSimpanBatas = document.getElementById('btnSimpanBatas');
const btnResetBatas  = document.getElementById('btnResetBatas');
const elBatasStatus  = document.getElementById('batasStatus');
const elBatasAlert   = document.getElementById('batasAlert');
const elBatasAlertTeks = document.getElementById('batasAlertTeks');

// Ringkasan bulanan
const selBulan        = document.getElementById('filterBulan');
const selTahun        = document.getElementById('filterTahun');
const elJmlTransaksi  = document.getElementById('statJumlahTransaksi');
const elTotalBulan    = document.getElementById('statTotalPengeluaran');
const elRataRata      = document.getElementById('statRataRata');
const elSummaryKat    = document.getElementById('summaryKategori');
const elSummaryKosong = document.getElementById('summaryEmpty');


// ============================================================
// BAGIAN 3 — INISIALISASI GRAFIK (Chart.js)
// ============================================================

const ctx = document.getElementById('spendingChart').getContext('2d');

// Buat grafik lingkaran kosong; datanya diisi lewat renderGrafik()
const grafikPengeluaran = new Chart(ctx, {
  type: 'pie',
  data: {
    labels: [],
    datasets: [{
      data: [],
      backgroundColor: [],
      borderWidth: 2,
      borderColor: '#ffffff',
      hoverOffset: 8,
    }],
  },
  options: {
    responsive: true,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          padding: 16,
          font: { size: 13, family: "'Segoe UI', system-ui, sans-serif" },
          usePointStyle: true,
          pointStyleWidth: 10,
        },
      },
      tooltip: {
        callbacks: {
          // Tampilkan Rupiah dan persentase di tooltip
          label: (konteks) => {
            const nilai = konteks.parsed;
            const total = konteks.dataset.data.reduce((a, b) => a + b, 0);
            const persen = ((nilai / total) * 100).toFixed(1);
            return ` ${formatRupiah(nilai)} (${persen}%)`;
          },
        },
      },
    },
  },
});


// ============================================================
// BAGIAN 4 — FUNGSI UTILITAS
// ============================================================

/** Buat ID unik untuk setiap transaksi */
function buatId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Ubah angka menjadi format Rupiah, contoh: "Rp 25.000" */
function formatRupiah(jumlah) {
  return 'Rp ' + Number(jumlah).toLocaleString('id-ID');
}

/**
 * Escape karakter HTML agar teks dari pengguna tidak bisa
 * menyuntikkan kode HTML berbahaya (mencegah XSS).
 */
function escapeHtml(teks) {
  return teks
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Ambil warna kategori berdasarkan namanya */
function warnaKategori(nama) {
  return KATEGORI_BAWAAN[nama] || '#94a3b8'; // abu-abu jika tidak ditemukan
}


// ============================================================
// BAGIAN 5 — PENYIMPANAN (localStorage)
// ============================================================

/** Muat semua data dari localStorage ke variabel global */
function muatDariStorage() {
  try {
    const rawTransaksi = localStorage.getItem(KUNCI_TRANSAKSI);
    transaksi = rawTransaksi ? JSON.parse(rawTransaksi) : [];
  } catch {
    transaksi = [];
  }

  // Muat batas; simpan sebagai angka (0 jika belum diset)
  const rawBatas = localStorage.getItem(KUNCI_BATAS);
  batasBatas = rawBatas ? parseFloat(rawBatas) : 0;
}

/** Simpan data transaksi ke localStorage */
function simpanTransaksi() {
  localStorage.setItem(KUNCI_TRANSAKSI, JSON.stringify(transaksi));
}

/** Simpan nilai batas ke localStorage */
function simpanBatas(nilai) {
  batasBatas = nilai;
  if (nilai > 0) {
    localStorage.setItem(KUNCI_BATAS, nilai);
  } else {
    localStorage.removeItem(KUNCI_BATAS);
  }
}


// ============================================================
// BAGIAN 6 — RENDER (menampilkan data ke halaman)
// ============================================================

/** Hitung ulang dan tampilkan total pengeluaran di header */
function renderSaldo() {
  const total = transaksi.reduce((jumlah, t) => jumlah + t.jumlah, 0);
  elTotalSaldo.textContent = formatRupiah(total);
}

/** Tampilkan semua transaksi ke daftar riwayat */
function renderDaftar() {
  // Hapus item lama (selain placeholder "kosong")
  elDaftar.querySelectorAll('.transaction-item').forEach(el => el.remove());

  if (transaksi.length === 0) {
    elKosong.style.display = '';
    return;
  }

  elKosong.style.display = 'none';

  // Tampilkan transaksi terbaru di atas (reverse)
  [...transaksi].reverse().forEach(t => {
    const li = document.createElement('li');
    li.className  = 'transaction-item';
    li.dataset.id = t.id;

    li.innerHTML = `
      <span class="category-dot"
            style="background: ${warnaKategori(t.kategori)}"></span>
      <div class="item-info">
        <div class="item-name">${escapeHtml(t.nama)}</div>
        <div class="item-category">${escapeHtml(t.kategori)}</div>
      </div>
      <span class="item-amount">${formatRupiah(t.jumlah)}</span>
      <button class="btn-delete" aria-label="Hapus ${escapeHtml(t.nama)}">Hapus</button>
    `;

    // Pasang event hapus
    li.querySelector('.btn-delete')
      .addEventListener('click', () => hapusTransaksi(t.id));

    elDaftar.appendChild(li);
  });
}

/** Perbarui grafik lingkaran berdasarkan data transaksi saat ini */
function renderGrafik() {
  // Hitung total per kategori
  const totalPerKategori = {};
  transaksi.forEach(t => {
    totalPerKategori[t.kategori] = (totalPerKategori[t.kategori] || 0) + t.jumlah;
  });

  const label = [];
  const data  = [];
  const warna = [];

  // Hanya tampilkan kategori yang ada transaksinya
  Object.entries(totalPerKategori).forEach(([kat, nilai]) => {
    if (nilai > 0) {
      label.push(kat);
      data.push(nilai);
      warna.push(warnaKategori(kat));
    }
  });

  const adaData = data.length > 0;

  grafikPengeluaran.data.labels                      = label;
  grafikPengeluaran.data.datasets[0].data            = data;
  grafikPengeluaran.data.datasets[0].backgroundColor = warna;
  grafikPengeluaran.update();

  // Sembunyikan canvas jika tidak ada data, tampilkan pesan
  document.getElementById('spendingChart').style.display = adaData ? 'block' : 'none';
  elGrafikKosong.classList.toggle('visible', !adaData);
}

/**
 * Perbarui UI fitur batas:
 * - Badge status (Aktif / Nonaktif)
 * - Nilai di input
 * - Banner peringatan jika TOTAL pengeluaran melampaui batas
 */
function renderBatas() {
  const aktif = batasBatas > 0;

  // Perbarui badge status
  elBatasStatus.textContent = aktif ? 'Aktif' : 'Nonaktif';
  elBatasStatus.classList.toggle('aktif', aktif);

  // Isi input dengan nilai batas tersimpan (atau kosongkan jika nonaktif)
  inputBatas.value = aktif ? batasBatas : '';

  if (!aktif) {
    elBatasAlert.classList.remove('visible');
    return;
  }

  // Hitung total pengeluaran keseluruhan
  const totalKeseluruhan = transaksi.reduce((s, t) => s + t.jumlah, 0);
  const selisih = totalKeseluruhan - batasBatas;

  if (totalKeseluruhan <= batasBatas) {
    // Total masih aman, sembunyikan banner
    elBatasAlert.classList.remove('visible');
  } else {
    // Total melampaui batas, tampilkan banner peringatan
    elBatasAlertTeks.textContent =
      `Total pengeluaran ${formatRupiah(totalKeseluruhan)} telah melebihi ` +
      `batas ${formatRupiah(batasBatas)} sebesar ${formatRupiah(selisih)}.`;
    elBatasAlert.classList.add('visible');
  }
}

/** Panggil semua fungsi render sekaligus */
function renderSemua() {
  renderSaldo();
  renderBatas();
  renderDaftar();
  renderGrafik();
  renderRingkasanBulanan();
}


// ============================================================
// BAGIAN 7 — FITUR 2: RINGKASAN BULANAN
// ============================================================

/** Isi dropdown bulan dan tahun secara otomatis */
function isiFilterBulanTahun() {
  const namaBulan = [
    'Januari','Februari','Maret','April','Mei','Juni',
    'Juli','Agustus','September','Oktober','November','Desember'
  ];

  // Isi bulan (Januari – Desember)
  selBulan.innerHTML = '';
  namaBulan.forEach((nama, i) => {
    const opt = document.createElement('option');
    opt.value       = i; // 0 = Januari
    opt.textContent = nama;
    selBulan.appendChild(opt);
  });

  // Isi tahun: dari tahun tertua transaksi hingga tahun sekarang
  const tahunSekarang = new Date().getFullYear();
  let tahunAwal = tahunSekarang;

  if (transaksi.length > 0) {
    // Cari tahun paling lama dari semua transaksi
    tahunAwal = Math.min(
      ...transaksi.map(t => new Date(t.tanggal).getFullYear())
    );
  }

  selTahun.innerHTML = '';
  for (let t = tahunSekarang; t >= tahunAwal; t--) {
    const opt = document.createElement('option');
    opt.value       = t;
    opt.textContent = t;
    selTahun.appendChild(opt);
  }

  // Set default ke bulan & tahun sekarang
  selBulan.value = new Date().getMonth();
  selTahun.value = tahunSekarang;
}

/** Hitung dan tampilkan ringkasan untuk bulan & tahun yang dipilih */
function renderRingkasanBulanan() {
  const bulanDipilih = parseInt(selBulan.value);
  const tahunDipilih = parseInt(selTahun.value);

  // Filter transaksi yang masuk di bulan & tahun terpilih
  const transaksiIni = transaksi.filter(t => {
    const tgl = new Date(t.tanggal);
    return tgl.getMonth() === bulanDipilih && tgl.getFullYear() === tahunDipilih;
  });

  const adaData = transaksiIni.length > 0;

  // Tampilkan / sembunyikan pesan kosong
  elSummaryKosong.classList.toggle('visible', !adaData);

  if (!adaData) {
    // Kosongkan semua statistik
    elJmlTransaksi.textContent = '0';
    elTotalBulan.textContent   = 'Rp 0';
    elRataRata.textContent     = 'Rp 0';
    elSummaryKat.innerHTML     = '';
    return;
  }

  // Hitung statistik utama
  const totalBulan = transaksiIni.reduce((s, t) => s + t.jumlah, 0);
  const rataRata   = totalBulan / transaksiIni.length;

  elJmlTransaksi.textContent = transaksiIni.length;
  elTotalBulan.textContent   = formatRupiah(totalBulan);
  elRataRata.textContent     = formatRupiah(Math.round(rataRata));

  // Hitung total per kategori untuk bar progres
  const perKategori = {};
  transaksiIni.forEach(t => {
    perKategori[t.kategori] = (perKategori[t.kategori] || 0) + t.jumlah;
  });

  elSummaryKat.innerHTML = '';

  // Urutkan dari terbesar ke terkecil
  Object.entries(perKategori)
    .sort((a, b) => b[1] - a[1])
    .forEach(([kat, nilai]) => {
      const persen = ((nilai / totalBulan) * 100).toFixed(1);
      const warna  = warnaKategori(kat);

      const baris = document.createElement('div');
      baris.className = 'summary-row';
      baris.innerHTML = `
        <span class="summary-row-dot" style="background:${warna}"></span>
        <span class="summary-row-nama">${escapeHtml(kat)}</span>
        <div class="summary-row-bar-wrapper">
          <div class="summary-row-bar"
               style="width:${persen}%; background:${warna}"></div>
        </div>
        <span class="summary-row-jumlah">${formatRupiah(nilai)}</span>
      `;

      elSummaryKat.appendChild(baris);
    });
}


// ============================================================
// BAGIAN 8 — OPERASI DATA (Tambah / Hapus)
// ============================================================

/** Tambah transaksi baru ke array dan simpan */
function tambahTransaksi(nama, jumlah, kategori) {
  const transaksiBarU = {
    id:      buatId(),
    nama:    nama.trim(),
    jumlah:  parseFloat(jumlah),
    kategori,
    tanggal: new Date().toISOString(), // simpan tanggal untuk ringkasan bulanan
  };

  transaksi.push(transaksiBarU);
  simpanTransaksi();
  renderSemua();
}

/** Hapus transaksi berdasarkan ID */
function hapusTransaksi(id) {
  transaksi = transaksi.filter(t => t.id !== id);
  simpanTransaksi();
  renderSemua();
}


// ============================================================
// BAGIAN 9 — VALIDASI FORM
// ============================================================

/**
 * Periksa apakah semua field form sudah terisi dengan benar.
 * Menampilkan pesan error jika ada field yang salah.
 * Mengembalikan true jika valid, false jika tidak.
 */
function validasiForm() {
  let valid = true;

  const nilaiNama     = inputNama.value.trim();
  const nilaiJumlah   = inputJumlah.value.trim();
  const nilaiKategori = inputKategori.value;

  // Validasi nama
  if (!nilaiNama) {
    inputNama.classList.add('input-error');
    errorNama.classList.add('visible');
    valid = false;
  } else {
    inputNama.classList.remove('input-error');
    errorNama.classList.remove('visible');
  }

  // Validasi jumlah (harus angka positif)
  if (!nilaiJumlah || isNaN(nilaiJumlah) || parseFloat(nilaiJumlah) <= 0) {
    inputJumlah.classList.add('input-error');
    errorJumlah.classList.add('visible');
    valid = false;
  } else {
    inputJumlah.classList.remove('input-error');
    errorJumlah.classList.remove('visible');
  }

  // Validasi kategori
  if (!nilaiKategori) {
    inputKategori.classList.add('input-error');
    errorKategori.classList.add('visible');
    valid = false;
  } else {
    inputKategori.classList.remove('input-error');
    errorKategori.classList.remove('visible');
  }

  return valid;
}

/** Hapus status error di satu field saat pengguna mulai mengetik */
function hapusError(inputEl, errorEl) {
  inputEl.classList.remove('input-error');
  errorEl.classList.remove('visible');
}


// ============================================================
// BAGIAN 10 — FITUR 3: TOGGLE MODE GELAP / TERANG
// ============================================================

/** Terapkan tema ke elemen <html> dan simpan preferensi */
function terapkanTema(tema) {
  document.documentElement.setAttribute('data-tema', tema);
  localStorage.setItem(KUNCI_TEMA, tema);

  // Ganti ikon tombol sesuai tema aktif
  btnTema.textContent = tema === 'gelap' ? '☀️' : '🌙';
  btnTema.setAttribute(
    'aria-label',
    tema === 'gelap' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'
  );
}

/** Muat preferensi tema dari localStorage (atau gunakan default: terang) */
function muatTema() {
  const temaTersimpan = localStorage.getItem(KUNCI_TEMA) || 'terang';
  terapkanTema(temaTersimpan);
}


// ============================================================
// BAGIAN 11 — EVENT LISTENER
// ============================================================

// --- Form tambah pengeluaran ---
form.addEventListener('submit', (e) => {
  e.preventDefault(); // Cegah reload halaman

  if (!validasiForm()) return; // Hentikan jika form tidak valid

  tambahTransaksi(inputNama.value, inputJumlah.value, inputKategori.value);

  // Kosongkan form setelah berhasil
  form.reset();
  inputNama.classList.remove('input-error');
  inputJumlah.classList.remove('input-error');
  inputKategori.classList.remove('input-error');
});

// Hapus error saat pengguna mulai mengetik / memilih
inputNama.addEventListener('input',      () => hapusError(inputNama,     errorNama));
inputJumlah.addEventListener('input',    () => hapusError(inputJumlah,   errorJumlah));
inputKategori.addEventListener('change', () => hapusError(inputKategori, errorKategori));

// --- Tombol Simpan Batas ---
btnSimpanBatas.addEventListener('click', () => {
  const nilai = parseFloat(inputBatas.value);

  if (!inputBatas.value || isNaN(nilai) || nilai <= 0) {
    // Input tidak valid: goyangkan input sebagai tanda error
    inputBatas.classList.add('input-error');
    setTimeout(() => inputBatas.classList.remove('input-error'), 1500);
    return;
  }

  simpanBatas(nilai);
  renderSemua(); // Render ulang agar highlight langsung muncul
});

// Izinkan tekan Enter di input batas untuk menyimpan
inputBatas.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnSimpanBatas.click();
});

// --- Tombol Reset Batas ---
btnResetBatas.addEventListener('click', () => {
  simpanBatas(0);    // Hapus batas
  inputBatas.value = '';
  renderSemua();     // Hapus semua highlight
});

// --- Dropdown ringkasan bulanan ---
selBulan.addEventListener('change', renderRingkasanBulanan);
selTahun.addEventListener('change', renderRingkasanBulanan);

// --- Tombol ganti tema ---
btnTema.addEventListener('click', () => {
  const temaAktif = document.documentElement.getAttribute('data-tema');
  terapkanTema(temaAktif === 'gelap' ? 'terang' : 'gelap');
});


// ============================================================
// BAGIAN 12 — INISIALISASI APLIKASI
// ============================================================

// 1. Muat data transaksi & batas dari localStorage
muatDariStorage();

// 2. Terapkan tema tersimpan (gelap / terang)
muatTema();

// 3. Isi dropdown bulan & tahun untuk ringkasan
isiFilterBulanTahun();

// 4. Render semua komponen UI
renderSemua();
