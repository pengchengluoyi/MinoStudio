export const ENV_PROFILES = [
  { key: 'dev', label: '开发' },
  { key: 'test', label: '测试' },
  { key: 'pre', label: '预发' },
  { key: 'prod', label: '正式' },
]

export const ENV_KEYS = ENV_PROFILES.map((p) => p.key)

export const CHANNEL_KINDS = [
  { id: 'app', label: 'App' },
  { id: 'web', label: 'Web' },
  { id: 'server', label: 'Server' },
]

export const DEFAULT_CHANNELS = [
  { id: 'android', kind: 'app', platform: 'android', alias: '', third_party: false, label: '安卓', field: 'package', placeholder: 'com.example.app' },
  { id: 'ios', kind: 'app', platform: 'ios', alias: '', third_party: false, label: 'iOS', field: 'bundle', placeholder: 'com.example.app' },
  { id: 'web', kind: 'web', platform: 'web', alias: '', third_party: false, label: 'Web', field: 'base_url', placeholder: 'https://test.example.com' },
  { id: 'pc', kind: 'app', platform: 'pc', alias: '', third_party: false, label: 'PC', field: 'path', placeholder: '安装路径或启动命令' },
  { id: 'mac', kind: 'app', platform: 'mac', alias: '', third_party: false, label: 'Mac', field: 'bundle', placeholder: 'com.example.desktop' },
  { id: 'server', kind: 'server', platform: 'server', alias: '', third_party: false, label: 'Server', field: 'base_url', placeholder: 'https://api.example.com' },
]

export const APP_PLATFORMS = DEFAULT_CHANNELS.filter((c) => c.kind === 'app')

const PRESET_BY_ID = Object.fromEntries(DEFAULT_CHANNELS.map((c) => [c.id, c]))

function inferKindPlatform(id, kind, platform) {
  const k = String(kind || '').trim().toLowerCase()
  const p = String(platform || '').trim().toLowerCase()
  if (['app', 'web', 'server'].includes(k) && PRESET_BY_ID[p]) return { kind: k, platform: p }
  if (PRESET_BY_ID[p]) return { kind: PRESET_BY_ID[p].kind, platform: PRESET_BY_ID[p].platform }
  if (PRESET_BY_ID[id]) return { kind: PRESET_BY_ID[id].kind, platform: PRESET_BY_ID[id].platform }
  const prefixes = [
    ['android', 'app', 'android'],
    ['ios', 'app', 'ios'],
    ['pc', 'app', 'pc'],
    ['mac', 'app', 'mac'],
    ['server', 'server', 'server'],
    ['web', 'web', 'web'],
  ]
  for (const [prefix, pk, pp] of prefixes) {
    if (id === prefix || String(id).startsWith(`${prefix}-`) || String(id).startsWith(`${prefix}.`)) return { kind: pk, platform: pp }
  }
  if (['app', 'web', 'server'].includes(k)) {
    return { kind: k, platform: k === 'app' ? 'android' : k }
  }
  return { kind: 'web', platform: 'web' }
}

export function channelTitle(ch) {
  const alias = String(ch?.alias || '').trim()
  if (alias) return alias
  return String(ch?.label || ch?.id || '').trim()
}

/** 跑批 / 用例「端」唯一键：channel.id（如 web、web.cn、android） */
export function channelSurfaceKey(ch) {
  return String(ch?.id || '').trim()
}

/** 新建执行：设备列表按被测应用筛选用 */
export function channelRunDeviceKind(ch) {
  if (!ch || typeof ch !== 'object') return ''
  const kind = String(ch.kind || '').toLowerCase()
  const plat = String(ch.platform || '').toLowerCase()
  if (kind === 'web' || plat === 'web') return 'web'
  if (plat === 'ios') return 'ios'
  if (kind === 'app' || plat === 'android') return 'android'
  return plat || kind || ''
}

export function channelKindText(ch) {
  const kind = CHANNEL_KINDS.find((k) => k.id === ch?.kind)
  const plat = DEFAULT_CHANNELS.find((c) => c.id === ch?.platform)
  const bits = []
  if (ch?.third_party || ch?.alias) bits.push('三方')
  if (kind) bits.push(kind.label)
  if (ch?.kind === 'app' && plat) bits.push(plat.label)
  return bits.join(' · ')
}

export function normalizeChannel(raw, seen) {
  const alias = String(raw?.alias || '').trim().slice(0, 24)
  const thirdParty = raw?.third_party == null ? Boolean(alias) : Boolean(raw.third_party)
  let id = slugEnvKey(raw?.id || raw?.key, '')
  const inferred = inferKindPlatform(id, raw?.kind, raw?.platform)
  const preset = PRESET_BY_ID[inferred.platform] || PRESET_BY_ID[id]
  if (id && seen.has(id)) return null
  if (!id && !alias && preset && !seen.has(preset.id)) id = preset.id
  if (!id) {
    const aliasSlug = slugEnvKey(alias, '')
    id = aliasSlug && aliasSlug !== inferred.platform ? `${inferred.platform}.${aliasSlug}` : (aliasSlug || inferred.platform)
    let n = 2
    const stem = id
    while (seen.has(id)) {
      id = `${stem}-${n}`
      n += 1
    }
  }
  if (!id || seen.has(id)) return null
  seen.add(id)
  const field = slugEnvKey(raw?.field || preset?.field || 'value', 'value')
  let label = String(raw?.label || alias || preset?.label || id).trim() || id
  if (!alias && preset && (label === id || label === preset.id)) label = preset.label
  const appIdentifier = String(raw?.app_identifier || '').trim() || (alias ? slugEnvKey(alias, '') : '')
  return {
    id,
    kind: inferred.kind,
    platform: inferred.platform,
    alias,
    app_identifier: appIdentifier,
    third_party: thirdParty,
    label: alias || label,
    field: field || preset?.field || 'value',
    placeholder: String(raw?.placeholder || preset?.placeholder || '').trim(),
  }
}

export const DEFAULT_ENVIRONMENTS = [
  { key: 'test', label: '测试' },
  { key: 'pre', label: '预发' },
  { key: 'prod', label: '正式' },
]

const OTP_MODES = new Set(['auto', 'fixed', 'gmail', 'hitl'])
const LOGIN_MODES = new Set(['auto', 'pool', 'hitl'])
const LOGIN_KINDS = new Set(['phone', 'email'])

function migrateMode(mode, allowed, fallback = 'auto') {
  const m = String(mode || '').trim().toLowerCase()
  if (m === 'adapter') return 'hitl'
  return allowed.has(m) ? m : fallback
}

export function emptyEnvSecrets() {
  return {
    otp: {
      mode: 'auto',
      fixed: '',
      from_allowlist: [],
      subject_contains: '',
      poll_interval_ms: 3000,
      max_wait_ms: 90000,
    },
    login: { mode: 'auto', kind: 'phone' },
    phone: { mode: 'auto' },
  }
}

export function normalizeEnvSecrets(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const otp = src.otp && typeof src.otp === 'object' ? src.otp : {}
  const loginSrc = src.login && typeof src.login === 'object'
    ? src.login
    : { mode: src.phone?.mode, kind: src.login_kind }
  const otpMode = migrateMode(otp.mode, OTP_MODES)
  const loginMode = migrateMode(loginSrc.mode, LOGIN_MODES)
  const loginKind = LOGIN_KINDS.has(String(loginSrc.kind || '').toLowerCase())
    ? String(loginSrc.kind).toLowerCase()
    : 'phone'
  let allow = otp.from_allowlist
  if (typeof allow === 'string') {
    allow = allow.split(',').map((s) => s.trim()).filter(Boolean)
  }
  if (!Array.isArray(allow)) allow = []
  return {
    otp: {
      mode: otpMode,
      fixed: String(otp.fixed || '').slice(0, 32),
      from_allowlist: allow.slice(0, 20).map((s) => String(s).slice(0, 120)),
      subject_contains: String(otp.subject_contains || '').slice(0, 120),
      poll_interval_ms: Math.min(30000, Math.max(1000, Number(otp.poll_interval_ms) || 3000)),
      max_wait_ms: Math.min(180000, Math.max(5000, Number(otp.max_wait_ms) || 90000)),
    },
    login: { mode: loginMode, kind: loginKind },
    phone: { mode: loginMode },
  }
}

export function normalizeGmailInbox(raw) {
  let addr = ''
  if (raw && typeof raw === 'object') {
    addr = raw.address
    if (addr && typeof addr === 'object') addr = addr.address
    addr = String(addr ?? '').trim()
  } else {
    addr = String(raw || '').trim()
  }
  if (addr.startsWith('{') && addr.includes('address')) {
    try {
      const parsed = JSON.parse(addr.replace(/'/g, '"'))
      if (parsed && typeof parsed === 'object') {
        addr = String(parsed.address || '').trim()
      }
    } catch {
      /* keep literal */
    }
  }
  return { address: addr.slice(0, 120) }
}

export function normalizeChannelSecrets(raw, channelIds, envKeys) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const chSet = new Set(channelIds || [])
  const envSet = new Set(envKeys || [])
  const out = {}
  for (const [cid, perEnv] of Object.entries(src)) {
    if (!chSet.has(cid) || !perEnv || typeof perEnv !== 'object') continue
    const row = {}
    for (const [ek, slot] of Object.entries(perEnv)) {
      if (!envSet.has(ek) || slot == null || typeof slot !== 'object') continue
      row[ek] = normalizeEnvSecrets(slot)
    }
    if (Object.keys(row).length) out[cid] = row
  }
  return out
}

const KEY_RE = /[^a-z0-9_-]+/g

export function slugEnvKey(text, fallback = 'env') {
  const s = String(text || '').trim().toLowerCase().replace(KEY_RE, '').slice(0, 24)
  return s || fallback
}

export function emptyProfile(channels = DEFAULT_CHANNELS) {
  const out = {}
  for (const ch of channels) {
    out[ch.id] = { [ch.field || 'value']: '' }
  }
  return out
}

export function emptyPlatformEnv() {
  return emptyProfile(DEFAULT_CHANNELS.filter((c) => ['android', 'ios', 'web'].includes(c.id)))
}

function asEnvDoc(raw) {
  if (raw && (raw.profiles || raw.environments || raw.channels || raw.pipeline)) return raw
  return { profiles: raw && typeof raw === 'object' ? raw : {} }
}

export function normalizeEnvDoc(raw) {
  const src = asEnvDoc(raw)
  const profilesIn = src.profiles && typeof src.profiles === 'object' ? src.profiles : {}

  const seenCh = new Set()
  let channels = []
  for (const row of (Array.isArray(src.channels) ? src.channels : [])) {
    const ch = normalizeChannel(row, seenCh)
    if (ch) channels.push(ch)
  }
  if (!channels.length) {
    const inferred = new Set()
    Object.values(profilesIn).forEach((snap) => {
      if (snap && typeof snap === 'object') {
        Object.keys(snap).forEach((k) => inferred.add(k))
      }
    })
    const want = inferred.size ? inferred : new Set(['android', 'ios', 'web'])
    channels = DEFAULT_CHANNELS.filter((c) => want.has(c.id)).map((c) => ({ ...c }))
    for (const id of want) {
      if (!channels.some((c) => c.id === id)) {
        const extra = normalizeChannel({ id, label: id, field: 'value' }, seenCh)
        if (extra) channels.push(extra)
      } else {
        seenCh.add(id)
      }
    }
  }

  let environments = (Array.isArray(src.environments) ? src.environments : [])
    .map((e) => ({
      key: slugEnvKey(e?.key || e?.id || e?.label, ''),
      label: String(e?.label || '').trim() || slugEnvKey(e?.key, '环境'),
      secrets: normalizeEnvSecrets(e?.secrets),
    }))
    .filter((e) => e.key)
  if (!environments.length) {
    const keys = Object.keys(profilesIn).length ? Object.keys(profilesIn) : ENV_KEYS
    environments = keys.map((key) => ({
      key,
      label: ENV_PROFILES.find((p) => p.key === key)?.label || key,
      secrets: emptyEnvSecrets(),
    }))
  }

  const envKeys = new Set(environments.map((e) => e.key))
  let pipeline = (Array.isArray(src.pipeline) ? src.pipeline : [])
    .map((k) => slugEnvKey(k, ''))
    .filter((k) => envKeys.has(k))
  if (!pipeline.length) {
    pipeline = ['test', 'pre', 'prod'].filter((k) => envKeys.has(k))
    if (!pipeline.length) pipeline = environments.map((e) => e.key)
  }

  let defaultProfile = slugEnvKey(src.default_profile || '', '')
  if (!envKeys.has(defaultProfile)) defaultProfile = pipeline[0] || environments[0]?.key || 'test'

  const profiles = {}
  for (const env of environments) {
    const snap = profilesIn[env.key] && typeof profilesIn[env.key] === 'object' ? profilesIn[env.key] : {}
    profiles[env.key] = emptyProfile(channels)
    for (const ch of channels) {
      const block = snap[ch.id] && typeof snap[ch.id] === 'object' ? snap[ch.id] : {}
      const val = block[ch.field] || block.value || block.package || block.bundle || block.base_url || block.path || ''
      profiles[env.key][ch.id][ch.field] = String(val || '').trim()
    }
  }

  const envKeyList = environments.map((e) => e.key)
  return {
    default_profile: defaultProfile,
    environments,
    channels,
    pipeline,
    profiles,
    gmail_inbox: normalizeGmailInbox(src.gmail_inbox),
    channel_secrets: normalizeChannelSecrets(src.channel_secrets, channels.map((c) => c.id), envKeyList),
  }
}

export function channelValue(snap, channelId, field) {
  const block = snap?.[channelId]
  if (!block || typeof block !== 'object') return ''
  return String(block[field] || block.value || block.package || block.bundle || block.base_url || block.path || '').trim()
}

export const MOBILE_CHANNEL_IDS = new Set(['android', 'ios'])

function mobileField(id) {
  return id === 'ios' ? 'bundle' : 'package'
}

/** 移动端未单独填写时，沿用其它环境 / 另一端已填的包名，不覆盖手动填写。 */
export function resolveChannelValue(profiles, envOrder, envKey, channelId, field) {
  const local = channelValue(profiles?.[envKey], channelId, field)
  if (local) return { value: local, fromKey: envKey, fromChannel: channelId, inherited: false }
  if (!MOBILE_CHANNEL_IDS.has(channelId)) {
    return { value: '', fromKey: '', fromChannel: '', inherited: false }
  }
  const keys = (Array.isArray(envOrder) && envOrder.length ? envOrder : Object.keys(profiles || {})).filter(Boolean)
  for (const key of keys) {
    const v = channelValue(profiles?.[key], channelId, field)
    if (v) return { value: v, fromKey: key, fromChannel: channelId, inherited: key !== envKey }
  }
  const other = channelId === 'android' ? 'ios' : 'android'
  for (const key of [envKey, ...keys]) {
    if (!key) continue
    const v = channelValue(profiles?.[key], other, mobileField(other))
    if (v) return { value: v, fromKey: key, fromChannel: other, inherited: true }
  }
  return { value: '', fromKey: '', fromChannel: '', inherited: false }
}

export function profileIsFilled(snap, channels) {
  if (!snap || typeof snap !== 'object') return false
  const list = Array.isArray(channels) && channels.length ? channels : DEFAULT_CHANNELS
  return list.some((ch) => channelValue(snap, ch.id, ch.field))
}

export function envLabel(key, environments) {
  if (Array.isArray(environments)) {
    const hit = environments.find((e) => e.key === key)
    if (hit?.label) return hit.label
  }
  return ENV_PROFILES.find((p) => p.key === key)?.label || key || '—'
}

export function isEnvKey(key, environments) {
  if (Array.isArray(environments) && environments.length) {
    return environments.some((e) => e.key === key)
  }
  return ENV_PROFILES.some((p) => p.key === key)
}

export function filledEnvKeys(docOrProfiles) {
  return envSummaries(docOrProfiles).filter((s) => s.filled).map((s) => s.key)
}

export function envSummaries(docOrProfiles) {
  const doc = normalizeEnvDoc(docOrProfiles)
  const pipe = new Set(doc.pipeline)
  const order = doc.pipeline.length ? doc.pipeline : doc.environments.map((e) => e.key)
  return doc.environments.map((e) => {
    const snap = doc.profiles[e.key] || {}
    const channelRows = doc.channels.map((ch) => {
      const resolved = resolveChannelValue(doc.profiles, order, e.key, ch.id, ch.field)
      return {
        id: ch.id,
        label: channelTitle(ch),
        kind: ch.kind,
        alias: ch.alias,
        third_party: ch.third_party,
        value: resolved.value,
        inherited: resolved.inherited,
      }
    })
    const filledChannels = channelRows.filter((c) => c.value)
    const pkg = resolveChannelValue(doc.profiles, order, e.key, 'android', 'package')
    const bundle = resolveChannelValue(doc.profiles, order, e.key, 'ios', 'bundle')
    return {
      key: e.key,
      label: e.label,
      filled: filledChannels.length > 0 || profileIsFilled(snap, doc.channels),
      package: pkg.value,
      bundle: bundle.value,
      web: channelValue(snap, 'web', 'base_url'),
      preview: filledChannels[0]?.value || '',
      channels: channelRows,
      channelText: filledChannels.length
        ? filledChannels.map((c) => `${c.label} ${c.value}`).join(' · ')
        : '',
      inPipeline: pipe.has(e.key),
    }
  })
}

export function pipelineKeys(docOrProfiles) {
  const doc = normalizeEnvDoc(docOrProfiles)
  return doc.pipeline.length ? doc.pipeline : doc.environments.map((e) => e.key)
}

const PRIMARY_CHANNEL_IDS = new Set(['android', 'ios', 'web', 'server', 'pc', 'mac'])

/** 简称 → 应用标识（仅保留英文、数字与下划线） */
export function appIdentifierFromAlias(text) {
  const raw = String(text || '').trim()
  if (!raw) return ''
  return raw
    .replace(/[\s\-·]+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase()
    .slice(0, 32)
}

export function channelAppIdentifier(ch) {
  const stored = String(ch?.app_identifier || '').trim()
  if (stored) return stored
  const id = String(ch?.id || '')
  if (id.includes('.')) {
    const parts = id.split('.')
    if (parts.length >= 2 && PRIMARY_CHANNEL_IDS.has(parts[0])) return parts.slice(1).join('.')
  }
  const legacy = id.match(/^(android|ios|web|server|pc|mac)-(.+)$/)
  if (legacy) return legacy[2]
  return appIdentifierFromAlias(ch?.alias || '')
}

/** 流程占位符：web.hi3d.base_url / android.package / web.base_url */
export function channelConfigVarKey(ch) {
  const field = ch?.field || 'value'
  const plat = String(ch?.platform || ch?.kind || 'web').toLowerCase()
  const id = String(ch?.id || '')
  if (!ch?.alias && !ch?.third_party && PRIMARY_CHANNEL_IDS.has(id)) {
    if (id === 'android') return `android.${field}`
    if (id === 'ios') return `ios.${field}`
    if (id === 'web') return `web.${field}`
    if (id === 'server') return `server.${field}`
    return `${id}.${field}`
  }
  const ident = channelAppIdentifier(ch)
  if (!ident) return `${plat}.${field}`
  return `${plat}.${ident}.${field}`
}

export function channelConfigVar(ch) {
  return `{{${channelConfigVarKey(ch)}}}`
}

/** 当前环境下已填写目标的渠道（跑批选应用） */
export function channelsConfiguredInEnv(doc, envKey) {
  const normalized = normalizeEnvDoc(doc)
  const order = pipelineKeys(normalized)
  const key = String(envKey || normalized.default_profile || 'test').trim()
  return (normalized.channels || []).map((ch) => {
    const resolved = resolveChannelValue(normalized.profiles, order, key, ch.id, ch.field)
    return {
      ...ch,
      configuredValue: resolved.value,
      inherited: resolved.inherited,
    }
  }).filter((row) => String(row.configuredValue || '').trim())
}

export const RUN_ENV_STORAGE_KEY = 'mo_run_env_profile'

export function getStoredRunEnvProfile() {
  const v = localStorage.getItem(RUN_ENV_STORAGE_KEY)
  return v || 'test'
}

export function setStoredRunEnvProfile(key) {
  const k = slugEnvKey(key, '')
  if (k) localStorage.setItem(RUN_ENV_STORAGE_KEY, k)
}
