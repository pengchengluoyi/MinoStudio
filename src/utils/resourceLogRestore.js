// Resource allocation log: can restore template state from snapshot?

export function canRestoreResourceLog(row) {
  if (!row || !row.id) return false
  const act = String(row.action || '')
  if (act !== 'facet_update' && act !== 'facet_restore') return false
  const detail = row.detail
  if (!detail || typeof detail !== 'object') return false
  const recover = detail.recover
  if (!recover || typeof recover !== 'object') return false
  if (String(detail.schema || '') === 'account_template_state_v1') return true
  const facets = recover.facets
  if (facets && typeof facets === 'object' && Object.keys(facets).length > 0) return true
  const fields = recover.fields
  if (fields && typeof fields === 'object' && Object.keys(fields).length > 0) return true
  return Boolean(recover.account_id)
}

export function unwrapListPayload(res) {
  if (!res || typeof res !== 'object') {
    return { items: [], total: 0, project_id: '' }
  }
  const inner =
    res.data && typeof res.data === 'object' && !Array.isArray(res.data) ? res.data : res
  return {
    items: Array.isArray(inner.items) ? inner.items : [],
    total: Number(inner.total || 0),
    project_id: String(inner.project_id || res.project_id || ''),
  }
}

export function formatResourceLogTime(iso) {
  const s = String(iso || '').trim()
  if (!s) return '—'
  const normalized = s.includes('T') ? s : s.replace(' ', 'T')
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return s.slice(0, 19)
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}
