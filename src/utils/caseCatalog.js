/** 与后端 case_precondition_service / coverage_codes 对齐的用例写作库。 */

export const PREP_CATALOG = [
  { kind: 'check_logged_in', label: '已登录', sample: '已登录', phase: 'after_launch' },
  { kind: 'check_not_logged_in', label: '游客 / 未登录', sample: '未登录', phase: 'after_launch' },
  { kind: 'check_env', label: '客户端环境', sample: '测试环境', phase: 'after_launch' },
  { kind: 'check_app_version', label: '客户端版本', sample: '客户端版本 ≥1.3.0', phase: 'before_launch' },
  { kind: 'check_app_foreground', label: '当前已打开 App', sample: '当前已打开 App', phase: 'before_launch' },
  { kind: 'clear_cache', label: '无缓存', sample: '无缓存', phase: 'before_launch' },
  { kind: 'check_sim', label: '已安装 SIM 卡', sample: '已安装 SIM 卡', phase: 'before_launch', note: '仅 Android' },
  { kind: 'check_wechat', label: '已安装微信', sample: '已安装微信', phase: 'before_launch' },
  { kind: 'check_no_wechat', label: '未安装微信', sample: '未安装微信', phase: 'before_launch' },
  { kind: 'check_android_device', label: 'Android 设备', sample: 'Android 设备执行', phase: 'before_launch' },
  { kind: 'check_ios_device', label: 'iOS 设备', sample: 'iOS 设备执行', phase: 'before_launch' },
  { kind: 'keep_permission_prompt', label: '保留权限询问', sample: '保留权限询问', phase: 'before_launch' },
]

const PREP_RULES = [
  { kind: 'clear_cache', re: /无缓存|清除缓存|清理缓存|清空缓存|清缓存|清除应用/ },
  { kind: 'check_sim', re: /sim卡|sim\s*卡|安装\s*sim|手机卡|电话卡/i },
  { kind: 'check_wechat', re: /安装.*微信|已装.*微信|有微信|装了微信|微信已安装/ },
  { kind: 'check_no_wechat', re: /未安装微信|没装微信|无微信/ },
  { kind: 'check_ios_device', re: /(ios|苹果机|iphone|ipad).*(设备|执行|手机)|(设备|执行|手机).*(ios|苹果机|iphone|ipad)/i },
  { kind: 'check_android_device', re: /(安卓|android).*(设备|执行|手机)|(设备|执行|手机).*(安卓|android)/i },
  { kind: 'check_logged_in', re: /已登录|登录状态|保持登录/ },
  { kind: 'check_not_logged_in', re: /未登录|游客|未登陆/ },
  { kind: 'check_env', re: /测试环境|预发环境|正式环境|生产环境|开发环境|切换环境|客户端环境/ },
  { kind: 'keep_permission_prompt', re: /保留权限(询问|弹窗|框)?|不要(预)?授权|keep_permission/i },
  { kind: 'check_app_foreground', re: /当前已打开|已打开\s*.*(App|APP|应用)|前台(是|为|应用)|应用在前台|目标应用已打开/i },
  { kind: 'check_app_version', re: /客户端版本|应用版本|app版本|versionName|版本\s*[≥>=≤<=]/i },
]

const PREP_UNSUPPORTED = [
  { kind: 'remote_config', code: 'PREP.UNSUPPORTED.remote_config', re: /远程配置|远程开关|feature\s*flag|灰度开关/i },
  { kind: 'backend_data', code: 'PREP.UNSUPPORTED.backend_data', re: /已购|指定订单|造数|服务端数据|号池标签|账号标签/ },
  { kind: 'sms_live', code: 'PREP.UNSUPPORTED.sms_live', re: /真短信|活短信|收到短信|短信验证码到达/ },
  { kind: 'external_channel', code: 'PREP.UNSUPPORTED.external_channel', re: /接电话|来电|推送必达/ },
  { kind: 'device_mock', code: 'PREP.UNSUPPORTED.device_mock', re: /地理围栏|模拟定位|时间旅行/ },
]

const PREP_DEFER = [
  { kind: 'web_config', re: /web\s*端|web后台|运营后台|管理后台|后台配置|查看后台|后台.*开关|悬浮球开关/i, label: '由步骤验证' },
]

export function classifyPrepLine(text) {
  const t = String(text || '').trim()
  if (!t) return { kind: '', code: '', label: '', tone: 'info' }
  for (const rule of PREP_RULES) {
    if (rule.re.test(t)) {
      const meta = PREP_CATALOG.find((c) => c.kind === rule.kind)
      return { kind: rule.kind, code: `PREP.OK.${rule.kind}`, label: meta?.label || rule.kind, tone: 'success' }
    }
  }
  for (const rule of PREP_DEFER) {
    if (rule.re.test(t)) {
      return { kind: rule.kind, code: 'PREP.OK.deferred', label: rule.label, tone: 'info' }
    }
  }
  for (const rule of PREP_UNSUPPORTED) {
    if (rule.re.test(t)) {
      return { kind: rule.kind, code: rule.code, label: '无法执行', tone: 'warning' }
    }
  }
  return { kind: 'unknown', code: 'PREP.UNKNOWN', label: '无法识别', tone: 'warning' }
}

export const STEP_CAPS = [
  { id: 'launch_app', label: '打开应用', re: /打开应用|启动应用|打开\s*app/i },
  { id: 'kill_app', label: '杀进程', re: /杀进程|关闭应用|结束应用/ },
  { id: 'long_press', label: '长按', re: /长按/ },
  { id: 'drag', label: '拖拽', re: /拖到|拖拽/ },
  { id: 'swipe', label: '滑动', re: /上滑|下滑|左滑|右滑/ },
  { id: 'input_text', label: '输入', re: /输入|填写/ },
  { id: 'press_key', label: '系统键', re: /返回键|按返回|按\s*home|按 Home/i },
  { id: 'wait_ms', label: '等待', re: /等待/ },
  { id: 'tap_element', label: '点击', re: /点击|点「|打开「|点选/ },
]

const STEP_UNSUPPORTED = [
  { id: 'av_call', re: /语音通话|视频通话/ },
  { id: 'camera_scene', re: /摄像头|扫二维码|对着/ },
  { id: 'gesture_complex', re: /双指|捏合|缩放/ },
  { id: 'external_app_pay', re: /微信支付|支付宝.*付|去微信.*付/ },
  { id: 'hardware_fx', re: /听声道|震动|闪光灯/ },
  { id: 'cross_surface', re: /同时.*后台|操作 web/i },
]

export function classifyStepLine(text) {
  const t = String(text || '').trim()
  if (!t) return { id: '', label: '', tone: 'info', code: '' }
  for (const rule of STEP_UNSUPPORTED) {
    if (rule.re.test(t)) return { id: rule.id, label: '无法执行', tone: 'warning', code: `STEP.UNSUPPORTED.${rule.id}` }
  }
  for (const rule of STEP_CAPS) {
    if (rule.re.test(t)) return { id: rule.id, label: rule.label, tone: 'success', code: 'STEP.OK' }
  }
  return { id: 'unknown', label: '无法识别', tone: 'warning', code: 'STEP.UNKNOWN' }
}

function classifyExpectClaim(text) {
  const t = String(text || '').trim()
  if (!t) return { id: 'skip', label: '不验', tone: 'info', code: 'EXPECT.SKIPPED.no_expect', gap: true }
  const unverifiable = [
    ['av_haptic', /视频自动播|自动播放|声音|音效|震动|听筒/, '声画震动'],
    ['subjective', /好看|高级感|沉浸|符合设计|精致|美观/, '主观观感'],
    ['temporal', /连续多帧|无卡死|无闪退|不卡顿/, '连续多帧'],
    ['no_baseline', /(?<!显示为)\+1|从.+变/, '无基线对比'],
    ['pixel_perfect', /像素|对齐|字号|色值|4px|间距精确/, '像素级对齐'],
  ]
  const mixed = /进入|切换到|到达|跳转|落地页|不出现|选中态|已选中/.test(t)
  if (!mixed) {
    for (const [id, re, label] of unverifiable) {
      if (re.test(t)) return { id, label, tone: 'warning', code: `EXPECT.UNVERIFIABLE.${id}`, gap: true }
    }
    if (/功能正常|逻辑正确|无异常|与设计一致/.test(t)) {
      return { id: 'unknown', label: '无法识别', tone: 'warning', code: 'EXPECT.UNKNOWN', gap: true }
    }
  }
  if (/不出现|不含|不可见|看不到|没有出现|未出现/.test(t)) {
    return { id: 'text_absent', label: '文本不出现', tone: 'success', code: 'EXPECT.PASS.text_absent', gap: false }
  }
  if (/选中态|已选中|高亮选中/.test(t) && !/进入|切换到/.test(t)) {
    return { id: 'tab_selected', label: '选中态', tone: 'success', code: 'EXPECT.PASS.tab_selected', gap: false }
  }
  if (/出现|可见「|文案/.test(t)) {
    return { id: 'text_present', label: '文本', tone: 'success', code: 'EXPECT.PASS.text_present', gap: false }
  }
  if (/数量为|显示为\s*\d|积分为/.test(t)) {
    return { id: 'numeric', label: '数量', tone: 'success', code: 'EXPECT.PASS.numeric', gap: false }
  }
  if (/进入|切换到|到达|跳转|落地页/.test(t)) {
    return { id: 'page_nav', label: '到页', tone: 'success', code: 'EXPECT.PASS.page_nav', gap: false }
  }
  if (/登录态|保持登录|仍在登录|未弹出登录/.test(t)) {
    return { id: 'login_outcome', label: '登录结果', tone: 'success', code: 'EXPECT.PASS.login_outcome', gap: false }
  }
  if (/可见|存在/.test(t)) {
    return { id: 'node', label: '控件', tone: 'success', code: 'EXPECT.PASS.node', gap: false }
  }
  return { id: 'meaning', label: '含义', tone: 'success', code: 'EXPECT.PASS.meaning', gap: false }
}

export function classifyExpectLine(text) {
  const t = String(text || '').trim()
  if (!t) return { id: 'skip', label: '不验', tone: 'info', code: 'EXPECT.SKIPPED.no_expect' }
  const one = classifyExpectClaim(t)
  if (one.gap) {
    return { id: one.id, label: one.label === '无法识别' ? '无法识别' : '无法验证', tone: 'warning', code: one.code }
  }
  return { id: one.id, label: one.label, tone: 'success', code: one.code }
}

export const GAP_KIND_LABEL = {
  remote_config: '远程开关',
  backend_data: '造服务端数据',
  sms_live: '真短信',
  external_channel: '外部通道',
  device_mock: '设备模拟',
  sim_ios: 'iOS 无法读 SIM',
  av_call: '语音/视频通话',
  camera_scene: '摄像头场景',
  gesture_complex: '复杂手势',
  external_app_pay: '外部支付',
  hardware_fx: '听声道/震动/闪光',
  cross_surface: '跨端操作',
  animation: '动画/转场',
  av_haptic: '声画震动',
  subjective: '主观观感',
  temporal: '连续多帧',
  no_baseline: '无基线对比',
  pixel_perfect: '像素级对齐',
  tab_selected: '选中态/切页',
  session_frame: '首页登录态',
}

export function codeLooksGap(code) {
  const c = String(code || '')
  return /UNKNOWN|UNSUPPORTED|UNVERIFIABLE/.test(c)
}

export function gapTagOf(code, kind = '') {
  const c = String(code || '')
  if (!codeLooksGap(c)) return ''
  let tail = String(kind || '').trim()
  if (!tail) {
    const parts = c.split('.')
    tail = parts[parts.length - 1] || ''
  }
  if (['UNKNOWN', 'UNSUPPORTED', 'UNVERIFIABLE'].includes(tail)) tail = String(kind || '')
  const detail = GAP_KIND_LABEL[tail] || ''
  if (/UNKNOWN/.test(c)) return '无法识别 · 未命中引擎库'
  if (/UNVERIFIABLE/.test(c)) return detail ? `无法验证 · ${detail}` : '无法验证'
  return detail ? `无法执行 · ${detail}` : '无法执行'
}

export const COVERAGE_LABEL = {
  pass: '通过',
  product_fail: '校验不通过',
  prep_insufficient: '前置准备不足',
  step_unexecutable: '测试步骤无法执行',
  expect_unverifiable: '无法验证',
  untestable: '测不了',
  engine_error: '引擎故障',
}

export const COVERAGE_TONE = {
  pass: 'success',
  product_fail: 'danger',
  prep_insufficient: 'warning',
  step_unexecutable: 'warning',
  expect_unverifiable: 'warning',
  untestable: 'info',
  engine_error: 'warning',
}

export function coverageClassOf(row) {
  const cls = String(row?.coverage_class || '').trim()
  if (cls) return cls
  const st = String(row?.status || '')
  const fc = String(row?.failure_category || '')
  if (st === 'untestable' || fc === 'untestable') return 'untestable'
  if (st === 'unverifiable' || fc === 'expect_unverifiable') return 'expect_unverifiable'
  if (st === 'unexecutable' || fc === 'step_unexecutable') return 'step_unexecutable'
  if (fc === 'prep_insufficient') return 'prep_insufficient'
  if (['execution_error', 'budget_exhausted', 'device_unhealthy'].includes(fc)) return 'engine_error'
  if (st === 'pass') return 'pass'
  if (['fail', 'failed'].includes(st)) return 'product_fail'
  if (st === 'blocked' || st === 'declined') return 'engine_error'
  return ''
}

export function isProductFailRow(row) {
  return coverageClassOf(row) === 'product_fail'
}

export function isUnverifiableRow(row) {
  return coverageClassOf(row) === 'expect_unverifiable'
}

export function isGapRow(row) {
  return ['prep_insufficient', 'step_unexecutable', 'untestable', 'engine_error'].includes(coverageClassOf(row))
}

export function summarizeTaskCoverage(cases = []) {
  const counts = {
    pass: 0,
    product_fail: 0,
    prep_insufficient: 0,
    step_unexecutable: 0,
    expect_unverifiable: 0,
    untestable: 0,
    engine_error: 0,
    other: 0,
  }
  for (const row of cases) {
    const st = String(row?.status || '')
    if (['pending', 'queued', 'running', 'cancelled', 'skipped'].includes(st)) continue
    const cls = coverageClassOf(row) || 'other'
    if (counts[cls] == null) counts.other += 1
    else counts[cls] += 1
  }
  const productDenom = counts.pass + counts.product_fail
  const productPassRate = productDenom ? Math.round((counts.pass / productDenom) * 100) : null
  const gaps = counts.prep_insufficient + counts.step_unexecutable + counts.engine_error
  return { ...counts, productDenom, productPassRate, gaps }
}

export const STATE_HELD = 'held'
export const STATE_FAILED = 'failed'
export const STATE_UNOBSERVED = 'unobserved'

export const STATE_LABEL = { held: '成立', failed: '不成立', unobserved: '未观察' }
export const REASON_LABEL = {
  not_reached: '没跑到',
  no_scene: '场景没有',
  cant_see: '这句看不了',
  human_unsigned: '人手未签',
}

const PROXY_SELECTED = /选中|高亮/
const PROXY_BALL = /悬浮球|领取球|投放球/
const NAV_TEXT = /进入|到了|打开了/
const PENDING_STATUS = new Set(['pending', 'queued', 'running'])

export function observationState(code) {
  const c = String(code || '')
  if (c.startsWith('EXPECT.PASS')) return STATE_HELD
  if (c.startsWith('EXPECT.FAIL')) return STATE_FAILED
  if (c === 'EXPECT.SKIPPED.no_expect') return ''
  return STATE_UNOBSERVED
}

export function unobservedReason(code, { coverageClass = '', caseStatus = '' } = {}) {
  const c = String(code || '')
  const st = String(caseStatus || '')
  const cls = String(coverageClass || '')
  if (st === 'blocked') return 'human_unsigned'
  if (['pending', 'queued', 'cancelled', 'skipped'].includes(st)) return 'not_reached'
  if (c.includes('step_not_done')) return 'not_reached'
  if (cls === 'prep_insufficient' || c.includes('SKIPPED.blocked')) return 'no_scene'
  if (cls === 'engine_error' || cls === 'step_unexecutable') return 'not_reached'
  if (/UNVERIFIABLE/.test(c) || c === 'EXPECT.UNKNOWN' || cls === 'expect_unverifiable' || cls === 'untestable') {
    return 'cant_see'
  }
  return 'cant_see'
}

function isProxyHeld(pointText, rows) {
  const pt = String(pointText || '')
  const held = (rows || []).filter((r) => r.state === STATE_HELD)
  if (!held.length) return false
  const onlyNav = held.every((r) => String(r.code || '').includes('page_nav') || NAV_TEXT.test(String(r.text || '')))
  if (!onlyNav) return false
  if (PROXY_SELECTED.test(pt)) return true
  if (PROXY_BALL.test(pt) && !held.some((r) => /球|悬浮/.test(String(r.text || '')))) return true
  return false
}

function countUnknownByCol(cov) {
  const counts = { prep: 0, step: 0, expect: 0 }
  const gaps = cov?.gaps
  if (Array.isArray(gaps) && gaps.length) {
    for (const gap of gaps) {
      if (counts[gap?.col] != null) counts[gap.col] += 1
    }
    return counts
  }
  if (!cov || typeof cov !== 'object') return counts
  for (const [col, key] of [['prep', 'prep'], ['step', 'steps'], ['expect', 'expects']]) {
    for (const row of cov[key] || []) {
      const code = String(row?.code || row?.reason_code || '')
      if (codeLooksGap(code) && counts[col] != null) counts[col] += 1
    }
  }
  return counts
}

function synthExpects(row) {
  const texts = []
  const ebs = row?.expected_by_step
  if (ebs && typeof ebs === 'object' && Object.keys(ebs).length) {
    for (const k of Object.keys(ebs).sort((a, b) => Number(a) - Number(b))) {
      const t = String(ebs[k] || '').trim()
      if (t) texts.push([Number(k) || texts.length + 1, t])
    }
  } else if (Array.isArray(row?.expected)) {
    row.expected.forEach((t, i) => {
      const tt = String(t || '').trim()
      if (tt) texts.push([i + 1, tt])
    })
  }
  const st = String(row?.status || '')
  if (!texts.length && [...PENDING_STATUS, 'cancelled', 'skipped', 'blocked'].includes(st)) {
    texts.push([0, String(row?.summary || row?.name || row?.case_id || '')])
  }
  const code = coverageClassOf(row) === 'prep_insufficient' ? 'EXPECT.SKIPPED.blocked' : 'EXPECT.SKIPPED.step_not_done'
  return texts.filter(([, t]) => t).map(([n, t]) => ({ n, text: t, code }))
}

export function buildSignoff(cases = [], { points = [] } = {}) {
  const observations = []
  const unknownByCol = { prep: 0, step: 0, expect: 0 }
  for (const row of cases || []) {
    if (!row || typeof row !== 'object') continue
    const cid = String(row.case_id || '')
    const name = String(row.name || cid)
    const st = String(row.status || '')
    const cls = coverageClassOf(row)
    const cov = (row.coverage && typeof row.coverage === 'object') ? row.coverage : {}
    const pids = Array.isArray(row.point_ids) ? row.point_ids.map((x) => String(x || '').trim()).filter(Boolean) : []
    const colCounts = countUnknownByCol(cov)
    unknownByCol.prep += colCounts.prep
    unknownByCol.step += colCounts.step
    unknownByCol.expect += colCounts.expect
    let expects = Array.isArray(cov.expects) ? cov.expects.filter((e) => e && typeof e === 'object') : []
    if (!expects.length) expects = synthExpects(row)
    for (const exp of expects) {
      let code = String(exp.code || '')
      const text = String(exp.text || '').trim()
      if (code === 'EXPECT.SKIPPED.no_expect' && !text) continue
      let state = observationState(code)
      if (!state) continue
      if (PENDING_STATUS.has(st)) {
        state = STATE_UNOBSERVED
        if (!/SKIPPED|UNVERIFIABLE|UNKNOWN/.test(code)) code = 'EXPECT.SKIPPED.step_not_done'
      }
      const reason = state === STATE_UNOBSERVED ? unobservedReason(code, { coverageClass: cls, caseStatus: st }) : ''
      observations.push({
        case_id: cid,
        case_name: name,
        sn: String(row.sn || ''),
        n: Number(exp.n || 0),
        text,
        code,
        state,
        reason,
        reason_label: reason ? (REASON_LABEL[reason] || '') : '',
        point_ids: pids,
      })
    }
  }

  const pointList = (points || []).filter((p) => p && typeof p === 'object')
  const caseIds = new Set((cases || []).map((c) => String(c?.case_id || '')).filter(Boolean))
  const inTask = []
  for (const p of pointList) {
    const pid = String(p.id || p.point_id || '')
    const cids = new Set((p.case_ids || []).map((x) => String(x)).filter(Boolean))
    const matched = observations.filter((o) => (pid && (o.point_ids || []).includes(pid)) || (cids.size && cids.has(o.case_id)))
    const linked = (p.case_ids || []).some((x) => caseIds.has(String(x)))
    if (matched.length || linked) inTask.push({ p, pid, matched })
  }

  let rows
  if (inTask.length) {
    rows = inTask.map(({ p, pid, matched }) => {
      const title = String(p.text || p.title || pid)
      let state = STATE_UNOBSERVED
      let reason = 'not_reached'
      if (p.waived) {
        state = STATE_UNOBSERVED
        reason = 'human_unsigned'
      } else if (matched.some((o) => o.state === STATE_FAILED)) {
        state = STATE_FAILED
        reason = ''
      } else if (isProxyHeld(title, matched)) {
        state = STATE_UNOBSERVED
        reason = 'cant_see'
      } else if (matched.length && matched.every((o) => o.state === STATE_HELD)) {
        state = STATE_HELD
        reason = ''
      } else if (matched.some((o) => o.state === STATE_HELD) && matched.some((o) => o.state === STATE_UNOBSERVED)) {
        state = STATE_UNOBSERVED
        reason = matched.find((o) => o.state === STATE_UNOBSERVED && o.reason)?.reason || 'cant_see'
      } else if (matched.length) {
        state = STATE_UNOBSERVED
        reason = matched.find((o) => o.reason)?.reason || 'not_reached'
      }
      return {
        kind: 'point',
        id: pid,
        title,
        state,
        reason,
        reason_label: reason ? (REASON_LABEL[reason] || '') : '',
        case_id: matched[0]?.case_id || String((p.case_ids || [])[0] || ''),
        evidence: matched.slice(0, 8),
      }
    })
  } else {
    rows = observations.map((obs) => ({
      kind: 'expect',
      id: `${obs.case_id}:${obs.n}:${obs.code}`,
      title: obs.text || obs.case_name,
      state: obs.state,
      reason: obs.reason,
      reason_label: obs.reason_label,
      case_id: obs.case_id,
      case_name: obs.case_name,
      n: obs.n,
      code: obs.code,
    }))
  }

  const held = rows.filter((r) => r.state === STATE_HELD).length
  const failed = rows.filter((r) => r.state === STATE_FAILED).length
  const unobserved = rows.filter((r) => r.state === STATE_UNOBSERVED).length
  const denom = held + failed
  let task_verdict = 'empty'
  if (failed) task_verdict = 'product_fail'
  else if (unobserved) task_verdict = 'unobserved'
  else if (held) task_verdict = 'pass'
  return {
    rows,
    observations,
    held,
    failed,
    unobserved,
    productPassRate: denom ? Math.round((held / denom) * 100) : null,
    product_pass_rate: denom ? Math.round((held / denom) * 100) : null,
    unknownByCol: unknownByCol,
    unknown_by_col: unknownByCol,
    task_verdict,
  }
}

export function signoffStateTag(state) {
  if (state === STATE_HELD) return 'success'
  if (state === STATE_FAILED) return 'danger'
  return 'warning'
}

/** 测试报告：执行器做了什么、怎么检测、失败/不可做分到哪一类。不是签收。 */
export const DETECT_HOW = {
  page_nav: '看图：是否到了这一页',
  text_present: '看图：文案是否出现',
  text_absent: '看图：文案是否不出现',
  node: '看图：控件是否可见',
  meaning: '看图：短含义（球 / 弹窗 / 商品页）',
  tab_selected: '看图：该槽是否选中',
  login_outcome: '看图：登录结果',
  numeric: '看图：数量',
  assert_dom: 'DOM：页面结构',
}

export const CANNOT_DIR = { prep: '前置', step: '步骤', expect: '预期' }
export const CANNOT_KIND = {
  UNKNOWN: '认不出',
  UNSUPPORTED: '当前动作表外',
  UNVERIFIABLE: '这句看不了',
}

function codeTail(code) {
  const parts = String(code || '').split('.')
  return parts[parts.length - 1] || ''
}

export function detectHowOf(code, kind = '') {
  const c = String(code || '')
  if (/assert_dom/.test(c)) return DETECT_HOW.assert_dom
  const tail = String(kind || '').trim() || codeTail(c)
  return DETECT_HOW[tail] || (c.startsWith('EXPECT.') ? '看图：当前屏是否满足这句' : '')
}

function cannotMeta(code, col = 'expect') {
  const c = String(code || '')
  let kind = 'UNKNOWN'
  if (/UNSUPPORTED/.test(c)) kind = 'UNSUPPORTED'
  else if (/UNVERIFIABLE/.test(c)) kind = 'UNVERIFIABLE'
  else if (/UNKNOWN/.test(c)) kind = 'UNKNOWN'
  return {
    dir: CANNOT_DIR[col] || col,
    kind,
    kind_label: CANNOT_KIND[kind] || kind,
    tag: gapTagOf(c) || CANNOT_KIND[kind] || '',
  }
}

function pushUnique(list, row, keyOf) {
  const key = keyOf(row)
  if (!key || list.some((x) => keyOf(x) === key)) return
  list.push(row)
}

export function buildExecReport(cases = []) {
  const passed = []
  const failed = []
  const cannot = []
  const pending = []
  for (const row of cases || []) {
    if (!row || typeof row !== 'object') continue
    const cid = String(row.case_id || '')
    const name = String(row.name || cid)
    const st = String(row.status || '')
    const cls = coverageClassOf(row)
    const cov = (row.coverage && typeof row.coverage === 'object') ? row.coverage : {}
    const summary = String(row.summary || '').trim()

    for (const p of cov.prep || []) {
      const code = String(p.code || p.reason_code || '')
      if (!codeLooksGap(code)) continue
      const text = String(p.text || '').trim()
      pushUnique(cannot, {
        case_id: cid,
        case_name: name,
        n: Number(p.seq || 0),
        text,
        code,
        ...cannotMeta(code, 'prep'),
      }, (x) => `${x.case_id}:prep:${x.code}:${x.text}`)
    }
    for (const s of cov.steps || []) {
      const code = String(s.code || '')
      if (!codeLooksGap(code)) continue
      const text = String(s.text || '').trim()
      pushUnique(cannot, {
        case_id: cid,
        case_name: name,
        n: Number(s.n || 0),
        text,
        code,
        ...cannotMeta(code, 'step'),
      }, (x) => `${x.case_id}:step:${x.n}:${x.code}:${x.text}`)
    }

    let expects = Array.isArray(cov.expects) ? cov.expects.filter((e) => e && typeof e === 'object') : []
    if (!expects.length) expects = synthExpects(row)
    for (const exp of expects) {
      let code = String(exp.code || '')
      const text = String(exp.text || '').trim()
      if (code === 'EXPECT.SKIPPED.no_expect' && !text) continue
      if (PENDING_STATUS.has(st) && !/SKIPPED|UNVERIFIABLE|UNKNOWN/.test(code)) {
        code = 'EXPECT.SKIPPED.step_not_done'
      }
      const base = {
        case_id: cid,
        case_name: name,
        n: Number(exp.n || 0),
        text: text || name,
        code,
        how: detectHowOf(code),
        evidence: summary,
      }
      if (code.startsWith('EXPECT.PASS')) {
        passed.push(base)
        continue
      }
      if (code.startsWith('EXPECT.FAIL')) {
        failed.push(base)
        continue
      }
      if (codeLooksGap(code)) {
        pushUnique(cannot, {
          ...base,
          ...cannotMeta(code, 'expect'),
        }, (x) => `${x.case_id}:expect:${x.n}:${x.code}:${x.text}`)
        continue
      }
      if (code === 'EXPECT.SKIPPED.no_expect') continue
      const reason = unobservedReason(code, { coverageClass: cls, caseStatus: st })
      pending.push({
        ...base,
        reason,
        reason_label: REASON_LABEL[reason] || reason,
      })
    }
  }
  return {
    passed,
    failed,
    cannot,
    pending,
    passedCount: passed.length,
    failedCount: failed.length,
    cannotCount: cannot.length,
    pendingCount: pending.length,
  }
}
