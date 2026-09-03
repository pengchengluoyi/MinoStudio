const BRAND_TOKENS = new Set([
  'MOTOROLA', 'MOTO', 'XIAOMI', 'REDMI', 'SAMSUNG', 'HUAWEI', 'HONOR',
  'GOOGLE', 'ONEPLUS', 'OPPO', 'VIVO', 'REALME', 'ANDROID', 'IPHONE', 'APPLE',
])

function normalizeModel(model) {
  if (!model) return ''
  const text = String(model).trim().toUpperCase().replace(/[^A-Z0-9]+/g, ' ')
  const tokens = text.split(/\s+/).filter(Boolean)
  if (!tokens.length) return ''

  const series = new Set()
  for (const tok of tokens) {
    if (/^[A-Z]{1,4}\d{2,}[A-Z0-9]*$/.test(tok)) series.add(tok)
    else if (/^\d{5,}[A-Z0-9]*$/.test(tok)) series.add(tok)
  }
  if (series.size) return [...series].sort().join('|')

  const rest = tokens.filter((t) => !BRAND_TOKENS.has(t) && t.length >= 2)
  return (rest.length ? rest : tokens).join(' ')
}

function canonicalDeviceKey(device) {
  const sn = String(device?.sn || '').trim()
  const alt = String(device?.claw_sn || device?.node_sn || '').trim()
  if (sn.startsWith('claw-')) return sn
  if (alt.startsWith('claw-')) return alt
  if (sn && alt && sn.toLowerCase() === alt.toLowerCase()) return sn
  return sn || alt
}

function isClawDirect(device) {
  const sn = String(device?.sn || '')
  return sn.startsWith('claw-') || String(device?.type || '').toLowerCase() === 'android_direct'
}

function isMobileDevice(device) {
  const type = String(device?.type || '').toLowerCase()
  return ['android', 'ios', 'mobile', 'android_direct'].includes(type)
}

export function isLegacyWebSlot(sn) {
  const s = String(sn || '').toLowerCase()
  return s === 'web-local' || s === 'web_local'
}

const EXPLICIT_OFFLINE = new Set(['disconnected', 'offline', 'unauthorized', 'unavailable'])

function hasExplicitOfflineChannel(device) {
  const ch = device?.channels && typeof device.channels === 'object' ? device.channels : {}
  return ['adb', 'adb_state', 'playwright', 'playwright_state', 'remote', 'remote_state', 'ios', 'ios_state']
    .some((key) => EXPLICIT_OFFLINE.has(String(ch[key] || '').toLowerCase()))
}

/** 合并 USB hub 与 ClawNode WS 重复条目（客户端兜底，与服务端 dedupe 一致）。
 *  只丢掉 leftover `web-local`；真实 SN（含 ADB offline）必须留下。 */
export function dedupeDevicesForUi(list) {
  const devices = (Array.isArray(list) ? list : []).filter((d) => !isLegacyWebSlot(d?.sn))
  const clawsByModel = new Map()
  const clawsByIp = new Map()

  for (const device of devices) {
    if (!isClawDirect(device)) continue
    const modelKey = normalizeModel(device.model)
    if (modelKey) clawsByModel.set(modelKey, device)
    const ip = String(device.ip || '').trim()
    if (ip && ip.toUpperCase() !== 'USB') clawsByIp.set(ip, device)
  }

  const skipSns = new Set()
  for (const device of devices) {
    if (String(device.type || '').toLowerCase() !== 'android' || device.role !== 'hub') continue
    const modelKey = normalizeModel(device.model)
    const ip = String(device.ip || '').trim()
    if (modelKey && clawsByModel.has(modelKey)) skipSns.add(device.sn)
    else if (ip && clawsByIp.has(ip)) skipSns.add(device.sn)
  }

  const filtered = devices.filter((device) => !skipSns.has(device.sn))
  const byKey = new Map()
  for (const device of filtered) {
    const key = canonicalDeviceKey(device)
    if (!key) {
      byKey.set(`__${Math.random()}`, device)
      continue
    }
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, device)
      continue
    }
    const score = (d) => {
      let s = 0
      if (d.status === 'online') s += 4
      if (String(d.sn || '').startsWith('claw-')) s += 2
      if (d.app_version) s += 1
      return s
    }
    byKey.set(key, score(device) >= score(prev) ? device : prev)
  }
  return [...byKey.values()]
}

/** 运行状态页：按接入顺序稳定排序，避免 last_online 秒级刷新导致列表跳动 */
const displayOrderBySn = new Map()
let displayOrderSeq = 1

/**
 * 在线设备按接入顺序展示；离线后重新上线则移到在线组末尾。
 * @param {Array} nextList 本次设备列表
 * @param {Array} previousList 上一帧列表（用于检测 offline→online）
 */
export function applyStableDeviceOrder(nextList, previousList = []) {
  const list = Array.isArray(nextList) ? [...nextList] : []
  const prevStatus = new Map(
    (Array.isArray(previousList) ? previousList : []).map((d) => [String(d?.sn || ''), d?.status]),
  )

  for (const device of list) {
    const sn = String(device?.sn || '').trim()
    if (!sn || displayOrderBySn.has(sn)) continue
    displayOrderBySn.set(sn, displayOrderSeq++)
  }

  for (const device of list) {
    const sn = String(device?.sn || '').trim()
    if (!sn) continue
    const isOnline = device.status === 'online'
    const wasOnline = prevStatus.get(sn) === 'online'
    if (isOnline && prevStatus.has(sn) && !wasOnline) {
      displayOrderBySn.set(sn, displayOrderSeq++)
    }
  }

  return list.sort((a, b) => {
    const aOnline = a.status === 'online'
    const bOnline = b.status === 'online'
    if (aOnline !== bOnline) return aOnline ? -1 : 1
    const ao = displayOrderBySn.get(String(a?.sn || '')) ?? 0
    const bo = displayOrderBySn.get(String(b?.sn || '')) ?? 0
    return ao - bo
  })
}

/** @deprecated 请用 applyStableDeviceOrder；保留兼容，不再按 last_online 排序 */
export function sortDevicesForDisplay(list) {
  return applyStableDeviceOrder(list, [])
}

/** WS 短暂断连时避免 UI 秒级闪烁 offline（与服务端 180s 宽限配合，客户端先 hold 90s） */
const onlineGraceUntilBySn = new Map()
const ONLINE_UI_GRACE_MS = 90_000

export function applyOnlineStatusGrace(nextList, previousList = []) {
  const now = Date.now()
  const prevBySn = new Map(
    (Array.isArray(previousList) ? previousList : []).map((d) => [String(d?.sn || ''), d]),
  )

  return (Array.isArray(nextList) ? nextList : []).map((device) => {
    const sn = String(device?.sn || '').trim()
    if (!sn) return device

    if (hasExplicitOfflineChannel(device)) {
      onlineGraceUntilBySn.delete(sn)
      return device
    }

    if (device.status === 'online') {
      onlineGraceUntilBySn.set(sn, now + ONLINE_UI_GRACE_MS)
      return device
    }

    const graceUntil = onlineGraceUntilBySn.get(sn) || 0
    const prev = prevBySn.get(sn)
    if (prev?.status === 'online' && now < graceUntil) {
      return { ...device, status: 'online' }
    }

    onlineGraceUntilBySn.delete(sn)
    return device
  })
}

/** 对话/执行场景可选设备：在线移动设备，已去重 */
export function selectableExecutionDevices(list) {
  const deduped = dedupeDevicesForUi(list)
  return deduped.filter((device) => {
    if (device.status !== 'online') return false
    if (!isMobileDevice(device)) return false
    if (device.type === 'pc') return false
    if (device.role === 'node' && !isClawDirect(device)) return false
    return true
  })
}

export function pickDefaultDeviceSn(devices) {
  const direct = devices.find((d) => isClawDirect(d))
  if (direct) return direct.sn
  const android = devices.find((d) => String(d.type || '').toLowerCase().includes('android'))
  return (android || devices[0])?.sn || ''
}
