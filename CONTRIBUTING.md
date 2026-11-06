# Alur kerja

## Branch

| Branch | Fungsi | Masuk lewat |
|---|---|---|
| `main` | Kode produksi. Setiap rilis diberi tag dari sini. | PR dari `dev`, `release/*`, atau `hotfix/*` |
| `dev` | Staging, tempat fitur digabung dan diuji bersama. | PR dari `feature/*`, `fix/*`, atau `chore/*` |
| `feature/<nama>` | Fitur baru, dibuat dari `dev`. | |
| `fix/<nama>` | Perbaikan bug yang belum sampai produksi, dibuat dari `dev`. | |
| `chore/<nama>` | Perawatan, dokumentasi, atau dependensi, dibuat dari `dev`. | |
| `release/<versi>` | Persiapan rilis, dibuat dari `dev`. | |
| `hotfix/<nama>` | Perbaikan darurat produksi, dibuat dari `main`. Setelah merge, gabungkan juga `main` ke `dev`. | |

```text
feature/* ──┐
fix/*     ──┼──> dev (staging) ──> main (produksi) ──> tag vX.Y.Z
chore/*   ──┘                       ^
hotfix/* ───────────────────────────┘
```

## GitHub Actions

| Workflow | Berjalan saat | Hasil |
|---|---|---|
| CI | PR ke `main` atau `dev`, dan push ke keduanya | Tes, pemeriksaan tipe, dan build |
| CI (push) | Push ke `dev` | Artefak `pos-staging-<commit>`, disimpan 14 hari |
| CI (push) | Push ke `main` | Artefak `pos-production-<commit>`, disimpan 14 hari |
| Release | Push tag `vX.Y.Z` | GitHub Release berisi zip hasil build |

Hasil build belum dikirim ke server mana pun, karena tempat hosting belum ditentukan.

## Merilis versi baru

Versi mengikuti [Semantic Versioning](https://semver.org/lang/id/).

1. Di `dev`, naikkan versi tanpa membuat tag, lalu commit dan push:

   ```bash
   npm version 0.2.0 --no-git-tag-version
   ```

2. Buka PR dari `dev` ke `main` dan merge setelah CI lulus.
3. Buat tag dari `main`:

   ```bash
   git switch main
   git pull
   git tag -a v0.2.0 -m "v0.2.0"
   git push origin v0.2.0
   ```

Workflow Release gagal kalau tag tidak berada di `main` atau tidak sama dengan versi di `package.json`.
