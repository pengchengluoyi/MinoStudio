export function flattenProjectApps(projects = []) {
  const out = []
  for (const p of projects || []) {
    for (const a of p.apps || []) {
      if (!a?.id) continue
      out.push({
        id: a.id,
        name: a.name || a.id,
        projectId: p.id,
        projectName: p.name || '',
      })
    }
  }
  return out
}

export function belongsToAgentTask(payload = {}, taskId = '') {
  const tid = String(taskId || '').trim()
  if (!tid) return false
  const runId = String(payload.run_id || payload.task_id || '').trim()
  const batch = String(payload.task_id || '').trim()
  if (runId === tid || batch === tid) return true
  if (runId.startsWith(`${tid}::`) || runId.startsWith(`${tid}-`)) return true
  if (tid.startsWith(`${runId}::`) || tid.startsWith(`${runId}-`)) return true
  if (batch && (tid.startsWith(`${batch}::`) || tid === batch)) return true
  if (String(payload.task_id || '') === tid) return true
  return false
}
