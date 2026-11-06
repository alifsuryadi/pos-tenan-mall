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
| CI | PR dan push yang sama | Image Docker dibangun, dijalankan, dan diperiksa lewat `docker/smoke-test.sh` |
| CI (push) | Push ke `dev` | Artefak `pos-staging-<commit>` disimpan 14 hari, lalu deploy ke staging |
| CI (push) | Push ke `main` | Artefak `pos-production-<commit>`, disimpan 14 hari |
| Release | Push tag `vX.Y.Z` | GitHub Release berisi zip hasil build, image Docker di `ghcr.io`, lalu deploy ke produksi jika diaktifkan |

## Deploy ke Cloudflare Pages

| Lingkungan | Sumber | Alamat |
|---|---|---|
| Staging | Push ke `dev` yang lulus CI | `https://dev.pos-tenan-mall.pages.dev` |
| Produksi | Tag `vX.Y.Z` di `main` | `https://pos-tenan-mall.pages.dev`, atau domain sendiri |

Penyiapan satu kali:

1. Buat project Pages bernama `pos-tenan-mall` dengan production branch `main`:

   ```bash
   npx wrangler@4 pages project create pos-tenan-mall --production-branch=main
   ```

2. Buat API token dengan izin **Cloudflare Pages: Edit**.
3. Di **Settings > Secrets and variables > Actions** pada repo GitHub, tambahkan secret `CLOUDFLARE_API_TOKEN` dan `CLOUDFLARE_ACCOUNT_ID`.

Selama secret belum ada, deploy staging dilewati tanpa membuat CI gagal.

Setiap deploy tercatat di panel **Deployments** pada halaman repo. Panel ini baru muncul setelah deploy pertama yang memakai `environment`.

### Mengaktifkan produksi

Deploy produksi mati secara bawaan. Build produksi tidak memuat data dan PIN contoh, yang hanya aktif di lokal dan staging lewat `VITE_DEMO_DATA=true`. Sebelum mengaktifkannya:

1. Pasang domain final. Data tersimpan per domain, jadi data di perangkat tenan tidak ikut pindah kalau domainnya berganti.
2. Tambahkan variable repo `ENABLE_PRODUCTION_DEPLOY` dengan nilai `true`.

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
