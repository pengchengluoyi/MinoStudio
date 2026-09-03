import request from '@/utils/request'
import { scoutManifestUrl } from '@/utils/config'
import { pickScoutRelease } from '@/utils/scoutRelease'

const pickData = (res) => res?.data || res || {}

export const listRuntimeNodes = (params = {}) =>
  request({ url: '/runtime/nodes', method: 'get', params })

export const sendNodeCommand = (nodeId, command, { studioId = '', reason = 'studio' } = {}) =>
  request({
    url: `/runtime/nodes/${encodeURIComponent(nodeId)}/command`,
    method: 'post',
    params: studioId ? { studio_id: studioId } : {},
    data: { command, reason },
  })

const fetchManifestJson = async (url) => {
  if (typeof window !== 'undefined' && window.electronAPI?.scoutFetchJson) {
    const res = await window.electronAPI.scoutFetchJson(url)
    if (!res?.ok) throw new Error(res?.error || 'manifest fetch failed')
    return res.data
  }
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    const err = new Error(`HTTP ${response.status}`)
    err.response = { status: response.status }
    throw err
  }
  return response.json()
}

export const getScoutLatestRelease = async ({ os, arch } = {}) => {
  const want = { os: os || undefined, arch: arch || undefined }
  const manifestUrl = scoutManifestUrl()
  if (!manifestUrl) {
    const err = new Error('未解析到 GitHub Scout manifest。本地请有 origin，或设置 VITE_SCOUT_MANIFEST_URL。')
    err.response = { status: 404, data: { detail: err.message } }
    throw err
  }
  const manifest = await fetchManifestJson(manifestUrl)
  const item = pickScoutRelease(manifest, want)
  if (!item?.url) {
    const err = new Error('GitHub manifest 里没有当前系统的安装包')
    err.response = { status: 404, data: { detail: err.message } }
    throw err
  }
  return { data: item }
}

export const createScoutInstallToken = () =>
  request({ url: '/runtime/nodes/install-token', method: 'post' })

export const parseRuntimeNodes = (res) => {
  const data = pickData(res)
  if (Array.isArray(data)) return data
  if (Array.isArray(data.nodes)) return data.nodes
  if (Array.isArray(data.items)) return data.items
  if (Array.isArray(data.executors)) return data.executors
  return []
}

export const detectClientPlatform = () => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
  const plat = typeof navigator !== 'undefined' ? navigator.platform || '' : ''
  let os = 'linux'
  if (/Mac/i.test(plat) || /Mac OS/i.test(ua)) os = 'darwin'
  else if (/Win/i.test(plat) || /Windows/i.test(ua)) os = 'win32'
  const arch = /arm|aarch64/i.test(ua) || /ARM/i.test(plat) ? 'arm64' : 'x64'
  return { os, arch }
}
