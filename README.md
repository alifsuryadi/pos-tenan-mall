# POS Tenan Mall (prototipe)

Kasir PWA untuk tenan mall. Semua data tersimpan di browser perangkat (IndexedDB), tanpa server.

**Coba versi staging:** https://dev.pos-tenan-mall.pages.dev (memakai data dan PIN contoh di bawah)

## Menjalankan

```bash
npm install
npm run dev
```

Perintah lain: `npm test`, `npm run build`, dan `npm run preview` untuk mencoba versi build yang bisa jalan offline.

## Akun contoh

Saat `npm run dev` dan di staging, perangkat kosong otomatis terisi empat tenan contoh.

| Akun | PIN |
|---|---|
| Pemilik tenan | 1111 |
| Kasir tenan | 2222 |
| Pengelola mall | 9999 |

Build produksi tidak memuat data ini. Data contoh hanya aktif jika `VITE_DEMO_DATA=true`.

## Menjalankan dengan Docker

```bash
docker build -t pos-tenan-mall .
```

```bash
docker run --rm -p 8080:8080 pos-tenan-mall
```

Buka http://localhost:8080. Image ini tidak memuat data contoh, jadi aplikasi mulai dari layar penyiapan perangkat. Untuk memuat data contoh, tambahkan `--build-arg VITE_DEMO_DATA=true` saat build.

Setiap rilis juga menerbitkan image `ghcr.io/alifsuryadi/pos-tenan-mall`.

Container ini hanya menyajikan file aplikasi. Data tetap tersimpan di browser tiap perangkat, bukan di container. Di luar `localhost`, fitur offline hanya aktif lewat HTTPS, jadi pasang di belakang proxy yang menyediakan HTTPS.

## Menyiapkan perangkat sungguhan

1. Di perangkat mall, pilih **Perangkat pengelola mall** dan buat PIN.
2. Tambahkan tenan, lalu klik **Unduh file penyiapan**.
3. Di perangkat tenan, pilih **Perangkat tenan** dan pilih file tersebut.
4. Masuk dengan PIN yang dibuat pengelola, lalu ganti PIN di **Pengaturan**.

Satu perangkat bersama tidak perlu file: tenan yang ditambahkan pengelola langsung muncul di direktori.

### Backup dan pemulihan perangkat mall

Buat backup secara rutin lewat **Unduh backup** di bagian **Perangkat ini** pada layar pengelola, lalu simpan filenya di luar perangkat.

- File memuat akun mall, daftar tenan beserta akun dan pengaturannya, rekap yang diterima, dan log pengelola. Simpan di tempat aman, karena PIN 4 sampai 6 angka bisa ditebak dari isi file oleh orang yang paham teknis.
- Produk dan transaksi tenan tidak ikut. Pada perangkat bersama, tiap pemilik membuat backup tokonya sendiri dari **Pengaturan** dan memulihkannya setelah perangkat mall pulih.

Untuk memulihkan, buka aplikasi di perangkat kosong, pilih **Pulihkan perangkat pengelola mall**, pilih filenya, lalu masukkan PIN pengelola yang berlaku saat backup dibuat. Perangkat yang sudah berisi data menolak pemulihan, jadi tidak ada data yang tertimpa. Kalau ingin memulihkan ke perangkat itu, kosongkan dulu lewat **Hapus semua data perangkat**.

File backup mall dan file tenan saling menolak. File tenan tidak bisa memasang akun mall.

Layar penyiapan hanya muncul di build tanpa data contoh, karena data contoh langsung mengisi perangkat kosong. Untuk mencobanya di lokal, jalankan `npm run build` lalu `npm run preview`.

## Struktur

- `src/domain`: skema data dan perhitungan (total, pajak, kas shift)
- `src/data/repo.ts`: satu-satunya pintu ke penyimpanan. Ganti file ini saat pindah ke server.
- `src/data/seed.ts`: data contoh, dimuat hanya jika `VITE_DEMO_DATA=true`
- `src/screens`: layar aplikasi
- `src/ui`: komponen bersama dan struk

## Branch dan rilis

Lihat [CONTRIBUTING.md](CONTRIBUTING.md).

## Pembaruan aplikasi

Versi baru diunduh di latar belakang dan menunggu. Saat ada yang login, muncul tombol **Muat ulang** dan isi struk tetap tersimpan. Saat tidak ada yang login, versi baru langsung diterapkan.

## Batasan yang disengaja

- Data hanya ada di satu perangkat, jadi backup dan rekap berpindah lewat file.
- PIN hanya penghalang ringan. Pada perangkat bersama, orang yang paham teknis tetap bisa membaca data tenan lain, dan file rekap atau backup tidak ditandatangani.
- QRIS dan kartu dicatat manual, tidak terhubung ke penyedia pembayaran.
- Void dan refund berlaku untuk seluruh transaksi.
- Varian dibuat sebagai produk terpisah (misalnya per ukuran).

## Lisensi

Hak cipta dilindungi (all rights reserved). Kode ini boleh dilihat, tetapi tidak boleh dipakai tanpa izin tertulis. Lihat [LICENSE](LICENSE).
