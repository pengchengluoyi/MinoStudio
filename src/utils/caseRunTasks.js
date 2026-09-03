import { classifyPrepLine, classifyStepLine, classifyExpectLine, codeLooksGap, gapTagOf } from './caseCatalog.js'
import {
  alignCaseStepExpected,
  normalizeCaseRow,
  splitPreconditionLines,
  splitStepOperations,
} from './caseText.js'

const LIVE = new Set(['thinking', 'checking', 'running', 'continue', 'ask_human'])
const FAIL = new Set(['fail', 'failed', 'give_up', 'declined', 'blocked'])
const DONE = new Set(['done', 'pass', 'skipped', 'skip'])

function normEngineStatus(s) {
  return String(s || '').toLowerCase()
}

function isTerminalEngineStatus(st) {
  return DONE.has(st) || FAIL.has(st)
}

export function isLiveEngineStep(s, opts = {}) {
  if (opts.finished) return false
  const st = normEngineStatus(s?.status)
  const rs = normEngineStatus(s?.result_status)
  if (isTerminalEngineStatus(st) || isTerminalEngineStatus(rs)) return false
  if (!(LIVE.has(st) || LIVE.has(rs))) return false
  const siblings = opts.siblings
  if (Array.isArray(siblings) && siblings.length) {
    const no = Number(s?.step)
    if (Number.isFinite(no) && no > 0) {
      const laterSettled = siblings.some((x) => {
        const n = Number(x?.step)
        if (!Number.isFinite(n) || n <= no) return false
        return isTerminalEngineStatus(normEngineStatus(x?.status))
          || isTerminalEngineStatus(normEngineStatus(x?.result_status))
      })
      if (laterSettled) return false
    }
  }
  return true
}

export function isFailEngineStep(s) {
  return FAIL.has(String(s?.result_status || s?.status || ''))
}

function capOf(step) {
  return String(step?.cap || step?.action?.capability_id || '').toLowerCase()
}

function isObserveStep(text) {
  const t = String(text || '').trim()
  if (!t) return true
  if (/点击|点「|点选|输入|填写|滑动|上滑|下滑|打开应用|启动|长按|拖|按返回/.test(t)) return false
  return /^(查看|检查|观察|确认是否|确认一下|看一下|看看)/.test(t)
}

function engineKind(step) {
  const cap = capOf(step)
  const blob = `${cap} ${step?.summary || ''} ${step?.thought || ''}`
  if (/assert|checkpoint|assert_skip/.test(cap) || /断言失败|assert_visual|assert_goal|无法校验|无法验证/.test(blob)) return 'assert'
  if (/skip_out_of_order/.test(cap)) return 'assert'
  if (/skip_restart|clear_cache|check_logged|check_not_logged|check_sim|check_wechat|grant_perm|keep_permission|pick_account|bind_account|inspect_session|inspect_env|session_gate|session_align|env_align|case_scene|get_app_version|get_foreground_app/.test(cap)) {
    return 'prep'
  }
  if (/recovery|overlay|dismiss_popup|close_popup/.test(cap)) return 'heal'
  if (/launch|open_app|close_app|kill_app/.test(cap)) return 'launch'
  return 'do'
}

function catalogIdFromCap(cap) {
  const c = String(cap || '').toLowerCase()
  if (/launch|open_app/.test(c)) return 'launch_app'
  if (/kill/.test(c)) return 'kill_app'
  if (/long_press|longpress/.test(c)) return 'long_press'
  if (/drag/.test(c)) return 'drag'
  if (/swipe|scroll/.test(c)) return 'swipe'
  if (/input|type|fill/.test(c)) return 'input_text'
  if (/key|back|home/.test(c)) return 'press_key'
  if (/wait|sleep/.test(c)) return 'wait_ms'
  if (/tap|click/.test(c)) return 'tap_element'
  if (/assert/.test(c)) return 'assert'
  return ''
}

function parseCpNums(step) {
  const bag = []
  const raw = [...(step?.checkpoint_ids || []), ...(step?.checkpoints_hit || [])]
  for (const x of raw) {
    const id = String(x?.id || x || '')
    const m = id.match(/cp(\d+)/i)
    if (m) bag.push(Number(m[1]))
  }
  return bag
}

function codeLooksFail(code) {
  const c = String(code || '')
  if (!c) return false
  if (/SKIPPED/.test(c) && !/\.FAIL/.test(c)) return false
  return /UNMET|\.FAIL|FAIL\./.test(c)
}

function codeLooksOk(code) {
  const c = String(code || '')
  return /PASS|\.OK|HEALED/.test(c)
}

function codeLooksSkip(code) {
  return /SKIPPED/.test(String(code || ''))
}

function makeTask({ id, kind, title, skip = false, code = '', catalogId = '', stepNum = 0, msg = '', gapTag = '' }) {
  return {
    id,
    kind,
    title,
    skip,
    code,
    catalogId,
    stepNum,
    msg,
    gapTag,
    cardNos: [],
    status: 'queued',
  }
}

function makeGroup({ id, label, kind, stepNum = 0, tasks }) {
  return {
    id,
    label,
    kind,
    stepNum,
    tasks,
    status: 'queued',
    hint: '',
  }
}

function foldPrepText(s) {
  return String(s || '')
    .replace(/\s+/g, '')
    .replace(/[≥≧⩾]/g, '>=')
    .replace(/[≤≦⩽]/g, '<=')
    .toLowerCase()
}

function prepTextMatch(a, b) {
  const x = String(a || '').trim()
  const y = String(b || '').trim()
  if (!x || !y) return false
  if (x === y) return true
  const fx = foldPrepText(x)
  const fy = foldPrepText(y)
  if (fx === fy) return true
  const shorter = fx.length <= fy.length ? fx : fy
  const longer = fx.length <= fy.length ? fy : fx
  return longer.includes(shorter) && shorter.length / longer.length >= 0.45
}

function pickPrepRow(text, rows) {
  const i = rows.findIndex((r) => prepTextMatch(text, r.text))
  if (i >= 0) return rows.splice(i, 1)[0]
  const kind = classifyPrepLine(text).kind
  if (kind && kind !== 'unknown') {
    const j = rows.findIndex((r) => String(r?.kind || '') === kind)
    if (j >= 0) return rows.splice(j, 1)[0]
  }
  return null
}

function stampPrepTask(text, row) {
  const guessed = classifyPrepLine(text)
  if (guessed.code === 'PREP.OK.deferred' || /PREP\.OK\.deferred/.test(String(row?.code || ''))) {
    return {
      code: 'PREP.OK.deferred',
      msg: row?.msg || '后台开关由用例步骤/预期验证，不单独查后台',
      gapTag: '',
    }
  }
  const inLib = guessed.kind && guessed.kind !== 'unknown' && !String(guessed.code || '').includes('UNSUPPORTED')
  if (row?.code) {
    if (/UNKNOWN/.test(row.code) && inLib) {
      return { code: '', msg: '', gapTag: '' }
    }
    const code = row.code
    const msg = row.msg || ''
    const gapTag = row.tag || gapTagOf(code, row.kind || guessed.kind)
    return { code, msg, gapTag }
  }
  if (inLib) return { code: '', msg: '', gapTag: '' }
  if (String(guessed.code || '').includes('UNSUPPORTED')) {
    return {
      code: guessed.code,
      msg: `前置引擎无法执行（${guessed.kind}）`,
      gapTag: gapTagOf(guessed.code, guessed.kind),
    }
  }
  return {
    code: guessed.code || 'PREP.UNKNOWN',
    msg: `前置未命中引擎库: ${text}`,
    gapTag: gapTagOf(guessed.code || 'PREP.UNKNOWN', guessed.kind),
  }
}

function stripEnvClause(text) {
  return String(text || '').replace(/[，,;；]\s*环境(为|是)[^，,;；]+/g, '').trim()
}

function envPrepTask({ envProfile = '', envLabel = '', envAlign = null, platform = '' } = {}) {
  const align = envAlign && typeof envAlign === 'object' ? envAlign : null
  if (align?.skipped === 'url_distinguishes' || align?.skipped === 'no_target') return null
  const plat = String(platform || '').toLowerCase()
  if (['web', 'browser', 'playwright', 'server'].includes(plat)) return null
  const wanted = String(envProfile || align?.wanted || '').trim()
  if (!wanted && !align) return null
  const name = String(envLabel || align?.label || wanted).trim() || wanted
  const title = `切换到${name}环境`
  if (align?.ok === false) {
    return makeTask({
      id: 'p-env',
      kind: 'prep',
      title,
      code: 'PREP.UNMET.env',
      msg: align.reason || `当前环境与本趟「${name}」不一致`,
      stepNum: 0,
    })
  }
  if (align?.ok) {
    return makeTask({
      id: 'p-env',
      kind: 'prep',
      title,
      code: 'PREP.OK.env',
      msg: align.reason || (align.unconfirmed ? '当前屏未看出环境标识，未当作不一致' : `已对齐 ${name}`),
      stepNum: 0,
    })
  }
  return makeTask({ id: 'p-env', kind: 'prep', title, stepNum: 0 })
}

function emptyTree(spec, coverage, envOpts = {}) {
  const groups = []
  const envTask = envPrepTask(envOpts)
  const prepLines = splitPreconditionLines(spec?.precondition || spec?.precondition_raw || '')
  const prepCov = Array.isArray(coverage?.prep) ? [...coverage.prep] : []
  if (envTask || prepLines.length || prepCov.length) {
    const lines = prepLines.length ? prepLines : prepCov.map((p) => p.text || p.kind)
    const rest = envTask
      ? lines.filter((text) => classifyPrepLine(text).kind !== 'check_env')
      : lines
    groups.push(makeGroup({
      id: 'prep',
      label: '前置',
      kind: 'prep',
      tasks: [
        ...(envTask ? [envTask] : []),
        ...rest.map((text, i) => {
          const row = pickPrepRow(text, prepCov)
          const stamped = stampPrepTask(text, row)
          const kind = classifyPrepLine(text).kind
          const title = envTask && kind === 'check_app_version' ? (stripEnvClause(text) || text) : text
          return makeTask({
            id: `p${i + 1}`,
            kind: 'prep',
            title,
            code: stamped.code,
            msg: stamped.msg,
            gapTag: stamped.gapTag,
            stepNum: 0,
          })
        }),
      ],
    }))
  }
  for (const pair of alignCaseStepExpected(spec)) {
    const ops = splitStepOperations(pair.step)
    const stepCov = (coverage?.steps || []).find((s) => Number(s.n) === pair.num)
    const expRows = (coverage?.expects || []).filter((e) => Number(e.n) === pair.num)
    const skipExpect = !pair.expected || (
      expRows.length > 0 && expRows.every((e) => /SKIPPED\.no_expect/.test(String(e?.code || '')))
    )
    const tasks = []
    const opTexts = ops.length ? ops : (pair.step ? [pair.step] : [])
    opTexts.forEach((text, i) => {
      if (isObserveStep(text)) return
      const stepCode = stepCov?.code || ''
      tasks.push(makeTask({
        id: `s${pair.num}-op${i + 1}`,
        kind: 'do',
        title: text,
        code: stepCode,
        catalogId: classifyStepLine(text).id,
        gapTag: gapTagOf(stepCode),
        stepNum: pair.num,
      }))
    })
    const unexecNoExpect = skipExpect && String(coverage?.coverage_class || '') === 'step_unexecutable'
    if (expRows.length > 1) {
      expRows.forEach((e, i) => {
        const expGuess = classifyExpectLine(e.text)
        const expGapCode = codeLooksGap(e.code) ? e.code : ''
        tasks.push(makeTask({
          id: `s${pair.num}-ck${i + 1}`,
          kind: 'check',
          title: e.text || pair.expected,
          skip: /SKIPPED\.no_expect/.test(String(e.code || '')) && !unexecNoExpect,
          code: e.code || '',
          gapTag: unexecNoExpect ? '无法执行 · 未写预期' : gapTagOf(expGapCode, expGuess.id),
          stepNum: pair.num,
        }))
      })
    } else {
      const expCode = expRows.map((e) => e.code).filter(Boolean).join('|')
        || (skipExpect ? 'EXPECT.SKIPPED.no_expect' : '')
      const expGuess = skipExpect ? { code: '', id: '' } : classifyExpectLine(pair.expected)
      const gapFromRows = expRows.map((e) => e.code).find((c) => codeLooksGap(c))
      const guessGap = (!gapFromRows && !/SKIPPED/.test(expCode) && codeLooksGap(expGuess.code)) ? expGuess.code : ''
      const expGapCode = gapFromRows || guessGap
      tasks.push(makeTask({
        id: `s${pair.num}-ck`,
        kind: 'check',
        title: skipExpect ? (unexecNoExpect ? '未写预期' : '不验') : pair.expected,
        skip: skipExpect && !unexecNoExpect,
        code: expCode,
        gapTag: unexecNoExpect ? '无法执行 · 未写预期' : (skipExpect ? '' : gapTagOf(expGapCode, expGuess.id)),
        stepNum: pair.num,
      }))
    }
    groups.push(makeGroup({
      id: `s${pair.num}`,
      label: `步骤 ${pair.num}${pair.step ? ` · ${pair.step}` : ''}`,
      kind: 'step',
      stepNum: pair.num,
      tasks,
    }))
  }
  return groups
}

function pickDoTask(group, capId) {
  const ops = (group?.tasks || []).filter((t) => t.kind === 'do')
  if (!ops.length) return null
  const from = group._opI || 0
  if (capId) {
    const hit = ops.findIndex((o, i) => i >= from && o.catalogId === capId)
    if (hit >= 0) {
      group._opI = hit
      return ops[hit]
    }
  }
  const i = Math.min(from, ops.length - 1)
  group._opI = i
  return ops[i]
}

function isGapTask(t) {
  return Boolean(t?.gapTag) || codeLooksGap(t?.code)
}

function matchPrepTask(prep, step, alignKind = '') {
  const tasks = prep?.tasks || []
  if (!tasks.length) return null
  const cap = capOf(step)
  const hit = (pred) => tasks.find(pred)
  const isEnvRow = (t) => t.id === 'p-env' || classifyPrepLine(t.title).kind === 'check_env'
  const isVersionRow = (t) => classifyPrepLine(t.title).kind === 'check_app_version' || /版本/.test(t.title)
  const isOpenedRow = (t) => classifyPrepLine(t.title).kind === 'check_app_foreground' || /已打开|打开.*app|打开应用/i.test(t.title)
  const isLoginRow = (t) => /logged|session/.test(classifyPrepLine(t.title).kind) || /已登录|未登录|游客|登录/.test(t.title)
  if (/get_app_version/.test(cap)) {
    return hit(isVersionRow) || hit((t) => t.id !== 'p-env' && !isGapTask(t))
  }
  if (/get_foreground_app/.test(cap)) {
    return hit(isOpenedRow) || hit((t) => t.id !== 'p-env' && !isGapTask(t))
  }
  if (/inspect_env|env_align/.test(cap) || alignKind === 'env') {
    return hit((t) => t.id === 'p-env') || hit(isEnvRow) || hit((t) => /环境/.test(t.title))
  }
  if (/session_gate|inspect_session|case_scene|check_logged|pick_account|bind_account/.test(cap) || alignKind === 'session') {
    return hit(isLoginRow)
      || hit((t) => t.id !== 'p-env' && !isGapTask(t))
  }
  if (/skip_restart|launch_app|open_app|close_app|kill_app/.test(cap)) {
    return hit(isOpenedRow)
      || hit((t) => !isGapTask(t))
  }
  if (/clear_cache/.test(cap)) {
    return hit((t) => classifyPrepLine(t.title).kind === 'clear_cache') || hit((t) => !isGapTask(t))
  }
  return hit((t) => t.id === 'p-env' && alignKind === 'env')
    || hit((t) => !isGapTask(t) && t.id !== 'p-env')
    || hit((t) => !isGapTask(t))
    || tasks[0]
}

function hangCheck(g, no) {
  const cks = (g?.tasks || []).filter((t) => t.kind === 'check' && !t.skip)
  const target = cks.find((t) => !(t.cardNos || []).length) || cks[cks.length - 1]
  if (target) target.cardNos.push(no)
  return target
}

function opsHung(g) {
  const ops = (g?.tasks || []).filter((t) => t.kind === 'do')
  if (!ops.length) return true
  return ops.every((t) => (t.cardNos || []).length)
}

function isWaitCap(cap) {
  return /wait|sleep/.test(String(cap || ''))
}

function hangDoCard(task, no, cap) {
  if (!task) return 'check'
  task.cardNos.push(no)
  return /skip_repeat/.test(String(cap || '')) ? 'check' : 'do'
}

function isSkipEngineStep(s) {
  return /^(skipped|skip)$/.test(normEngineStatus(s?.result_status || s?.status))
}

function laneOf(step) {
  const v = String(step?.lane || '').toLowerCase()
  if (v === 'prep' || v === 'step' || v === 'expect') return v
  return ''
}

function assignEngineSteps(groups, engineSteps) {
  const prep = groups.find((g) => g.kind === 'prep')
  const stepGroups = groups.filter((g) => g.kind === 'step')
  let stepI = 0
  let lastDo = null
  let lastHang = prep?.tasks?.length ? 'prep' : 'do'
  let phase = prep?.tasks?.length ? 'prep' : 'step'
  let alignKind = ''
  const firstOpLaunch = stepGroups[0]?.tasks?.some(
    (t) => t.kind === 'do' && t.catalogId === 'launch_app',
  )

  const hangOnPrep = (step, no) => {
    if (!prep?.tasks?.length) return false
    const t = matchPrepTask(prep, step, alignKind)
    if (t) t.cardNos.push(no)
    lastDo = null
    lastHang = 'prep'
    return true
  }

  const hangOnExpect = (step, no) => {
    const cps = parseCpNums(step)
    const n = cps.length
      ? cps[0]
      : stepGroups[Math.min(stepI, Math.max(0, stepGroups.length - 1))]?.stepNum
    const g = stepGroups.find((x) => x.stepNum === n) || stepGroups[stepI]
    hangCheck(g, no)
    const lastIdx = stepGroups.indexOf(g)
    const rs = String(step?.result_status || '').toLowerCase()
    lastDo = null
    lastHang = 'check'
    if (engineKind(step) === 'assert' && lastIdx >= 0 && (rs === 'pass' || rs === 'done')) {
      const pending = (g?.tasks || []).filter((t) => t.kind === 'check' && !t.skip && !(t.cardNos || []).length)
      if (!pending.length) {
        stepI = Math.min(lastIdx + 1, stepGroups.length)
        const next = stepGroups[stepI]
        lastHang = !next || opsHung(next) ? 'check' : 'do'
      }
    }
  }

  const hangOnStep = (step, no) => {
    if (!stepGroups.length) return
    const kind = engineKind(step)
    const cap = capOf(step)
    const capId = catalogIdFromCap(cap)
    const cps = parseCpNums(step)
    if (kind === 'heal' && lastDo) {
      lastDo.cardNos.push(no)
      return
    }
    if (cps.length && kind !== 'assert') {
      const n = cps[0]
      const g = stepGroups.find((x) => x.stepNum === n) || stepGroups[Math.min(stepI, stepGroups.length - 1)]
      const ops = (g?.tasks || []).filter((t) => t.kind === 'do')
      if (!ops.length) {
        hangCheck(g, no)
        lastHang = 'check'
        return
      }
      const task = pickDoTask(g, capId) || ops[0]
      lastHang = hangDoCard(task, no, cap)
      if (task) lastDo = task
      const idx = stepGroups.indexOf(g)
      if (idx >= 0) stepI = idx
      return
    }
    let g = stepGroups[Math.min(stepI, stepGroups.length - 1)]
    const ops = (g?.tasks || []).filter((t) => t.kind === 'do')
    if (!ops.length) {
      hangCheck(g, no)
      lastHang = 'check'
      return
    }
    const curHas = Boolean(capId && ops.some((t) => t.catalogId === capId))
    if (capId && g && !curHas) {
      const later = stepGroups.slice(stepI + 1).find((sg) => (
        sg.tasks.some((t) => t.kind === 'do' && t.catalogId === capId)
      ))
      if (later) {
        stepI = stepGroups.indexOf(later)
        g = later
      }
    }
    const task = pickDoTask(g, capId) || lastDo
    if (task && task.kind === 'do') {
      lastHang = hangDoCard(task, no, cap)
      lastDo = task
    } else {
      hangCheck(g, no)
      lastHang = 'check'
    }
  }

  for (const step of engineSteps || []) {
    const no = Number(step?.step)
    if (!Number.isFinite(no) || no <= 0) continue
    const kind = engineKind(step)
    const cap = capOf(step)
    const tagged = laneOf(step)
    const waitOrThink = isWaitCap(cap) || (!cap && isLiveEngineStep(step))
    const gCur = stepGroups[Math.min(stepI, Math.max(0, stepGroups.length - 1))]

    if (/env_align/.test(cap)) alignKind = isSkipEngineStep(step) ? '' : 'env'
    if (/session_align/.test(cap)) alignKind = isSkipEngineStep(step) ? '' : 'session'
    if (/inspect_session|session_gate/.test(cap)) alignKind = ''

    let lane = tagged
    if (!lane) {
      if (waitOrThink && lastHang === 'check') lane = 'expect'
      else if (waitOrThink && lastHang === 'prep' && alignKind) lane = 'prep'
      else if (kind === 'assert' || (lastHang !== 'prep' && opsHung(gCur) && waitOrThink)) lane = 'expect'
      else if (phase === 'prep' && (kind === 'prep' || alignKind || (kind === 'launch' && !firstOpLaunch))) lane = 'prep'
      else lane = 'step'
      if (phase !== 'prep' && lane === 'prep') {
        lane = kind === 'assert' || lastHang === 'check' ? 'expect' : 'step'
      }
    }

    if (lane === 'prep' && hangOnPrep(step, no)) continue
    if (lane === 'expect') {
      hangOnExpect(step, no)
      if (phase === 'prep') phase = 'step'
      continue
    }
    hangOnStep(step, no)
    phase = 'step'
  }
}

function resolveCards(task, byNo) {
  return (task.cardNos || []).map((n) => byNo.get(n)).filter(Boolean)
}

function taskStatus(task, { finished, runningId, blocked, byNo }) {
  if (task.kind === 'check' && task.skip && !task.gapTag) return 'skip'
  if (task.kind === 'check' && /SKIPPED\.no_expect/.test(task.code) && !task.gapTag) return 'skip'
  if (task.id === runningId) return 'run'
  const cards = resolveCards(task, byNo)
  const allSteps = [...byNo.values()]
  if (cards.some((s) => isLiveEngineStep(s, { finished, siblings: allSteps }))) return 'run'
  if (codeLooksSkip(task.code) && /step_not_done|SKIPPED\.blocked/.test(String(task.code || '')) && !codeLooksFail(task.code)) {
    return 'blocked'
  }
  if (codeLooksFail(task.code) || cards.some(isFailEngineStep)) return 'fail'
  if (/PREP\.OK\.deferred/.test(task.code)) return 'skip'
  if (codeLooksGap(task.code) || task.gapTag) return 'gap'
  if (blocked && task.kind !== 'prep') return 'blocked'
  if (codeLooksOk(task.code) && (finished || cards.length)) return 'done'
  if (cards.length && cards.every((s) => DONE.has(String(s.result_status || s.status)) || isFailEngineStep(s))) {
    return cards.some(isFailEngineStep) ? 'fail' : 'done'
  }
  if (finished) {
    if (codeLooksSkip(task.code) && /no_expect/.test(task.code) && !task.gapTag) return 'skip'
    if (codeLooksSkip(task.code)) return 'blocked'
    if (cards.length) return cards.some(isFailEngineStep) ? 'fail' : 'done'
    if (task.kind === 'prep' && !task.code) return 'blocked'
    return 'blocked'
  }
  return 'queued'
}

function groupStatus(group) {
  const sts = group.tasks.map((t) => t.status)
  const idle = (s) => s === 'skip' || s === 'gap' || s === 'blocked'
  if (sts.includes('run')) return 'run'
  if (sts.includes('fail')) return 'fail'
  if (sts.every((s) => idle(s))) return sts.includes('blocked') ? 'blocked' : (sts.includes('gap') ? 'gap' : 'skip')
  if (sts.every((s) => s === 'done' || idle(s))) return 'done'
  if (sts.every((s) => s === 'queued' || s === 'skip' || s === 'gap')) return 'queued'
  if (sts.includes('done') && sts.includes('queued')) return 'queued'
  return 'queued'
}

function groupHint(group) {
  if (group.kind === 'prep') {
    const n = group.tasks.length
    const d = group.tasks.filter((t) => t.status === 'done').length
    const bad = group.tasks.filter((t) => t.status === 'fail').length
    const gap = group.tasks.filter((t) => t.status === 'gap').length
    if (bad) return `${d}/${n} · ${bad} 条挡住开跑`
    if (gap) return `${d}/${n} · ${gap} 条无法执行`
    return `${d}/${n}`
  }
  const ops = group.tasks.filter((t) => t.kind === 'do')
  const cks = group.tasks.filter((t) => t.kind === 'check')
  const doneOps = ops.filter((t) => t.status === 'done').length
  const ckFail = cks.some((t) => t.status === 'fail')
  const ckRun = cks.some((t) => t.status === 'run')
  const ckGap = cks.find((t) => t.status === 'gap')
  const ckSkip = cks.length && cks.every((t) => t.status === 'skip')
  const ckDone = cks.length && cks.every((t) => t.status === 'done' || t.status === 'skip' || t.status === 'gap')
  if (!ops.length) {
    if (group.status === 'blocked') return '未执行'
    if (ckSkip) return '不验'
    if (ckGap) return ckGap.gapTag || '无法验证'
    if (ckRun) return '校验中'
    if (ckFail) return '校验不通过'
    if (ckDone) return '已校验'
    return ''
  }
  if (group.status === 'blocked') return '未执行'
  if (ckSkip) return `${ops.length} 个操作 · 不验`
  if (ckGap && !ckFail) return `${ops.length} 个操作 · ${ckGap.gapTag || '无法验证'}`
  if (ckRun) return `操作 ${doneOps}/${ops.length} · 校验中`
  if (ckFail) return `操作 ${doneOps}/${ops.length} · 校验不通过`
  if (group.status === 'run') return `操作 ${doneOps}/${ops.length} · 校验还没到`
  return `操作 ${doneOps}/${ops.length}${ckDone ? ' · 已校验' : ''}`
}

function groupRunLabel(group) {
  if (group.status !== 'run') return TASK_STATUS_LABEL[group.status] || group.status
  if (group.kind === 'prep') return '执行中'
  const cks = group.tasks.filter((t) => t.kind === 'check')
  if (cks.some((t) => t.status === 'run')) return '校验中'
  if (group.tasks.some((t) => t.kind === 'do' && t.status === 'run')) return '操作中'
  return '执行中'
}

export function runningTaskId(groups, engineSteps, { finished, live } = {}) {
  const liveOpts = { finished, siblings: engineSteps }
  const focus = [...(engineSteps || [])].reverse().find((s) => isLiveEngineStep(s, liveOpts))
    || ((live && !finished) ? engineSteps?.[engineSteps.length - 1] : null)
  if (focus) {
    const no = Number(focus.step)
    for (const g of groups) {
      for (const t of g.tasks) {
        if (t.cardNos.includes(no)) return t.id
      }
    }
  }
  if (finished || !live) {
    let last = ''
    for (const g of groups) {
      for (const t of g.tasks) {
        if (t.status === 'fail') return t.id
        if (t.cardNos.length) last = t.id
      }
    }
    return last
  }
  for (const g of groups) {
    const hit = g.tasks.find((t) => t.status === 'run' || (t.status === 'queued' && !t.skip))
    if (hit) return hit.id
  }
  return ''
}

export function taskIdForEngineStep(groups, stepNo) {
  const n = Number(stepNo)
  for (const g of groups) {
    for (const t of g.tasks) {
      if (t.cardNos.includes(n)) return t.id
    }
  }
  return ''
}

export function buildCaseRunGroups({
  spec, coverage, engineSteps = [], finished = false, live = false,
  envProfile = '', envLabel = '', envAlign = null, platform = '',
} = {}) {
  const row = normalizeCaseRow(spec || {})
  const groups = emptyTree(row, coverage, { envProfile, envLabel, envAlign, platform })
  if (!groups.length) return []
  assignEngineSteps(groups, engineSteps)
  const cls = String(coverage?.coverage_class || '')
  const blocked = (coverage?.prep || []).some((p) => codeLooksFail(p.code))
    || (engineSteps || []).some((s) => /session_gate|env_align/.test(capOf(s)) && isFailEngineStep(s))
    || (envAlign && envAlign.ok === false)
  const settled = finished || (Boolean(cls) && (cls !== 'prep_insufficient' || blocked))
  const byNo = new Map((engineSteps || []).map((s) => [Number(s.step), s]))
  const runId = ''
  for (const g of groups) {
    for (const t of g.tasks) {
      t.status = taskStatus(t, { finished: settled, runningId: runId, blocked, byNo })
    }
  }
  const rid = runningTaskId(groups, engineSteps, { finished: settled, live: live && !settled })
  if (rid && live && !settled) {
    for (const g of groups) {
      for (const t of g.tasks) {
        if (t.id === rid && t.status === 'queued') t.status = 'run'
      }
    }
  }
  for (const g of groups) {
    g.status = groupStatus(g)
    g.hint = groupHint(g)
    g.runLabel = groupRunLabel(g)
  }
  return groups
}

export const TASK_STATUS_LABEL = {
  done: '通过',
  fail: '失败',
  skip: '不验',
  gap: '无法执行',
  blocked: '未执行',
  run: '执行中',
  queued: '未执行',
}

export function taskStatusLabel(task) {
  const c = String(task?.code || '')
  if (task?.status === 'run') {
    if (task.kind === 'check') return '校验中'
    if (task.kind === 'do') return '操作中'
    return '执行中'
  }
  if (task?.status === 'fail' && task.kind === 'check') return '校验不通过'
  if (/PREP\.OK\.deferred/.test(c)) return '由步骤验证'
  if (task?.status === 'blocked' || /SKIPPED\.step_not_done|SKIPPED\.blocked/.test(c)) return '未执行'
  if (task?.gapTag) return task.gapTag
  if (codeLooksGap(c)) return gapTagOf(c)
  if (/UNMET|PREP\.FAIL/.test(c)) return '未就绪'
  if (task?.status === 'gap' && task.kind === 'check') return '无法验证'
  if (task?.status === 'fail' && task.kind === 'prep') return '未就绪'
  if (task?.status === 'fail') return '失败'
  if (task?.skip || (/SKIPPED\.no_expect/.test(c) && !task?.gapTag)) return '不验'
  if (task?.status === 'blocked' || task?.status === 'queued' || /SKIPPED/.test(c)) return '未执行'
  return TASK_STATUS_LABEL[task?.status] || task?.status || ''
}

export function emptyTaskHint(task) {
  const c = String(task?.code || '')
  if (task?.msg) return task.msg
  if (codeLooksGap(c) || task?.status === 'gap') {
    return task?.gapTag ? `${task.gapTag}，已跳过，不挡住开跑。` : '引擎做不到或认不出，已跳过，不挡住开跑。'
  }
  if (/UNMET|PREP\.FAIL/.test(c)) return '前置检查过了但没满足，所以停在这里。'
  if (task?.status === 'fail') return '没有动作卡片。检查阶段就结束了。'
  if (task?.skip) return '本步不生成预期号，没有断言卡片。'
  if (task?.status === 'blocked') return '前面的前置没过，本步没开始，所以没有卡片。'
  if (task?.status === 'queued') return '还没轮到，没有卡片。'
  if (task?.status === 'done') return '已满足，没有额外动作。'
  return '没有动作卡片。'
}
