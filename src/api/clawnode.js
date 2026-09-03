import { sendWsRequest, wsUploadFile } from '@/api/mWebSocket'
import request from '@/utils/request'
import { getBaseUrl } from '@/utils/config'

export const adoptClawNode = (sn, gatewayHost, extra = {}) => {
  return sendWsRequest('adopt_clawnode', {
    sn,
    host: gatewayHost,
    ip: extra.ip,
    model: extra.model,
    pair_port: extra.pair_port || 10105,
  })
}

export const fetchClawNodeLogs = (sn, { minutes = 5 } = {}) => {
  return sendWsRequest('fetch_clawnode_logs', { sn, minutes }, { timeout: 30000 }).catch((err) => {
    const raw = err?.msg || err?.message || '拉取日志失败'
    if (raw === 'device offline or not clawnode') {
      throw new Error('设备离线或未通过 ClawNode 连接')
    }
    throw new Error(raw)
  })
}

export const listClawNodeLogs = () => {
  return request({ url: '/api/clawnode/logs', method: 'get' })
}

export const listClawNodeScripts = () => {
  return request({ url: '/api/clawnode/scripts', method: 'get' })
}

export const downloadClawNodeLogUrl = (filename, prefix = 'download') => {
  const safePrefix = String(prefix || '').trim().replace(/^\/+|\/+$/g, '') || 'download'
  return `${getBaseUrl()}/api/clawnode/${safePrefix}/${encodeURIComponent(filename)}`
}

export const fetchLogFileContent = async (filename) => {
  const res = await fetch(downloadClawNodeLogUrl(filename))
  if (!res.ok) throw new Error(`读取日志失败 (${res.status})`)
  return res.text()
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const copyTextToClipboard = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  throw new Error('当前环境不支持剪贴板写入')
}

/** 拉取设备日志并复制到剪贴板，等待设备 HTTP 上传完成 */
export const pullClawNodeLogsToClipboard = async (sn, { minutes = 5, timeoutMs = 90000, intervalMs = 1000 } = {}) => {
  const deviceSn = String(sn || '').trim()
  const startedAt = Date.now() / 1000 - 1
  await fetchClawNodeLogs(deviceSn, { minutes })

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await sleep(intervalMs)
    const res = await listClawNodeLogs()
    const items = res?.data || []
    const candidates = items.filter((item) => {
      const itemSn = String(item.sn || '').trim()
      return itemSn === deviceSn && Number(item.mtime || 0) >= startedAt
    })
    if (candidates.length > 0) {
      const latest = candidates.sort((a, b) => b.mtime - a.mtime)[0]
      const content = await fetchLogFileContent(latest.filename)
      await copyTextToClipboard(content)
      return { filename: latest.filename, size: latest.size, contentLength: content.length }
    }
  }
  throw new Error('等待设备上传日志超时，请稍后重试')
}

export const unbindClawNode = (sn) => {
  return sendWsRequest('unbind_clawnode', { sn })
}

export const formatLogSize = (bytes) => {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * 上传本地 APK（来自桌面端本地磁盘或已挂载的 SMB 卷），供后续通过 ClawNode INSTALL_APK 下发。
 *
 * 策略：
 * 1. 优先尝试后端专用 REST 接口 POST /api/clawnode/apks（multipart），如果后端已实现会直接返回可下载 URL。
 * 2. 如果 404（后端尚未实现），则回退使用现有的 WebSocket 'upload' 机制上传 base64 文件。
 *    上传成功后，前端构造一个 ClawNode 可下载的 URL（约定路径 /api/clawnode/apks/<name>）。
 *
 * 注意：无论哪种方式，**后端都需要确保设备能通过 HTTP GET 该 URL 下载到 APK**。
 * 推荐后端实现：
 *   - 接收上传后把文件放到可静态访问的位置
 *   - 暴露 GET /api/clawnode/apks/:filename （或复用现有的 clawnode 文件服务）
 *
 * 返回：{ url: 'http://.../api/clawnode/apks/xxx.apk', filename: 'xxx.apk' }
 */
export const uploadApkForClawInstall = async (file) => {
  const safeName = file.name || 'install.apk'

  // 尝试 1: 专用 HTTP 上传端点（当后端实现后最干净）
  try {
    const formData = new FormData()
    formData.append('file', file, safeName)

    const res = await request({
      url: '/api/clawnode/apks',
      method: 'post',
      data: formData,
      // 注意：使用 FormData 时不要手动设置 Content-Type，让 axios/browser 自动带 boundary
      timeout: 300000
    })

    // 优先用 server 给的 device_url（它是用 LAN IP 构造的，设备能直接连）
    let url = res?.device_url || res?.download_url || res?.url || res?.data?.url || res?.path
    const filename = res?.filename || res?.apk || res?.data?.filename || safeName

    if (url) {
      // 只有相对路径才补全；如果是 server 已经给的完整 device_url（http://192...），就直接用
      if (url.startsWith('/')) {
        url = `${getBaseUrl().replace(/\/$/, '')}${url}`
      }
      return { url, filename }
    }
  } catch (err) {
    const status = err?.response?.status
    if (status !== 404) {
      // 其他错误（网络、超时、权限等）直接抛出
      throw err
    }
    // 404 说明后端还没加 /api/clawnode/apks，走 fallback
    console.warn('[uploadApkForClawInstall] /api/clawnode/apks 返回 404，使用 WebSocket upload 回退')
  }

  // 尝试 2: 使用项目已有的 WebSocket 通用上传（content 为 base64）
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // data:application/vnd.android.package-archive;base64,XXXX  -> 只取 XXXX
      const result = reader.result || ''
      const commaIndex = result.indexOf(',')
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const uploadRes = await wsUploadFile(safeName, base64)

  // 优先使用后端返回的 url（wsFile 返回 /static/xxx）
  let url = uploadRes?.url || uploadRes?.data?.url || uploadRes?.download_url
  const filename = uploadRes?.filename || uploadRes?.data?.filename || safeName

  if (url) {
    if (url.startsWith('/')) {
      url = `${getBaseUrl().replace(/\/$/, '')}${url}`
    }
  } else {
    // 兜底：构造时也尽量用非 localhost 的地址（最终 server send_command 还会再 rewrite 一次）
    const base = getBaseUrl().replace(/\/$/, '')
    // 如果当前 base 是 localhost，尝试用 window 实际 host（如果不是 loopback）
    let effectiveBase = base
    try {
      const h = window.location.hostname
      if (h && h !== '127.0.0.1' && h !== 'localhost' && !h.startsWith('127.')) {
        effectiveBase = `${window.location.protocol}//${h}:${window.location.port || 10104}`
      }
    } catch {}
    url = `${effectiveBase}/api/clawnode/apks/${encodeURIComponent(safeName)}`
  }

  return { url, filename }
}
