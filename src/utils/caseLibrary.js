/** 用例库：模块树、套件、同步时间 */

export function caseModuleKey(c) {
  const m = String(c?.module || '').trim()
  return m || '未分类'
}

export function groupCasesByModule(cases = []) {
  const map = new Map()
  for (const c of cases) {
    const k = caseModuleKey(c)
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(c)
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh'))
}

export function filterCasesByModule(cases = [], moduleKey = '') {
  if (!moduleKey) return cases
  return cases.filter((c) => caseModuleKey(c) === moduleKey)
}

export function formatSyncedAt(iso) {
  const raw = String(iso || '').trim()
  if (!raw) return ''
  const t = Date.parse(raw)
  if (!Number.isFinite(t)) return `上次同步 ${raw.replace('T', ' ').slice(0, 16)}`
  const d = new Date(t)
  const pad = (n) => String(n).padStart(2, '0')
  const abs = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (mins < 1) return `刚刚同步 · ${abs}`
  if (mins < 60) return `${mins} 分钟前同步 · ${abs}`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} 小时前同步 · ${abs}`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days} 天前同步 · ${abs}`
  return `上次同步 ${abs}`
}

export function parseCaseIdQuery(q) {
  return String(q || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function suiteCaseIds(suite, cases = []) {
  const want = new Set(suite?.case_ids || [])
  if (!want.size) return []
  return (cases || []).filter((c) => want.has(c.case_id)).map((c) => c.case_id)
}

/** 按模块路径铺成树：勾父节点等于勾下面全部用例。 */
export function groupCasesByModuleTree(cases = []) {
  const split = (m) => String(m || '未分类')
    .split(/\s*\/\s*|\s*>\s*|\s*-\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
  const root = { id: 'root', label: '全部', children: [] }
  const map = new Map([['', root]])
  for (const c of cases || []) {
    const parts = split(c.module)
    if (!parts.length) parts.push('未分类')
    let parent = root
    let acc = []
    for (const part of parts) {
      acc.push(part)
      const path = acc.join(' / ')
      if (!map.has(path)) {
        const node = { id: `mod:${path}`, label: part, path, children: [] }
        parent.children.push(node)
        map.set(path, node)
      }
      parent = map.get(path)
    }
    parent.children.push({
      id: c.case_id,
      label: `${c.case_id} · ${c.name || c.title || ''}`.trim(),
      isCase: true,
      case_id: c.case_id,
    })
  }
  return root.children
}
