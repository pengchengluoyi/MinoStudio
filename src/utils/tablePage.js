/** 前端表格翻页：把列表切成当前页。 */

export function slicePage(list = [], page = 1, size = 20) {
  const items = Array.isArray(list) ? list : []
  const s = Math.max(1, Number(size) || 20)
  const p = Math.max(1, Number(page) || 1)
  const start = (p - 1) * s
  return items.slice(start, start + s)
}

export function clipText(value, max = 80) {
  const s = String(value || '').replace(/\s+/g, ' ').trim()
  if (!s) return '—'
  return s.length > max ? `${s.slice(0, max)}…` : s
}

export const TABLE_PAGE_SIZES = [10, 20, 50]
