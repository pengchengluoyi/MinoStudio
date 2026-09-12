/** NavFSM ↔ VueFlow 互转。布局存 meta.studio_layout，runtime 忽略。 */

export const CALIBRATE_MARK = '__CALIBRATE__'

const DEFAULT_LAYOUT = { states: {} }

export function readLayout(doc) {
  const meta = doc?.meta || {}
  const layout = meta.studio_layout || {}
  return {
    states: { ...(layout.states || {}) },
  }
}

export function writeLayout(doc, layout) {
  const next = { ...(doc || {}) }
  next.meta = { ...(next.meta || {}) }
  next.meta.studio_layout = {
    states: { ...(layout?.states || {}) },
  }
  return next
}

function hasCalibrateMark(obj) {
  try {
    return JSON.stringify(obj || {}).includes(CALIBRATE_MARK)
  } catch {
    return false
  }
}

function stateKind(state) {
  return String(state?.kind || 'page')
}

function edgeKind(edge) {
  return String(edge?.kind || 'nav')
}

function edgeFrom(edge) {
  return String(edge?.from || edge?.from_state || '').trim()
}

function edgeTo(edge) {
  return String(edge?.to || edge?.to_state || '').trim()
}

function edgeId(edge) {
  return String(edge?.id || edge?.edge_id || '').trim()
}

function stateId(state) {
  return String(state?.id || state?.state_id || '').trim()
}

const WIDGET_LABELS = {
  search_bar: '搜索',
  carousel: '轮播',
  banner: '横幅',
  action_row: '按钮',
  dropdown: '下拉',
  grid_2col: '双列',
  list_rows: '列表',
  tab_shell: '壳层',
}

function frameworkKindLabel(kind) {
  const raw = String(kind || '').trim()
  if (!raw) return ''
  return raw.replace(/_/g, '·')
}

function widgetSummary(match) {
  const widgets = Array.isArray(match?.widgets) ? match.widgets : []
  const parts = widgets.map((w) => WIDGET_LABELS[w] || w).filter(Boolean)
  if (parts.length) return parts.join('+')
  return frameworkKindLabel(match?.kind)
}

function stateLabel(state) {
  const identify = state?.identify || {}
  const required = identify.required
  const blocks = Array.isArray(required) ? required : (required ? [required] : [])
  let tabLabel = ''
  let fwMatch = null
  for (const block of blocks) {
    const tab = block?.match?.selected
    if (block?.signal === 'tab_bar' && tab) tabLabel = tab
    if (block?.signal === 'layout_framework') fwMatch = block.match || null
  }
  if (state?.entry && tabLabel) return `入口 · ${tabLabel}`
  if (tabLabel && fwMatch) {
    const kind = String(fwMatch.kind || '')
    const pageName = frameworkKindLabel(kind)
    if (pageName) return `${tabLabel} · ${pageName}`
  }
  for (const block of blocks) {
    const tab = block?.match?.selected
    if (block?.signal === 'tab_bar' && tab) return `Tab · ${tab}`
    for (const text of block?.any || []) {
      const val = String(text || '').trim()
      if (val && val !== CALIBRATE_MARK) return val
    }
  }
  return stateId(state)
}

/** 简单横向排布：无坐标时按 states 顺序摆。 */
function autoPosition(index, kind) {
  const row = kind === 'dialog' ? 1 : 0
  return { x: 80 + index * 240, y: 80 + row * 140 }
}

function tabBarEntries(doc) {
  const entries = doc?.meta?.tab_bar?.entries
  return Array.isArray(entries) ? entries.map((s) => String(s || '').trim()).filter(Boolean) : []
}

const LAYOUT_ENTRY_X = 48
const LAYOUT_NODE_W = 220
const LAYOUT_H_GAP = 88
const LAYOUT_ROW_MIN_H = 200
const LAYOUT_ROW_PAD = 56
const LAYOUT_START_Y = 48
const LAYOUT_COL_W = 340

function isCollinearPositions(positions) {
  if (!positions || positions.length < 3) return false
  const ys = positions.map((p) => Number(p.y) || 0)
  return Math.max(...ys) - Math.min(...ys) < 40
}

/** 多节点坐标挤在一起时强制重新排版。 */
function positionsTooClustered(positions) {
  if (!positions || positions.length < 2) return false
  const pts = positions.map((p) => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 }))
  for (let i = 0; i < pts.length; i += 1) {
    for (let j = i + 1; j < pts.length; j += 1) {
      const dx = Math.abs(pts[i].x - pts[j].x)
      const dy = Math.abs(pts[i].y - pts[j].y)
      if (dx < 100 && dy < 180) return true
    }
  }
  return isCollinearPositions(pts)
}

function positionsLookHorizontalRow(positions) {
  if (!positions || positions.length < 2) return false
  const xs = positions.map((p) => Number(p.x) || 0)
  const ys = positions.map((p) => Number(p.y) || 0)
  const ySpan = Math.max(...ys) - Math.min(...ys)
  const xSpan = Math.max(...xs) - Math.min(...xs)
  return ySpan < 100 && xSpan > LAYOUT_COL_W * 0.5
}

/** 入口或子页被排成横排（旧列布局）时需要重排为按 Tab 分行。 */
function layoutLooksLikeHorizontalStrip(layoutStates, states, entries) {
  const entrySet = new Set(entries || [])
  const entryPositions = (entries || [])
    .map((eid) => layoutStates?.[eid])
    .filter(Boolean)
  if (positionsLookHorizontalRow(entryPositions)) return true

  const subPositions = []
  for (const st of states || []) {
    const sid = stateId(st)
    if (!sid || entrySet.has(sid) || st.entry) continue
    const pos = layoutStates?.[sid]
    if (pos) subPositions.push(pos)
  }
  return positionsLookHorizontalRow(subPositions)
}

function inferTabFromStateId(sid) {
  const m = String(sid || '').match(/^page\.tab_([^.]+)/)
  return m ? m[1] : ''
}

function parentEntryForState(sid, entries, labelsMap) {
  const id = String(sid || '').trim()
  if (!id) return ''
  const entryList = entries || []
  const byPrefix = entryList.find((eid) => id.startsWith(`${eid}.`))
  if (byPrefix) return byPrefix
  const labels = labelsMap || {}
  const entryByLabel = new Map()
  for (const eid of entryList) {
    const label = String(labels[eid] || inferTabFromStateId(eid) || '').trim()
    if (label) entryByLabel.set(label, eid)
  }
  const tab = inferTabFromStateId(id)
  return entryByLabel.get(tab) || ''
}

function tabLabelFromState(st, labelsMap, entries) {
  const identify = st?.identify || {}
  const blocks = Array.isArray(identify.required) ? identify.required : []
  const fromBar = blocks.find((b) => b?.signal === 'tab_bar')?.match?.selected
  if (fromBar) return String(fromBar).trim()
  const sid = stateId(st)
  for (const eid of entries || []) {
    const label = labelsMap?.[eid]
    if (sid === eid || sid.startsWith(`${eid}.`)) return String(label || inferTabFromStateId(eid)).trim()
  }
  return inferTabFromStateId(sid)
}

/** Tab 全互连：同级入口纵向排列，连线仍走左右端口。 */
function tabMeshPositions(stateIds) {
  const ids = (stateIds || []).filter(Boolean)
  const out = {}
  ids.forEach((sid, i) => {
    out[sid] = { x: LAYOUT_ENTRY_X, y: LAYOUT_START_Y + i * LAYOUT_ROW_MIN_H }
  })
  return out
}

function isFullTabMesh(entryCount, navEdgeCount) {
  return entryCount >= 2 && navEdgeCount >= entryCount * (entryCount - 1)
}

/** 每个 Tab 一行：入口在左，子页在右；多 Tab 纵向叠放。 */
function layeredLayout(doc, states, { rowMinH = LAYOUT_ROW_MIN_H } = {}) {
  const entries = tabBarEntries(doc)
  const labelsMap = doc?.meta?.tab_bar?.labels || {}
  const entrySet = new Set(entries)
  const layout = {}
  const entryByLabel = new Map()

  for (const eid of entries) {
    const label = String(labelsMap[eid] || inferTabFromStateId(eid) || '').trim()
    if (label) entryByLabel.set(label, eid)
  }

  const subsByEntry = new Map()
  const orphans = []

  for (const st of states) {
    const sid = stateId(st)
    if (!sid || entrySet.has(sid) || st.entry) continue
    const tab = tabLabelFromState(st, labelsMap, entries)
    const parentByPrefix = entries.find((eid) => sid.startsWith(`${eid}.`))
    const parent = parentByPrefix || entryByLabel.get(tab) || ''
    if (parent) {
      if (!subsByEntry.has(parent)) subsByEntry.set(parent, [])
      subsByEntry.get(parent).push(sid)
    } else {
      orphans.push(sid)
    }
  }

  let rowY = LAYOUT_START_Y
  for (const eid of entries) {
    const subs = (subsByEntry.get(eid) || []).sort()
    layout[eid] = { x: LAYOUT_ENTRY_X, y: rowY }
    subs.forEach((sid, i) => {
      layout[sid] = {
        x: LAYOUT_ENTRY_X + LAYOUT_NODE_W + LAYOUT_H_GAP + i * (LAYOUT_NODE_W + LAYOUT_H_GAP),
        y: rowY,
      }
    })
    rowY += rowMinH + LAYOUT_ROW_PAD
  }

  orphans.sort()
  orphans.forEach((sid, i) => {
    layout[sid] = { x: LAYOUT_ENTRY_X + (i % 3) * LAYOUT_COL_W, y: rowY + Math.floor(i / 3) * rowMinH }
  })

  return layout
}

function edgeTabLabel(edge, states) {
  const to = edgeTo(edge)
  const st = (states || []).find((s) => stateId(s) === to)
  const label = st ? stateLabel(st) : to
  return String(label).replace(/^Tab · /, '').trim() || to.split('.').pop() || to
}

const STEP_LABELS = {
  tap_element: '点击',
  swipe_direction: '滑动',
  swipe_element_to_element: '拖拽',
  input_text: '输入',
  long_press_element: '长按',
}

function edgeActionLabel(edge, states, labelsMap) {
  if (edge?.ui_action) return String(edge.ui_action)
  const eid = edgeId(edge)
  const exec = edge?.execute || {}
  const steps = Array.isArray(exec.steps) ? exec.steps : []
  const meta = edge?.meta || {}
  const scroll = edge?.scroll_into_view || {}

  if (eid.startsWith('edge.tab.')) {
    const dst = edgeTo(edge)
    const tab = exec.target_tab || labelsMap?.[dst] || edgeTabLabel(edge, states)
    return `点击 Tab · ${tab}`
  }
  if (meta.reason === 'tab_sub_enter') return '进入子页'
  if (meta.reason === 'tab_sub_back') return '返回上级'
  if (meta.reason === 'observed_reverse') return '返回'
  if (scroll.direction) {
    const d = String(scroll.direction).toLowerCase()
    return d === 'down' || d === 'bottom' ? '下滑查找' : '上滑查找'
  }
  if (steps.length) {
    const step = String(steps[0] || '')
    if (step === 'tap_element' && exec.target_tab) return `点击 Tab · ${exec.target_tab}`
    if (step === 'swipe_direction') {
      const d = String(exec.direction || '').toLowerCase()
      if (d === 'left') return '左滑'
      if (d === 'right') return '右滑'
      if (d === 'up') return '上滑'
      if (d === 'down') return '下滑'
    }
    return STEP_LABELS[step] || step
  }
  if (meta.observed) {
    const c = Number(meta.count || 1)
    return c > 1 ? `跳转 ×${c}` : '跳转'
  }
  return edgeTabLabel(edge, states) || '跳转'
}

function edgeVisualStyle(edge) {
  const kind = String(edge?.ui_action_kind || edge?.meta?.reason || '')
  const eid = edgeId(edge)
  if (eid.startsWith('hier.')) {
    return { stroke: '#2563eb', strokeWidth: 2, dash: '' }
  }
  if (kind === 'tap_tab' || eid.startsWith('edge.tab.')) {
    return { stroke: '#7c3aed', strokeWidth: 1.5, dash: '' }
  }
  if (kind === 'back' || kind === 'observed_reverse') {
    return { stroke: '#ea580c', strokeWidth: 1.5, dash: '6 4' }
  }
  if (kind === 'enter_sub' || kind === 'tab_sub_enter') {
    return { stroke: '#059669', strokeWidth: 1.5, dash: '' }
  }
  if (kind === 'scroll' || kind === 'swipe') {
    return { stroke: '#0891b2', strokeWidth: 1.5, dash: '4 3' }
  }
  return { stroke: '#64748b', strokeWidth: 1.5, dash: '' }
}

/** 审核预览：入口 → 子页的包含关系（仅展示，不写回 FSM）。 */
function buildHierarchyEdges(states, entries, labelsMap) {
  const entrySet = new Set(entries || [])
  const out = []
  for (const st of states || []) {
    const sid = stateId(st)
    if (!sid || entrySet.has(sid) || st.entry) continue
    const parent = parentEntryForState(sid, entries, labelsMap)
    if (!parent) continue
    out.push({
      id: `hier.${parent}_contains_${sid}`,
      source: parent,
      target: sid,
      type: 'smoothstep',
      label: '子页',
      labelStyle: { fontSize: 10, fill: '#2563eb' },
      labelBgStyle: { fill: '#eff6ff', fillOpacity: 0.95 },
      labelBgPadding: [3, 5],
      labelBgBorderRadius: 4,
      animated: false,
      style: { stroke: '#2563eb', strokeWidth: 2 },
      data: { edge: { kind: 'hierarchy', displayOnly: true, from: parent, to: sid } },
    })
  }
  return out
}

export function docToFlow(doc, options = {}) {
  const preferAutoLayout = Boolean(options.preferAutoLayout)
  const previewMode = Boolean(options.previewMode ?? preferAutoLayout)
  /** structure=Tab行+子页(蓝线)；nav=采集到的页面跳转(不含Tab全互连) */
  const archView = String(options.archView || (previewMode ? 'structure' : 'full'))
  const states = Array.isArray(doc?.states) ? doc.states : []
  const edges = Array.isArray(doc?.edges) ? doc.edges : []
  const layout = readLayout(doc)
  const routeEdges = edges.filter((e) => edgeKind(e) === 'nav')
  const entries = tabBarEntries(doc)
  const entryStates = states.filter((s) => s.entry || entries.includes(stateId(s)))
  const savedPositions = Object.values(layout.states || {})
  const savedIds = Object.keys(layout.states || {})
  const allStatesPositioned = states.length > 0 && states.every((st) => savedIds.includes(stateId(st)))
  const mode = String(doc?.meta?.synthesis_mode || '')
  const hasSubPages = states.length > entryStates.length
  const layered = mode === 'tab_bar_layered' || hasSubPages || entries.length >= 2
  const stripLayout = layoutLooksLikeHorizontalStrip(layout.states, states, entries)
  const needReflow = preferAutoLayout
    || !savedPositions.length
    || !allStatesPositioned
    || positionsTooClustered(savedPositions)
    || stripLayout
  const wireframes = doc?.meta?.state_wireframes || {}
  const emptyWireframe = { regions: [], chrome: {}, screen: { w: 1080, h: 1920 }, source: 'empty' }
  const wireframeForState = (sid) => wireframes[sid] || emptyWireframe
  const useWireframeNodes = previewMode && archView === 'structure'
  const rowMinH = useWireframeNodes ? 460 : LAYOUT_ROW_MIN_H

  let autoPos = null
  if (layered && needReflow) {
    autoPos = layeredLayout(doc, states, { rowMinH })
  } else if (
    entries.length >= 2
    && !hasSubPages
    && isFullTabMesh(entryStates.length, routeEdges.filter((e) => String(e.id || '').startsWith('edge.tab.')).length)
    && needReflow
  ) {
    autoPos = tabMeshPositions(entries)
  }

  const nodes = states.map((st, i) => {
    const sid = stateId(st)
    const kind = stateKind(st)
    const savedPos = preferAutoLayout ? null : layout.states[sid]
    const pos = autoPos?.[sid] || savedPos || autoPosition(i, kind)
    const guards = st?.guards || {}
    return {
      id: sid,
      type: 'navState',
      position: { x: Number(pos.x) || 0, y: Number(pos.y) || 0 },
      data: {
        stateId: sid,
        label: stateLabel(st),
        kind,
        guardsCount: Object.keys(guards).length,
        hasCalibrate: hasCalibrateMark(st),
        state: { ...st, id: sid },
        wireframe: wireframeForState(sid),
        showWireframe: useWireframeNodes,
        appId: String(doc?.app_id || options.appId || ''),
      },
    }
  })

  const labelsMap = doc?.meta?.tab_bar?.labels || {}
  const flowEdges = []
  const seenNav = new Map()
  for (const ed of routeEdges) {
    const eid = edgeId(ed) || `edge.${edgeFrom(ed)}_${edgeTo(ed)}`
    const from = edgeFrom(ed)
    const to = edgeTo(ed)
    if (!from || !to) continue
    const isTabMesh = String(eid).startsWith('edge.tab.')
    const isTrace = String(eid).startsWith('edge.trace.')
    const isShell = String(eid).startsWith('edge.shell.')
    const isInfer = String(eid).startsWith('edge.infer.')
    if (previewMode) {
      if (isTabMesh) continue
      if (archView === 'structure' && (isShell || isInfer)) continue
    }
    const navKey = `${from}→${to}`
    const label = edgeActionLabel(ed, states, labelsMap)
    const vis = edgeVisualStyle(ed)
    if (previewMode && archView === 'nav') {
      const prev = seenNav.get(navKey)
      if (prev) {
        prev.data.edge._dupLabels = [...(prev.data.edge._dupLabels || [prev.label]), label]
        prev.label = prev.data.edge._dupLabels.join(' / ')
        continue
      }
    }
    const row = {
      id: eid,
      source: from,
      target: to,
      type: 'smoothstep',
      label,
      labelStyle: { fontSize: 10, fill: vis.stroke },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95 },
      labelBgPadding: [4, 6],
      labelBgBorderRadius: 4,
      animated: false,
      style: { stroke: vis.stroke, strokeWidth: vis.strokeWidth, strokeDasharray: vis.dash || undefined },
      data: { edge: { ...ed, id: eid, kind: 'nav', from, to, ui_action: label } },
    }
    seenNav.set(navKey, row)
    flowEdges.push(row)
  }

  const hierarchyEdges = previewMode ? buildHierarchyEdges(states, entries, labelsMap) : []
  return { nodes, edges: [...hierarchyEdges, ...flowEdges] }
}

export function flowToDoc(nodes, flowEdges, baseDoc = {}) {
  const stateNodes = (nodes || []).filter((n) => n.type === 'navState')
  const states = stateNodes.map((n) => {
    const raw = n.data?.state || {}
    const sid = String(n.data?.stateId || n.id || '').trim()
    return {
      ...raw,
      id: sid,
      kind: String(n.data?.kind || raw.kind || 'page'),
    }
  })

  const stateIds = new Set(states.map((s) => stateId(s)))

  const edges = (flowEdges || [])
    .filter((fe) => fe.type === 'navEdge' || fe.type === 'smoothstep' || fe.type === 'default')
    .map((fe) => {
      const raw = fe.data?.edge || {}
      const from = String(fe.source || raw.from || '').trim()
      const to = String(fe.target || raw.to || '').trim()
      return {
        ...raw,
        id: String(fe.id || raw.id || `edge.${from}_to_${to}`),
        kind: 'nav',
        from,
        to,
      }
    })
    .filter((ed) => stateIds.has(edgeFrom(ed)) && stateIds.has(edgeTo(ed)))

  const layout = { states: {} }
  for (const n of nodes || []) {
    if (!n?.id || !n.position) continue
    layout.states[n.id] = {
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
    }
  }

  const next = {
    ...baseDoc,
    states,
    edges,
  }
  return writeLayout(next, layout)
}

export function newStateSkeleton(stateId, kind = 'page') {
  const sid = String(stateId || '').trim()
  return {
    id: sid,
    kind,
    identify: {
      required: [{ signal: 'text_landmarks', any: [CALIBRATE_MARK], none_of: [] }],
    },
    guards: kind === 'page' ? {} : {},
    wiki_ref: '',
  }
}

export function newNavEdgeSkeleton(from, to) {
  const f = String(from || '').trim()
  const t = String(to || '').trim()
  const short = (s) => s.split('.').pop() || s
  return {
    id: `edge.${short(f)}_to_${short(t)}`,
    kind: 'nav',
    from: f,
    to: t,
    guard: {},
    execute: { steps: [CALIBRATE_MARK] },
    effect_assert: {
      within_ms: 8000,
      require_any: [{ text_landmarks: [CALIBRATE_MARK] }],
      require_none: [],
      state_delta: {},
    },
    on_fail: {},
    scroll_into_view: {},
  }
}

export function renameStateInDoc(doc, oldId, newId) {
  const oid = String(oldId || '').trim()
  const nid = String(newId || '').trim()
  if (!oid || !nid || oid === nid) return doc
  const next = JSON.parse(JSON.stringify(doc || {}))
  next.states = (next.states || []).map((st) => {
    const sid = stateId(st)
    if (sid !== oid) return st
    return { ...st, id: nid }
  })
  next.edges = (next.edges || []).map((ed) => {
    const patch = { ...ed }
    if (edgeFrom(ed) === oid) patch.from = nid
    if (edgeTo(ed) === oid) patch.to = nid
    return patch
  })
  const layout = readLayout(next)
  if (layout.states[oid]) {
    layout.states[nid] = layout.states[oid]
    delete layout.states[oid]
  }
  return writeLayout(next, layout)
}

export function removeStateFromDoc(doc, targetId) {
  const tid = String(targetId || '').trim()
  const next = JSON.parse(JSON.stringify(doc || {}))
  next.states = (next.states || []).filter((st) => stateId(st) !== tid)
  next.edges = (next.edges || []).filter(
    (ed) => edgeKind(ed) === 'nav' && edgeFrom(ed) !== tid && edgeTo(ed) !== tid,
  )
  const layout = readLayout(next)
  delete layout.states[tid]
  return writeLayout(next, layout)
}

/** Nexus 未部署 /nav-fsm 时 Studio 本地兜底，与 `nav_fsm_template.build_template` 同形。 */
export function buildClientTemplate(appId, projectId = '') {
  const anchor = 'case.nav_anchor.author_name'
  const screens = [
    ['page.home', 'page'],
    ['page.list', 'page'],
    ['page.detail', 'page'],
    ['dialog.confirm', 'dialog'],
  ]
  const ids = screens.map(([sid]) => sid)

  const identify = (sid, kind) => {
    const signals = [{ signal: 'text_landmarks', any: [CALIBRATE_MARK], none_of: [] }]
    if (kind === 'page' && sid.startsWith('page.')) {
      signals.push({ signal: 'tab_bar', match: { selected: CALIBRATE_MARK } })
    }
    return { required: signals }
  }

  const states = screens.map(([sid, kind]) => ({
    id: sid,
    kind,
    identify: identify(sid, kind),
    guards: kind === 'page' && sid !== ids[0] ? { 'widget.primary': { states: {} } } : {},
    wiki_ref: '',
  }))

  const edges = []
  for (let i = 0; i < ids.length - 1; i += 1) {
    const src = ids[i]
    const dst = ids[i + 1]
    const edge = newNavEdgeSkeleton(src, dst)
    if (i === 1) {
      edge.guard = {
        'widget.primary': 'on',
        anchor: { author_name: `{{${anchor}}}` },
      }
      edge.scroll_into_view = {
        required: CALIBRATE_MARK,
        anchor_match: {
          text_landmarks: [`{{${anchor}}}`],
          parent_resource_id_regex: CALIBRATE_MARK,
        },
        max_swipes: 8,
        direction: 'up',
      }
    }
    edges.push(edge)
  }

  return {
    app_id: String(appId || ''),
    project_id: String(projectId || ''),
    version: 'v1',
    meta: {
      hierarchy_calibration: {
        calibration_id: CALIBRATE_MARK,
        evidence_rel_path: CALIBRATE_MARK,
        account_id: CALIBRATE_MARK,
        project_id: String(projectId || ''),
        hierarchy_format: 'accessibility_json',
        hierarchy_result_key: 'nodes',
        follow_filled_detectable: CALIBRATE_MARK,
        guard_recheck_on_anchor_hit: true,
        anchor_on_first_screen: CALIBRATE_MARK,
      },
      guard_catalog: [],
    },
    test_data: {
      lease_tags: [],
      anchor_field: anchor,
    },
    states,
    edges,
  }
}

export function pendingMarks(doc) {
  const out = []
  const walk = (node, path) => {
    if (node === null || node === undefined) return
    if (typeof node === 'string') {
      if (node.includes(CALIBRATE_MARK)) out.push(path || '<root>')
      return
    }
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`))
      return
    }
    if (typeof node === 'object') {
      Object.entries(node).forEach(([k, v]) => {
        walk(v, path ? `${path}.${k}` : k)
      })
    }
  }
  walk(doc, '')
  return out
}
