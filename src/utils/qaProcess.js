/** 需求测试 / 版本测试流程：阶段、验收标准抽取、用例覆盖。阶段顺序读应用 workflow。 */

import { splitNumberedLines } from './caseText'
import {
  DEFAULT_WORKFLOW,
  DISPATCH_RUNS,
  findStep,
  firstGate,
  hasPassed,
  isNextStep,
  kindTab,
  kindTagType,
  reachedDispatch,
  resolveWorkflow,
  stepIndex,
  trackKey,
  trackSteps,
  understood,
} from './qaWorkflow'

function asGates(track) {
  return trackSteps(DEFAULT_WORKFLOW, track).map((s) => ({
    id: s.id,
    label: s.label,
    tab: kindTab(s.kind),
    hint: s.hint,
    kind: s.kind,
  }))
}

export const REQ_GATES = asGates('req')
export const REL_GATES = asGates('rel')

export const RUN_KINDS = {
  req_admit: { label: DISPATCH_RUNS.req_admit.label, env: 'test', coverage: 'once' },
  req_test: { label: DISPATCH_RUNS.req_test.label, env: 'test', coverage: 'once' },
  release_regression: { label: DISPATCH_RUNS.release_regression.label, env: 'pre', coverage: 'once' },
  release_smoke: { label: DISPATCH_RUNS.release_smoke.label, env: 'prod', coverage: 'once' },
}

export function gateLabel(kind, gate, workflow) {
  const step = findStep(workflow, kind, gate)
  return step?.label || gate || '—'
}

export function gateHint(kind, gate, workflow) {
  const step = findStep(workflow, kind, gate)
  return step?.hint || ''
}

export function gateTab(kind, gate, workflow) {
  const step = findStep(workflow, kind, gate)
  return step ? kindTab(step.kind) : ''
}

export function gateIndex(kind, gate, workflow) {
  return stepIndex(workflow, kind, gate)
}

export function gatePassed(kind, current, target, workflow) {
  return hasPassed(workflow, kind, current, target)
}

export function isNextGate(kind, current, target, workflow) {
  return isNextStep(workflow, kind, current, target)
}

export function gateTagType(gate, workflow, kind = 'req') {
  const step = findStep(workflow, kind, gate)
  if (step) return kindTagType(step.kind)
  return kindTagType(trackSteps(DEFAULT_WORKFLOW, kind).find((s) => s.id === gate)?.kind)
}

export function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function nowIso() {
  return new Date().toISOString()
}

export function emptyUnderstanding() {
  return {
    version: 1,
    confirmed: false,
    confirmed_at: '',
    source_excerpt: '',
    ac: [''],
    impact: { platforms: [], notes: '', e2e: false, how_to_run: '' },
    points: [],
    stale_risks: [],
    rule_candidates: [],
    extracted_at: '',
  }
}

function numberedItems(text) {
  const lines = String(text || '')
    .split(/\n+/)
    .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean)
  const out = []
  for (const line of lines) {
    const m = line.match(/^(?:\d+[.、．)）]|AC\s*\d+[:：.]?|验收\s*\d+[:：.]?)\s*(.+)$/i)
    if (m) out.push(m[1].trim())
  }
  return out
}

export function extractUnderstanding(sourceText, { title } = {}) {
  const text = String(sourceText || '').trim()
  const lines = text.split(/\n+/).map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean)
  let ac = numberedItems(text)
  if (!ac.length) {
    ac = lines.filter((l) => /应当|必须|支持|可以|验收|完成/.test(l)).slice(0, 8)
  }
  if (!ac.length && title) ac = [`${title} 主流程可完成`]
  if (!ac.length) ac = ['主流程可完成']

  const platforms = []
  if (/ios|iphone|苹果/i.test(text)) platforms.push('ios')
  if (/android|安卓/i.test(text)) platforms.push('android')
  if (/app|移动端|客户端/i.test(text)) platforms.push('app')
  if (/web|h5|后台|管理端|网页|运营平台|运营后台|cms/i.test(text)) platforms.push('web')
  const e2e = /端到端|跨端/.test(text)
  if (e2e) platforms.push('e2e')

  const notes = []
  if (/登录|账号|token/i.test(text)) notes.push('账号态')
  if (/支付|订单|钱包/.test(text)) notes.push('支付')
  if (/权限|相册|相机|定位/.test(text)) notes.push('系统权限')
  if (/上传|选图|本地图片/.test(text)) notes.push('图片上传')
  if (/运营平台|运营后台/.test(text)) notes.push('运营平台')
  if (e2e) notes.push('端到端')

  const points = ac.map((item, i) => ({
    id: `tp${i + 1}`,
    kind: /异常|失败|取消|超时|无网|错误/.test(item) ? '异常' : (i === 0 ? '正向' : '正向'),
    text: item,
    case_ids: [],
    waived: false,
  }))
  if (!points.some((p) => p.kind === '异常')) {
    points.push({
      id: `tp${points.length + 1}`,
      kind: '异常',
      text: '失败 / 取消路径有明确提示且可恢复',
      case_ids: [],
      waived: false,
    })
  }
  if (!points.some((p) => /边界|空|上限|重复/.test(p.text))) {
    points.push({
      id: `tp${points.length + 1}`,
      kind: '边界',
      text: '空态 / 重复提交 / 极限输入不被错误提交',
      case_ids: [],
      waived: false,
    })
  }

  const rule_candidates = lines
    .filter((l) => /必须|不能|仅当|先.+再/.test(l))
    .slice(0, 6)

  return {
    version: 1,
    confirmed: false,
    confirmed_at: '',
    source_excerpt: text.slice(0, 20000),
    ac,
    impact: {
      platforms,
      notes: notes.join('、'),
      e2e,
      how_to_run: e2e ? '需要跨端验证' : '',
    },
    points,
    stale_risks: [],
    rule_candidates,
    extracted_at: nowIso(),
  }
}

function caseBlob(row) {
  return `${row.case_id || ''} ${row.name || row.title || ''} ${row.module || ''} ${row.requirement_id || row.req_id || row.story_id || ''}`.toLowerCase()
}

export function caseRequirementId(row) {
  return String(row?.requirement_id || row?.req_id || row?.story_id || '').trim()
}

export function casesForRequirement(cases, requirement) {
  const list = Array.isArray(cases) ? cases : []
  const ext = String(requirement?.external_id || '').trim().toLowerCase()
  const id = String(requirement?.id || '').trim().toLowerCase()
  if (!ext && !id) return []
  return list
    .filter((c) => {
      const rid = caseRequirementId(c).toLowerCase()
      return rid && (rid === ext || rid === id)
    })
    .map((c) => c.case_id)
    .filter(Boolean)
}

export function matchCaseIds(understanding, cases, requirement) {
  const list = Array.isArray(cases) ? cases : []
  const ext = String(requirement?.external_id || requirement?.id || '').trim().toLowerCase()
  const exact = new Set(casesForRequirement(list, requirement))
  const tokens = (understanding?.points || [])
    .flatMap((p) => String(p.text || '').split(/[\s,，、/]+/))
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 2)
  const scored = []
  for (const c of list) {
    if (!c?.case_id) continue
    if (exact.has(c.case_id)) {
      scored.push({ id: c.case_id, score: 100 })
      continue
    }
    const blob = caseBlob(c)
    let score = 0
    if (ext && blob.includes(ext)) score += 8
    for (const t of tokens.slice(0, 24)) {
      if (t.length >= 2 && blob.includes(t)) score += 1
    }
    if (score > 0) scored.push({ id: c.case_id, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 20).map((x) => x.id).filter(Boolean)
}

/** 只保留测试点上已挂且仍在池里的用例。禁止把剩余 ID 抹到每个缺口上造成假覆盖。 */
export function applyCoverage(understanding, caseIds) {
  const ids = new Set((caseIds || []).filter(Boolean))
  const points = (understanding?.points || []).map((p) => {
    if (p.waived) return { ...p }
    if (!ids.size) return { ...p, case_ids: [] }
    return { ...p, case_ids: (p.case_ids || []).filter((id) => ids.has(id)) }
  })
  return { ...understanding, points }
}

export function reqSigned(req, workflow) {
  if (Boolean(req?.signoff)) return true
  const step = findStep(workflow, 'req', req?.gate)
  if (step?.kind === 'archive') return true
  return req?.gate === 'hand'
}

export function reqOptionLabel(req, workflow) {
  if (!req) return ''
  const tag = reqSigned(req, workflow) ? '已验收' : '已挂版本'
  return `${tag} · ${gateLabel('req', req.gate, workflow)} · ${req.title}`
}

export function flattenMindmap(root) {
  const rows = []
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object') return
    const name = String(node.text || node.title || node.name || '').trim()
    const kind = String(node.kind || '')
    const children = (node.children || []).filter((c) => c && typeof c === 'object')
    const isLeaf = !children.length
    const isPoint = Boolean(name) && kind !== 'root' && kind !== 'platform' && (
      kind === 'point' || (isLeaf && kind !== 'module' && kind !== 'feature')
    )
    if (name && kind !== 'root' && kind !== 'platform') {
      rows.push({
        name,
        kind,
        depth,
        detail: String(node.detail || '').trim(),
        isLeaf,
        isPoint,
        orphan: Boolean(node.orphan),
      })
    }
    for (const child of children) walk(child, depth + (kind === 'root' || kind === 'platform' ? 0 : 1))
  }
  walk(root, 0)
  return rows
}

export function mindmapPointRows(root) {
  return flattenMindmap(root).filter((row) => row.isPoint)
}

export function coverHistory(req, job) {
  return [...(req?.cover_history || [])]
    .filter((row) => row && (!job || row.job === job))
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
}

export function coverReady(req) {
  const points = mindmapPointRows(req?.mindmap)
  const cases = req?.draft_cases || []
  if (!points.length) return { ok: false, reason: '测试脑图还没写完，请等待或重试' }
  if (!cases.length) return { ok: false, reason: '用例还没写完，请等待或重试' }
  const { gaps, stubbed, aspectGaps } = coverageStats(req)
  if (gaps) return { ok: false, reason: `还有 ${gaps} 个测试点没挂用例（可标「本版本不测」）` }
  // 模板兜底不算覆盖：以前这里放行，界面显示 100%，人打开一看全是「1. 打开应用 2. 按正向路径覆盖」。
  if (stubbed) return { ok: false, reason: `${stubbed} 个测试点只有模板兜底用例，请补写或标「本版本不测」` }
  if (aspectGaps.length) {
    return { ok: false, reason: `${aspectGaps.length} 个测试点缺情况（正向/异常/边界），请补写` }
  }
  return { ok: true }
}

/** case_id → origin（llm / stub / human / import）。缺省当 llm。 */
function caseOriginMap(req) {
  const map = new Map()
  for (const c of req?.draft_cases || []) {
    if (c?.case_id) map.set(String(c.case_id), String(c.origin || 'llm'))
  }
  return map
}

export function coverageStats(req) {
  const points = req?.understanding?.points || []
  const origins = caseOriginMap(req)
  const realCaseIds = (p) => (p.case_ids || []).filter((id) => origins.get(String(id)) !== 'stub')

  const waived = points.filter((p) => p.waived)
  const real = points.filter((p) => !p.waived && realCaseIds(p).length)
  // 只有模板兜底的点：有 case_ids，但没有一条不是 stub
  const stubbed = points.filter(
    (p) => !p.waived && !realCaseIds(p).length && (p.case_ids || []).length,
  )
  const gaps = points.filter((p) => !p.waived && !(p.case_ids || []).length)

  return {
    total: points.length,
    // covered = 不用再管的点。模板兜底**不算**覆盖，否则覆盖率虚高。
    covered: waived.length + real.length,
    real: real.length,
    waived: waived.length,
    stubbed: stubbed.length,
    gaps: gaps.length,
    gapItems: gaps,
    stubItems: stubbed,
    // 后端确定性校验的结果：每个点该有的情况齐不齐
    aspectGaps: req?.case_aspect_gaps || [],
    failures: req?.case_failures || [],
    mindmapFailures: req?.mindmap_failures || [],
    analyzeFailures: req?.analyze_failures || [],
  }
}

export function linkedCaseIds(req) {
  const set = new Set()
  for (const p of req?.understanding?.points || []) {
    for (const id of p.case_ids || []) if (id) set.add(id)
  }
  for (const id of req?.case_ids || []) if (id) set.add(id)
  for (const row of req?.draft_cases || []) {
    if (row?.case_id) set.add(row.case_id)
  }
  return [...set]
}

/** 流程里写出来的用例，转成和下发对话框同一套结构。 */
export function generatedCasesFromProcess(requirements = []) {
  const rows = []
  for (const req of requirements || []) {
    const title = String(req?.title || req?.external_id || '需求').trim() || '需求'
    for (const raw of req?.draft_cases || []) {
      if (!raw || typeof raw !== 'object') continue
      const caseId = String(raw.case_id || '').trim()
      if (!caseId) continue
      const stepsRaw = Array.isArray(raw.steps) ? raw.steps.join('\n') : String(raw.steps || raw.steps_raw || '')
      const expectedRaw = Array.isArray(raw.expected) ? raw.expected.join('\n') : String(raw.expected || raw.expected_raw || '')
      const module = String(raw.module || '').trim()
      rows.push({
        ...raw,
        case_id: caseId,
        name: raw.name || raw.title || caseId,
        title: raw.name || raw.title || caseId,
        module: module ? `本需求生成 / ${title} / ${module}` : `本需求生成 / ${title}`,
        source: 'generated',
        requirement_id: req.id || raw.requirement_id || '',
        requirement_title: title,
        steps: Array.isArray(raw.steps) ? raw.steps : splitNumberedLines(stepsRaw),
        expected: Array.isArray(raw.expected) ? raw.expected : splitNumberedLines(expectedRaw),
        steps_raw: stepsRaw,
        expected_raw: expectedRaw,
        precondition: raw.precondition || raw.pre || '',
        platform: raw.platform || '',
      })
    }
  }
  return rows
}

export function mergeRunCases(primary = [], extra = []) {
  const by = new Map()
  for (const c of [...(primary || []), ...(extra || [])]) {
    if (c?.case_id && !by.has(String(c.case_id))) by.set(String(c.case_id), c)
  }
  return [...by.values()]
}

function canLeaveStep(track, entity, current, next) {
  if (!current) return { ok: true }
  if (current.kind === 'human_verdict') {
    return {
      ok: false,
      reason: trackKey(track) === 'rel'
        ? '发版评审必须测试同学判定通过或带风险'
        : '测试验收必须测试同学判定，不能自动通过',
    }
  }
  if (current.kind === 'archive') {
    return { ok: false, reason: '已结束，不能再往下走' }
  }
  if (current.kind === 'understand') {
    const ac = (entity?.understanding?.ac || []).map((s) => String(s || '').trim()).filter(Boolean)
    if (!ac.length) return { ok: false, reason: '至少写一条验收标准，才能结束评审' }
    return { ok: true }
  }
  if (current.kind === 'cover') {
    return coverReady(entity)
  }
  if (current.kind === 'scope') {
    if (next?.kind === 'dispatch' && !(entity?.case_ids || []).length) {
      return { ok: false, reason: '先圈定回归用例' }
    }
    return { ok: true }
  }
  return { ok: true }
}

export function canAdvanceTicket(track, entity, toGate, workflow) {
  const steps = trackSteps(workflow, track)
  const from = entity?.gate || firstGate(workflow, track)
  const iFrom = steps.findIndex((s) => s.id === from)
  const iTo = steps.findIndex((s) => s.id === toGate)
  if (iTo < 0) return { ok: false, reason: '未知阶段' }
  if (iTo === iFrom) return { ok: true }
  if (iTo < iFrom) return { ok: true }
  if (iTo !== iFrom + 1) return { ok: false, reason: '请按阶段顺序往下走，不能跳步' }
  return canLeaveStep(track, entity, steps[iFrom], steps[iTo])
}

export function canAdvanceReq(req, toGate, workflow) {
  return canAdvanceTicket('req', req, toGate, workflow)
}

export function canAdvanceRel(rel, toGate, workflow) {
  return canAdvanceTicket('rel', rel, toGate, workflow)
}

export function signOffReport(req, tasks = []) {
  const stats = coverageStats(req)
  const runs = (req?.runs || []).map((r) => {
    const task = tasks.find((t) => t.taskId === r.task_id)
    return { ...r, task }
  })
  const testRuns = runs.filter((r) => r.kind === 'req_test')
  const latest = testRuns[testRuns.length - 1]
  const failed = Number(latest?.task?.failed || 0)
  const blocked = Number(latest?.task?.blocked || 0)
  const passed = Number(latest?.task?.passed || 0)
  let suggest = '不能验收'
  if (!latest) suggest = '还没跑功能测试'
  else if (failed || blocked) suggest = '带风险'
  else suggest = '可以验收'
  return {
    understanding_version: req?.understanding?.version || 1,
    ac: req?.understanding?.ac || [],
    coverage: stats,
    unrun: stats.gapItems.map((p) => p.text),
    failed,
    blocked,
    passed,
    latest_task_id: latest?.task_id || '',
    suggest,
  }
}

export function goNoGoReport(rel, requirements = [], tasks = [], workflow) {
  const reqs = (rel?.requirement_ids || []).map((id) => requirements.find((r) => r.id === id)).filter(Boolean)
  const unsigned = reqs.filter((r) => !reqSigned(r, workflow))
  const runs = (rel?.runs || []).map((r) => {
    const task = tasks.find((t) => t.taskId === r.task_id)
    return { ...r, task }
  })
  const latest = [...runs].reverse().find((r) => r.kind === 'release_regression')
  const failed = Number(latest?.task?.failed || 0)
  const blocked = Number(latest?.task?.blocked || 0)
  let suggest = '阻断'
  if (!latest) suggest = '尚未跑预发回归'
  else if (failed || blocked || unsigned.length) suggest = '带风险'
  else suggest = '通过'
  return {
    locked: reqs.map((r) => r.title),
    unsigned: unsigned.map((r) => r.title),
    case_count: (rel?.case_ids || []).length,
    failed,
    blocked,
    latest_task_id: latest?.task_id || '',
    suggest,
  }
}

export function bmWatchStatus({ requirements = [], releases = [], tasks = [], workflow } = {}) {
  const todos = []
  const wf = resolveWorkflow(workflow)
  for (const r of requirements) {
    const step = findStep(wf, 'req', r.gate)
    if (step?.kind === 'understand') todos.push(`「${r.title}」待需求评审`)
    else if (step?.kind === 'cover') todos.push(`「${r.title}」用例还没备齐`)
    else if (step?.kind === 'human_verdict') todos.push(`「${r.title}」待测试验收`)
    else if (step?.kind === 'checkpoint') todos.push(`「${r.title}」待完成「${step.label}」`)
  }
  for (const r of releases) {
    const step = findStep(wf, 'rel', r.gate)
    const scopes = trackSteps(wf, 'rel').filter((s) => s.kind === 'scope')
    if (step?.kind === 'scope') {
      const si = scopes.findIndex((s) => s.id === step.id)
      todos.push(si <= 0 ? `「${r.title}」待${step.label}` : `「${r.title}」${step.label}未定`)
    } else if (step?.kind === 'human_verdict') todos.push(`「${r.title}」待发版评审`)
    else if (step?.kind === 'checkpoint') todos.push(`「${r.title}」待完成「${step.label}」`)
  }
  const runIds = new Set(
    [...requirements, ...releases].flatMap((row) => (row.runs || []).map((r) => r.task_id)).filter(Boolean),
  )
  const running = tasks.some((t) => runIds.has(t.taskId) && ['running', 'queued'].includes(t.status))
  if (running) return { id: 'dispatching', label: '正在跑测试', todos }
  if (todos.length) return { id: 'blocked', label: `${todos.length} 条停在当前阶段`, todos }
  if (!releases.length) return { id: 'empty', label: '先建一个版本', todos }
  return { id: 'watching', label: '阶段都过了，可以排下一轮', todos }
}

export function createRequirement({ title, external_id, source_url, source_text, case_ids = [], workflow } = {}) {
  const understanding = extractUnderstanding(source_text || '', { title })
  return {
    id: newId('req'),
    title: String(title || '未命名需求').trim() || '未命名需求',
    external_id: String(external_id || '').trim(),
    source_url: String(source_url || '').trim(),
    gate: firstGate(workflow, 'req'),
    understanding,
    case_ids: [...case_ids].filter(Boolean),
    runs: [],
    signoff: null,
    plan: { test_start: '', test_end: '', review_at: '', online_at: '' },
    ai_artifacts: [],
    created_at: nowIso(),
    updated_at: nowIso(),
  }
}

export function createRelease({ title, requirement_ids = [], workflow } = {}) {
  return {
    id: newId('rel'),
    title: String(title || '未命名版本').trim() || '未命名版本',
    gate: firstGate(workflow, 'rel'),
    requirement_ids: [...requirement_ids],
    case_ids: [],
    runs: [],
    verdict: null,
    plan: { test_start: '', test_end: '', online_at: '' },
    ai_artifacts: [],
    created_at: nowIso(),
    updated_at: nowIso(),
  }
}

export const ASSIST_JOBS = [
  { id: 'analyze_req', label: '需求分析' },
  { id: 'draft_mindmap', label: '测试脑图' },
  { id: 'draft_cases', label: '写用例' },
  { id: 'map_cases', label: '对照用例' },
  { id: 'classify_fail', label: '失败分类' },
  { id: 'draft_sign', label: '验收建议' },
  { id: 'draft_gate', label: '发版建议' },
  { id: 'pick_regression', label: '圈回归' },
]

function djb2(text) {
  let h = 5381
  const s = String(text || '')
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

export function assistInputHash({ job, req, rel, cases = [], tasks = [], requirements = [] } = {}) {
  const bits = [job]
  if (req) {
    bits.push(req.id, req.external_id || '', req.understanding?.source_excerpt || '')
    bits.push((req.understanding?.points || []).map((p) => `${p.id}:${p.text}:${(p.case_ids || []).join(',')}:${p.waived ? 1 : 0}`).join('|'))
    bits.push((req.runs || []).map((r) => r.task_id).join(','))
  }
  if (rel) {
    bits.push(rel.id, (rel.requirement_ids || []).join(','), (rel.case_ids || []).join(','))
    bits.push((rel.runs || []).map((r) => r.task_id).join(','))
    bits.push((rel.requirement_ids || []).map((id) => {
      const r = (requirements || []).find((x) => x.id === id)
      return r ? `${id}:${r.gate}:${r.signoff ? 1 : 0}` : id
    }).join(','))
  }
  bits.push((cases || []).map((c) => `${c.case_id}:${caseRequirementId(c)}`).join(','))
  const runIds = [...(req?.runs || []), ...(rel?.runs || [])].map((r) => r.task_id).filter(Boolean)
  for (const id of runIds) {
    const t = (tasks || []).find((x) => x.taskId === id)
    if (t) bits.push(`${id}:${t.status}:${t.failed}:${t.blocked}:${t.passed}`)
  }
  return djb2(bits.join('\n'))
}

export function createArtifact({ job, payload = {}, citations = [], suggest = '', input_hash = '', engine = 'rule' } = {}) {
  const text = String(suggest || '').trim()
  return {
    id: newId('ai'),
    job,
    status: 'draft',
    engine,
    at: nowIso(),
    input_hash,
    citations: [...citations].filter(Boolean),
    suggest: text.startsWith('建议') ? text : (text ? `建议：${text}` : ''),
    payload,
  }
}

export function latestArtifact(entity, job) {
  const list = [...(entity?.ai_artifacts || [])].filter((a) => a.job === job)
  list.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
  return list[0] || null
}

export function visibleArtifact(entity, job, currentHash) {
  const art = latestArtifact(entity, job)
  if (!art) return null
  if (currentHash && art.input_hash && art.input_hash !== currentHash) {
    return { ...art, status: 'stale' }
  }
  return art
}

export function upsertArtifact(list = [], art) {
  const next = (list || []).filter((a) => !(a.job === art.job && a.status === 'draft'))
  return [art, ...next].slice(0, 40)
}

export function acceptArtifact(list = [], artifactId) {
  return (list || []).map((a) => (a.id === artifactId ? { ...a, status: 'accepted', accepted_at: nowIso() } : a))
}

function scoreCaseToPoint(point, row) {
  const blob = caseBlob(row)
  const tokens = String(point?.text || '').split(/[\s,，、/]+/).map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 2)
  let score = 0
  for (const t of tokens.slice(0, 12)) {
    if (blob.includes(t)) score += 3
  }
  return score
}

export function mapCasesJob({ req, cases = [] } = {}) {
  const poolRows = []
  const exactIds = new Set(casesForRequirement(cases, req))
  const weakIds = new Set(matchCaseIds(req?.understanding, cases, req))
  for (const c of cases || []) {
    if (!c?.case_id) continue
    if (exactIds.has(c.case_id) || weakIds.has(c.case_id)) poolRows.push(c)
  }
  const mappings = []
  const gaps = []
  for (const p of req?.understanding?.points || []) {
    if (p.waived) continue
    const hung = new Set(p.case_ids || [])
    const scored = []
    for (const c of poolRows) {
      if (hung.has(c.case_id)) continue
      let score = exactIds.has(c.case_id) ? 24 : 8
      score += scoreCaseToPoint(p, c)
      if (score >= 24) scored.push({ case_id: c.case_id, title: c.name || c.title || c.case_id, score })
    }
    scored.sort((a, b) => b.score - a.score)
    const top = scored.slice(0, 3)
    if (top.length) mappings.push({ point_id: p.id, point_text: p.text, hung: [...hung], suggest: top })
    else if (!hung.size) {
      gaps.push({
        point_id: p.id,
        point_text: p.text,
        reason: exactIds.size ? '池里没有能对上的步骤，去用例库补或手写草稿' : '用例库没有能对上本需求编号的用例',
      })
    }
  }
  return createArtifact({
    job: 'map_cases',
    suggest: gaps.length
      ? `${gaps.length} 个测试点还缺用例，去用例库补或手选`
      : (mappings.length ? `${mappings.length} 个测试点可挂用例，采纳后才算覆盖` : '测试点已挂满，或还没有测试点'),
    citations: mappings.flatMap((m) => m.suggest.map((s) => s.case_id)),
    payload: { mappings, gaps, pool_count: exactIds.size || poolRows.length },
  })
}

function latestTaskFor(runs = [], kind, tasks = []) {
  const row = [...(runs || [])].reverse().find((r) => r.kind === kind)
  if (!row) return { row: null, task: null }
  return { row, task: (tasks || []).find((t) => t.taskId === row.task_id) || null }
}

export function classifyFailJob({ task } = {}) {
  const rows = (task?.cases || []).filter((c) => ['fail', 'failed', 'blocked', 'error'].includes(String(c.status || '').toLowerCase()))
  const items = rows.map((c) => {
    const blob = `${c.error || ''} ${c.message || ''} ${c.name || c.title || ''}`.toLowerCase()
    let kind = '产品'
    if (/timeout|超时|断开|offline|设备|安装失败|无网/.test(blob)) kind = '环境'
    else if (/找不到|locator|控件|走神|未看到|没点到|元素/.test(blob)) kind = '走神'
    else if (/过期|文案变|已下线|改版/.test(blob)) kind = '用例过期'
    return {
      case_id: c.case_id || c.caseId,
      title: c.name || c.title || '',
      kind,
      status: c.status,
    }
  })
  const wander = items.filter((i) => i.kind === '走神').map((i) => i.case_id).filter(Boolean)
  return createArtifact({
    job: 'classify_fail',
    suggest: items.length ? `${items.length} 条失败已分类${wander.length ? `，${wander.length} 条像走神可重跑` : ''}` : '没有失败条',
    citations: items.map((i) => i.case_id),
    payload: { items, rerun_ids: wander },
  })
}

export function draftSignJob({ req, tasks = [] } = {}) {
  const report = signOffReport(req, tasks)
  const { task } = latestTaskFor(req?.runs, 'req_test', tasks)
  const failArt = classifyFailJob({ task })
  return createArtifact({
    job: 'draft_sign',
    suggest: report.suggest,
    citations: [report.latest_task_id, ...failArt.citations],
    payload: { report, fails: failArt.payload },
  })
}

export function draftGateJob({ rel, requirements = [], tasks = [], workflow } = {}) {
  const report = goNoGoReport(rel, requirements, tasks, workflow)
  const { task } = latestTaskFor(rel?.runs, 'release_regression', tasks)
  const failArt = classifyFailJob({ task })
  return createArtifact({
    job: 'draft_gate',
    suggest: report.suggest,
    citations: [report.latest_task_id, ...failArt.citations],
    payload: { report, fails: failArt.payload },
  })
}

export function pickRegressionJob({ rel, requirements = [], cases = [], suites = [], workflow } = {}) {
  const reqs = (rel?.requirement_ids || []).map((id) => requirements.find((r) => r.id === id)).filter(Boolean)
  const signed = reqs.filter((r) => reqSigned(r, workflow))
  const unsigned = reqs.filter((r) => !reqSigned(r, workflow))
  const smoke = (suites || []).find((s) => /冒烟|smoke/i.test(s.name || ''))
  const smokeIds = smoke ? (smoke.case_ids || []) : []
  const passIds = [...new Set(signed.flatMap((r) => linkedCaseIds(r)).concat(smokeIds))]
  const riskIds = [...new Set(unsigned.flatMap((r) => linkedCaseIds(r)))]
  return createArtifact({
    job: 'pick_regression',
    suggest: unsigned.length
      ? `建议回归 ${passIds.length} 条；还有 ${unsigned.length} 条需求未验收，它们的 ${riskIds.length} 条用例不要自动带上`
      : `建议回归 ${passIds.length} 条，可圈进预发回归`,
    citations: passIds,
    payload: {
      pass_ids: passIds,
      risk_ids: riskIds,
      unsigned: unsigned.map((r) => r.title),
      smoke_name: smoke?.name || '',
    },
  })
}

export function runAssistJob(job, ctx = {}) {
  if (job === 'map_cases') return mapCasesJob(ctx)
  if (job === 'classify_fail') {
    const { task } = ctx.task
      ? { task: ctx.task }
      : latestTaskFor(ctx.req?.runs || ctx.rel?.runs, ctx.req ? 'req_test' : 'release_regression', ctx.tasks)
    return classifyFailJob({ task })
  }
  if (job === 'draft_sign') return draftSignJob(ctx)
  if (job === 'draft_gate') return draftGateJob(ctx)
  if (job === 'pick_regression') return pickRegressionJob(ctx)
  return createArtifact({ job, suggest: '未知建议任务' })
}

export function formatShortTime(iso) {
  const s = String(iso || '').replace('T', ' ')
  return s.slice(5, 16) || '—'
}

export const SLOT_KINDS = [
  { id: 'req_test', label: '功能测试', env: 'test', run: 'req_test' },
  { id: 'req_admit', label: '提测冒烟', env: 'test', run: 'req_admit' },
  { id: 'req_review', label: '需求提审', env: 'test', run: '' },
  { id: 'req_online', label: '需求上线', env: 'prod', run: '' },
  { id: 'rel_test', label: '版本开测', env: 'pre', run: 'release_regression' },
  { id: 'rel_online', label: '版本上线', env: 'prod', run: 'release_smoke' },
]

export function slotKindMeta(id) {
  return SLOT_KINDS.find((k) => k.id === id) || { id, label: id || '排期', env: 'test', run: '' }
}

export function parseWhen(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

export function startOfWeek(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const wd = d.getDay()
  d.setDate(d.getDate() + (wd === 0 ? -6 : 1 - wd))
  return d
}

export function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

export function dayKey(date) {
  const d = new Date(date)
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function weekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

export function isSameDay(a, b) {
  return dayKey(a) === dayKey(b)
}

export function slotTouchesDay(slot, day) {
  const s = parseWhen(slot?.start_at)
  const e = parseWhen(slot?.end_at) || s
  if (!s) return false
  const from = new Date(day)
  from.setHours(0, 0, 0, 0)
  const to = addDays(from, 1)
  return s < to && e > from
}

export function slotsOverlap(a, b) {
  const as = parseWhen(a?.start_at)
  const ae = parseWhen(a?.end_at) || as
  const bs = parseWhen(b?.start_at)
  const be = parseWhen(b?.end_at) || bs
  if (!as || !bs) return false
  return as < be && bs < ae
}

export function conflictingSlotIds(slots = []) {
  const hits = new Set()
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      const a = slots[i]
      const b = slots[j]
      const share = (a.sns || []).some((sn) => (b.sns || []).includes(sn))
      if (share && slotsOverlap(a, b)) {
        hits.add(a.id)
        hits.add(b.id)
      }
    }
  }
  return hits
}

export function formatClock(iso) {
  const d = parseWhen(iso)
  if (!d) return ''
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`
}

export function formatDayLabel(date) {
  const names = ['日', '一', '二', '三', '四', '五', '六']
  const d = new Date(date)
  return `${d.getMonth() + 1}/${d.getDate()} 周${names[d.getDay()]}`
}

export function defaultSlotRange(day = new Date()) {
  const start = new Date(day)
  start.setHours(0, 0, 0, 0)
  const end = addDays(start, 1)
  return { start_at: start.toISOString(), end_at: end.toISOString() }
}

export function createSlot(partial = {}) {
  const range = defaultSlotRange(partial.start_at ? parseWhen(partial.start_at) : new Date())
  return {
    id: partial.id || newId('sch'),
    kind: partial.kind || 'req_test',
    title: String(partial.title || '').trim(),
    requirement_id: partial.requirement_id || '',
    release_id: partial.release_id || '',
    sns: [...(partial.sns || [])],
    start_at: partial.start_at || range.start_at,
    end_at: partial.end_at || range.end_at,
    note: String(partial.note || '').trim(),
    created_at: partial.created_at || nowIso(),
  }
}

export function slotTitle(slot, { requirements = [], releases = [] } = {}) {
  if (slot?.title) return slot.title
  const req = requirements.find((r) => r.id === slot?.requirement_id)
  const rel = releases.find((r) => r.id === slot?.release_id)
  return req?.title || rel?.title || slotKindMeta(slot?.kind).label
}

function pad2(n) {
  return `${n}`.padStart(2, '0')
}

function ymd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function isMidnight(d) {
  return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0
}

function parseDateInput(value) {
  if (!value) return null
  const raw = String(value).trim()
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00`)
    : new Date(raw.includes(' ') ? raw.replace(' ', 'T') : raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/** 半开区间 [start, end) 里，end 若落在次日 00:00，最后计入的是前一天。 */
export function inclusiveEndDate(iso) {
  const d = parseWhen(iso)
  if (!d) return null
  if (isMidnight(d)) return addDays(d, -1)
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function toInclusiveDateValue(iso, { end = false } = {}) {
  const d = parseWhen(iso)
  if (!d) return ''
  if (end) {
    const last = inclusiveEndDate(iso)
    return last ? ymd(last) : ''
  }
  return ymd(d)
}

export function fromDateStart(value) {
  const d = parseDateInput(value)
  if (!d) return ''
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export function fromDateEnd(value) {
  const d = parseDateInput(value)
  if (!d) return ''
  d.setHours(0, 0, 0, 0)
  return addDays(d, 1).toISOString()
}

export function isAllDaySlot(slot) {
  const s = parseWhen(slot?.start_at)
  const e = parseWhen(slot?.end_at)
  if (!s || !e || e <= s) return false
  const startMidnight = isMidnight(s)
  const endMidnight = isMidnight(e)
  const endEod = e.getHours() === 23 && e.getMinutes() >= 59
  return startMidnight && (endMidnight || endEod)
}

export function canCreateSlot(kind, { req, rel, workflow } = {}) {
  if (kind === 'req_admit' || kind === 'req_test') {
    if (!req) return { ok: false, reason: '请选择需求' }
    if (!understood(req, workflow)) {
      return { ok: false, reason: '需求还没评审完，不能排提测冒烟 / 功能测试' }
    }
    const run = kind === 'req_admit' ? 'req_admit' : 'req_test'
    if (!reachedDispatch(req, workflow, 'req', run)) {
      return {
        ok: false,
        reason: kind === 'req_test'
          ? '还没到功能测试，不能排（可先排提测冒烟）'
          : '还没到提测冒烟，不能排',
      }
    }
    return { ok: true }
  }
  if (kind === 'req_review' || kind === 'req_online') {
    if (!req) return { ok: false, reason: '请选择需求' }
    return { ok: true }
  }
  if (kind === 'rel_test' || kind === 'rel_online') {
    if (!rel) return { ok: false, reason: '请选择版本' }
    return { ok: true }
  }
  return { ok: true }
}

export function deviceGroupId(row) {
  if (row?.unassigned) return 'none'
  const blob = `${row.execChannel || ''} ${row.device_type || ''} ${row.channels?.ios_state || ''}`.toLowerCase()
  if (blob.includes('ios') || blob.includes('iphone') || blob.includes('ipad')) return 'ios'
  return 'android'
}

export function groupDeviceRows(rows = []) {
  const labels = { android: 'Android', ios: 'iOS', none: '不占设备' }
  const buckets = { android: [], ios: [], none: [] }
  for (const row of rows) buckets[deviceGroupId(row)].push(row)
  return ['android', 'ios', 'none']
    .filter((id) => buckets[id].length)
    .map((id) => ({ id, label: labels[id], rows: buckets[id] }))
}

export function persistableSlot(slot) {
  return {
    id: slot?.id,
    kind: slot?.kind || 'req_test',
    title: String(slot?.title || '').trim(),
    requirement_id: slot?.requirement_id || '',
    release_id: slot?.release_id || '',
    sns: [...(slot?.sns || [])],
    start_at: slot?.start_at || '',
    end_at: slot?.end_at || '',
    note: String(slot?.note || '').trim(),
    created_at: slot?.created_at || nowIso(),
  }
}

export function nextUpcomingSlot(slots = [], now = new Date()) {
  const t = now.getTime()
  return (slots || [])
    .map((s) => ({
      s,
      start: parseWhen(s?.start_at)?.getTime() || 0,
      end: parseWhen(s?.end_at)?.getTime() || 0,
    }))
    .filter((x) => (x.end || x.start) > t)
    .sort((a, b) => a.start - b.start)[0]?.s || null
}

export function formatSlotCardLine(slot) {
  const d = parseWhen(slot?.start_at)
  if (!d) return ''
  const names = ['日', '一', '二', '三', '四', '五', '六']
  return `周${names[d.getDay()]} ${barRangeLabel(slot)} · ${slotKindMeta(slot.kind).label}`
}

export function isWeekend(date) {
  const d = new Date(date).getDay()
  return d === 0 || d === 6
}

export function weekRangeMs(weekStart) {
  const from = new Date(weekStart)
  from.setHours(0, 0, 0, 0)
  const to = addDays(from, 7)
  return { from, to, span: to.getTime() - from.getTime() }
}

export function ganttBarStyle(slot, weekStart) {
  const { from, to, span } = weekRangeMs(weekStart)
  const s = parseWhen(slot?.start_at)
  const e = parseWhen(slot?.end_at) || s
  if (!s) return { display: 'none' }
  const a = Math.max(from.getTime(), s.getTime())
  let b = Math.min(to.getTime(), e.getTime())
  if (b <= a) b = a + 36e5
  const left = ((a - from.getTime()) / span) * 100
  const width = Math.max(1.4, ((b - a) / span) * 100)
  return { left: `${left}%`, width: `${width}%` }
}

export function ganttTodayStyle(weekStart, now = new Date()) {
  const { from, to, span } = weekRangeMs(weekStart)
  if (now < from || now >= to) return null
  return { left: `${((now.getTime() - from.getTime()) / span) * 100}%` }
}

export function layoutGanttLanes(slots = []) {
  const sorted = [...slots].sort((a, b) => (
    (parseWhen(a.start_at)?.getTime() || 0) - (parseWhen(b.start_at)?.getTime() || 0)
  ))
  const laneEnds = []
  return sorted.map((slot) => {
    const start = parseWhen(slot.start_at)?.getTime() || 0
    let lane = laneEnds.findIndex((end) => start >= end)
    if (lane < 0) {
      lane = laneEnds.length
      laneEnds.push(0)
    }
    laneEnds[lane] = parseWhen(slot.end_at)?.getTime() || start
    return { slot, lane }
  })
}

export function slotHours(slot) {
  const s = parseWhen(slot?.start_at)
  const e = parseWhen(slot?.end_at) || s
  if (!s) return 0
  return Math.max(0, (e - s) / 36e5)
}

export function barRangeLabel(slot) {
  const s = parseWhen(slot?.start_at)
  const e = parseWhen(slot?.end_at) || s
  if (!s) return ''
  const last = inclusiveEndDate(slot.end_at) || e
  const allDay = isAllDaySlot(slot)
  if (dayKey(s) === dayKey(last)) {
    return allDay ? `${s.getMonth() + 1}/${s.getDate()} 全天` : `${formatClock(slot.start_at)}–${formatClock(slot.end_at)}`
  }
  const span = `${s.getMonth() + 1}/${s.getDate()}–${last.getMonth() + 1}/${last.getDate()}`
  return allDay ? span : `${span} ${formatClock(slot.start_at)}–${formatClock(slot.end_at)}`
}

export function formatShortDate(iso) {
  const d = parseWhen(iso)
  if (!d) return '—'
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function sortReleases(releases = []) {
  return [...(releases || [])].filter(Boolean).sort((a, b) => {
    const ta = String(a.created_at || a.updated_at || '')
    const tb = String(b.created_at || b.updated_at || '')
    if (ta !== tb) return ta.localeCompare(tb)
    return String(a.title || '').localeCompare(String(b.title || ''))
  })
}

export function previousRelease(releases, release) {
  if (!release) return null
  const sorted = sortReleases(releases)
  const idx = sorted.findIndex((r) => r.id === release.id)
  return idx > 0 ? sorted[idx - 1] : null
}

function hungPaths(atlas, reqId) {
  const rid = String(reqId || '')
  if (!rid) return []
  const rows = []
  const walk = (mod, path) => {
    const next = [...path, mod.name]
    if ((mod.req_ids || []).includes(rid)) rows.push(next.join('-'))
    for (const child of mod.children || []) walk(child, next)
    for (const feat of mod.features || []) {
      if ((feat.req_ids || []).includes(rid)) rows.push([...next, feat.name].join('-'))
    }
  }
  for (const mod of atlas?.modules || []) walk(mod, [])
  return [...new Set(rows)]
}

function nodePaths(atlas) {
  const rows = []
  const walk = (mod, path) => {
    const next = [...path, mod.name]
    rows.push(next.join('-'))
    for (const child of mod.children || []) walk(child, next)
    for (const feat of mod.features || []) rows.push([...next, feat.name].join('-'))
  }
  for (const mod of atlas?.modules || []) walk(mod, [])
  return new Set(rows)
}

/** 这条需求相对上一版本：完全新增 / 修改已有功能 / 新增功能。 */
export function reqVersionImpact(req, releases = [], atlas) {
  const sorted = sortReleases(releases)
  const hungOn = sorted.filter((r) => (r.requirement_ids || []).includes(req?.id))
  const target = hungOn[hungOn.length - 1] || sorted[sorted.length - 1] || null
  const prev = target ? previousRelease(sorted, target) : null
  const currentAtlas = atlas || target?.atlas || {}
  const current = hungPaths(currentAtlas, req?.id)
  if (!prev) {
    return {
      kind: 'new',
      label: '完全新增',
      vs: null,
      target,
      added: current,
      changed: [],
    }
  }
  const prevNodes = nodePaths(prev.atlas || {})
  const prevHung = hungPaths(prev.atlas || {}, req?.id)
  const added = current.filter((p) => !prevNodes.has(p))
  const changed = current.filter((p) => prevNodes.has(p))
  if (!prevHung.length && !changed.length) {
    return { kind: 'new', label: `相对 ${prev.title} 完全新增`, vs: prev, target, added: current, changed: [] }
  }
  const bits = []
  if (changed.length) bits.push(`修改 ${changed.slice(0, 3).join('、')}`)
  if (added.length) bits.push(`新增 ${added.slice(0, 3).join('、')}`)
  return {
    kind: added.length && !changed.length ? 'add' : 'change',
    label: bits.join('，') || `相对 ${prev.title} 修改`,
    vs: prev,
    target,
    added,
    changed,
  }
}
