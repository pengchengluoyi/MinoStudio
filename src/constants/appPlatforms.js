/** 应用覆盖端：创建、展示、判断是否支持某端 */

export const MOBILE_CANONICAL = 'Mobile'
export const MOBILE_PARTS = ['Android', 'iOS']

/** 创建应用时的平台卡片（featured 占两列） */
export const APP_PLATFORM_OPTIONS = [
  { label: '移动端', value: MOBILE_CANONICAL, desc: 'Android + iOS 双端共用', icon: '📱', featured: true },
  { label: 'Web', value: 'Web', desc: '浏览器 / H5', icon: '🌐' },
  { label: 'Windows', value: 'Windows', desc: '桌面客户端', icon: '🪟' },
  { label: 'Mac', value: 'Mac', desc: '桌面客户端', icon: '🍎' },
]

/** 仅需单端时展开（高级） */
export const APP_PLATFORM_OPTIONS_ADVANCED = [
  { label: '仅 Android', value: 'Android', icon: '🤖' },
  { label: '仅 iOS', value: 'iOS', icon: '🍏' },
]

const ICON_MAP = {
  Windows: '🪟',
  Mac: '🍎',
  Mobile: '📱',
  Android: '🤖',
  iOS: '🍏',
  Web: '🌐',
}

/** 解析 DB / API 中的 platforms 字符串或数组 */
export function normalizePlatforms(platforms) {
  if (Array.isArray(platforms)) {
    return platforms.map((p) => String(p).trim()).filter(Boolean)
  }
  if (typeof platforms === 'string') {
    return platforms.split(',').map((p) => p.trim()).filter(Boolean)
  }
  return []
}

/** Mobile → Android + iOS，用于能力判断、环境字段等 */
export function expandPlatforms(platforms) {
  const raw = normalizePlatforms(platforms)
  const out = []
  for (const p of raw) {
    if (p === MOBILE_CANONICAL) {
      out.push(...MOBILE_PARTS)
    } else {
      out.push(p)
    }
  }
  return [...new Set(out)]
}

/** 若同时勾了 Android+iOS，展示/存储时收敛为 Mobile */
export function collapsePlatforms(list) {
  const raw = normalizePlatforms(list)
  const set = new Set(raw)
  const hasAndroid = set.has('Android')
  const hasIos = set.has('iOS')
  if (set.has(MOBILE_CANONICAL) || (hasAndroid && hasIos)) {
    set.delete('Android')
    set.delete('iOS')
    set.add(MOBILE_CANONICAL)
  }
  return [...set]
}

/** 创建应用：单选覆盖端 → 规范为 0/1 个平台值 */
export function serializePlatformSelection(selected) {
  if (!selected) return []
  const list = typeof selected === 'string' ? [selected] : normalizePlatforms(selected)
  const collapsed = collapsePlatforms(list)
  return collapsed.length ? [collapsed[0]] : []
}

export function platformIncludes(platforms, name) {
  const key = String(name).toLowerCase()
  return expandPlatforms(platforms).some((p) => p.toLowerCase() === key)
}

export function getPlatformIcon(platform) {
  if (!platform) return '📱'
  const collapsed = collapsePlatforms([platform])
  const p = collapsed[0] || platform
  return ICON_MAP[p] || '📱'
}

/** 卡片上展示的端标签（已收敛 Mobile） */
export function formatPlatformTags(platforms) {
  const collapsed = collapsePlatforms(platforms)
  return collapsed.map((p) => {
    const opt = [...APP_PLATFORM_OPTIONS, ...APP_PLATFORM_OPTIONS_ADVANCED].find((o) => o.value === p)
    return opt?.label || p
  })
}
