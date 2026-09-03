import request from '@/utils/request'

export const DEFAULT_STUDIO_NAV = ['testing', 'agent', 'knowledge', 'runtime', 'scout', 'keys', 'dispatch']

const ENTRY_ROUTES = {
  plugins: ['/settings/plugins', '/settings/feishu'],
  scout: ['/settings/scout', '/settings/runtime?view=scout'],
  runtime: ['/settings/runtime', '/settings/schedule'],
  keys: ['/settings/keys', '/settings/ai'],
  dispatch: ['/settings/dispatch'],
}

let allowed = [...DEFAULT_STUDIO_NAV]
let loaded = false
let pending = null

export function studioNavAllowed(id) {
  return allowed.includes(id)
}

export function studioNavList() {
  return [...allowed]
}

export async function loadStudioNav() {
  if (loaded) return allowed
  if (pending) return pending
  pending = (async () => {
    try {
      const res = await request({ url: '/me/bootstrap', method: 'get' })
      const rows = res?.data?.studio_nav?.allowed
      if (Array.isArray(rows)) allowed = rows.map((x) => String(x || '').trim()).filter(Boolean)
    } catch {
      allowed = [...DEFAULT_STUDIO_NAV]
    } finally {
      loaded = true
      pending = null
    }
    return allowed
  })()
  return pending
}

export function resetStudioNav() {
  allowed = [...DEFAULT_STUDIO_NAV]
  loaded = false
  pending = null
}

export function settingsEntryForPath(path) {
  const p = String(path || '')
  return Object.keys(ENTRY_ROUTES).find((id) => ENTRY_ROUTES[id].some((prefix) => p === prefix || p.startsWith(`${prefix}/`))) || ''
}

export function firstAllowedSettingsPath() {
  const order = ['runtime', 'scout', 'keys', 'dispatch', 'plugins']
  const hit = order.find((id) => studioNavAllowed(id))
  if (hit === 'runtime') return '/settings/runtime?view=overview'
  if (hit === 'scout') return '/settings/scout'
  if (hit === 'keys') return '/settings/keys?tab=model-keys'
  if (hit === 'dispatch') return '/settings/dispatch'
  if (hit === 'plugins') return '/settings/plugins'
  return '/testing'
}
