import { getKnowledgeJobSettings, saveKnowledgeJobSettings } from '@/api/settings'

export const KNOWLEDGE_JOB_DEFAULTS = {
  capture_enabled: true,
  review_enabled: true,
}

let cache = { ...KNOWLEDGE_JOB_DEFAULTS }
let cacheAccountKey = ''

const asJobs = (raw) => ({
  capture_enabled: raw?.capture_enabled !== false,
  review_enabled: raw?.review_enabled !== false,
  account_id: String(raw?.account_id || '').trim(),
  account_ident: String(raw?.account_ident || '').trim(),
})

const accountKey = (scope = {}) =>
  String((scope && typeof scope === 'object' ? (scope.account_id || scope.account_ident) : '') || '').trim()

export const resetKnowledgeJobSettings = () => {
  cache = { ...KNOWLEDGE_JOB_DEFAULTS }
  cacheAccountKey = ''
}

export const peekKnowledgeJobSettings = () => ({ ...cache })

export const loadKnowledgeJobSettings = async (scope = {}) => {
  const key = accountKey(scope)
  if (key && cacheAccountKey && key !== cacheAccountKey) resetKnowledgeJobSettings()
  const res = await getKnowledgeJobSettings({
    account_id: scope.account_id || '',
    account_ident: scope.account_ident || '',
    project_id: scope.project_id || '',
    app_id: scope.app_id || '',
  })
  cache = asJobs(res?.data)
  cacheAccountKey = cache.account_id || cache.account_ident || key
  return { ...cache }
}

export const persistKnowledgeJobSettings = async (next, scope = {}) => {
  if (!scope.account_id && !scope.account_ident) {
    throw new Error('请选择应用登录账号')
  }
  const res = await saveKnowledgeJobSettings({
    capture_enabled: next?.capture_enabled !== false,
    review_enabled: next?.review_enabled !== false,
    account_id: scope.account_id || '',
    account_ident: scope.account_ident || '',
    project_id: scope.project_id || '',
    app_id: scope.app_id || '',
  })
  cache = asJobs(res?.data || next)
  cacheAccountKey = cache.account_id || cache.account_ident || accountKey(scope)
  return { ...cache }
}
