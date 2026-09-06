const DEFAULT_NEXUS = 'http://mino.local:10104'
const DEFAULT_SCOUT_MANIFEST =
  'https://github.com/pengchengluoyi/MinoScout/releases/latest/download/manifest.json'

export const isElectronRuntime = () => typeof window !== 'undefined' && !!window.electronAPI

/** Studio 桌面窗口才能把 Scout zip 写到本机。浏览器标签页没有这些 IPC。 */
export const canInstallLocalScout = () =>
  typeof window !== 'undefined'
  && (
    typeof window.electronAPI?.scoutSetup === 'function'
    || (
      typeof window.electronAPI?.scoutDownload === 'function'
      && typeof window.electronAPI?.scoutInstall === 'function'
    )
  )

export const nexusOrigin = () => {
  const baked = String(import.meta.env.VITE_NEXUS_URL || '').trim().replace(/\/$/, '')
  return baked || DEFAULT_NEXUS
}

/** GitHub Release `manifest.json` only. Studio never asks Nexus for the installer. */
export const scoutManifestUrl = () =>
  String(import.meta.env.VITE_SCOUT_MANIFEST_URL || '').trim() || DEFAULT_SCOUT_MANIFEST

export const usesWebProxy = () => {
  if (typeof window === 'undefined' || isElectronRuntime()) return false
  if (import.meta.env.VITE_NEXUS_URL) return false
  return import.meta.env.DEV
}

export const getBaseUrl = () => {
  if (usesWebProxy()) return ''
  return nexusOrigin()
}

export const getWsUrl = () => {
  if (usesWebProxy()) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}/ws`
  }
  const origin = nexusOrigin()
  if (origin.startsWith('https://')) return `wss://${origin.slice('https://'.length)}/ws`
  if (origin.startsWith('http://')) return `ws://${origin.slice('http://'.length)}/ws`
  return `ws://${origin}/ws`
}

export const getPairedGatewayDisplay = () => ''
export const savePairedGateway = () => {}
export const clearPairedGateway = () => {}

export const initServiceConfig = async () => nexusOrigin()

export const pingServer = async (timeoutMs = 800) => {
  const path = usesWebProxy() ? '/sys/server_info' : `${nexusOrigin()}/sys/server_info`
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    const response = await fetch(path, { method: 'GET', signal: controller.signal })
    clearTimeout(timeoutId)
    return response.ok || response.status === 404
  } catch {
    return false
  }
}

export const waitForServer = async ({ timeoutMs = 0, intervalMs = 600, isCancelled } = {}) => {
  const started = Date.now()
  while (!isCancelled?.()) {
    if (timeoutMs > 0 && Date.now() - started >= timeoutMs) return false
    if (await pingServer(800)) return true
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return false
}
