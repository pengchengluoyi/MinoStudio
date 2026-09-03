const KEY_AGENT = 'mo.work.lastAgent'
const KEY_TESTING = 'mo.work.lastTesting'
const KEY_RETURN = 'mo.work.returnFromSettings'
const KEY_SETTINGS = 'mo.work.lastSettings'

export function rememberAgentPath(fullPath) {
  if (fullPath) sessionStorage.setItem(KEY_AGENT, fullPath)
}

export function rememberTestingPath(fullPath) {
  if (fullPath) sessionStorage.setItem(KEY_TESTING, fullPath)
}

export function lastAgentPath() {
  return sessionStorage.getItem(KEY_AGENT) || '/dialogue'
}

export function lastTestingPath() {
  return sessionStorage.getItem(KEY_TESTING) || '/testing'
}

export function rememberSettingsPath(fullPath) {
  if (fullPath && String(fullPath).startsWith('/settings')) sessionStorage.setItem(KEY_SETTINGS, fullPath)
}

export function lastSettingsPath() {
  const raw = sessionStorage.getItem(KEY_SETTINGS) || ''
  return raw.startsWith('/settings') ? raw : ''
}

export function openSettingsRemembering(router, fromFullPath) {
  if (fromFullPath) sessionStorage.setItem(KEY_RETURN, fromFullPath)
  const last = lastSettingsPath()
  if (last) router.push(last)
  else router.push({ name: 'SettingsRuntime', query: { view: 'overview' } })
}

export function returnFromSettingsPath() {
  return sessionStorage.getItem(KEY_RETURN) || lastTestingPath()
}

export function isTestingPath(path = '') {
  return String(path).startsWith('/testing')
}

export function isAgentPath(path = '') {
  return path === '/dialogue' || path.startsWith('/agents')
}
