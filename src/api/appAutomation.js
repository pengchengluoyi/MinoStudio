import request from '@/utils/request'

export const getAppPlaybook = (appId) =>
  request({ url: `/app-automation/playbook/${appId}`, method: 'get' })

export const saveAppPlaybook = (appId, playbook) =>
  request({ url: `/app-automation/playbook/${appId}`, method: 'put', data: { playbook } })

export const getAppAutomationConfig = (appId) =>
  request({ url: `/app-automation/config/${appId}`, method: 'get' })

export const listQaProcessSummary = () =>
  request({ url: '/app-automation/qa-process/summary', method: 'get' })

export const assistQaProcess = (appId, data) =>
  request({ url: `/app-automation/qa-process/assist/${appId}`, method: 'post', data, timeout: 120000 })

/** 投递推进任务，立刻返回 job_id（不再同步等 10 分钟）。 */
export const tickQaProcess = (appId, data = {}) =>
  request({ url: `/app-automation/qa-process/tick/${appId}`, method: 'post', data, timeout: 30000 })

export const getQaProcessJob = (jobId) =>
  request({ url: `/app-automation/qa-process/job/${jobId}`, method: 'get', timeout: 15000 })

export const cancelQaProcessJob = (jobId) =>
  request({ url: `/app-automation/qa-process/job/${jobId}/cancel`, method: 'post', timeout: 15000 })

/**
 * 投递 + 轮询直到结束。onProgress({ job, qa_process }) 每次有更新都回调。
 * 返回最后一次 data（含 actions / usage / qa_process）。
 */
export const runQaProcessTick = async (appId, data = {}, { onProgress, signal, pollMs = 1200 } = {}) => {
  const started = await tickQaProcess(appId, data)
  const jobId = started?.data?.job_id || started?.data?.job?.job_id
  if (!jobId) {
    // 兼容万一还是同步回包
    if (started?.data?.qa_process) return started.data
    throw new Error('没有返回任务 id')
  }
  if (onProgress) onProgress(started.data || {})
  const sleep = (ms) => new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      return
    }
    const t = setTimeout(resolve, ms)
    signal?.addEventListener?.('abort', () => {
      clearTimeout(t)
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    }, { once: true })
  })
  let last = started.data || {}
  for (;;) {
    await sleep(pollMs)
    const res = await getQaProcessJob(jobId)
    last = res?.data || {}
    if (onProgress) onProgress(last)
    const status = last.job?.status || ''
    if (status === 'done' || status === 'cancelled' || status === 'error') return last
  }
}

export const importQaCover = (appId, data) =>
  request({ url: `/app-automation/qa-process/import/${appId}`, method: 'post', data, timeout: 60000 })

export const publishQaMindmap = (appId, data) =>
  request({ url: `/app-automation/qa-process/publish-mindmap/${appId}`, method: 'post', data, timeout: 120000 })

export const hideQaMindmapWiki = (appId, data) =>
  request({ url: `/app-automation/qa-process/hide-mindmap-wiki/${appId}`, method: 'post', data, timeout: 60000 })

export const reviewAtlasPatch = (appId, data) =>
  request({ url: `/app-automation/qa-process/atlas-patch/${appId}`, method: 'post', data, timeout: 180000 })

export const listAtlasAliases = (appId, params = {}) =>
  request({ url: `/app-automation/qa-process/atlas-aliases/${appId}`, method: 'get', params })

export const updateAtlasAlias = (appId, aliasId, data) =>
  request({ url: `/app-automation/qa-process/atlas-aliases/${appId}/${aliasId}`, method: 'patch', data })

export const deleteAtlasAlias = (appId, aliasId) =>
  request({ url: `/app-automation/qa-process/atlas-aliases/${appId}/${aliasId}`, method: 'delete' })

export const updateAppAutomationConfig = (appId, data) =>
  request({ url: `/app-automation/config/${appId}`, method: 'put', data })

export const syncAppFigma = (appId, data) =>
  request({ url: `/app-automation/config/${appId}/figma/sync`, method: 'post', data, timeout: 90000 })

export const applyFigmaAppLogic = (appId, data) =>
  request({ url: `/app-automation/config/${appId}/figma/apply-logic`, method: 'post', data, timeout: 120000 })

export const getAppCases = (appId) =>
  request({
    url: `/app-automation/cases/${appId}`,
    method: 'get',
  })

export const listAppRegressionRuns = (appId, limit = 30) =>
  request({ url: `/feishu/runs/${appId}`, method: 'get', params: { limit } })

export const getRegressionRun = (runId) =>
  request({ url: `/feishu/run/${runId}`, method: 'get' })

export const listIconTargets = (appId, params = {}) =>
  request({
    url: `/app-automation/icon-targets/${appId}`,
    method: 'get',
    params,
  })

export const saveIconTarget = (appId, data) =>
  request({ url: `/app-automation/icon-targets/${appId}`, method: 'post', data })

export const seedLoginIconTemplates = (appId) =>
  request({ url: `/app-automation/icon-targets/${appId}/seed-login-templates`, method: 'post' })

export const seedLoginIconsFromFigma = (appId) =>
  request({ url: `/app-automation/icon-targets/${appId}/seed-from-figma`, method: 'post', timeout: 120000 })

export const importIconFromLocate = (appId, data) =>
  request({ url: `/app-automation/icon-targets/${appId}/from-locate`, method: 'post', data })

export const deleteIconTarget = (appId, targetId) =>
  request({ url: `/app-automation/icon-targets/${appId}/${targetId}`, method: 'delete' })

export const uploadIconImage = (appId, file) => {
  const fd = new FormData()
  fd.append('file', file)
  return request({
    url: `/app-automation/icon-targets/${appId}/upload`,
    method: 'post',
    data: fd,
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const getGraphIconCandidates = (appId) =>
  request({ url: `/app-automation/icon-targets/${appId}/graph-candidates`, method: 'get' })

export const importGraphIcon = (appId, componentUid) =>
  request({
    url: `/app-automation/icon-targets/${appId}/import-graph`,
    method: 'post',
    data: { component_uid: componentUid },
  })
