/** NavFSM doc → relation-graph JSON（控件锚点连线 + 双向跳转）。 */

const NAV_ROOT_ID = '__nav_app_root__'
const HS_SEP = '::'
export const RG_TARGET_HTML = 'HTMLElementId'
export const RG_TARGET_NODE = 'node'
/** relation-graph RGLineShape.StandardCurve */
export const RG_LINE_SHAPE_CURVE = 6
/** 正交折线：拐点在卡片外侧走线 */
export const RG_LINE_SHAPE_ORTH = 44

export function stateId(state) {
  return String(state?.id || state?.state_id || '').trim()
}

export function regionHotspotKey(region) {
  return `${region?.source || 'r'}-${region?.id ?? 0}`
}

export function hotspotTargetId(stateSid, region) {
  const sid = String(stateSid || '').trim()
  const rk = typeof region === 'string' ? region : regionHotspotKey(region)
  if (!sid || !rk) return ''
  return `${sid}${HS_SEP}${rk}`
}

export function parseHotspotTargetId(targetId) {
  const raw = String(targetId || '')
  const i = raw.indexOf(HS_SEP)
  if (i < 0) return { stateId: raw, regionKey: '' }
  return { stateId: raw.slice(0, i), regionKey: raw.slice(i + HS_SEP.length) }
}

function edgeFrom(edge) {
  return String(edge?.from || edge?.from_state || '').trim()
}

function edgeTo(edge) {
  return String(edge?.to || edge?.to_state || '').trim()
}

function edgeKind(edge) {
  return String(edge?.kind || 'nav')
}

function tabBarEntries(doc) {
  const entries = doc?.meta?.tab_bar?.entries
  return Array.isArray(entries) ? entries.map((s) => String(s || '').trim()).filter(Boolean) : []
}

function tabSlotForLabel(doc, tabLabel) {
  const slots = doc?.meta?.tab_bar?.slots
  if (!Array.isArray(slots)) return null
  const want = String(tabLabel || '').trim()
  return (
    slots.find((s) => String(s?.label || '').trim() === want || String(s?.display || '').trim() === want) ||
    null
  )
}

export function compactPageTitle(raw) {
  const noDigit = String(raw || '').replace(/\d+/g, '').trim()
  const head = (noDigit.split('·')[0] || noDigit).trim()
  const cleaned = head.replace(/\s+/g, '')
  if (!cleaned) return '页面'
  return cleaned.slice(0, 10)
}

const ROLE_LABELS = {
  profile: '个人页',
  feed: '信息流',
  detail: '详情',
  main: '子页',
}

export const LAYOUT_CLASS_LABELS = {
  fixed_viewport: '固定视口',
  infinite_feed: '信息流',
  horizontal_pager: '横滑多态',
  transient_overlay: '浮层',
  unknown: '未知布局',
}

export function layoutExtentLabel(extent) {
  const e = extent && typeof extent === 'object' ? extent : {}
  const h = e.height === 'infinite' ? '∞高' : '有限高'
  const w = e.width === 'infinite' ? '∞宽' : '有限宽'
  return `${h} · ${w}`
}

export function archNodeSubhead(st, intel = {}) {
  const meta = st?.meta || {}
  const bits = []
  const lc = String(meta.layout_class || '').trim()
  if (LAYOUT_CLASS_LABELS[lc]) bits.push(LAYOUT_CLASS_LABELS[lc])
  const tier = String(meta.evidence_tier || '').trim()
  if (tier) bits.push(`证据 ${tier}`)
  const morph = Number(meta.morph_count || 0)
  if (morph > 0) bits.push(`多态 ×${morph}`)
  const ext = meta.layout_extent
  if (ext && (ext.height || ext.width)) bits.push(layoutExtentLabel(ext))
  const role = String(meta.page_role || '').trim()
  if (ROLE_LABELS[role]) bits.push(ROLE_LABELS[role])
  const vc = Number(meta.visit_count || 0)
  if (vc > 0) bits.push(`采集 ${vc} 次`)
  if (intel.wikiCount) bits.push(`wiki ${intel.wikiCount}`)
  if (intel.docCount) bits.push(`文档 ${intel.docCount}`)
  const tab = String(meta.tab || '').trim()
  const title = String(meta.display_name || '').trim()
  if (tab && title && !title.includes(tab)) bits.push(`Tab ${tab}`)
  return bits.join(' · ')
}

export function stateDisplayLabel(st) {
  const meta = st?.meta || {}
  const title = String(meta.display_name || meta.page_title || '').trim()
  if (title) return compactPageTitle(title)
  const tab = String(meta.tab || '').trim()
  const role = String(meta.page_role || '').trim()
  if (tab && role) return `${tab} · ${role.replace(/_/g, ' ')}`
  if (tab) return tab
  if (st?.entry) {
    const blocks = Array.isArray(st?.identify?.required) ? st.identify.required : []
    const tab = String(blocks.find((b) => b?.signal === 'tab_bar')?.match?.selected || '').trim()
    if (tab) return `入口 · ${tab}`
  }
  return stateId(st)
}

function wireframeForState(doc, sid) {
  const wf = doc?.meta?.state_wireframes || {}
  return wf[sid] || { regions: [], chrome: {}, screen: { w: 1080, h: 1920 }, source: 'empty' }
}

function applyNavHintsToWireframe(wf, stateSid, edges) {
  const out = { ...wf, regions: [...(wf.regions || [])] }
  for (const ed of edges || []) {
    if (edgeKind(ed) !== 'nav') continue
    if (edgeFrom(ed) !== stateSid) continue
    const meta = ed.meta || {}
    const hs = String(meta.from_hotspot_id || '')
    const dst = edgeTo(ed)
    if (!dst) continue
    let regionKey = ''
    if (hs.includes(HS_SEP)) {
      regionKey = hs.split(HS_SEP).slice(1).join(HS_SEP)
    }
    for (const r of out.regions) {
      const rk = regionHotspotKey(r)
      if (regionKey && rk !== regionKey) continue
      if (regionKey || r.clickable) {
        r.nav_to = dst
        r.nav_label = String(meta.action_label || r.nav_label || r.label || '进入')
        break
      }
    }
  }
  return out
}

/**
 * @param {object} doc NavFSM / Atlas doc
 * @param {{ archView?: 'structure'|'nav', appId?: string, appName?: string, intelOverlay?: object, showWireframe?: boolean }} options
 */
function wireframeHasHotspot(wf, regionKey) {
  if (!regionKey || !wf?.regions?.length) return false
  return wf.regions.some((r) => regionHotspotKey(r) === regionKey)
}

/** Atlas 架构图：固定网格，避免 tree 低估 slot 节点高度导致重叠。 */
function layoutAtlasArchGrid(nodes, { wfW, wfH, colGap = 112, rowGap = 148, maxCols = 3 }) {
  const visible = nodes.filter((n) => String(n.id || '') !== NAV_ROOT_ID)
  const colCount = Math.min(maxCols, Math.max(1, visible.length))
  const indexOf = new Map(visible.map((n, i) => [String(n.id), i]))
  const padX = 48
  const padY = 48
  return nodes.map((n) => {
    const id = String(n.id || '')
    if (id === NAV_ROOT_ID) return n
    const idx = indexOf.get(id)
    if (idx == null) return n
    const col = idx % colCount
    const row = Math.floor(idx / colCount)
    return {
      ...n,
      x: padX + col * (wfW + colGap),
      y: padY + row * (wfH + rowGap),
      fixed: true,
    }
  })
}

function lineFromStateId(line) {
  let fromSid = String(line.from || '')
  if (line.fromType === RG_TARGET_HTML) {
    fromSid = parseHotspotTargetId(fromSid).stateId || fromSid
  }
  return fromSid
}

/** 同对节点多条跳转合并为一条（标签拼接），减少叠线 */
function dedupeArchNavLines(lines) {
  const pairBest = new Map()
  const passthrough = []
  for (const line of lines) {
    if (line.dashType) {
      passthrough.push(line)
      continue
    }
    const to = String(line.to || '')
    const fromSid = lineFromStateId(line)
    if (!fromSid || !to) {
      passthrough.push(line)
      continue
    }
    const key = `${fromSid}→${to}`
    const prev = pairBest.get(key)
    if (!prev) {
      pairBest.set(key, { ...line })
      continue
    }
    const t1 = String(prev.text || '')
    const t2 = String(line.text || '')
    if (t2 && !t1.includes(t2)) {
      prev.text = t1 ? `${t1} / ${t2}` : t2
    }
  }
  return [...passthrough, ...pairBest.values()]
}

/** 架构图：贝塞尔曲线 + 边框锚点 + 平行线/标签错开 */
function routeArchLines(lines, nodes) {
  const byId = new Map(nodes.map((n) => [String(n.id || ''), n]))
  const laneByFrom = new Map()
  return lines.map((line) => {
    const out = {
      ...line,
      lineShape: RG_LINE_SHAPE_CURVE,
      polyLineStartDistance: 36,
      polyLineEndDistance: 36,
      force_elastic: 28,
    }
    const fromSid = lineFromStateId(line)
    const fromN = byId.get(fromSid)
    const toN = byId.get(String(line.to || ''))
    if (!fromN || !toN || !Number.isFinite(Number(fromN.x)) || !Number.isFinite(Number(toN.x))) {
      return out
    }
    const fx = Number(fromN.x)
    const fy = Number(fromN.y)
    const fw = Number(fromN.width || 260)
    const fh = Number(fromN.height || 480)
    const tx = Number(toN.x)
    const ty = Number(toN.y)
    const tw = Number(toN.width || 260)
    const th = Number(toN.height || 480)
    const dx = tx + tw / 2 - (fx + fw / 2)
    const dy = ty + th / 2 - (fy + fh / 2)
    if (Math.abs(dx) >= Math.abs(dy)) {
      out.fromJunctionPoint = dx >= 0 ? 'right' : 'left'
      out.toJunctionPoint = dx >= 0 ? 'left' : 'right'
    } else {
      out.fromJunctionPoint = dy >= 0 ? 'bottom' : 'top'
      out.toJunctionPoint = dy >= 0 ? 'top' : 'bottom'
    }
    const laneKey = `${fromSid}:${out.fromJunctionPoint}:${line.to}`
    const lane = laneByFrom.get(laneKey) || 0
    laneByFrom.set(laneKey, lane + 1)
    const spread = lane * 18
    out.junctionOffset = spread
    out.textOffset_y = -10 - spread
    out.textOffset_x = spread % 2 === 0 ? 0 : 6
    return out
  })
}

export function docToRelationGraph(doc, options = {}) {
  const states = Array.isArray(doc?.states) ? doc.states : []
  const entries = tabBarEntries(doc)
  const overlay = options.intelOverlay || {}
  const showWireframe = Boolean(options.showWireframe ?? true)
  const appTitle = String(options.appName || options.appDisplayName || '').trim()
  const isAtlas = Boolean(doc?.meta?.screen_atlas)
  const hideRoot = Boolean(options.hideAppRoot ?? isAtlas)
  const editableHotspots = Boolean(options.editableHotspots)
  const variant = String(options.variant || 'config')
  const allEdges = doc?.edges || []

  const nodes = []
  const lines = []
  const lineKeys = new Set()

  let lineSeq = 0
  const pushLine = (line) => {
    const f = String(line.from || '').trim()
    const t = String(line.to || '').trim()
    if (!f || !t || f === t) return
    const key = `${f}→${t}→${line.text || ''}→${line.fromType || ''}`
    if (lineKeys.has(key)) return
    lineKeys.add(key)
    lineSeq += 1
    lines.push({
      id: line.id || `nav-line-${lineSeq}`,
      showEndArrow: true,
      showStartArrow: false,
      ...line,
    })
  }

  const WF_W = 260
  const WF_HEAD = 40
  const WF_CANVAS_H = Math.round(WF_W * (16 / 9))
  const archMode = String(options.variant || '') === 'arch'
  const WF_META_EXTRA = archMode ? 44 : 0
  const WF_H = WF_HEAD + WF_META_EXTRA + WF_CANVAS_H + 12
  const archView = String(options.archView || 'structure')
  let rootId = ''

  if (entries.length >= 1 && !hideRoot) {
    nodes.push({
      id: NAV_ROOT_ID,
      text: appTitle || '应用架构',
      width: 128,
      height: 52,
      data: { kind: 'root', showWireframe: false },
    })
    rootId = NAV_ROOT_ID
    for (const eid of entries) {
      pushLine({
        from: NAV_ROOT_ID,
        to: eid,
        toType: RG_TARGET_NODE,
        text: 'Tab',
        color: '#94a3b8',
        lineWidth: 1,
      })
    }
  }

  const launchId = String(doc?.meta?.tab_bar?.launch_state_id || '').trim()
  const homeStateId = String(doc?.meta?.tab_bar?.home_state_id || '').trim()

  for (const st of states) {
    const sid = stateId(st)
    if (!sid) continue
    const intel = overlay[sid] || {}
    const isEntry = Boolean(st.entry) || entries.includes(sid)
    const labelsMap = doc?.meta?.tab_bar?.labels || {}
    const tabLabel = String(labelsMap[sid] || st?.meta?.tab || '').trim()
    const tabSlot = isEntry ? tabSlotForLabel(doc, tabLabel) : null
    const wf = applyNavHintsToWireframe(wireframeForState(doc, sid), sid, allEdges)
    const meta = st?.meta || {}
    const layoutClass = String(meta.layout_class || '').trim()
    const layoutExtent = meta.layout_extent && typeof meta.layout_extent === 'object' ? meta.layout_extent : {}
    const morphCount = Number(meta.morph_count || 0)
    const evidenceTier = String(meta.evidence_tier || '').trim()
    const hasWf = showWireframe && (wf.regions?.length > 0)
    if (!rootId && (sid === launchId || sid === homeStateId || isEntry)) rootId = sid
    nodes.push({
      id: sid,
      text: stateDisplayLabel(st),
      width: hasWf ? WF_W : isEntry ? 148 : 168,
      height: hasWf ? WF_H : isEntry ? 76 : 80,
      data: {
        stateId: sid,
        kind: st.kind || 'page',
        entry: isEntry,
        showWireframe: hasWf,
        wireframe: wf,
        connectHotspots: false,
        editableHotspots: false,
        appId: String(doc?.app_id || options.appId || ''),
        intelWikiCount: intel.wikiCount || 0,
        intelDocCount: intel.docCount || 0,
        intelMissingWiki: intel.missingWiki,
        tabSlotKind: tabSlot?.kind || '',
        tabSlotParts: Array.isArray(tabSlot?.parts) ? tabSlot.parts : [],
        state: st,
        subhead: archMode ? archNodeSubhead(st, intel) : '',
        layoutClass,
        layoutExtent,
        morphCount,
        evidenceTier,
      },
    })
  }

  if (!rootId && nodes.length) {
    rootId = nodes[0].id
  }

  const tabEntrySet = new Set(entries)
  const showNav = archMode ? archView === 'nav' : (archView === 'nav' || archView === 'structure')
  const showHierarchy = archView === 'structure'
  for (const ed of allEdges) {
    const from = edgeFrom(ed)
    const to = edgeTo(ed)
    if (!from || !to) continue
    const kind = edgeKind(ed)
    const meta = ed.meta || {}
    if (kind === 'hierarchy') {
      if (!showHierarchy) continue
      if (tabEntrySet.has(from)) continue
      pushLine({
        from,
        to,
        fromType: RG_TARGET_NODE,
        toType: RG_TARGET_NODE,
        text: String(meta.note || '内页层级'),
        color: '#94a3b8',
        lineWidth: 1,
        dashType: 2,
      })
      continue
    }
    if (kind === 'tab_scope') {
      if (!showHierarchy) continue
      const hasNav = allEdges.some(
        (e) => edgeKind(e) === 'nav' && edgeFrom(e) === from && edgeTo(e) === to,
      )
      if (hasNav && showNav) continue
      pushLine({
        from,
        to,
        fromType: RG_TARGET_NODE,
        toType: RG_TARGET_NODE,
        text: String(meta.action_label || '同级页面'),
        color: '#cbd5e1',
        lineWidth: 1.5,
        dashType: 3,
      })
      continue
    }
    if (kind !== 'nav' || !showNav) continue
    const eid = String(ed.id || '')
    if (eid.startsWith('edge.tab.')) continue
    const label = String(meta.action_label || meta.note || '进入').replace(/observed×\d+/, '进入')
    const isRev = Boolean(meta.reverse)
    const lineFrom = from
    const fromType = RG_TARGET_NODE
    const navColor = archMode ? (isRev ? '#c2410c' : '#1d4ed8') : isRev ? '#ea580c' : '#475569'
    const navWidth = archMode ? (isRev ? 2.5 : 3) : isRev ? 1.5 : 2
    pushLine({
      from: lineFrom,
      to,
      fromType,
      toType: RG_TARGET_NODE,
      text: label,
      color: navColor,
      lineWidth: navWidth,
      dashType: isRev ? 4 : undefined,
      data: { edgeId: ed.id, manual: Boolean(meta.manual) },
    })
  }

  for (const st of states) {
    const sid = stateId(st)
    const parent = String(st?.meta?.parent_state_id || '').trim()
    if (!parent || parent === sid || tabEntrySet.has(parent)) continue
    if (!showHierarchy) continue
    if (allEdges.some((e) => edgeKind(e) === 'hierarchy' && edgeFrom(e) === parent && edgeTo(e) === sid)) {
      continue
    }
    pushLine({
      from: parent,
      to: sid,
      fromType: RG_TARGET_NODE,
      toType: RG_TARGET_NODE,
      text: '内页层级',
      color: '#94a3b8',
      lineWidth: 1,
      dashType: 2,
    })
  }

  const layoutPos = doc?.meta?.studio_layout?.states || {}
  const nodeIdList = nodes.map((n) => String(n.id || ''))
  const layoutKeys = Object.keys(layoutPos || {})
  const layoutMatchesGraph =
    layoutKeys.length > 0 &&
    layoutKeys.length === nodeIdList.length &&
    nodeIdList.every((id) => layoutPos[id] && Number.isFinite(Number(layoutPos[id].x)))
  // Atlas 架构图不用旧「配置图」拖出来的 studio_layout，避免卡片挤成一排、连线被挡
  let useFixed = layoutMatchesGraph && !(archMode && isAtlas)
  let laidOutNodes = nodes.map((n) => {
    const pos = layoutPos[n.id]
    if (!useFixed || !pos || !Number.isFinite(Number(pos.x)) || !Number.isFinite(Number(pos.y))) {
      return n
    }
    return {
      ...n,
      x: Number(pos.x),
      y: Number(pos.y),
      fixed: true,
    }
  })

  if (archMode && isAtlas && !useFixed) {
    useFixed = true
    laidOutNodes = layoutAtlasArchGrid(laidOutNodes, { wfW: WF_W, wfH: WF_H })
  }

  let graphRootId = rootId
  if (hideRoot) {
    graphRootId = launchId || homeStateId || (entries.length ? entries[0] : graphRootId)
  }

  const nodeIds = new Set(laidOutNodes.map((n) => String(n.id || '')))
  const visibleLines = lines.filter((line) => {
    const to = String(line.to || '').trim()
    if (!to || !nodeIds.has(to)) return false
    let fromNode = String(line.from || '').trim()
    if (line.fromType === RG_TARGET_HTML) {
      fromNode = parseHotspotTargetId(fromNode).stateId || fromNode
    }
    return fromNode && nodeIds.has(fromNode)
  })

  let routedLines = visibleLines
  if (archMode) {
    routedLines = dedupeArchNavLines(visibleLines)
    routedLines = routeArchLines(routedLines, laidOutNodes)
  }

  return {
    rootId: graphRootId,
    nodes: laidOutNodes,
    lines: routedLines,
    layoutName: useFixed ? 'fixed' : 'center',
    layoutFrom: 'left',
    layoutConfig: useFixed
      ? { layoutName: 'fixed' }
      : {
          layoutName: 'center',
          from: 'left',
          min_per_width: archMode ? WF_W + 48 : 280,
          min_per_height: archMode ? WF_H + 48 : 220,
        },
  }
}

export function relationGraphOptions(editable = false, { curved = false } = {}) {
  return {
    definitelyNoDataProviderNeeded: true,
    debug: false,
    showToolBar: true,
    allowShowMiniToolBar: true,
    allowShowMiniView: true,
    allowSwitchLineShape: false,
    allowSwitchJunctionPoint: false,
    defaultJunctionPoint: 'border',
    defaultLineShape: curved ? RG_LINE_SHAPE_CURVE : 1,
    defaultNodeShape: 1,
    defaultNodeBorderWidth: 2,
    defaultNodeBorderColor: '#93c5fd',
    defaultLineColor: '#475569',
    defaultShowLineLabel: true,
    showEasyView: false,
    defaultLineTextOffset_y: -2,
    layout: {
      layoutName: 'center',
      from: 'left',
      min_per_width: 280,
      min_per_height: 220,
      max_per_width: 320,
      max_per_height: 480,
    },
    disableDragNode: true,
    disableZoom: false,
    allowShowDownloadButton: false,
    allowShowRefreshButton: false,
    useAnimationWhenExpanded: false,
    ...(editable ? { allowShowMiniNameFilter: false } : {}),
  }
}

/** 从 relation-graph 连线事件生成 NavFSM 边（含控件锚点）。 */
export function navEdgeFromLineJson(lineJson, baseDoc) {
  const rawFrom = String(lineJson?.from || '').trim()
  const to = String(lineJson?.to || '').trim()
  const parsed = parseHotspotTargetId(rawFrom)
  const fromState = parsed.stateId || rawFrom
  const short = (s) => s.split('.').pop() || s
  const id = `edge.manual.${short(fromState)}_to_${short(to)}`
  const label = String(lineJson?.text || '').trim() || '点击'
  const meta = {
    manual: true,
    source: 'studio',
    action_label: label,
  }
  if (parsed.regionKey) {
    meta.from_hotspot_id = hotspotTargetId(fromState, parsed.regionKey)
  }
  return {
    id,
    kind: 'nav',
    from: fromState,
    to,
    guard: {},
    execute: { steps: ['tap_element'], target_label: label },
    effect_assert: { within_ms: 8000, require_any: [], require_none: [] },
    on_fail: {},
    meta,
  }
}
