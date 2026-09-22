/** Pick a Scout installer row from GitHub `manifest.json`.

Scout CI packs exactly three zips: darwin-arm64, linux-x64, win32-x64.
Studio selects by OS only — never by the Electron/browser process arch.
*/

export const packedArchForOs = (os) => {
  const key = normalizeScoutOs(os)
  if (key === 'darwin') return 'arm64'
  return 'x64'
}

export const guessInstaller = (filename = '', os = '') => {
  const lower = String(filename || '').toLowerCase()
  for (const ext of ['pkg', 'dmg', 'msi', 'exe', 'zip']) {
    if (lower.endsWith(`.${ext}`)) return ext
  }
  if (os === 'darwin' || os === 'win32') return 'zip'
  return 'zip'
}

export const normalizeScoutOs = (value) => {
  const s = String(value || '').trim().toLowerCase()
  if (s === 'darwin' || s === 'macos' || s === 'mac') return 'darwin'
  if (s === 'win32' || s === 'windows' || s === 'win') return 'win32'
  if (s === 'linux') return 'linux'
  return s
}

export const normalizeScoutArch = (value) => {
  const s = String(value || '').trim().toLowerCase()
  if (s === 'arm64' || s === 'aarch64') return 'arm64'
  if (s === 'x64' || s === 'amd64' || s === 'x86_64') return 'x64'
  return s
}

const basename = (url) => {
  const raw = String(url || '').split('?')[0]
  return raw.split('/').pop() || ''
}

const normalizeItem = (row, version, os) => {
  if (!row || !row.url) return null
  const filename = row.filename || basename(row.url)
  const item = {
    version: row.version || version || '',
    url: row.url,
    sha256: row.sha256 || '',
    installer: row.installer || guessInstaller(filename, os || row.os),
    filename,
    os: normalizeScoutOs(row.os || os),
    arch: packedArchForOs(row.os || os),
  }
  // 分层字段原样带过去，由主进程比对本机 bin/layers.txt 决定下哪几层。
  // 老的 manifest 没有这两个字段，缺了就退回下合并包 —— 见 main.js 的 planScoutUpdate。
  if (Number(row.bytes) > 0) item.bytes = Number(row.bytes)
  if (row.layers && typeof row.layers === 'object') item.layers = row.layers
  return item
}

export const pickScoutRelease = (manifest, { os } = {}) => {
  if (!manifest || typeof manifest !== 'object') return null
  const wantOs = normalizeScoutOs(os)
  const wantArch = packedArchForOs(wantOs)
  const version = manifest.version || ''

  if (Array.isArray(manifest.items)) {
    const items = manifest.items.filter((row) => row && row.url)
    const hit = items.find(
      (row) => normalizeScoutOs(row.os) === wantOs && normalizeScoutArch(row.arch) === wantArch,
    )
    return normalizeItem(hit, version, wantOs)
  }

  if (manifest.url) {
    if (manifest.os && normalizeScoutOs(manifest.os) !== wantOs) return null
    return normalizeItem(manifest, version, wantOs)
  }

  const nested = manifest[wantOs] && typeof manifest[wantOs] === 'object'
    ? manifest[wantOs][wantArch]
    : null
  return normalizeItem(nested, nested?.version || version, wantOs)
}

export const scoutReleasesPageUrl = (manifestUrl) => {
  const raw = String(manifestUrl || '').trim()
  const m = raw.match(/^(https:\/\/github\.com\/[^/]+\/[^/]+\/releases)/)
  return m ? `${m[1]}/latest` : ''
}

export const scoutRepoFromManifestUrl = (manifestUrl) => {
  const m = String(manifestUrl || '').match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\//)
  return m ? m[1] : 'pengchengluoyi/MinoScout'
}

/** GitHub `/releases/latest` 不含 Pre-release；与 manifest 下载地址一致。 */
export const manifestUrlForTag = (manifestUrl, tag) => {
  const repo = scoutRepoFromManifestUrl(manifestUrl)
  const ver = normalizeScoutVersion(tag)
  if (!ver) return manifestUrl
  return `https://github.com/${repo}/releases/download/v${ver}/manifest.json`
}

export const nodeScoutVersion = (node) =>
  normalizeScoutVersion(
    node?.app_layer ||
      node?.installed_layers?.app ||
      node?.scout_version ||
      node?.version ||
      '',
  )

export const scoutVersionStatus = (installed, latest) => {
  const cur = normalizeScoutVersion(installed)
  const lat = normalizeScoutVersion(latest)
  if (!lat) return 'unknown'
  if (!cur) return 'unknown'
  return compareScoutVersions(cur, lat) >= 0 ? 'latest' : 'outdated'
}

export const normalizeScoutVersion = (value) => String(value || '').trim().replace(/^v/i, '')

/** @returns {number} 1 if a>b, -1 if a<b, 0 if equal */
export const compareScoutVersions = (a, b) => {
  const pa = normalizeScoutVersion(a).split('.').map((p) => parseInt(p, 10))
  const pb = normalizeScoutVersion(b).split('.').map((p) => parseInt(p, 10))
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i += 1) {
    const na = Number.isFinite(pa[i]) ? pa[i] : 0
    const nb = Number.isFinite(pb[i]) ? pb[i] : 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}
