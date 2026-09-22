import request from '@/utils/request'

// ---- 启动 / 进度 ----

export const runCaseRunner = (data) =>
  request({ url: '/case-runner/run', method: 'post', data, timeout: 120000 })

export const runAppExplore = (data) =>
  request({ url: '/case-runner/explore', method: 'post', data, timeout: 120000 })

export const getCaseRunnerRun = (runId) =>
  request({ url: `/case-runner/run/${runId}`, method: 'get' })

export const listCaseRunnerRuns = (limit = 30) =>
  request({ url: '/case-runner/runs', method: 'get', params: { limit } })

/** P0 任务中心：GET /case-runner/tasks?app_id= */
export const listTestingTasks = ({ appId, status, limit = 50, offset = 0 } = {}) =>
  request({
    url: '/case-runner/tasks',
    method: 'get',
    params: {
      app_id: appId || undefined,
      status: status || undefined,
      limit,
      offset,
    },
  })

export const getTestingTask = (taskId) =>
  request({ url: `/case-runner/tasks/${encodeURIComponent(taskId)}`, method: 'get' })

export const cancelTestingTask = (taskId) =>
  request({ url: `/case-runner/tasks/${encodeURIComponent(taskId)}/cancel`, method: 'post' })

export const retryFailedTestingTask = (taskId) =>
  request({ url: `/case-runner/tasks/${encodeURIComponent(taskId)}/retry-failed`, method: 'post' })

/** 本任务产生的模板状态变更日志（可恢复快照） */
export const getTaskResourceRestoreLogs = (taskId, { page = 1, page_size = 30, case_id = '' } = {}) =>
  request({
    url: `/case-runner/tasks/${encodeURIComponent(taskId)}/resource-restore-logs`,
    method: 'get',
    params: {
      page,
      page_size,
      case_id: case_id || undefined,
    },
  })

export const restoreTaskResourceLog = (taskId, logId) =>
  request({
    url: `/case-runner/tasks/${encodeURIComponent(taskId)}/resource-restore-logs/${logId}/restore`,
    method: 'post',
  })

export const listTestingTaskSummary = (appIds = []) =>
  request({
    url: '/case-runner/tasks/summary',
    method: 'get',
    params: { app_ids: (appIds || []).filter(Boolean).join(',') || undefined },
  })

// ---- Agent 流式执行（实时 + 历史回填） ----

export const getAgentRuns = () =>
  request({ url: '/case-runner/agent/runs', method: 'get' })

export const getAgentSteps = (runId) =>
  request({ url: `/case-runner/agent/steps/${encodeURIComponent(runId)}`, method: 'get' })

export const listSessions = ({ appId, runId, caseId, status, limit = 30, offset = 0 } = {}) =>
  request({
    url: '/case-runner/sessions',
    method: 'get',
    params: {
      app_id: appId || undefined,
      run_id: runId || undefined,
      case_id: caseId || undefined,
      status: status || undefined,
      limit,
      offset,
    },
  })

export const getSessionTurns = (sessionId) =>
  request({ url: `/case-runner/sessions/${encodeURIComponent(sessionId)}/turns`, method: 'get' })

export const getSessionEval = (sessionId) =>
  request({ url: `/case-runner/sessions/${encodeURIComponent(sessionId)}/eval`, method: 'get' })

export const getSessionAudit = (sessionId) =>
  request({ url: `/case-runner/sessions/${encodeURIComponent(sessionId)}/audit`, method: 'get' })

export const getSessionReplayPlan = (sessionId, { upToTurn } = {}) =>
  request({
    url: `/case-runner/sessions/${encodeURIComponent(sessionId)}/replay-plan`,
    method: 'get',
    params: { up_to_turn: upToTurn ?? undefined },
  })

export const getSessionForkPlan = (sessionId, { fromTurn, providerId } = {}) =>
  request({
    url: `/case-runner/sessions/${encodeURIComponent(sessionId)}/fork-plan`,
    method: 'get',
    params: { from_turn: fromTurn, provider_id: providerId || undefined },
  })

export const replaySession = (sessionId, data = {}) =>
  request({
    url: `/case-runner/sessions/${encodeURIComponent(sessionId)}/replay`,
    method: 'post',
    data,
    timeout: 600000,
  })

export const forkSession = (sessionId, data = {}) =>
  request({
    url: `/case-runner/sessions/${encodeURIComponent(sessionId)}/fork`,
    method: 'post',
    data,
    timeout: 600000,
  })

export const harvestSessions = (data = {}) =>
  request({ url: '/case-runner/sessions/harvest', method: 'post', data })

export const getSessionTrajectory = (sessionId) =>
  request({ url: `/case-runner/sessions/${encodeURIComponent(sessionId)}/trajectory`, method: 'get' })

export const getSessionEvents = (sessionId, { fromSeq = 0, limit = 500 } = {}) =>
  request({
    url: `/case-runner/sessions/${encodeURIComponent(sessionId)}/events`,
    method: 'get',
    params: { from_seq: fromSeq, limit },
  })

export const getSessionLlmCalls = (sessionId) =>
  request({ url: `/case-runner/sessions/${encodeURIComponent(sessionId)}/llm`, method: 'get' })

export const getSessionMetrics = (sessionId) =>
  request({ url: `/case-runner/sessions/${encodeURIComponent(sessionId)}/metrics`, method: 'get' })


// ---- Trace（持久化的 m_case_run_trace） ----

export const listCaseRunnerTraces = ({ caseId, deviceSignature, onlyPass, limit = 20 } = {}) =>
  request({
    url: '/case-runner/traces',
    method: 'get',
    params: {
      case_id: caseId || undefined,
      device_signature: deviceSignature || undefined,
      only_pass: onlyPass ? true : undefined,
      limit,
    },
  })

export const getCaseRunnerTraceDetail = (runId) =>
  request({ url: `/case-runner/traces/${encodeURIComponent(runId)}`, method: 'get' })

// ---- Baseline ----

export const getCaseRunnerBaseline = (caseId, { sn = '', deviceSignature = '', platform = 'android' } = {}) =>
  request({
    url: `/case-runner/baseline/${caseId}`,
    method: 'get',
    params: { sn, device_signature: deviceSignature, platform },
  })

export const promoteCaseRunnerBaseline = (data) =>
  request({ url: '/case-runner/baseline/promote', method: 'post', data })

// ---- 设备 ----

export const listCaseRunnerDevices = (onlyOnline = true) =>
  request({ url: '/case-runner/devices', method: 'get', params: { only_online: onlyOnline } })
