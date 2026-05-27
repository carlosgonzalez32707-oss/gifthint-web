#!/usr/bin/env bash
# browser-build.sh — GiftHint Extension Cross-Browser Build Script
#
# Packages the GiftHint browser extension for Chrome, Firefox, and Edge.
# Each target produces a separate .zip file ready for store submission.
#
# USAGE
# ─────
#   ./browser-build.sh [chrome|firefox|edge|all]
#
# Or via package.json scripts (add these to package.json):
#   npm run build:chrome    → builds Chrome package
#   npm run build:firefox   → builds Firefox package
#   npm run build:edge      → builds Edge package
#   npm run build:ext       → builds all three
#
# OUTPUT
# ──────
#   dist/
#   ├── chrome/      ← Chrome source directory
#   ├── firefox/     ← Firefox source directory (bundled for MV2)
#   ├── edge/        ← Edge source directory
#   ├── gifthint-chrome-1.1.0.zip
#   ├── gifthint-firefox-1.1.0.zip
#   └── gifthint-edge-1.1.0.zip
#
# PREREQUISITES
# ─────────────
#   node + npm  — for npx esbuild
#   zip         — standard on macOS/Linux; on Windows use WSL or 7-Zip
#
# FIREFOX BUNDLING NOTE
# ─────────────────────
#   Firefox MV2 does not support ES module content scripts ("type":"module").
#   The build script uses esbuild to bundle each entry point so all imports
#   are resolved into single files.  Chrome and Edge support ES modules in
#   MV3 and use the unbundled source files directly — no bundling step needed.
#
# STORE SUBMISSION CHECKLIST
# ──────────────────────────
#   Chrome Web Store:    upload gifthint-chrome-<version>.zip
#   Firefox Add-ons:     upload gifthint-firefox-<version>.zip
#     ⚠ Also upload extension/ source for AMO review (required for obfuscated code)
#   Edge Add-ons:        upload gifthint-edge-<version>.zip

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────────

EXTENSION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/extension" && pwd)"
DIST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/dist"
VERSION=$(node -p "require('${EXTENSION_DIR}/../package.json').version" 2>/dev/null || \
          node -e "const m=require('${EXTENSION_DIR}/manifest.json'); console.log(m.version)")

TARGET="${1:-all}"

# ── Helpers ────────────────────────────────────────────────────────────────────

log()  { echo "▶ $*"; }
ok()   { echo "✓ $*"; }
err()  { echo "✗ $*" >&2; exit 1; }
hr()   { echo "────────────────────────────────────────"; }

check_deps() {
  command -v node >/dev/null 2>&1 || err "node not found — install Node.js"
  command -v zip  >/dev/null 2>&1 || err "zip not found — install zip (brew install zip)"
}

# Copies all extension source files except manifests and compat-only files
copy_common_sources() {
  local dest="$1"
  cp "${EXTENSION_DIR}"/*.js   "${dest}/" 2>/dev/null || true
  cp "${EXTENSION_DIR}"/*.html "${dest}/" 2>/dev/null || true
  cp "${EXTENSION_DIR}"/*.css  "${dest}/" 2>/dev/null || true
  if [[ -d "${EXTENSION_DIR}/icons" ]]; then
    cp -r "${EXTENSION_DIR}/icons" "${dest}/"
  fi
}

zip_dist() {
  local name="$1"
  local source_dir="$2"
  local zip_path="${DIST_DIR}/gifthint-${name}-${VERSION}.zip"
  # Remove existing zip to avoid stale files accumulating
  rm -f "${zip_path}"
  (cd "${source_dir}" && zip -r "${zip_path}" . -x "*.DS_Store" -x "__MACOSX/*")
  ok "Created ${zip_path}"
}

# ── Chrome build ───────────────────────────────────────────────────────────────
# Chrome MV3 supports ES module content scripts natively.
# Files are copied as-is; no bundling required.

build_chrome() {
  hr
  log "Building Chrome (MV3 — no bundling)"

  local dir="${DIST_DIR}/chrome"
  rm -rf "${dir}" && mkdir -p "${dir}"

  copy_common_sources "${dir}"

  # Use the canonical manifest (manifest.json = Chrome)
  cp "${EXTENSION_DIR}/manifest.json" "${dir}/manifest.json"

  # Remove Firefox-only files from the Chrome package
  rm -f "${dir}/auth.firefox.js"
  rm -f "${dir}/manifest.firefox.json"
  rm -f "${dir}/manifest.edge.json"

  zip_dist "chrome" "${dir}"
  ok "Chrome build complete"
}

# ── Firefox build ──────────────────────────────────────────────────────────────
# Firefox MV2 does NOT support ES module content scripts.
# We use esbuild to bundle each entry point into a single self-contained file.

build_firefox() {
  hr
  log "Building Firefox (MV2 — bundling with esbuild)"

  local dir="${DIST_DIR}/firefox"
  rm -rf "${dir}" && mkdir -p "${dir}/dist"

  # ── Bundle entry points with esbuild ─────────────────────────────────────────
  # Entry points:
  #   floating-button.js → content script (injected into pages)
  #   popup.js           → extension popup
  #   hint-sheet.js      → web-accessible resource (loaded dynamically)
  #   supabase.js        → web-accessible resource
  #   wishlists.js       → web-accessible resource
  #
  # For auth, the Firefox build substitutes auth.firefox.js for auth.js.
  # esbuild resolves the import graph automatically.

  log "  Bundling content scripts and web-accessible resources…"

  # esbuild --alias does not support relative paths (./auth.js).
  # Strategy: copy source files into a temp working directory, replace
  # auth.js with auth.firefox.js there, then bundle from the temp dir.
  # Source files are never modified.

  local tmp_src
  tmp_src="$(mktemp -d)"
  trap "rm -rf '${tmp_src}'" EXIT  # clean up temp dir on exit or error

  # Copy all extension source files into the temp dir
  cp "${EXTENSION_DIR}"/*.js   "${tmp_src}/"
  cp "${EXTENSION_DIR}"/*.html "${tmp_src}/" 2>/dev/null || true
  cp "${EXTENSION_DIR}"/*.css  "${tmp_src}/" 2>/dev/null || true

  # Substitute auth.firefox.js for auth.js (the import name stays ./auth.js)
  cp "${tmp_src}/auth.firefox.js" "${tmp_src}/auth.js"

  npx --yes esbuild \
    "${tmp_src}/floating-button.js" \
    "${tmp_src}/hint-sheet.js" \
    "${tmp_src}/supabase.js" \
    "${tmp_src}/wishlists.js" \
    --bundle \
    --format=iife \
    --target=firefox109 \
    --outdir="${dir}/dist" \
    --log-level=info

  npx esbuild \
    "${tmp_src}/popup.js" \
    --bundle \
    --format=iife \
    --target=firefox109 \
    --outfile="${dir}/popup.js" \
    --log-level=info

  # Copy static assets
  cp "${EXTENSION_DIR}/popup.html" "${dir}/"
  cp "${EXTENSION_DIR}/popup-skeleton.css" "${dir}/" 2>/dev/null || true
  [[ -d "${EXTENSION_DIR}/icons" ]] && cp -r "${EXTENSION_DIR}/icons" "${dir}/"

  # Use Firefox manifest
  cp "${EXTENSION_DIR}/manifest.firefox.json" "${dir}/manifest.json"

  zip_dist "firefox" "${dir}"
  ok "Firefox build complete"
}

# ── Edge build ─────────────────────────────────────────────────────────────────
# Edge supports Chrome MV3 natively — only the manifest differs (update_url).
# Files are copied as-is; no bundling required.

build_edge() {
  hr
  log "Building Edge (MV3 — no bundling)"

  local dir="${DIST_DIR}/edge"
  rm -rf "${dir}" && mkdir -p "${dir}"

  copy_common_sources "${dir}"

  # Use Edge manifest (identical to Chrome + update_url)
  cp "${EXTENSION_DIR}/manifest.edge.json" "${dir}/manifest.json"

  # Remove Firefox-only files from the Edge package
  rm -f "${dir}/auth.firefox.js"
  rm -f "${dir}/manifest.firefox.json"
  rm -f "${dir}/manifest.edge.json"

  zip_dist "edge" "${dir}"
  ok "Edge build complete"
}

# ── Main ───────────────────────────────────────────────────────────────────────

check_deps
mkdir -p "${DIST_DIR}"

hr
log "GiftHint Extension Build — v${VERSION}"
log "Extension source: ${EXTENSION_DIR}"
log "Output:           ${DIST_DIR}"

case "${TARGET}" in
  chrome)  build_chrome  ;;
  firefox) build_firefox ;;
  edge)    build_edge    ;;
  all)
    build_chrome
    build_firefox
    build_edge
    ;;
  *)
    err "Unknown target '${TARGET}'. Use: chrome | firefox | edge | all"
    ;;
esac

hr
log "Done. Packages in ${DIST_DIR}/"
ls -lh "${DIST_DIR}"/*.zip 2>/dev/null || true
