/**
 * Finish Electron's Chromium download after `npm install`.
 *
 * Two common failures on this machine:
 * - npm 11 skips dependency `postinstall` unless `allow-scripts` lists `electron`
 * - Node 26 + extract-zip can leave only `dist/LICENSES.chromium.html` (no Electron.app)
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const electronDir = path.join(root, 'node_modules', 'electron')
const dist = path.join(electronDir, 'dist')
const binaryRel = process.platform === 'darwin'
  ? 'Electron.app/Contents/MacOS/Electron'
  : process.platform === 'win32'
    ? 'electron.exe'
    : 'electron'
const pathTxt = path.join(electronDir, 'path.txt')

/** Electron's index.js concatenates this raw — never write a trailing newline. */
function writePathTxt () {
  fs.writeFileSync(pathTxt, binaryRel)
}

function patchElectronIndexTrim () {
  const index = path.join(electronDir, 'index.js')
  if (!fs.existsSync(index)) return
  const src = fs.readFileSync(index, 'utf8')
  if (src.includes("readFileSync(pathFile, 'utf-8').trim()")) return
  const next = src.replace(
    /fs\.readFileSync\(pathFile,\s*['"]utf-8['"]\)/g,
    "fs.readFileSync(pathFile, 'utf-8').trim()",
  )
  if (next !== src) fs.writeFileSync(index, next)
}

function installed () {
  try {
    const rel = fs.readFileSync(pathTxt, 'utf8').trim()
    return fs.existsSync(path.join(dist, rel))
  } catch {
    return false
  }
}

function runInstallJs () {
  const install = path.join(electronDir, 'install.js')
  if (!fs.existsSync(install)) return
  spawnSync(process.execPath, [install], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '', ELECTRON_RUN_AS_NODE: '' },
  })
}

function findCachedZip (version) {
  const name = `electron-v${version}-${process.platform}-${process.arch}.zip`
  const roots = [
    path.join(os.homedir(), 'Library/Caches/electron'),
    path.join(os.homedir(), '.electron'),
  ]
  for (const cache of roots) {
    if (!fs.existsSync(cache)) continue
    const direct = path.join(cache, name)
    if (fs.existsSync(direct)) return direct
    for (const ent of fs.readdirSync(cache, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue
      const nested = path.join(cache, ent.name, name)
      if (fs.existsSync(nested)) return nested
    }
  }
  return null
}

function extractWithDitto (zipPath) {
  fs.rmSync(dist, { recursive: true, force: true })
  fs.mkdirSync(dist, { recursive: true })
  const r = spawnSync('ditto', ['-x', '-k', zipPath, dist], { stdio: 'inherit' })
  if (r.status !== 0) {
    throw new Error(`ditto failed extracting ${zipPath}`)
  }
  writePathTxt()
}

if (!fs.existsSync(electronDir)) process.exit(0)
writePathTxt()
patchElectronIndexTrim()
if (installed()) process.exit(0)

runInstallJs()
writePathTxt()
patchElectronIndexTrim()
if (installed()) process.exit(0)

if (process.platform !== 'darwin') {
  console.error('Electron failed to install correctly. Delete node_modules/electron and run npm install again (Node 20 or 22 LTS).')
  process.exit(1)
}

const { version } = JSON.parse(fs.readFileSync(path.join(electronDir, 'package.json'), 'utf8'))
let zip = findCachedZip(version)
if (!zip) {
  const require = createRequire(path.join(electronDir, 'install.js'))
  const { downloadArtifact } = require('@electron/get')
  zip = await downloadArtifact({
    version,
    artifactName: 'electron',
    platform: process.platform,
    arch: process.arch,
  })
}
extractWithDitto(zip)
if (!installed()) {
  console.error('Electron.app is still missing after ditto extract.')
  process.exit(1)
}
