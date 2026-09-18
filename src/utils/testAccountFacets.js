/** 号池展示：状态字段来自业务模板 facet_extensions，不再单独维护五维表单。 */

export const ACCOUNT_HEALTH_OPTIONS = [
  { value: 'available', label: '可租用', tone: 'ok' },
  { value: 'dirty', label: '待重置', tone: 'warn' },
  { value: 'quarantine', label: '隔离', tone: 'danger' },
  { value: 'bad', label: '坏号', tone: 'danger' },
]

export const TEMPLATE_FIELD_SKIP_KEYS = new Set(['health'])

const UNCONFIGURED_LABELS = new Set(['未设置', '—', '-', '无'])

export function isConfiguredFacetValue(def, value) {
  const val = String(value || '').trim().toLowerCase()
  if (!val || val === 'unknown') return false
  const opt = (def?.options || []).find((o) => o.value === val)
  if (opt && UNCONFIGURED_LABELS.has(String(opt.label || '').trim())) return false
  return true
}

export function extensionFieldDefs(extensions) {
  return (extensions || [])
    .filter((x) => !TEMPLATE_FIELD_SKIP_KEYS.has(x.key))
    .map((x) => ({
    key: x.key,
    label: x.label || x.key,
    help: x.help || '',
    options: (x.options || []).map((o) => ({
      value: o.value,
      label: o.label || o.value,
      tone: o.tone || (o.value === 'unknown' ? 'muted' : 'ok'),
    })),
    source: x.source || 'manual',
  }))
}

export function templateFieldDefsForRow(row, poolFieldDefs = []) {
  if (Array.isArray(row?.template_field_defs) && row.template_field_defs.length) {
    return extensionFieldDefs(row.template_field_defs)
  }
  return extensionFieldDefs(poolFieldDefs)
}

export function facetsFromTemplate(template) {
  const defs = extensionFieldDefs(template?.facet_extensions || [])
  const out = {}
  for (const def of defs) {
    const unknown = def.options.find((o) => o.value === 'unknown')
    out[def.key] = unknown ? 'unknown' : (def.options[0]?.value || 'unknown')
  }
  const defaults = template?.default_facets || {}
  return { ...out, ...defaults }
}

export function facetsFromAllTemplates(templates) {
  const out = {}
  for (const tpl of templates || []) {
    Object.assign(out, facetsFromTemplate(tpl))
  }
  return out
}

/** 提交保存：仅保留已配置项 + 非默认可租用健康 */
export function facetsForSave(facets, fieldDefs) {
  const src = facets && typeof facets === 'object' ? facets : {}
  const out = {}
  const health = String(src.health || 'available').trim().toLowerCase()
  if (health && health !== 'available') out.health = health
  for (const def of fieldDefs || []) {
    const val = String(src[def.key] || '').trim().toLowerCase()
    if (isConfiguredFacetValue(def, val)) out[def.key] = val
  }
  return out
}

export function templateFieldsForTemplate(extensions) {
  return extensionFieldDefs(extensions).filter((f) => f.key !== 'health')
}

export function projectOnlyFieldDefs(poolFieldDefs, templates) {
  const inTpl = new Set()
  for (const t of templates || []) {
    for (const f of templateFieldsForTemplate(t.facet_extensions)) {
      inTpl.add(f.key)
    }
  }
  return extensionFieldDefs(poolFieldDefs).filter((f) => !inTpl.has(f.key))
}

export function ensureFacetKeys(facets, fieldDefs) {
  const out = { ...(facets && typeof facets === 'object' ? facets : {}) }
  for (const def of fieldDefs || []) {
    const val = String(out[def.key] || '').trim().toLowerCase()
    const ok = def.options.some((o) => o.value === val)
    if (!ok) {
      const unknown = def.options.find((o) => o.value === 'unknown')
      out[def.key] = unknown ? 'unknown' : (def.options[0]?.value || 'unknown')
    } else {
      out[def.key] = val
    }
  }
  return out
}

export function emptyFacetForm(templatesOrPoolDefs) {
  if (Array.isArray(templatesOrPoolDefs) && templatesOrPoolDefs[0]?.facet_extensions) {
    return facetsFromAllTemplates(templatesOrPoolDefs)
  }
  if (Array.isArray(templatesOrPoolDefs) && templatesOrPoolDefs[0]?.key) {
    const out = {}
    for (const def of extensionFieldDefs(templatesOrPoolDefs)) {
      const unknown = def.options.find((o) => o.value === 'unknown')
      out[def.key] = unknown ? 'unknown' : (def.options[0]?.value || 'unknown')
    }
    return out
  }
  return facetsFromTemplate(templatesOrPoolDefs)
}

function optionMeta(def, value) {
  const val = String(value || 'unknown')
  const hit = def?.options?.find((o) => o.value === val)
  return {
    label: hit?.label || val || '—',
    tone: hit?.tone || (val === 'unknown' ? 'muted' : 'ok'),
    title: def?.label || def?.key,
  }
}

export function healthDisplayRow(health) {
  const val = String(health || 'available')
  const hit = ACCOUNT_HEALTH_OPTIONS.find((o) => o.value === val)
  return {
    key: 'health',
    title: '健康',
    value: val,
    label: hit?.label || val,
    tone: hit?.tone || 'muted',
  }
}

/** 表格「模板状态」：仅展示已配置（非 unknown / 未设置）的字段 */
export function statusDisplayRows(row, fieldDefs = null) {
  const defs = fieldDefs || templateFieldDefsForRow(row)
  const facets = row?.facets && typeof row.facets === 'object' ? row.facets : {}
  const rows = []
  const healthVal = String(facets.health || 'available')
  if (healthVal !== 'available') {
    rows.push(healthDisplayRow(healthVal))
  }
  for (const def of defs) {
    if (TEMPLATE_FIELD_SKIP_KEYS.has(def.key)) continue
    const val = String(facets[def.key] || 'unknown')
    if (!isConfiguredFacetValue(def, val)) continue
    const meta = optionMeta(def, val)
    rows.push({
      key: def.key,
      title: def.label,
      value: val,
      label: meta.label,
      tone: meta.tone,
    })
  }
  return rows
}

export function accountHeadline(row) {
  const display = String(row?.display_name || '').trim()
  if (display) return display
  const aid = String(row?.account_id || row?.id || '').trim()
  const phone = String(row?.phone || '').trim()
  const email = String(row?.email || '').trim()
  const user = String(row?.username || '').trim()
  if (phone) return phone
  if (email) return email
  if (user) return user
  if (aid) return aid
  return '未填登录标识'
}

export function accountSubline(row) {
  const parts = []
  const user = String(row?.username || '').trim()
  const email = String(row?.email || '').trim()
  const phone = String(row?.phone || '').trim()
  if (user && user !== accountHeadline(row)) parts.push(`用户 ${user}`)
  if (email && email !== accountHeadline(row)) parts.push(email)
  if (phone && phone !== accountHeadline(row)) parts.push(phone)
  if (row?.account_id) parts.push(row.account_id)
  return parts.join(' · ') || '—'
}

export function leaseBadge(row) {
  if (row?.locked) {
    return { kind: 'locked', text: '手动占用', detail: '运维锁定，跑批不会自动选用' }
  }
  const d = row?.lease_display
  const status = String(d?.status || '').trim()
  const runId = String(d?.run_id || row?.lease?.run_id || '').trim()
  if (status === 'expired' || (row?.lease?.expires_at && status === 'expired')) {
    return { kind: 'expired', text: '租约过期', detail: runId ? `任务 ${runId}` : '等待后台回收' }
  }
  if (runId) {
    return { kind: 'leased', text: '跑批占用', detail: `任务 ${runId.slice(0, 12)}` }
  }
  return { kind: 'free', text: '可租用', detail: '' }
}

export function facetsBrief(row, templates = []) {
  const rows = statusDisplayRows(row, templateFieldDefsForRow(row, templates))
  return rows.map((r) => `${r.title}:${r.label}`).join(' · ')
}

export function poolSummary(accounts) {
  const rows = accounts || []
  const leased = rows.filter((r) => leaseBadge(r).kind === 'leased').length
  const locked = rows.filter((r) => r.locked).length
  const dirty = rows.filter((r) => String(r.facets?.health || '') === 'dirty').length
  const free = Math.max(0, rows.length - leased - locked)
  return { total: rows.length, leased, locked, dirty, free, unhealthy: dirty }
}

/** @deprecated 仅兼容旧引用 */
export const FACET_FIELDS = []
export const PRIMARY_FACET_KEYS = []

export function normalizeFacets(raw) {
  return raw && typeof raw === 'object' ? { ...raw } : {}
}

export function applyProfileFacets() {
  return {}
}
