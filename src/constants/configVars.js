/** Workflow 节点可引用的长期配置变量（Run 时从服务端加载） */

export const CONFIG_ENV_FIELDS = ['target_mobile', 'target_web', 'target_pc']

export const CONFIG_VAR_CATALOG = [
  { key: 'app.mobile.target', label: '移动端（自动）', group: '项目环境', platforms: ['mobile'] },
  { key: 'app.android.package', label: 'Android 包名', group: '项目环境', platforms: ['android'] },
  { key: 'app.ios.bundle', label: 'iOS Bundle ID', group: '项目环境', platforms: ['ios'] },
  { key: 'app.web.base_url', label: 'Web 根地址', group: '项目环境', platforms: ['web'] },
  { key: 'device.password', label: '设备解锁密码', group: '设备', platforms: [] },
  { key: 'device.sn', label: '设备 SN', group: '设备', platforms: [] }
]

const MOBILE_CONFIG_KEYS = ['app.android.package', 'app.ios.bundle']

const LABEL_MAP = Object.fromEntries(CONFIG_VAR_CATALOG.map(v => [v.key, v.label]))

/** 统一 platform 字段大小写（schema 为 android/ios，旧数据可能为 Android/iOS） */
export function normalizePlatformKey(platform) {
  const p = String(platform || '').trim().toLowerCase()
  if (p === 'ios') return 'ios'
  if (p === 'android') return 'android'
  if (p === 'mobile') return 'mobile'
  if (p === 'web') return 'web'
  if (p === 'windows') return 'windows'
  if (p === 'mac') return 'mac'
  return ''
}

export function configVarLabel(key) {
  return LABEL_MAP[key] || key
}

export function wrapConfigVar(key) {
  return `{{${key}}}`
}

/** target_mobile 可选的项目环境变量 */
export function getMobileConfigVars(platform) {
  const p = normalizePlatformKey(platform)
  if (p === 'mobile') {
    return CONFIG_VAR_CATALOG.filter((v) => v.key === 'app.mobile.target')
  }
  const mobile = CONFIG_VAR_CATALOG.filter((v) =>
      ['app.android.package', 'app.ios.bundle'].includes(v.key)
  )
  if (p === 'ios') {
    return [...mobile].sort((a, b) => (a.key.includes('ios') ? -1 : 1))
  }
  if (p === 'android') {
    return [...mobile].sort((a, b) => (a.key.includes('android') ? -1 : 1))
  }
  return mobile
}

/** 某字段 + 当前 platform 下的推荐变量 */
export function getConfigVarsForField(fieldName, platform) {
  if (fieldName === 'target_mobile') {
    return getMobileConfigVars(platform)
  }
  if (fieldName === 'target_web') {
    return CONFIG_VAR_CATALOG.filter(v => v.key === 'app.web.base_url')
  }
  if (fieldName === 'target_pc') {
    return []
  }
  return CONFIG_VAR_CATALOG
}

const ENV_PLACEHOLDER_KEYS = new Set([
  'app.mobile.target',
  'app.android.package',
  'app.ios.bundle',
  'app.web.base_url',
])

/** 按节点 platform 返回默认项目环境占位符 */
export function getDefaultEnvVarKey(fieldName, platform) {
  const p = normalizePlatformKey(platform)
  if (fieldName === 'target_mobile') {
    if (p === 'mobile') return 'app.mobile.target'
    if (p === 'ios') return 'app.ios.bundle'
    if (p === 'android') return 'app.android.package'
    return null
  }
  if (fieldName === 'target_web' && p === 'web') return 'app.web.base_url'
  return null
}

export function getDefaultEnvVarValue(fieldName, platform) {
  const key = getDefaultEnvVarKey(fieldName, platform)
  return key ? wrapConfigVar(key) : ''
}

export function isKnownEnvPlaceholder(val) {
  const key = parseConfigVarValue(val)
  return key ? ENV_PLACEHOLDER_KEYS.has(key) : false
}

/** 是否应视为「跟随项目环境」（空值、或仍为环境占位符） */
export function shouldUseProjectEnv(val) {
  if (val === undefined || val === null || val === '') return true
  return isKnownEnvPlaceholder(val)
}

export function envTargetSummary(fieldName, platform) {
  const p = normalizePlatformKey(platform)
  if (fieldName === 'target_mobile') {
    if (p === 'mobile') {
      return '移动端 · Run 时按设备自动选 Android 包名或 iOS Bundle'
    }
    if (p === 'ios') return 'iOS Bundle · 随运行环境解析'
    if (p === 'android') return 'Android 包名 · 随运行环境解析'
    return '请先选择目标平台'
  }
  if (fieldName === 'target_web') {
    if (p === 'web') return 'Web 根地址 · 随运行环境解析'
    return '请先选择 Web 平台'
  }
  return '项目环境'
}

export function targetMobileFieldHint(platform) {
  const p = normalizePlatformKey(platform)
  if (p === 'mobile') return '默认双端：Run 时在 Android 设备用包名、iOS 设备用 Bundle'
  if (p === 'ios') return '默认使用项目环境中的 iOS Bundle'
  if (p === 'android') return '默认使用项目环境中的 Android 包名'
  return '选择平台后自动关联项目环境'
}

export function targetWebFieldHint() {
  return '默认使用项目环境中的 Web 根地址'
}

export function targetMobilePlaceholder(platform) {
  return '自定义包名或 Bundle，如 com.other.app'
}

export function targetWebPlaceholder() {
  return '自定义 URL，如 https://staging.example.com'
}

/** platform 变更时：若仍在跟随项目环境，则切换占位符 */
export function resolveEnvTargetOnPlatformChange(currentVal, fieldName, platform) {
  if (!shouldUseProjectEnv(currentVal)) return currentVal
  return getDefaultEnvVarValue(fieldName, platform) || currentVal || ''
}

export function isConfigEnvField(fieldName) {
  if (!fieldName) return false
  const base = fieldName.includes('[') ? fieldName.split('[')[0] : fieldName
  return CONFIG_ENV_FIELDS.includes(base)
}

export function parseConfigVarValue(val) {
  if (typeof val !== 'string') return null
  const m = val.match(/^\{\{([^{}]+)\}\}$/)
  return m ? m[1].trim() : null
}

export function displayConfigOrNodeVar(val, allNodes = []) {
  if (!val) return ''
  const cfgKey = parseConfigVarValue(val)
  if (cfgKey) {
    return configVarLabel(cfgKey) !== cfgKey
        ? `${configVarLabel(cfgKey)} · ${cfgKey}`
        : cfgKey
  }
  const match = val.match(/^\{\{(.+?)\.(.+?)\}\}$/)
  if (!match) return val
  const nodeId = match[1]
  const varKey = match[2]
  const targetNode = allNodes.find(n => n.id === nodeId)
  return targetNode ? `${targetNode.label}.${varKey}` : `${nodeId}.${varKey}`
}
