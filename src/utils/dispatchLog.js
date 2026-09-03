import { getBaseUrl } from '@/utils/config'

/** 调度日志：角色 / 入口文案，以及按流水线收成一行。 */

export const ROLE_LABEL = {
  'req-analyst': '需求分析师',
  'mindmap-writer': '测试脑图',
  'case-writer': '用例编写',
  'req-qa-bm': '需求QA BM',
  'version-qa-bm': '版本QA BM',
  'test-engineer': '测试工程师',
  'doc-keeper': '文档维护',
  'report-writer': '报告编写',
  'product-expert': '产品专家',
  'knowledge-reviewer': '知识审核员',
  conductor: '分析师',
  'im-qa-assistant': 'IM 总指挥',
  'im-defect-assistant': 'IM 缺陷助手',
}

export const TRIGGER_LABEL = {
  qa_tick: '继续分析',
  atlas_confirm: '确认图谱变更',
  atlas_edit: '人手改骨架',
  atlas_reject: '驳回图谱后重跑',
  settings_chat: '角色页对话',
  im_chat: 'IM 进线',
  case_run: '下发执行',
  knowledge_capture: '沉淀知识',
  knowledge_review: '知识机审',
  knowledge_situation: '知识情境',
  knowledge_briefing: '知识简报',
  conductor_route: '分析师调度',
  unknown: '未归类',
}

export const SOURCE_LABEL = {
  continue_analysis: '继续分析',
  im_inbound: 'IM 进线',
  feishu_im: '飞书进线',
  wecom_im: '企微进线',
  wechat_im: '微信进线',
  dingtalk_im: '钉钉进线',
  slack_im: 'Slack 进线',
  plugin_trial: '插件试对话',
  settings_role_chat: '角色页对话',
  case_run: '下发执行',
  atlas_confirm: '确认图谱',
  atlas_edit: '人手改骨架',
  atlas_reject: '驳回图谱后重跑',
  knowledge_capture: '沉淀知识',
  knowledge_review: '知识机审',
  knowledge_situation: '知识情境',
  knowledge_briefing: '知识简报',
  analyst_route: '分析师调度',
}

export const SKILL_LABEL = {
  'im.dialogue': 'IM 对话',
  'im.defect': 'IM 提缺陷',
  analyze_req: '拆验收标准',
  propose_atlas: '建议图谱',
  draft_mindmap: '写测试脑图',
  draft_cases: '写用例草稿',
  map_cases: '对照用例库',
  draft_sign: '验收草稿',
  pick_regression: '圈回归范围',
  draft_gate: '发版草稿',
  pick_account: '租账号',
  lease_account: '租账号',
  get_otp: '取口令',
  get_phone: '取登录号',
  release_account: '还账号',
  'goal-extract': '抽取目标',
  'case-scene': '场景理解',
  'inspect-session': '观察登录态',
  'agent-decide': '看图决策',
  'assert-vision': '视觉断言',
  'plan-overview': '规划步骤',
  'locate-vision': '视觉定位',
  'single-step-replan': '失败重规划',
  'hitl-composer': '问人话术',
  'persona-task': '拟人路径',
  'knowledge-capture': '沉淀知识',
  'knowledge-review': '知识机审',
  'knowledge-situation': '知识情境',
  'knowledge-briefing': '知识简报',
  'account-tag': '账号打标',
  publish_wiki: '写入 Wiki',
}

export const JOB_LABEL = {
  qa_tick: '流程推进',
  atlas_followup: '补脑图和用例',
  propose_atlas: '建议应用图谱',
  analyze_req: '分析需求',
  draft_mindmap: '写测试脑图',
  draft_cases: '写用例',
  review_impact: '确认图谱变更',
  edit_atlas: '人手改骨架',
  'goal-extract': '抽取目标',
  'case-scene': '场景理解',
  'inspect-session': '观察登录态',
  'agent-restart': '是否重开应用',
  'agent-decide': '看图决策',
  'assert-vision': '视觉断言',
  'plan-overview': '规划步骤',
  'locate-vision': '定位坐标',
  'single-step-replan': '失败重规划',
  'hitl-composer': '问人话术',
  'persona-task': '拟人化操作',
  'knowledge-capture': '沉淀知识',
  'knowledge-review': '知识机审',
  'knowledge-situation': '知识情境',
  'knowledge-situation-batch': '知识情境',
  'knowledge-briefing': '知识简报',
  'account-tag': '账号打标',
  role_chat: '角色对话',
  im_dialogue: '问答',
  im_defect: '提缺陷',
  route: '选下一步',
}

const HEAD_JOBS = new Set(['qa_tick', 'route', 'atlas_followup'])
const CASE_HEAD_JOBS = ['goal-extract', 'case-scene', 'plan-overview', 'agent-restart', 'inspect-session']
const CLUSTERABLE = new Set(['case_run', 'knowledge_capture', 'knowledge_review'])
const CLUSTER_MS = 3 * 60 * 1000

export const roleLabel = (id) => ROLE_LABEL[id] || id || '—'
export const triggerLabel = (id) => TRIGGER_LABEL[id] || id || '—'
export const sourceLabel = (id) => SOURCE_LABEL[id] || TRIGGER_LABEL[id] || id || '—'
export const skillLabel = (id) => SKILL_LABEL[id] || JOB_LABEL[id] || id || '—'
export const jobLabel = (id) => JOB_LABEL[id] || SKILL_LABEL[id] || id || '—'
export const kindLabel = (k) => (k === 'job' ? '流水线节点' : '模型调用')
export const statusLabel = (s) => ({ done: '完成', running: '进行中', error: '失败', skipped: '跳过' }[s] || s || '—')
export const statusTagType = (s) => ({ done: 'success', running: 'warning', error: 'danger', skipped: 'info' }[s] || '')

export const toolCallLabel = (row) => {
  if (!row || row.kind === 'job') return ''
  if (row.tools_downgraded) return '已降级 JSON'
  const name = String(row.tool_name || '').trim()
  if (row.used_tool_calls && name) return name
  if (row.used_tool_calls) return 'function call'
  if (row.job === 'agent-decide') return '未走 tool_calls'
  return ''
}

const parseTime = (at) => {
  if (!at) return 0
  const raw = String(at).trim()
  const iso = /Z$|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw.replace(' ', 'T')}Z`
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? 0 : t
}

export const fmtTime = (at) => {
  const t = parseTime(at)
  if (!t) return String(at || '—').replace('T', ' ').replace(/Z$/, '')
  const d = new Date(t)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export const fmtTimeShort = (at) => {
  const full = fmtTime(at)
  return full.length >= 16 ? full.slice(5, 16) : full
}

export const clipText = (text, n = 72) => {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  if (!s) return '—'
  return s.length > n ? `${s.slice(0, n)}…` : s
}

export const fmtElapsed = (ms) => {
  const n = Number(ms || 0)
  if (!n) return '—'
  if (n < 1000) return `${Math.round(n)} ms`
  if (n < 60000) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)} s`
  const m = Math.floor(n / 60000)
  const s = Math.round((n % 60000) / 1000)
  return s ? `${m}m ${s}s` : `${m}m`
}

export const fmtTokens = (row) => {
  const n = Number(row?.total_tokens || 0)
  if (!n) return '—'
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export const jobTitle = (row) => {
  if (!row) return '调度'
  const skill = skillLabel(row.skill || row.job)
  const role = roleLabel(row.role)
  if (row.role === 'conductor' || row.job === 'route') {
    return `${sourceLabel(row.source || row.trigger)} · 分析师理解任务`
  }
  if (role !== '—' && skill !== '—') return `${sourceLabel(row.source || row.trigger)} · ${role} · ${skill}`
  return `${sourceLabel(row.source || row.trigger)} · ${jobLabel(row.job)}`
}

const parseMaybeJson = (value) => {
  if (value && typeof value === 'object') return value
  const s = String(value || '').trim()
  if (!s) return null
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

const DATA_URL_RE = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/g
const STATIC_IMG_RE = /\/static\/[^\s"'\\>]+\.(?:png|jpe?g|webp|gif)/gi
const RAW_PNG_RE = /iVBORw0KGgo[A-Za-z0-9+/=]{80,}/g
const RAW_JPG_RE = /\/9j\/[A-Za-z0-9+/=]{80,}/g

export function mediaSrc(src) {
  const s = String(src || '').trim().replace(/…+$/, '').replace(/\.\.\.$/, '')
  if (!s) return ''
  if (s.startsWith('data:image/')) return s
  if (s.startsWith('/static/')) return `${getBaseUrl()}${s}`
  if (s.startsWith('http://') || s.startsWith('https://')) return s
  if (s.startsWith('iVBORw0KGgo') && s.length > 80) return `data:image/png;base64,${s}`
  if (s.startsWith('/9j/') && s.length > 80) return `data:image/jpeg;base64,${s}`
  return ''
}

const looksLikeImage = (value) => {
  const s = String(value || '').trim()
  return Boolean(
    mediaSrc(s)
    || s.startsWith('data:image/')
    || s.startsWith('/static/')
    || (s.startsWith('iVBORw0KGgo') && s.length > 80)
    || (s.startsWith('/9j/') && s.length > 80),
  )
}

/** 从调度正文里抽出图，base64 换成短标记，避免一整屏编码。 */
export function splitPayloadMedia(value, extra = []) {
  const images = []
  const seen = new Set()

  const add = (src) => {
    const resolved = mediaSrc(src)
    if (!resolved || seen.has(resolved)) return images.length ? `[图 ${images.length}]` : '[图]'
    seen.add(resolved)
    images.push(resolved)
    return `[图 ${images.length}]`
  }

  extra.forEach((src) => add(src))

  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk)
    if (node && typeof node === 'object') {
      const out = {}
      Object.entries(node).forEach(([key, val]) => {
        out[key] = walk(val)
      })
      return out
    }
    if (typeof node !== 'string') return node
    if (looksLikeImage(node)) return add(node)
    if (!node.includes('data:image/') && !node.includes('/static/') && !node.includes('iVBORw0KGgo')) {
      return node
    }
    return replaceInline(node)
  }

  const replaceInline = (text) => {
    let out = String(text || '')
    out = out.replace(DATA_URL_RE, (match) => add(match.replace(/\s/g, '')))
    out = out.replace(STATIC_IMG_RE, (match) => add(match))
    out = out.replace(RAW_PNG_RE, (match) => add(`data:image/png;base64,${match}`))
    out = out.replace(RAW_JPG_RE, (match) => add(`data:image/jpeg;base64,${match}`))
    return out
  }

  const parsed = parseMaybeJson(value)
  let text = ''
  if (parsed && typeof parsed === 'object') {
    text = JSON.stringify(walk(parsed), null, 2)
  } else {
    const raw = String(value || '').trim()
    text = raw ? replaceInline(raw) : ''
  }
  if (!text && !images.length) text = '（无）'
  if (images.length && (text === '（无）' || text === '[图 1]' || text === '[图]' || text === '"[图 1]"')) {
    text = ''
  }
  return { text, images }
}

export function inferCallMeta(row = {}) {
  if (row.trigger && row.trigger !== 'unknown' && row.job && row.role) return {}
  const parsed = parseMaybeJson(row.output) || {}
  const sys = String(row.system_prompt || '')
  if (parsed.goal && (parsed.checkpoints != null || parsed.checkpoint != null)) {
    return { trigger: 'case_run', job: 'goal-extract', role: 'test-engineer', skill: 'goal-extract', source: 'case_run' }
  }
  if ('restart' in parsed && parsed.thought) {
    return { trigger: 'case_run', job: 'agent-restart', role: 'test-engineer', skill: 'agent-decide', source: 'case_run' }
  }
  if (['relogin', 'logout', 'skip'].includes(String(parsed.session_prep))) {
    return { trigger: 'case_run', job: 'case-scene', role: 'test-engineer', skill: 'case-scene', source: 'case_run' }
  }
  if (parsed.session && ['logged_out', 'logged_in', 'unknown'].includes(String(parsed.session))) {
    return { trigger: 'case_run', job: 'inspect-session', role: 'test-engineer', skill: 'inspect-session', source: 'case_run' }
  }
  if (parsed.thought && ['action', 'tool', 'capability_id', 'done', 'x', 'y'].some((k) => k in parsed)) {
    return { trigger: 'case_run', job: 'agent-decide', role: 'test-engineer', skill: 'agent-decide', source: 'case_run' }
  }
  if (parsed.thought) return { trigger: 'case_run', job: 'agent-decide', role: 'test-engineer', skill: 'agent-decide', source: 'case_run' }
  if ('passed' in parsed && (parsed.confidence != null || parsed.ai_reasoning)) {
    return { trigger: 'case_run', job: 'assert-vision', role: 'test-engineer', skill: 'assert-vision', source: 'case_run' }
  }
  if (Array.isArray(parsed.events) || ['plan', 'decline', 'replan', 'give_up'].includes(parsed.mode)) {
    return { trigger: 'case_run', job: 'plan-overview', role: 'test-engineer', skill: 'plan-overview', source: 'case_run' }
  }
  if (parsed.bbox || (parsed.x != null && parsed.y != null)) {
    return { trigger: 'case_run', job: 'locate-vision', role: 'test-engineer', skill: 'locate-vision', source: 'case_run' }
  }
  if ((Array.isArray(parsed.tags) && ('replaces' in parsed) && ('reason' in parsed)) || (sys.includes('测试账号') && sys.includes('标签')) || (sys.includes('账号管理') && sys.includes('标签'))) {
    return { trigger: 'case_run', job: 'account-tag', role: 'test-engineer', skill: 'account-tag', source: 'case_run' }
  }
  if (['approve', 'reject', 'hold'].includes(parsed.action) && parsed.confidence != null) {
    return { trigger: 'knowledge_review', job: 'knowledge-review', role: 'knowledge-reviewer', skill: 'knowledge-review', source: 'knowledge_review' }
  }
  if (Array.isArray(parsed.items)) {
    return { trigger: 'knowledge_capture', job: 'knowledge-capture', role: 'version-qa-bm', skill: 'knowledge-capture', source: 'knowledge_capture' }
  }
  if (sys.includes('抽取目标') || sys.includes('goal-extract')) {
    return { trigger: 'case_run', job: 'goal-extract', role: 'test-engineer', skill: 'goal-extract', source: 'case_run' }
  }
  if (sys.includes('是否先重开') || sys.includes('agent-restart')) {
    return { trigger: 'case_run', job: 'agent-restart', role: 'test-engineer', skill: 'agent-decide', source: 'case_run' }
  }
  if (sys.includes('场景理解') || sys.includes('session_prep') || sys.includes('case-scene')) {
    return { trigger: 'case_run', job: 'case-scene', role: 'test-engineer', skill: 'case-scene', source: 'case_run' }
  }
  if (sys.includes('登录会话') || sys.includes('inspect-session')) {
    return { trigger: 'case_run', job: 'inspect-session', role: 'test-engineer', skill: 'inspect-session', source: 'case_run' }
  }
  if (sys.includes('下一个动作') || sys.includes('agent-decide')) {
    return { trigger: 'case_run', job: 'agent-decide', role: 'test-engineer', skill: 'agent-decide', source: 'case_run' }
  }
  if (parsed.action && ['submit', 'clarify', 'reject'].includes(parsed.action) && (parsed.reply || parsed.title || parsed.steps)) {
    return { trigger: 'im_chat', job: 'im_defect', role: 'im-defect-assistant', skill: 'im.defect', source: 'im_inbound' }
  }
  if (['在飞书 / 企业微信 / 钉钉 / Slack', '不在这套对话里直接建禅道单', 'Mino 的测试助手', 'Mino 的总指挥', '你排兵，其他角色干活', '请他们说「提缺陷」'].some((m) => sys.includes(m))) {
    return { trigger: 'im_chat', job: 'im_dialogue', role: 'im-qa-assistant', skill: 'im.dialogue', source: 'im_inbound' }
  }
  if (['整理一张可提交到禅道的缺陷', '只输出 JSON，不要输出其它文字'].some((m) => sys.includes(m))) {
    return { trigger: 'im_chat', job: 'im_defect', role: 'im-defect-assistant', skill: 'im.defect', source: 'im_inbound' }
  }
  return {}
}

export function normalizeCall(row = {}) {
  const guessed = inferCallMeta(row)
  const trigger = (!row.trigger || row.trigger === 'unknown')
    ? (guessed.trigger || row.trigger || 'unknown')
    : row.trigger
  const job = row.job || guessed.job || ''
  return {
    ...row,
    trigger,
    job,
    role: row.role || guessed.role || '',
    skill: row.skill || guessed.skill || job,
    source: row.source || guessed.source || trigger,
    routed_by: row.routed_by || (trigger === 'qa_tick' ? 'conductor' : ''),
  }
}

export const sortDispatchSteps = (steps = []) => [...steps].sort((a, b) => {
  const ta = parseTime(a.at)
  const tb = parseTime(b.at)
  if (ta !== tb) return ta - tb
  const sa = Number(a.step_index || 0)
  const sb = Number(b.step_index || 0)
  if (sa !== sb) return sa - sb
  return String(a.id || '').localeCompare(String(b.id || ''))
})

const stepKey = (s) => {
  if (s.kind === 'job' && HEAD_JOBS.has(s.job)) return `head:${s.job}`
  if (s.kind === 'llm') return `llm:${s.job || 'x'}:${s.step_index || s.id}`
  return `${s.kind || 'x'}:${s.job || s.id}:${s.step_index || s.id}`
}

/** 同一条 Job 的「进行中 + 完成」收成一步，避免起点一直显示进行中。 */
export function collapseDispatchSteps(steps = []) {
  const sorted = sortDispatchSteps(steps)
  const latest = new Map()
  const order = []
  for (const s of sorted) {
    const key = stepKey(s)
    if (!latest.has(key)) order.push(key)
    const prev = latest.get(key)
    if (!prev || parseTime(s.at) >= parseTime(prev.at)) latest.set(key, s)
  }
  return order.map((key) => latest.get(key)).filter(Boolean)
}

const rollupStatus = (steps) => {
  if (steps.some((s) => s.status === 'error')) return 'error'
  const collapsed = collapseDispatchSteps(steps)
  if (collapsed.some((s) => s.status === 'running')) return 'running'
  if (collapsed.length && collapsed.every((s) => s.status === 'skipped')) return 'skipped'
  return 'done'
}

export const jobSummary = (row) => {
  if (!row) return '—'
  if (row.error && row.status === 'error') return clipText(row.error, 80)
  const detail = String(row.detail || '').trim()
  if (detail && !detail.startsWith('{')) return clipText(detail, 80)
  const parsed = parseMaybeJson(row.output || row.detail)
  const toolBit = String(row.tool_name || '').trim()
  if (toolBit && parsed?.thought) return clipText(`${toolBit}：${parsed.thought}`, 80)
  if (toolBit) return clipText(toolBit, 80)
  if (parsed) {
    const actions = parsed.actions
    if (Array.isArray(actions) && actions.length) {
      return `${triggerLabel(row.trigger)}：${actions.map((a) => jobLabel(a)).join(' → ')}`
    }
    if (typeof actions === 'number') return `${triggerLabel(row.trigger)}：完成 ${actions} 步`
    if (Array.isArray(parsed.requirement_ids) && parsed.requirement_ids.length) {
      return `${triggerLabel(row.trigger)} · ${parsed.requirement_ids.length} 条需求`
    }
    if (parsed.goal) return clipText(`目标：${parsed.goal}`, 80)
    if (typeof parsed.restart === 'boolean') {
      return clipText(parsed.restart ? `建议重开应用。${parsed.thought || ''}` : `不重开。${parsed.thought || ''}`, 80)
    }
    if (typeof parsed.passed === 'boolean') {
      const why = parsed.ai_reasoning || parsed.evidence || ''
      return clipText(parsed.passed ? `断言通过。${why}` : `断言未通过。${why}`, 80)
    }
    if (parsed.thought) return clipText(parsed.thought, 80)
    if (Array.isArray(parsed.events)) return `规划了 ${parsed.events.length} 步`
  }
  const raw = String(row.output || row.detail || row.error || '').trim()
  if (raw.startsWith('{') || raw.startsWith('[')) return jobLabel(row.job)
  return clipText(raw, 80)
}

const pickHead = (steps) => {
  const collapsed = collapseDispatchSteps(steps)
  const caseHead = CASE_HEAD_JOBS.map((job) => collapsed.find((s) => s.job === job)).find(Boolean)
  return collapsed.find((s) => s.kind === 'job' && HEAD_JOBS.has(s.job))
    || collapsed.find((s) => s.kind === 'job')
    || caseHead
    || collapsed[0]
}

const routedChain = (row, steps = []) => {
  const explicit = Array.isArray(row?.routed) ? row.routed : []
  const fromSteps = (steps.length ? steps : (row?._steps || []))
    .filter((s) => s.role && s.role !== 'conductor' && s.job !== 'qa_tick' && s.job !== 'route')
    .map((s) => ({ role: s.role, skill: s.skill || s.job }))
  const list = explicit.length ? explicit : fromSteps
  const seen = new Set()
  const bits = []
  for (const item of list) {
    const role = roleLabel(item.role)
    const skill = skillLabel(item.skill)
    const key = `${role}·${skill}`
    if (!item.role && !item.skill) continue
    if (seen.has(key)) continue
    seen.add(key)
    bits.push(`${role} · ${skill}`)
  }
  return bits
}

export const pipelineHeadline = (row, steps = []) => {
  const list = steps.length ? steps : (row?._steps || [])
  const chain = routedChain(row, list)
  if (row?.trigger === 'qa_tick' || row?.job === 'route') {
    return chain.length ? `分析师 → ${chain.join(' → ')}` : '分析师理解任务后无需调用'
  }
  if (row?.routed_by === 'conductor' && chain.length) {
    return `分析师 → ${chain.join(' → ')}`
  }
  if (row?.trigger === 'im_chat') {
    return chain[0] || `${roleLabel(row.role)} · ${skillLabel(row.skill || row.job)}`
  }
  if (row?.trigger === 'case_run') {
    const decide = list.filter((s) => s.job === 'agent-decide').length
    const asserts = list.filter((s) => s.job === 'assert-vision')
    const failed = asserts.some((s) => {
      const parsed = parseMaybeJson(s.output)
      return parsed && parsed.passed === false
    })
    const bits = ['测试工程师']
    if (decide) bits.push(`${decide} 次看图决策`)
    if (asserts.length) bits.push(failed ? '有断言未通过' : `${asserts.length} 次视觉断言`)
    if (bits.length === 1) bits.push(skillLabel(row.skill || row.job))
    return bits.join(' · ')
  }
  if (chain.length) return chain.join(' → ')
  if (list.length > 1) {
    const names = [...new Set(list.map((s) => skillLabel(s.skill || s.job)).filter((x) => x && x !== '—'))]
    if (names.length > 1) return names.slice(0, 3).join(' → ')
  }
  return skillLabel(row?.skill || row?.job)
}

const toGroup = (steps, { pipelineId = '' } = {}) => {
  const collapsed = collapseDispatchSteps(steps)
  const head = pickHead(steps)
  if (!head) return null
  const tokens = steps.reduce((n, s) => n + Number(s.total_tokens || 0), 0)
  const elapsed = steps.reduce((n, s) => n + Number(s.elapsed_ms || 0), 0)
  const latest = collapsed[collapsed.length - 1] || head
  return {
    ...head,
    at: latest.at || head.at,
    pipeline_id: pipelineId || head.pipeline_id || '',
    source: head.source || collapsed.find((s) => s.source)?.source || head.trigger,
    skill: head.skill || collapsed.find((s) => s.skill)?.skill || head.job,
    routed: head.routed || undefined,
    status: rollupStatus(steps),
    total_tokens: tokens || Number(head.total_tokens || 0),
    elapsed_ms: elapsed || Number(head.elapsed_ms || 0),
    step_total: collapsed.length,
    headline: pipelineHeadline(head, collapsed),
    summary: jobSummary(head),
    _steps: collapsed,
  }
}

const clusterLoose = (loose = []) => {
  const sorted = sortDispatchSteps(loose)
  const buckets = []
  for (const row of sorted) {
    const trigger = row.trigger || 'unknown'
    const app = row.app_id || ''
    const t = parseTime(row.at)
    const last = buckets[buckets.length - 1]
    const same = last
      && last.trigger === trigger
      && last.app_id === app
      && CLUSTERABLE.has(trigger)
      && t - last.end <= CLUSTER_MS
    if (same) {
      last.steps.push(row)
      last.end = t
    } else {
      buckets.push({ trigger, app_id: app, steps: [row], end: t })
    }
  }
  return buckets.map((b) => toGroup(b.steps, { pipelineId: b.steps[0]?.pipeline_id || '' })).filter(Boolean)
}

/** 同一条流水线收成一行；散落的执行步骤按时间窗归组。 */
export function groupDispatchJobs(calls = []) {
  const byPipe = new Map()
  const loose = []
  for (const raw of calls) {
    const row = normalizeCall(raw)
    const pid = String(row.pipeline_id || '')
    if (!pid) {
      loose.push(row)
      continue
    }
    if (!byPipe.has(pid)) byPipe.set(pid, [])
    byPipe.get(pid).push(row)
  }
  const grouped = [...byPipe.values()].map((steps) => toGroup(steps)).filter(Boolean)
  return [...grouped, ...clusterLoose(loose)].sort((a, b) => parseTime(b.at) - parseTime(a.at))
}

/** 把流水线拆成 Job 列表，散落步骤也尽量接到同一条执行上。 */
export function flattenDispatchJobs(calls = []) {
  const groups = groupDispatchJobs(calls)
  const rows = []
  for (const group of groups) {
    const steps = group._steps || [group]
    steps.forEach((step, idx) => {
      const prev = steps[idx - 1]
      const next = steps[idx + 1]
      rows.push({
        ...step,
        pipeline_id: group.pipeline_id,
        headline: group.headline,
        step_label: skillLabel(step.skill || step.job),
        step_index_label: `${idx + 1}/${steps.length}`,
        prev_job: prev ? jobLabel(prev.job) : '起点',
        next_job: next ? jobLabel(next.job) : '结束',
        summary: jobSummary(step),
      })
    })
  }
  return rows.sort((a, b) => parseTime(b.at) - parseTime(a.at))
}

export function findDispatchGroup(calls = [], callId = '') {
  const id = String(callId || '')
  if (!id) return null
  return groupDispatchJobs(calls).find((g) => g.id === id || (g._steps || []).some((s) => s.id === id)) || null
}

export function matchDispatchFilters(row, filters = {}) {
  if (filters.trigger && row.trigger !== filters.trigger) return false
  if (filters.status && row.status !== filters.status) return false
  if (filters.role) {
    if (row.role === filters.role) return true
    return (row._steps || []).some((s) => s.role === filters.role)
  }
  return true
}

export function relatedWork(row) {
  const trigger = row?.trigger || ''
  if (trigger === 'qa_tick') return { label: '去单据', tab: 'process' }
  if (trigger === 'atlas_confirm' || trigger === 'atlas_edit' || row?.job === 'atlas_followup') {
    return { label: '去图谱', tab: 'cases', view: 'atlas' }
  }
  if (trigger === 'case_run') return { label: '去任务', tab: 'tasks' }
  if (trigger === 'knowledge_capture' || trigger === 'knowledge_review') {
    return { label: '去知识', tab: 'knowledge' }
  }
  if (trigger === 'im_chat' || trigger === 'settings_chat') {
    return { label: '去角色', tab: '' }
  }
  return { label: '详情', tab: '' }
}
