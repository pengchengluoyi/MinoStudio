import request from '@/utils/request'

// ---- 启动 / 进度 ----

export const runCaseRunner = (data) =>
  request({ url: '/case-runner/run', method: 'post', data, timeout: 120000 })

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
