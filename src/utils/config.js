const DEFAULT_NEXUS = 'http://mino.local:10104'

export const isElectronRuntime = () => typeof window !== 'undefined' && !!window.electronAPI

export const nexusOrigin = () => {
  const baked = String(import.meta.env.VITE_NEXUS_URL || '').trim().replace(/\/$/, '')
  return baked || DEFAULT_NEXUS
}

/** GitHub Release `manifest.json` only. Studio never asks Nexus for the installer. */
export const scoutManifestUrl = () =>
  String(import.meta.env.VITE_SCOUT_MANIFEST_URL || '').trim()

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
