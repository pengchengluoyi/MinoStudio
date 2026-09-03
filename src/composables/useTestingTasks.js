/**
 * FE-P0：任务列表加载（优先 /tasks）+ testing_task 增量。
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import {
  getCaseRunnerRun,
  getTestingTask,
  listCaseRunnerRuns,
  listCaseRunnerTraces,
  listTestingTasks,
} from '@/api/caseRunner'
import { addMessageListener, removeMessageListener } from '@/api/mWebSocket'
import {
  applyTestingTaskEvent,
  batchIdFromCaseRunId,
  groupTracesIntoTasks,
  isMissingTaskEndpoint,
  mergeTaskLists,
  normalizeTask,
} from '@/utils/testingTasks'

export async function fetchTasksForApp(appId, { caseIds = [] } = {}) {
  if (!appId) return { tasks: [], source: 'none' }
  try {
    const r = await listTestingTasks({ appId, limit: 50 })
    const items = r?.data?.items || r?.data?.tasks || []
    return {
      tasks: items.map((row) => normalizeTask(row, { source: 'tasks-api' })).filter(Boolean),
      source: 'tasks-api',
    }
  } catch (e) {
    if (!isMissingTaskEndpoint(e)) {
      console.warn('[testing] GET /tasks failed, fallback legacy', e)
    }
  }

  const [runsRes, tracesRes] = await Promise.all([
    listCaseRunnerRuns(50).catch(() => null),
    listCaseRunnerTraces({ limit: 80 }).catch(() => null),
  ])
  const memory = (runsRes?.data?.runs || [])
    .map((row) => normalizeTask(row, { source: 'memory' }))
    .filter((t) => t && t.appId === appId)
  const caseIdSet = new Set((caseIds || []).filter(Boolean))
  const traces = caseIdSet.size
    ? (tracesRes?.data?.items || []).filter((t) => caseIdSet.has(t.case_id))
    : []
  const fromTraces = groupTracesIntoTasks(traces, { appId })
  return { tasks: mergeTaskLists(memory, fromTraces), source: 'legacy' }
}

export async function fetchTaskDetail(taskId, seed = null) {
  if (!taskId) return null
  try {
    const r = await getTestingTask(taskId)
    const next = normalizeTask(r?.data, { source: 'tasks-api' })
    if (next) return next
  } catch (e) {
    if (!isMissingTaskEndpoint(e)) {
      console.warn('[testing] GET /tasks/{id} failed', e)
    }
  }
  try {
    const r = await getCaseRunnerRun(taskId)
    const next = normalizeTask(r?.data, { source: 'memory' })
    if (next) return next
  } catch (_) { /* noop */ }
  try {
    const tr = await listCaseRunnerTraces({ limit: 100 })
    const items = (tr?.data?.items || []).filter((t) => batchIdFromCaseRunId(t.run_id) === taskId)
    if (items.length) {
      const grouped = groupTracesIntoTasks(items, { appId: seed?.appId || '' })
      if (grouped[0]) return grouped[0]
    }
  } catch (_) { /* noop */ }
  return seed ? { ...seed } : null
}

export function useTestingTaskList(appIdRef) {
  const tasks = ref([])
  const source = ref('none')

  const upsert = (next) => {
    if (!next?.taskId) return
    const idx = tasks.value.findIndex((t) => t.taskId === next.taskId)
    if (idx >= 0) tasks.value[idx] = next
    else tasks.value = [next, ...tasks.value]
  }

  const onWs = (res) => {
    if (!res) return
    const type = res.type || res.action
    if (type !== 'testing_task') return
    const data = res.data || {}
    const aid = String(data.app_id || '')
    if (aid && aid !== String(appIdRef.value || '')) return
    const tid = data.task_id
    if (!tid) return
    const cur = tasks.value.find((t) => t.taskId === tid)
    if (cur) upsert(applyTestingTaskEvent(cur, data))
    else if (data.event === 'task_created' || data.status === 'running') {
      upsert(normalizeTask({ ...data, task_id: tid }, { source: 'ws' }))
    }
  }

  onMounted(() => addMessageListener(onWs))
  onUnmounted(() => removeMessageListener(onWs))

  watch(appIdRef, () => { tasks.value = [] }, { flush: 'sync' })

  return { tasks, source, upsert }
}
