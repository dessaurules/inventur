/**
 * Richtet das PocketBase-Binary für die aktuelle Plattform ein.
 *
 * Aufruf:
 *   node scripts/install-pocketbase.mjs           → aktuelle Plattform
 *   node scripts/install-pocketbase.mjs linux      → Linux ARM64 (Raspberry Pi)
 *   node scripts/install-pocketbase.mjs mac        → macOS ARM64
 *
 * Wird automatisch bei `npm install` via postinstall aufgerufen.
 *
 * Strategie:
 *   1. Liegt bereits ein gecachtes Plattform-Binary vor (pocketbase-mac-arm64 /
 *      pocketbase-linux-arm64), wird es nach pocketbase kopiert – kein Download.
 *   2. Sonst wird es von GitHub heruntergeladen und entpackt (benötigt Internetzugang).
 */

import { existsSync, copyFileSync, chmodSync, mkdirSync, unlinkSync, writeFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { tmpdir } from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT      = path.join(__dirname, '..')
const BIN_DIR   = path.join(ROOT, 'pocketbase-bin')
const TARGET    = path.join(BIN_DIR, 'pocketbase')
const VERSION   = '0.37.5'

function detectPlatform() {
  const arg = (process.argv[2] ?? '').toLowerCase()
  if (arg === 'linux')                  return 'linux'
  if (arg === 'mac' || arg === 'darwin') return 'mac'

  const p = process.platform
  if (p === 'linux')  return 'linux'
  if (p === 'darwin') return 'mac'
  throw new Error(`Nicht unterstützte Plattform: ${p}. Bitte manuell herunterladen.`)
}

function cachedBinaryPath(platform) {
  return path.join(BIN_DIR, platform === 'linux' ? 'pocketbase-linux-arm64' : 'pocketbase-mac-arm64')
}

function downloadUrl(platform) {
  const base = `https://github.com/pocketbase/pocketbase/releases/download/v${VERSION}`
  const asset = platform === 'linux'
    ? `pocketbase_${VERSION}_linux_arm64.zip`
    : `pocketbase_${VERSION}_darwin_arm64.zip`
  return `${base}/${asset}`
}

async function downloadAndExtract(url, dest) {
  console.log(`  Lade herunter: ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download fehlgeschlagen: HTTP ${res.status}`)

  const zipPath = path.join(tmpdir(), `pocketbase_${VERSION}.zip`)
  const buf = await res.arrayBuffer()
  writeFileSync(zipPath, Buffer.from(buf))

  const extractDir = path.join(tmpdir(), `pb_extract_${Date.now()}`)
  mkdirSync(extractDir, { recursive: true })

  try {
    execFileSync('unzip', ['-o', zipPath, 'pocketbase', '-d', extractDir], { stdio: 'pipe' })
  } catch {
    throw new Error('unzip nicht gefunden. Bitte manuell installieren oder das Binary direkt herunterladen.')
  }

  const extracted = path.join(extractDir, 'pocketbase')
  if (!existsSync(extracted)) {
    throw new Error('pocketbase-Binary nicht im ZIP gefunden.')
  }

  copyFileSync(extracted, dest)
  chmodSync(dest, 0o755)

  try { unlinkSync(zipPath) } catch { /* ignore */ }
}

async function main() {
  const platform = detectPlatform()
  const cached   = cachedBinaryPath(platform)

  console.log(`[install-pocketbase] Plattform: ${platform}, Version: ${VERSION}`)

  if (existsSync(cached)) {
    console.log(`  Gecachtes Binary gefunden: ${path.relative(ROOT, cached)}`)
    copyFileSync(cached, TARGET)
    chmodSync(TARGET, 0o755)
  } else {
    console.log(`  Kein gecachtes Binary – lade herunter …`)
    await downloadAndExtract(downloadUrl(platform), TARGET)
    // Auch als Cache speichern
    copyFileSync(TARGET, cached)
  }

  console.log(`✓ pocketbase-bin/pocketbase ist bereit (${platform} v${VERSION})`)
}

main().catch((e) => {
  console.error('\n[install-pocketbase] Fehler:', e.message)
  console.error('→ Bitte manuell herunterladen: https://github.com/pocketbase/pocketbase/releases/tag/v' + VERSION)
  process.exit(1)
})
