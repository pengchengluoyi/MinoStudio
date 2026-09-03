/** 新建执行：只保留在线且有可用通道的设备 */

const ONLINE = new Set(['connected', 'online', 'available'])
const RFC4122 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isChannelOnline(state) {
  return ONLINE.has(String(state || '').toLowerCase())
}

/** Scout 报 `adb` / `playwright`；旧 UI 认 `adb_state` / `playwright_state`。 */
function channelState(channels, ...keys) {
  const ch = channels && typeof channels === 'object' ? channels : {}
  for (const key of keys) {
    const value = ch[key]
    if (value != null && value !== '') return value
  }
  return ''
}

function iosTransportOf(device) {
  return String(device?.channels?.ios_transport || '').toLowerCase()
}

/** Leftover global Playwright slot from before per-node `web`+scout_id. */
export function isLegacyWebSlot(sn) {
  const s = String(sn || '').toLowerCase()
  return s === 'web-local' || s === 'web_local'
}

/** Playwright slot: `web` + scout_id. Leftover `web-local` is recognized only to hide it. */
function isWebSlot(sn, type) {
  const s = String(sn || '').toLowerCase()
  const t = String(type || '').toLowerCase()
  if (isLegacyWebSlot(s)) return true
  if (t === 'web' || t === 'browser' || t === 'playwright') return true
  if (s === 'web' || s.startsWith('web-')) return true
  return /^web[a-z0-9]+$/.test(s)
}

/**
 * @param {object} device listCaseRunnerDevices item
 * @returns {{ ok: boolean, channel: string, label: string }}
 */
export function deviceExecChannel(device) {
  const ch = device?.channels || {}
  const type = String(device?.device_type || device?.type || '').toLowerCase()
  const status = String(device?.status || '').toLowerCase()
  const sn = String(device?.sn || '').toLowerCase()
  const iosTransport = iosTransportOf(device)

  if (isLegacyWebSlot(sn)) {
    return { ok: false, channel: '', label: '' }
  }

  const playwright = channelState(ch, 'playwright_state', 'playwright')
  if (isChannelOnline(playwright) || isWebSlot(sn, type)) {
    return { ok: isChannelOnline(playwright), channel: 'playwright', label: '浏览器' }
  }
  if (isChannelOnline(channelState(ch, 'ios_state', 'ios')) || (status === 'online' && (type.includes('ios') || type.includes('iphone') || type.includes('ipad')))) {
    const via = iosTransport === 'wifi'
      ? 'ios/wifi'
      : iosTransport === 'usb'
        ? 'ios/usb'
        : iosTransport === 'simulator'
          ? 'ios/simulator'
          : 'ios'
    return { ok: true, channel: 'ios', label: via }
  }
  if (isChannelOnline(channelState(ch, 'adb_state', 'adb'))) {
    return { ok: true, channel: 'adb', label: 'adb' }
  }
  if (isChannelOnline(channelState(ch, 'remote_state', 'remote'))) {
    return { ok: true, channel: 'remote', label: '远程设备' }
  }
  return { ok: false, channel: '', label: '' }
}

export function filterExecutableDevices(devices = []) {
  return (devices || [])
    .map((d) => {
      const sn = String(d.sn || '')
      if (isLegacyWebSlot(sn)) return null
      const isSimulator = iosTransportOf(d) === 'simulator'
      // CoreDevice _remotepairing 也是 UUID，只放过 simctl 注册的模拟器
      if (RFC4122.test(sn.replace(/^ios-wifi-/i, '')) && !isSimulator) return null
      const meta = deviceExecChannel(d)
      return meta.ok ? { ...d, execChannel: meta.label } : null
    })
    .filter(Boolean)
}

import { shortTaskId } from '@/utils/testingTasks'

const GENERIC_MODEL = /^(ios|iphone|ipad|ios device|device|apple)$/i

function channelKindLabel(ch) {
  const s = String(ch || '').toLowerCase()
  if (s.includes('wifi')) return 'Wi‑Fi'
  if (s.includes('usb')) return 'USB'
  if (s.includes('simulator')) return '模拟器'
  if (s.includes('ios')) return 'iOS'
  if (s === 'adb') return 'Android'
  if (s.includes('claw') || s.includes('remote')) return '远程设备'
  if (s.includes('playwright') || s.includes('browser') || s.includes('浏览器')) return '浏览器'
  return s || '设备'
}

export function devicePrimaryName(device) {
  const sn = String(device?.sn || '').trim()
  const rawName = String(device?.name || device?.device_name || '').trim()
  if (rawName && rawName !== sn) return rawName
  const rawModel = String(device?.model || '').trim()
  if (rawModel && !GENERIC_MODEL.test(rawModel) && rawModel !== sn) return rawModel
  const iosName = String(device?.channels?.ios_name || '').trim()
  if (iosName && iosName !== sn) return iosName
  if (sn.startsWith('ios-wifi-')) {
    const tail = sn.slice('ios-wifi-'.length)
    if (tail && !/^[0-9a-f-]{20,}$/i.test(tail)) return tail
  }
  const type = String(device?.device_type || device?.type || '').toLowerCase()
  if (isWebSlot(sn, type)) {
    return '本机浏览器'
  }
  return shortTaskId(sn) || '未命名设备'
}

export function formatDeviceTag(device) {
  const ch = device.execChannel || deviceExecChannel(device).label || '?'
  return `${devicePrimaryName(device)} · ${channelKindLabel(ch)}`
}

export function formatDeviceOption(device) {
  const busy = device.busy_task_id ? ` · 占用中 ${shortTaskId(device.busy_task_id)}` : ''
  return `${formatDeviceTag(device)}${busy}`
}

export function formatDeviceMeta(device) {
  const ch = device?.execChannel || deviceExecChannel(device).label || ''
  const sn = String(device?.sn || '').trim()
  return [ch, sn].filter(Boolean).join(' · ')
}
