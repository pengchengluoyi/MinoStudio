import request from '@/utils/request'

export const listFeishuBots = () =>
  request({ url: '/settings/feishu/bots', method: 'get' })

export const createFeishuBot = (data) =>
  request({ url: '/settings/feishu/bots', method: 'post', data })

export const updateFeishuBot = (botId, data) =>
  request({ url: `/settings/feishu/bots/${botId}`, method: 'put', data })

export const deleteFeishuBot = (botId) =>
  request({ url: `/settings/feishu/bots/${botId}`, method: 'delete' })

export const listRobotIntegrations = () =>
  request({ url: '/settings/robots/bots', method: 'get' })

export const createRobotIntegration = (data) =>
  request({ url: '/settings/robots/bots', method: 'post', data })

export const updateRobotIntegration = (botId, data) =>
  request({ url: `/settings/robots/bots/${botId}`, method: 'put', data })

export const deleteRobotIntegration = (botId) =>
  request({ url: `/settings/robots/bots/${botId}`, method: 'delete' })

/** @deprecated 兼容旧接口 */
export const getFeishuBotSettings = () =>
  request({ url: '/settings/feishu', method: 'get' })

export const getTestingKnowledge = (appId = '', accountId = '') =>
  request({
    url: '/settings/knowledge',
    method: 'get',
    params: {
      ...(appId ? { app_id: appId } : {}),
      ...(accountId ? { account_id: accountId } : {}),
    },
  })

export const saveTestingKnowledge = (items) =>
  request({ url: '/settings/knowledge', method: 'put', data: { items } })

export const upsertKnowledgeItem = (item) => {
  const id = item.id || ''
  return request({ url: `/settings/knowledge/${id || 'new'}`, method: 'put', data: item })
}

export const deleteKnowledgeItem = (id) =>
  request({ url: `/settings/knowledge/${encodeURIComponent(id)}`, method: 'delete' })

export const reviewKnowledgeItem = (id, data) =>
  request({ url: `/settings/knowledge/${encodeURIComponent(id)}/review`, method: 'post', data })

export const autoReviewKnowledge = (appId = '', accountId = '') =>
  request({
    url: '/settings/knowledge/auto-review',
    method: 'post',
    data: { app_id: appId || '', account_id: accountId || '' },
    timeout: 180000,
  })

export const getKnowledgeJobSettings = (params = {}) =>
  request({ url: '/settings/knowledge/jobs', method: 'get', params })

export const saveKnowledgeJobSettings = (data) =>
  request({ url: '/settings/knowledge/jobs', method: 'put', data })

export const analyzeFailureKnowledge = (data) =>
  request({ url: '/settings/knowledge/analyze-failure', method: 'post', data })

export const appendAppKnowledge = (appId, item) =>
  request({ url: '/settings/knowledge/append', method: 'post', data: { app_id: appId, item } })

export const listAppKnowledge = (appId) =>
  request({ url: `/settings/knowledge/app/${appId}`, method: 'get' })

export const getFigmaSettings = () =>
  request({ url: '/settings/figma', method: 'get' })

export const saveFigmaSettings = (data) =>
  request({ url: '/settings/figma', method: 'put', data })

export const testFigmaToken = (accessToken = '') =>
  request({ url: '/settings/figma/test', method: 'post', data: { access_token: accessToken } })

export const getMailSettings = () =>
  request({ url: '/settings/mail', method: 'get' })

export const saveMailSettings = (data) =>
  request({ url: '/settings/mail', method: 'put', data })

export const testMailSettings = (to = '') =>
  request({ url: '/settings/mail/test', method: 'post', data: { to }, timeout: 25000 })

export const listPlugins = () =>
  request({ url: '/settings/plugins', method: 'get' })

export const getPlugin = (pluginId) =>
  request({ url: `/settings/plugins/${pluginId}`, method: 'get' })

export const savePlugin = (pluginId, data) =>
  request({ url: `/settings/plugins/${pluginId}`, method: 'put', data })

export const chatPlugin = (pluginId, data) =>
  request({ url: `/settings/plugins/${pluginId}/chat`, method: 'post', data, timeout: 120000 })

export const syncFeishuListener = () =>
  request({ url: '/settings/plugins/feishu/listener/sync', method: 'post', timeout: 20000 })

export const startWechatLogin = () =>
  request({ url: '/settings/plugins/wechat/login', method: 'post', timeout: 30000 })

export const getWechatLogin = () =>
  request({ url: '/settings/plugins/wechat/login', method: 'get', timeout: 20000 })

export const verifyWechatLogin = (verifyCode) =>
  request({ url: '/settings/plugins/wechat/login/verify', method: 'post', data: { verify_code: verifyCode }, timeout: 20000 })

export const logoutWechat = () =>
  request({ url: '/settings/plugins/wechat/logout', method: 'post', timeout: 20000 })

export const syncWechatListener = () =>
  request({ url: '/settings/plugins/wechat/listener/sync', method: 'post', timeout: 20000 })

export const debugFeishuWiki = (data) =>
  request({ url: '/settings/plugins/feishu/wiki/debug', method: 'post', data, timeout: 30000 })

export const testZentaoPlugin = (data = {}) =>
  request({ url: '/settings/plugins/zentao/test', method: 'post', data, timeout: 20000 })

export const fetchZentaoToken = (data = {}) =>
  request({ url: '/settings/plugins/zentao/token', method: 'post', data, timeout: 20000 })

export const testZentaoBug = (data = {}) =>
  request({ url: '/settings/plugins/zentao/bugs/test', method: 'post', data, timeout: 20000 })

export const getSkillsCatalog = () =>
  request({ url: '/settings/skills', method: 'get' })

export const listAIProviders = () =>
  request({ url: '/settings/ai/providers', method: 'get' })

export const saveAIProvider = (providerId, data) =>
  request({ url: `/settings/ai/providers/${providerId}`, method: 'put', data })

export const deleteAIProvider = (providerId) =>
  request({ url: `/settings/ai/providers/${providerId}`, method: 'delete' })

export const saveAIUsage = (data) =>
  request({ url: '/settings/ai/usage', method: 'put', data })

export const getAIPlanPrompt = () =>
  request({ url: '/settings/ai/plan-prompt', method: 'get' })

export const listAIRoles = () =>
  request({ url: '/settings/ai/roles', method: 'get' })

export const getLayerStack = () =>
  request({ url: '/settings/ai/stack', method: 'get' })

export const saveLayerStack = (data) =>
  request({ url: '/settings/ai/stack', method: 'put', data })

export const chatAIRole = (data) =>
  request({ url: '/settings/ai/roles/chat', method: 'post', data, timeout: 120000 })

export const saveRolePrompt = (roleId, data) =>
  request({ url: `/settings/ai/roles/${roleId}/prompt`, method: 'put', data })

export const listDispatchCalls = (params = {}) =>
  request({ url: '/settings/dispatch', method: 'get', params })

export const getDispatchCall = (id) =>
  request({ url: `/settings/dispatch/${id}`, method: 'get' })

/** 系统设置 - ClawNode 日志存储目录 */
export const getClawnodeLogsDir = () =>
  request({ url: '/settings/system/clawnode/logs-dir', method: 'get' })

export const saveClawnodeLogsDir = (path) =>
  request({ url: '/settings/system/clawnode/logs-dir', method: 'put', data: { path } })
