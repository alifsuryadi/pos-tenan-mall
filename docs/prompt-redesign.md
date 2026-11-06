# Prompt redesign

Buka Claude Code di folder project, panggil skill `/frontend-design`, lalu tempel semua teks di bawah garis.

---

Redesign seluruh tampilan POS Tenan Mall di repo ini. Hasilnya harus terasa seperti produk ritel yang dipakai sungguhan setiap hari, bukan template dashboard. Pertahankan semua fungsi yang sudah ada.

## Produk dan penggunanya

Aplikasi kasir PWA untuk tenan di mall Indonesia, seperti kafe, butik batik, toko sepatu, dan aksesori ponsel. Berjalan offline, dan semua data tersimpan di perangkat.

| Pengguna | Situasi | Yang paling penting |
|---|---|---|
| Kasir | Berdiri di konter dengan tablet, ada antrean, pencahayaan mall terang | Cepat, sulit salah ketuk, total terbaca dari jarak lengan |
| Pemilik tenan | Mengecek toko di sela kesibukan | Tahu kondisi toko dalam beberapa detik |
| Pengelola mall | Duduk di kantor, memakai laptop | Tenan mana yang sudah mengirim rekap, dan berapa totalnya |

Coba dulu versi yang berjalan sebelum mendesain: jalankan `npm run dev`, lalu pakai PIN pemilik `1111`, kasir `2222`, dan pengelola `9999`. Rasakan satu transaksi penuh sebagai kasir, dari buka shift sampai struk.

## Ruang lingkup

Prioritaskan sesuai urutan ini:

1. **Kasir dan pembayaran** (`src/screens/Pos.tsx`): layar terpenting, dipakai ratusan kali sehari.
2. **Masuk dan penyiapan perangkat** (`src/screens/Login.tsx`, `src/screens/Setup.tsx`): kesan pertama.
3. **Struk** (`src/ui/Receipt.tsx`): harus terbaca di kertas thermal 58 mm dan 80 mm, hitam putih.
4. **Laporan** (`src/screens/Reports.tsx`): pakai skill `dataviz` untuk grafiknya.
5. **Layar lain**: `History`, `ShiftView`, `Products`, `AuditLog`, `Settings`, dan `Admin`, memakai sistem yang sama.

## Yang tidak boleh berubah

- Jangan ubah logika di `src/domain`, `src/data`, dan `src/pwa.ts`, atau perilaku store di `src/store.ts`.
- Jangan menambah, menghapus, atau menyederhanakan fitur. Setiap tindakan dan pesan error yang ada harus tetap bisa dicapai.
- Pemindai barcode bekerja lewat input keyboard global di `Pos.tsx`. Jangan merusaknya, dan jangan buat keyboard layar tablet terbuka tanpa perlu.
- Aplikasi harus tetap jalan offline. Bundel font lewat `@fontsource`, tanpa CDN atau aset jarak jauh.
- Warna tenan adalah data, bisa berupa warna heksa apa pun yang dipilih pengelola. Desain harus tetap terbaca dengan warna apa pun, dan pakai `readableOn` untuk warna teks di atasnya.
- Pertahankan `#print-root` dan aturan `@media print`.
- Stack tetap React, TypeScript, dan Tailwind v4. Simpan token desain di `src/index.css` dan komponen bersama di `src/ui/kit.tsx`. Jangan menambah library komponen.
- Teks antarmuka berbahasa Indonesia yang wajar, dengan format `Rp25.000`.

## Arah desain

Rumuskan sudut pandang sendiri dari dunia ritel mall dan konter kasir, misalnya papan petunjuk, kartu harga, label rak, atau kertas struk. Desain saat ini memakai papan direktori dan gulungan struk. Boleh dipertahankan kalau memang yang terbaik, tapi nilai dengan jujur dan jangan dipertahankan hanya karena sudah ada.

Kesan yang dicari: tenang, tegas, dan bisa dipercaya untuk urusan uang. Terlihat profesional karena disiplin pada hierarki, jarak, dan tipografi, bukan karena dekorasi.

Yang harus terasa di layar kasir:

- **Total dan tombol Bayar** paling menonjol. Mata kasir harus langsung menemukannya tanpa mencari.
- **Produk mudah dipindai:** nama, harga, dan sisa stok terbaca sekilas, termasuk nama produk yang panjang.
- **Tindakan berisiko dibedakan** dari tindakan biasa, seperti Kosongkan struk, Void, dan Refund.
- **Angka memakai `tabular-nums`,** dan rupiah sejajar kanan di daftar dan tabel.
- **Satu elemen yang berkesan.** Selebihnya tenang.

## Hindari

Ini ciri tampilan generik. Jangan dipakai kecuali ada alasan kuat yang berasal dari produk ini:

- Deretan kartu identik dengan radius dan bayangan yang sama, gradasi sebagai hiasan, dan efek kaca.
- Latar krem dengan aksen terakota, atau latar hampir hitam dengan satu aksen neon.
- Label huruf kapital berjarak lebar di atas setiap judul.
- Baris stat dengan angka besar, label kecil, dan ikon berwarna di dalam kotak.
- Ikon di setiap tombol atau menu. Gunakan hanya bila lebih cepat dipahami daripada teks.
- Font monospace untuk label kecil. Di aplikasi ini monospace hanya wajar untuk struk.
- Hiasan animasi, seperti fade-in tiap bagian atau kartu yang naik saat disentuh. Di layar kasir, animasi hanya menanggapi tindakan dan selesai di bawah 150 ms.
- Teks promosi seperti "Kelola bisnis Anda lebih mudah". Ini alat kerja, jadi tulis hanya yang membantu tugas.

## Standar minimum

- Target sentuh minimal 44 × 44 px, dan 56 px untuk tindakan utama kasir.
- Kontras teks memenuhi WCAG AA, dan status tidak dibedakan oleh warna saja.
- Fokus keyboard terlihat, dan `prefers-reduced-motion` dihormati.
- Layout bekerja di 1180 × 820 (tablet, ukuran utama), 1920 × 1080 (PC kasir), 768 × 1024, dan 375 × 812, tanpa scroll horizontal halaman.
- Setiap layar punya keadaan kosong, error, stok habis, dan teks panjang yang sudah dirancang.
- Mode gelap tidak wajib. Prioritaskan mode terang yang tetap terbaca di ruangan terang.

## Proses

1. **Audit.** Ambil screenshot layar yang ada, lalu tulis masalah terbesarnya dari sudut pandang kasir.
2. **Rencana.** Tulis palet (4 sampai 6 warna hex bernama), peran tipografi, konsep layout dengan wireframe ASCII untuk layar kasir, dan satu elemen yang berkesan. Lalu kritik rencana itu: bagian mana yang akan sama saja di aplikasi POS lain? Revisi bagian itu dan sebutkan alasannya.
3. **Tunjukkan rencana itu kepada saya, dan tunggu persetujuan sebelum menulis kode.**
4. **Bangun** dengan mengikuti urutan prioritas, mulai dari token dan komponen di `kit.tsx`.
5. **Kritik.** Ambil screenshot setiap layar di setiap ukuran, lalu perbaiki yang terasa generik. Sebelum selesai, hapus satu hiasan yang tidak perlu.

## Selesai jika

- `npm test` dan `npm run build` lulus.
- Satu transaksi tunai dan satu QRIS berhasil dengan data contoh, termasuk diskon, tahan keranjang, cetak struk, dan void dengan PIN pemilik.
- Tampilan cetak struk diperiksa pada lebar 58 mm dan 80 mm.
- Layar penyiapan diperiksa pada build produksi (`npm run build` dan `npm run preview`), karena mode contoh melewatinya.
- Tidak ada error di console.
- Pekerjaan berada di branch `feature/redesign-ui` dengan PR ke `dev`, disertai screenshot sebelum dan sesudah. Commit dan PR tidak mencantumkan Claude sebagai kontributor.
