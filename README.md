# POS Tenan Mall (prototipe)

Kasir PWA untuk tenan mall. Semua data tersimpan di browser perangkat (IndexedDB), tanpa server.

## Menjalankan

```bash
npm install
npm run dev
```

Perintah lain: `npm test`, `npm run build`, dan `npm run preview` untuk mencoba versi build yang bisa jalan offline.

## Akun contoh

Perangkat kosong otomatis terisi empat tenan contoh.

| Akun | PIN |
|---|---|
| Pemilik tenan | 1111 |
| Kasir tenan | 2222 |
| Pengelola mall | 9999 |

Hapus `DEMO_PINS`, data contoh, dan petunjuk PIN di layar masuk sebelum dipakai sungguhan.

## Struktur

- `src/domain`: skema data dan perhitungan (total, pajak, kas shift)
- `src/data/repo.ts`: satu-satunya pintu ke penyimpanan. Ganti file ini saat pindah ke server.
- `src/data/seed.ts`: data contoh
- `src/screens`: layar aplikasi
- `src/ui`: komponen bersama dan struk

## Branch dan rilis

Lihat [CONTRIBUTING.md](CONTRIBUTING.md).

## Batasan yang disengaja

- Data hanya ada di satu perangkat, jadi backup dan rekap berpindah lewat file.
- PIN hanya penghalang ringan. Pada perangkat bersama, orang yang paham teknis tetap bisa membaca data tenan lain, dan file rekap atau backup tidak ditandatangani.
- QRIS dan kartu dicatat manual, tidak terhubung ke penyedia pembayaran.
- Void dan refund berlaku untuk seluruh transaksi.
- Varian dibuat sebagai produk terpisah (misalnya per ukuran).
