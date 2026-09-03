import { sendWsRequest } from '@/api/mWebSocket'

/** 对话规划：自然语言 → Agent 任务（与 /case-runner/run 同一引擎） */
export function copilotChat({ text, sn, context, appId = '', planningMode = 'local', providerId = '' } = {}) {
  const ctx = { ...(context || {}) }
  if (appId && !ctx.app_id) ctx.app_id = appId
  return sendWsRequest(
    'copilot/chat',
    { text, sn, context: ctx, app_id: appId || ctx.app_id, planning_mode: planningMode, provider_id: providerId },
    { timeout: 60000 },
  )
}

/** 执行拆解后的步骤 */
export function copilotExecute({ steps, sn, platform = 'android', runId = '', captureScreenshots = true } = {}) {
  return sendWsRequest(
    'copilot/execute',
    { steps, sn, platform, run_id: runId, capture_screenshots: captureScreenshots },
    { timeout: 120000 },
  )
}
