function stripNumberPrefix(s) {
  let t = String(s || '').trim()
  while (t) {
    const next = t.replace(/^\d+[.、．)）]\s*/, '').trim()
    if (next === t) break
    t = next
  }
  return t
}

/** 执行结果行与缓存用例行字段名不一致时统一结构 */
export function normalizeCaseRow(row) {
  const r = row || {}
  const stepsRaw = r.steps_raw
    || (typeof r.steps === 'string' ? r.steps : '')
    || (typeof r.step === 'string' ? r.step : '')
  const expectedRaw = r.expected_raw
    || (typeof r.expected === 'string' ? r.expected : '')
  const stepFromList = Array.isArray(r.steps) ? r.steps : (Array.isArray(r.step_lines) ? r.step_lines : [])
  const expectedFromList = Array.isArray(r.expected) ? r.expected : (Array.isArray(r.expected_lines) ? r.expected_lines : [])
  const stepList = stepFromList.length ? stepFromList : splitNumberedLines(stepsRaw)
  const expectedList = expectedFromList.length ? expectedFromList : splitNumberedLines(expectedRaw)
  return {
    ...r,
    steps: stepList,
    expected: expectedList,
    step_nums: r.step_nums || [],
    expected_nums: r.expected_nums || [],
    expected_by_step: r.expected_by_step || {},
    steps_raw: stepsRaw || (stepList.length ? stepList.map((t, i) => `${i + 1}. ${t}`).join('\n') : ''),
    expected_raw: expectedRaw || (expectedList.length ? expectedList.map((t, i) => `${i + 1}. ${t}`).join('\n') : ''),
    precondition: r.precondition || r.precondition_raw || '',
  }
}

/** 保留原文编号（可跳号 1/3/4），与后端 parse_numbered_items_rules 对齐。 */
export function parseNumberedItems(text) {
  const raw = String(text || '').trim()
  if (!raw) return []
  const re = /(?:^|\n)\s*(\d+)[.、．)）]\s*/g
  const matches = [...raw.matchAll(re)]
  if (!matches.length) {
    if (raw.includes('\n')) {
      return raw
        .split(/\n+/)
        .map((p, i) => ({ num: i + 1, text: stripNumberPrefix(p.trim()) }))
        .filter((p) => p.text)
    }
    return [{ num: 1, text: stripNumberPrefix(raw) }]
  }
  const items = []
  const prefix = raw.slice(0, matches[0].index).trim()
  if (prefix) items.push({ num: 1, text: stripNumberPrefix(prefix) })
  for (let i = 0; i < matches.length; i += 1) {
    const num = Number(matches[i][1])
    const start = matches[i].index + matches[i][0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : raw.length
    const body = stripNumberPrefix(raw.slice(start, end).trim())
    if (body) items.push({ num, text: body })
  }
  return items.length ? items : [{ num: 1, text: stripNumberPrefix(raw) }]
}

/** 与后端 feishu_service._split_numbered_lines 对齐，并支持同行多序号（如 1. xxx 2. yyy） */
export function splitNumberedLines(text) {
  return parseNumberedItems(text).map((it) => it.text)
}

/** 返回 { num, text }[]，num 与飞书原文编号一致（可跳号如 2/3/4） */
export function caseFieldLines(row, { listKey, rawKey, numsKey }) {
  const normalized = normalizeCaseRow(row)
  const list = normalized?.[listKey]
  const nums = normalized?.[numsKey]
  if (Array.isArray(list) && list.length) {
    if (Array.isArray(nums) && nums.length === list.length) {
      return list.map((text, i) => ({
        num: Number(nums[i]) || i + 1,
        text: stripNumberPrefix(text),
      }))
    }
    return list.map((text, i) => ({ num: i + 1, text: stripNumberPrefix(text) }))
  }
  const raw = normalized?.[rawKey]
    || (typeof list === 'string' ? list : '')
    || ''
  return parseNumberedItems(raw)
}

/** 步骤与预期按编号对齐（无预期的行留空，无步骤的行也留空） */
export function alignCaseStepExpected(row) {
  const normalized = normalizeCaseRow(row)
  const steps = caseFieldLines(normalized, {
    listKey: 'steps',
    rawKey: 'steps_raw',
    numsKey: 'step_nums',
  })
  const expectedItems = caseFieldLines(normalized, {
    listKey: 'expected',
    rawKey: 'expected_raw',
    numsKey: 'expected_nums',
  })
  const expectedMap = {}
  const ebs = normalized?.expected_by_step
  if (ebs && typeof ebs === 'object' && Object.keys(ebs).length) {
    for (const [k, v] of Object.entries(ebs)) {
      const num = Number(k)
      if (Number.isFinite(num) && String(v || '').trim()) expectedMap[num] = String(v).trim()
    }
  } else {
    for (const e of expectedItems) {
      if (e.text) expectedMap[e.num] = e.text
    }
  }
  const nums = [
    ...new Set([
      ...steps.map((s) => s.num),
      ...Object.keys(expectedMap).map((k) => Number(k)),
    ]),
  ].sort((a, b) => a - b)
  const stepMap = Object.fromEntries(steps.map((s) => [s.num, s.text]))
  return nums.map((num) => ({
    num,
    step: stepMap[num] || '',
    expected: expectedMap[num] || '',
    verify: Boolean(expectedMap[num]),
  }))
}

const OP_VERB = /^(点击|点「|点选|打开|启动|上滑|下滑|左滑|右滑|输入|填写|等待|长按|拖|返回|按|关闭|杀掉|杀进程|滑动)/
const OP_SPLIT = /(?:[；;]|\n+|然后|接着|(?:并(?=点击|打开|上滑|下滑|输入|等待|长按|拖|关闭)))/
const OP_LEAD = /^(?:再|又|且)\s*/

function maskQuoted(text) {
  const held = []
  const masked = String(text || '').replace(/[「『""'][^」』""']*[」』""']/g, (m) => {
    held.push(m)
    return `\u0000${held.length - 1}\u0000`
  })
  const restore = (s) => String(s || '').replace(/\u0000(\d+)\u0000/g, (_, i) => held[Number(i)] || '')
  return { masked, restore }
}

/** 一条编号步骤里可能有多个操作：按分号/然后/逗号（两侧都像动词）拆开。 */
export function splitStepOperations(text) {
  const raw = stripNumberPrefix(String(text || '').trim())
  if (!raw) return []
  const { masked, restore } = maskQuoted(raw)
  const coarse = masked.split(OP_SPLIT).map((s) => s.trim()).filter(Boolean)
  const out = []
  for (const chunk of coarse) {
    const bits = chunk.split(/[，,]/).map((s) => s.trim()).filter(Boolean)
    if (bits.length <= 1) {
      out.push(restore(chunk))
      continue
    }
    const verbish = bits.filter((b) => OP_VERB.test(restore(b).replace(OP_LEAD, ''))).length
    if (verbish >= 2) out.push(...bits.map((b) => restore(b)))
    else out.push(restore(chunk))
  }
  const cleaned = out
    .map((s) => restore(s).replace(OP_LEAD, '').trim())
    .filter(Boolean)
  return cleaned.length ? cleaned : [raw]
}

export function splitPreconditionLines(text) {
  const raw = String(text || '').trim()
  if (!raw) return []
  const numbered = parseNumberedItems(raw)
  if (numbered.length > 1) return numbered.map((it) => it.text)
  return raw.split(/\n+/).map((s) => stripNumberPrefix(s.trim())).filter(Boolean)
}

export function fieldsFromPairedCase({ prepLines = [], pairs = [] } = {}) {
  const steps = (pairs || []).filter((p) => String(p.step || '').trim())
  const expectedByStep = {}
  for (const p of pairs || []) {
    const exp = String(p.expected || '').trim()
    if (p.verify && exp) expectedByStep[p.num] = exp
  }
  const expectedNums = Object.keys(expectedByStep).map(Number).sort((a, b) => a - b)
  const prep = (prepLines || []).map((t) => String(t || '').trim()).filter(Boolean)
  return {
    precondition: prep.map((t, i) => `${i + 1}. ${t}`).join('\n'),
    steps: steps.map((p) => p.step.trim()),
    step_nums: steps.map((p) => p.num),
    steps_raw: steps.map((p) => `${p.num}. ${p.step.trim()}`).join('\n'),
    expected: expectedNums.map((n) => expectedByStep[n]),
    expected_nums: expectedNums,
    expected_raw: expectedNums.map((n) => `${n}. ${expectedByStep[n]}`).join('\n'),
    expected_by_step: expectedByStep,
  }
}
