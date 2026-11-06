#!/usr/bin/env bash
# Menjalankan image lalu memeriksa bahwa aplikasi benar-benar tersaji.
# Pemakaian: docker/smoke-test.sh <nama-image>
set -euo pipefail

IMAGE="${1:?Sebutkan nama image}"
NAME="pos-smoke-$$"
PORT=18080
BASE="http://127.0.0.1:$PORT"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() {
  echo "GAGAL: $1" >&2
  docker logs "$NAME" >&2 || true
  exit 1
}

docker run -d --name "$NAME" -p "$PORT:8080" "$IMAGE" >/dev/null

for _ in $(seq 1 30); do
  curl -fsS -o /dev/null "$BASE/" && break
  sleep 1
done

curl -fsS "$BASE/" | grep -q '<div id="root"' || fail "Halaman utama tidak memuat aplikasi."

ASSET=$(curl -fsS "$BASE/" | grep -oE 'assets/index[^"]*\.js' | head -1)
[ -n "$ASSET" ] || fail "File JavaScript utama tidak ditemukan."
curl -fsSI "$BASE/$ASSET" | grep -qi 'cache-control: public, max-age=31536000, immutable' || fail "Asset tidak memakai cache panjang."

curl -fsSI "$BASE/sw.js" | grep -qi 'cache-control: no-cache' || fail "sw.js harus selalu diperiksa ulang."
curl -fsSI "$BASE/manifest.webmanifest" | grep -qi 'content-type: application/manifest+json' || fail "Tipe manifest salah."

STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/assets/tidak-ada.js")
[ "$STATUS" = "404" ] || fail "Asset yang tidak ada harus 404, bukan $STATUS."

[ "$(docker exec "$NAME" id -u)" != "0" ] || fail "Container tidak boleh berjalan sebagai root."

if [ "${EXPECT_DEMO_DATA:-false}" != "true" ]; then
  if docker exec "$NAME" grep -rlq 'Kopi Pagi Hari' /usr/share/nginx/html; then
    fail "Image produksi tidak boleh memuat data contoh."
  fi
fi

echo "Image $IMAGE lulus pemeriksaan."
