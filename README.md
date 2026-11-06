# POS Tenan Mall (prototipe)

Kasir PWA untuk tenan mall. Semua data tersimpan di browser perangkat (IndexedDB), tanpa server.

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

## Menyiapkan perangkat sungguhan

1. Di perangkat mall, pilih **Perangkat pengelola mall** dan buat PIN.
2. Tambahkan tenan, lalu klik **Unduh file penyiapan**.
3. Di perangkat tenan, pilih **Perangkat tenan** dan pilih file tersebut.
4. Masuk dengan PIN yang dibuat pengelola, lalu ganti PIN di **Pengaturan**.

Satu perangkat bersama tidak perlu file: tenan yang ditambahkan pengelola langsung muncul di direktori.

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
