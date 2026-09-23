import request from '@/utils/request'
import { scoutManifestUrl } from '@/utils/config'
import { packedArchForOs, pickScoutRelease } from '@/utils/scoutRelease'

const pickData = (res) => res?.data || res || {}

export const listRuntimeNodes = (params = {}) =>
  request({ url: '/runtime/nodes', method: 'get', params })

export const sendNodeCommand = (nodeId, command, { studioId = '', reason = 'studio', timeout } = {}) =>
  request({
    url: `/runtime/nodes/${encodeURIComponent(nodeId)}/command`,
    method: 'post',
    params: studioId ? { studio_id: studioId } : {},
    data: { command, reason },
    timeout: timeout ?? (command === 'update' ? 660000 : 60000),
  })

export const getNodeWorkload = (nodeId, params = {}) =>
  request({
    url: `/runtime/nodes/${encodeURIComponent(nodeId)}/workload`,
    method: 'get',
    params,
  })

export const getNodeLogs = (nodeId, { lines = 200, studioId = '' } = {}) =>
  request({
    url: `/runtime/nodes/${encodeURIComponent(nodeId)}/logs`,
    method: 'get',
    params: { lines, ...(studioId ? { studio_id: studioId } : {}) },
    timeout: 60000,
  })

const fetchManifestJson = async (url) => {
  const load = async (target) => {
    const response = await fetch(target, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      cache: 'no-store',
    })
    if (!response.ok) {
      const err = new Error(`HTTP ${response.status}`)
      err.response = { status: response.status }
      throw err
    }
    return response.json()
  }
  if (import.meta.env.DEV) {
    try {
      return await load('/__scout_manifest')
    } catch { /* fall through to Electron / GitHub */ }
  }
  if (typeof window !== 'undefined' && window.electronAPI?.scoutFetchJson) {
    const res = await window.electronAPI.scoutFetchJson(url)
    if (!res?.ok) {
      const err = new Error(res?.error || '无法从 GitHub 拉取安装列表')
      err.response = { status: res?.status || 0 }
      throw err
    }
    return res.data
  }
  try {
    return await load(url)
  } catch (e) {
    const msg = String(e?.message || e || '')
    if (/failed to fetch/i.test(msg) || e?.name === 'TypeError') {
      throw new Error('无法从 GitHub 拉取安装列表（浏览器不能直连 GitHub，请用桌面端）')
    }
    throw e
  }
}

export const getScoutReleaseMeta = async ({ os, arch } = {}) => {
  const wantOs = os || undefined
  const wantArch = arch || (wantOs ? packedArchForOs(wantOs) : undefined)
  try {
    const res = await request({
      url: '/releases/scout/meta',
      method: 'get',
      params: {
        ...(wantOs ? { os: wantOs } : {}),
        ...(wantArch ? { arch: wantArch } : {}),
      },
    })
    return pickData(res)
  } catch (e) {
    return {
      version: '',
      packaging: false,
      manifest_ready: false,
      detail: e?.response?.data?.detail || e?.message || '',
    }
  }
}

/** @returns {{ data: object|null, packaging: boolean, version: string, error: string }} */
export const getScoutLatestRelease = async ({ os } = {}) => {
  const want = { os: os || undefined }
  const manifestUrl = scoutManifestUrl()
  if (!manifestUrl) {
    return {
      data: null,
      packaging: false,
      version: '',
      error: '未解析到 GitHub Scout manifest。本地请有 origin，或设置 VITE_SCOUT_MANIFEST_URL。',
    }
  }
  const bust = `${manifestUrl}${manifestUrl.includes('?') ? '&' : '?'}t=${Date.now()}`
  try {
    const manifest = await fetchManifestJson(bust)
    const item = pickScoutRelease(manifest, want)
    if (item?.url) {
      return {
        data: JSON.parse(JSON.stringify(item)),
        packaging: false,
        version: String(item.version || manifest.version || '').replace(/^v/i, ''),
        error: '',
      }
    }
  } catch (e) {
    const status = e?.response?.status
    const msg = e?.response?.data?.detail || e?.message || ''
    if (status !== 404 && !/HTTP 404/i.test(msg) && !/failed to fetch/i.test(msg)) {
      const meta = await getScoutReleaseMeta(want)
      if (meta.packaging && meta.version) {
        return { data: null, packaging: true, version: meta.version, error: meta.detail || '' }
      }
      return { data: null, packaging: false, version: meta.version || '', error: msg || '拉取安装包失败' }
    }
  }

  const meta = await getScoutReleaseMeta(want)
  if (meta.manifest_ready && meta.version) {
    try {
      const res = await request({
        url: '/releases/scout/latest',
        method: 'get',
        params: { os: want.os || 'darwin', arch: packedArchForOs(want.os || 'darwin') },
      })
      const row = pickData(res)
      if (row?.url) {
        return {
          data: JSON.parse(JSON.stringify(row)),
          packaging: false,
          version: String(row.version || meta.version || '').replace(/^v/i, ''),
          error: '',
        }
      }
    } catch { /* fall through */ }
  }
  if (meta.packaging && meta.version) {
    return {
      data: null,
      packaging: true,
      version: String(meta.version || '').replace(/^v/i, ''),
      error: meta.detail || 'GitHub Release 已创建，安装包仍在 CI 上传中',
    }
  }
  return {
    data: null,
    packaging: false,
    version: meta.version || '',
    error: meta.detail || 'GitHub manifest 里没有当前系统的安装包',
  }
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
  const host = typeof window !== 'undefined' ? window.electronAPI?.hostPlatform : null
  let os = 'linux'
  if (host?.os === 'win32' || host?.os === 'darwin' || host?.os === 'linux') {
    os = host.os
  } else {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
    const plat = typeof navigator !== 'undefined' ? navigator.platform || '' : ''
    if (/Mac/i.test(plat) || /Mac OS/i.test(ua)) os = 'darwin'
    else if (/Win/i.test(plat) || /Windows/i.test(ua)) os = 'win32'
  }
  return { os, arch: packedArchForOs(os) }
}
