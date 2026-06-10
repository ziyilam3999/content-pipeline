#!/usr/bin/env bash
# make-mobile-proxy.sh — produce a phone-downloadable review proxy of a render.
#
# WHY: the operator reviews videos on the Claude phone app over remote control, whose
# download relay silently fails on large files. A full-res publish master (e.g. a
# 1080p oscillating-motion demo can hit ~38MB) will NOT download to the phone, while a
# ~4-8MB 720p proxy does. Send the *-mobile.mp4 for REVIEW; keep the master for PUBLISH.
# See memory feedback_deliver_mobile_proxy_for_remote_review_videos.
#
# Usage: tools/make-mobile-proxy.sh <input.mp4> [output.mp4] [max_height=1280] [crf=27]
# Output defaults to <input>-mobile.mp4 next to the source.
set -euo pipefail

SRC="${1:?usage: make-mobile-proxy.sh <input.mp4> [output.mp4] [max_height] [crf]}"
[ -f "$SRC" ] || { echo "make-mobile-proxy: not found: $SRC" >&2; exit 1; }

DIR="$(cd "$(dirname "$SRC")" && pwd)"
BASE="$(basename "${SRC%.*}")"
OUT="${2:-$DIR/${BASE}-mobile.mp4}"
MAXH="${3:-1280}"
CRF="${4:-27}"

# Resolve vendored ffmpeg from the content-pipeline repo (DYLD_LIBRARY_PATH required on macOS arm64).
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FF="$REPO/node_modules/@remotion/compositor-darwin-arm64"
[ -x "$FF/ffmpeg" ] || { echo "make-mobile-proxy: vendored ffmpeg missing at $FF" >&2; exit 1; }

# Scale by height, preserve aspect, keep width even (-2). Web-optimized + faststart for instant play.
DYLD_LIBRARY_PATH="$FF" "$FF/ffmpeg" -y -i "$SRC" \
  -vf "scale=-2:${MAXH}:flags=lanczos" \
  -c:v libx264 -preset slow -crf "$CRF" -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 96k "$OUT" >/dev/null 2>&1

BYTES="$(stat -f '%z' "$OUT" 2>/dev/null || stat -c '%s' "$OUT")"
MB="$(awk "BEGIN{printf \"%.2f\", $BYTES/1048576}")"
echo "make-mobile-proxy: wrote $OUT (${MB} MB)"
# Soft warn if still large for a phone download relay.
if [ "$BYTES" -gt 15728640 ]; then
  echo "make-mobile-proxy: WARNING ${MB}MB still >15MB — lower max_height or raise crf before sending for review." >&2
fi
