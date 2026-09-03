/** Pick a Scout installer row from a GitHub (or Nexus-proxied) manifest. */

export const guessInstaller = (filename = '', os = '') => {
  const lower = String(filename || '').toLowerCase()
  for (const ext of ['pkg', 'dmg', 'msi', 'exe', 'zip']) {
    if (lower.endsWith(`.${ext}`)) return ext
  }
  if (os === 'darwin') return 'zip'
  if (os === 'win32') return 'zip'
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
  return {
    version: row.version || version || '',
    url: row.url,
    sha256: row.sha256 || '',
    installer: row.installer || guessInstaller(filename, os || row.os),
    filename,
  }
}

export const pickScoutRelease = (manifest, { os, arch } = {}) => {
  if (!manifest || typeof manifest !== 'object') return null
  const wantOs = normalizeScoutOs(os)
  const wantArch = normalizeScoutArch(arch)
  const version = manifest.version || ''

  if (Array.isArray(manifest.items)) {
    const items = manifest.items.filter((row) => row && row.url)
    const hit = items.find((row) => normalizeScoutOs(row.os) === wantOs && normalizeScoutArch(row.arch) === wantArch)
      || items.find((row) => normalizeScoutOs(row.os) === wantOs)
    return normalizeItem(hit, version, wantOs)
  }

  if (manifest.url) {
    if (manifest.os && normalizeScoutOs(manifest.os) !== wantOs) return null
    if (manifest.arch && normalizeScoutArch(manifest.arch) !== wantArch) return null
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
