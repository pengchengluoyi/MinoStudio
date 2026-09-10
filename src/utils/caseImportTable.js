/** 用例导入表格：列名行识别、建议跳过的表头行。不做静默猜测，只给初始建议。 */

export const HEADER_ALIASES = {
  case_id: ['用例编号', '编号', 'id', 'case_id'],
  name: ['用例名称', '用例名', '名称', '标题'],
  module: ['模块', '路径'],
  platform: ['端', '平台'],
  precondition: ['前置', '前置条件'],
  steps: ['步骤', '测试步骤', '操作步骤'],
  expected: ['预期', '预期效果', '预期结果', '期望结果'],
}

export const normHeader = (s) => String(s || '').replace(/\s+/g, '').toLowerCase()

export function scoreHeaderRow(row = []) {
  let score = 0
  for (const cell of row) {
    const key = normHeader(cell)
    if (!key) continue
    for (const aliases of Object.values(HEADER_ALIASES)) {
      if (aliases.some((a) => normHeader(a) === key)) score += 1
    }
  }
  return score
}

/** 在前几行里找最像列名的一行。 */
export function detectHeaderRow(table = [], scan = 6) {
  let best = 0
  let bestScore = 0
  const limit = Math.min(scan, table.length)
  for (let i = 0; i < limit; i += 1) {
    const s = scoreHeaderRow(table[i])
    if (s > bestScore) {
      bestScore = s
      best = i
    }
  }
  return bestScore >= 2 ? best : 0
}

const SUB_HEADER_RE = /^(ios|android|鸿蒙|web|双端|iphone|ipad)$/i
const REGRESSION_RE = /回归|测试轮|结果/

/** 建议勾「跳过」的行：回归大表头、子表头、重复列名行。 */
export function suggestSkipRows(table = [], headerRow = 0) {
  const skip = new Set()
  for (let i = 0; i < table.length; i += 1) {
    if (i === headerRow) continue
    const row = table[i] || []
    const cells = row.map((c) => String(c || '').trim()).filter(Boolean)
    if (!cells.length) {
      skip.add(i)
      continue
    }
    if (scoreHeaderRow(row) >= 2) {
      skip.add(i)
      continue
    }
    const joined = cells.join(' ')
    if (REGRESSION_RE.test(joined) && cells.length <= 4) {
      skip.add(i)
      continue
    }
    if (cells.length <= 3 && cells.every((c) => SUB_HEADER_RE.test(c))) {
      skip.add(i)
    }
  }
  return skip
}

export function suggestColumnMap(labels = []) {
  const map = {}
  labels.forEach((label, idx) => {
    const key = normHeader(label)
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[field] != null) continue
      if (aliases.some((a) => normHeader(a) === key)) map[field] = idx
    }
  })
  return map
}

/** 当前列名行是否像列名（含至少 2 个已知字段）。 */
export function headerRowLooksValid(labels = []) {
  const normalized = labels.map(normHeader)
  let hits = 0
  for (const aliases of Object.values(HEADER_ALIASES)) {
    if (aliases.some((a) => normalized.includes(normHeader(a)))) hits += 1
  }
  return hits >= 2
}

export const FLAG_LABELS = {
  likely_header: '疑似表头行',
  empty_steps: '步骤为空',
  empty_expected: '预期为空',
  likely_duplicate: '与库中已有用例同名',
}
