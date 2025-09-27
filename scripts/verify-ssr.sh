#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-5173}"
python3 -m http.server "$PORT" >/dev/null 2>&1 &
SERVE_PID=$!
trap 'kill $SERVE_PID >/dev/null 2>&1 || true' EXIT
sleep 1

echo "Checking homepage H1 is present in raw HTML..."
curl -s "http://localhost:${PORT}/" | grep -i -E '<h1>[^<]+</h1>' || (echo "Missing H1 in homepage HTML"; exit 1)

echo "Checking homepage primary intro text is in HTML..."
curl -s "http://localhost:${PORT}/" | grep -q "Drop files and choose an output" || (echo "Missing intro text"; exit 1)

echo "Checking one conversion page H1 is present in raw HTML..."
curl -s "http://localhost:${PORT}/convert/mp4-to-mp3/" | grep -i -E '<h1>[^<]+</h1>' || (echo "Missing H1 on conversion page"; exit 1)

echo "Checking conversion page CTA link is visible server-side..."
curl -s "http://localhost:${PORT}/convert/mp4-to-mp3/" | grep -q "Open the converter" || (echo "Missing CTA text"; exit 1)

echo "✅ SSR/SSG checks passed."
