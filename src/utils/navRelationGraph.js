/** NavFSM doc → relation-graph JSON（控件锚点连线 + 双向跳转）。 */

const NAV_ROOT_ID = '__nav_app_root__'
const HS_SEP = '::'
/** @deprecated RG 3.x 请用 RG_TARGET_CONNECT */
export const RG_TARGET_HTML = 'HTMLElementId'
/** RGConnectTarget + fakeLines 锚点类型（relation-graph ≥3.1） */
export const RG_TARGET_CONNECT = 'NodePoint'
export const RG_TARGET_NODE = 'node'
/** relation-graph RGLineShape.StandardCurve */
export const RG_LINE_SHAPE_CURVE = 6
/** 正交折线：拐点在卡片外侧走线 */
export const RG_LINE_SHAPE_ORTH = 44

/** relation-graph 内置默认箭头（勿把 defaultLineMarker 设成字符串 'arrow'，会弄坏 SVG marker） */
export const RG_DEFAULT_LINE_MARKER = {
  viewBox: '0 0 12 12',
  markerWidth: 20,
  markerHeight: 20,
  refX: 3,
  refY: 3,
  data: 'M 0 0, V 6, L 4 3, Z',
}

/** 为 RG 线补全终点箭头 marker（fakeLine / 虚线需显式 endMarkerId）。 */
export function enrichArchLineArrows(lines, instanceId) {
  const iid = String(instanceId || '').trim()
  const endMarkerId = iid ? `${iid}-arrow-default` : ''
  return (lines || []).map((line) => ({
    ...line,
    showEndArrow: line.showEndArrow !== false,
    showStartArrow: false,
    ...(endMarkerId ? { endMarkerId } : {}),
  }))
}

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
  const fb = String(intel.flowBlockName || meta.flow_block_name || '').trim()
  if (fb) bits.push(`业务流 · ${fb}`)
  const lc = String(meta.layout_class || '').trim()
  const vMorph = Number(meta.region_morph_vertical || 0)
  const hMorph = Number(meta.region_morph_horizontal || 0)
  if (vMorph > 0) bits.push(`竖滑区 ×${vMorph}`)
  if (hMorph > 0) bits.push(`横滑区 ×${hMorph}`)
  if (!vMorph && !hMorph && LAYOUT_CLASS_LABELS[lc]) bits.push(LAYOUT_CLASS_LABELS[lc])
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
  const sid = stateId(st)
  let title = String(meta.display_name || meta.page_title || '').trim()
  const looksLikeId = (t) => !t || t === sid || /^page\.sk/i.test(t)
  if (looksLikeId(title)) {
    const samples = Array.isArray(meta.name_samples) ? meta.name_samples : []
    const aliases = Array.isArray(meta.aliases) ? meta.aliases : []
    const pick =
      samples.find((a) => a && !looksLikeId(String(a).trim())) ||
      aliases.find((a) => a && !looksLikeId(String(a).trim()))
    if (pick) title = String(pick).trim()
    else if (meta.header_title && !looksLikeId(String(meta.header_title).trim())) {
      title = String(meta.header_title).trim()
    }
  }
  if (title && !looksLikeId(title)) return compactPageTitle(title)
  const tab = String(meta.tab || '').trim()
  const role = String(meta.page_role || '').trim()
  if (tab && role) return `${tab} · ${role.replace(/_/g, ' ')}`
  if (tab) return tab
  if (st?.entry) {
    const blocks = Array.isArray(st?.identify?.required) ? st.identify.required : []
    const tabSel = String(blocks.find((b) => b?.signal === 'tab_bar')?.match?.selected || '').trim()
    if (tabSel) return `入口 · ${tabSel}`
  }
  return sid
}

function wireframeForState(doc, sid) {
  const wf = doc?.meta?.state_wireframes || {}
  return wf[sid] || { regions: [], chrome: {}, screen: { w: 1080, h: 1920 }, source: 'empty' }
}

function regionArea(region) {
  const rect = region?.rect || {}
  return Number(rect.w || 0) * Number(rect.h || 0)
}

/** 整屏 content 块不适合做连线锚点（线会看起来从页面中心出）。 */
function regionEligibleForNavAnchor(r) {
  const rect = r?.rect || {}
  const w = Number(rect.w || 0)
  const h = Number(rect.h || 0)
  if (w * h > 0.22) return false
  if (w > 0.88 && h > 0.35) return false
  if (h > 0.55 && w > 0.45) return false
  return true
}

function sanitizeWireframeNavRegions(wf) {
  const regions = (wf?.regions || []).map((r) => {
    const copy = { ...r }
    if (copy.nav_to && !regionEligibleForNavAnchor(copy)) {
      delete copy.nav_to
      if (!copy.clickable) copy.clickable = false
    }
    return copy
  })
  return { ...wf, regions }
}

function pruneWireframeNavTo(wf, stateSid, edges) {
  const outgoing = new Set(
    (edges || [])
      .filter((e) => edgeKind(e) === 'nav' && edgeFrom(e) === stateSid)
      .map((e) => edgeTo(e))
      .filter(Boolean),
  )
  const regions = (wf?.regions || []).map((r) => {
    const copy = { ...r }
    const dst = String(copy.nav_to || '')
    if (dst && !outgoing.has(dst)) {
      delete copy.nav_to
      if (String(copy.source || '') !== 'nav_hint') {
        copy.clickable = Boolean(copy.clickable && false)
      }
    }
    return copy
  })
  return { ...wf, regions }
}

function wireframeForStatePrepared(doc, sid, allEdges) {
  const raw = wireframeForState(doc, sid)
  const hinted = applyNavHintsToWireframe(sanitizeWireframeNavRegions(raw), sid, allEdges)
  return pruneWireframeNavTo(hinted, sid, allEdges)
}

function regionBottomScore(region) {
  const rect = region?.rect || {}
  const y = Number(rect.y || 0)
  const h = Number(rect.h || 0)
  return y + h
}

function applyNavHintsToWireframe(wf, stateSid, edges) {
  const out = { ...wf, regions: (wf.regions || []).map((r) => ({ ...r })) }
  const outgoing = (edges || []).filter(
    (ed) => edgeKind(ed) === 'nav' && edgeFrom(ed) === stateSid,
  )
  const usedKeys = new Set()
  for (const ed of outgoing) {
    const meta = ed.meta || {}
    const hs = String(meta.from_hotspot_id || '')
    const dst = edgeTo(ed)
    if (!dst) continue
    let regionKey = ''
    if (hs.includes(HS_SEP)) {
      regionKey = hs.split(HS_SEP).slice(1).join(HS_SEP)
    }
    let matched = false
    if (regionKey) {
      for (const r of out.regions) {
        const rk = regionHotspotKey(r)
        if (rk !== regionKey) continue
        r.nav_to = dst
        r.clickable = true
        r.nav_label = String(meta.action_label || r.nav_label || r.label || '进入')
        usedKeys.add(rk)
        matched = true
        break
      }
    }
    if (matched) continue
    const pool = out.regions
      .filter((r) => {
        const rk = regionHotspotKey(r)
        if (!rk || usedKeys.has(rk)) return false
        if (r.nav_to && r.nav_to !== dst) return false
        if (!regionEligibleForNavAnchor(r)) return false
        return r.clickable || regionBottomScore(r) >= 0.62
      })
      .sort((a, b) => regionBottomScore(b) - regionBottomScore(a))
    const pick = pool[0]
    if (pick) {
      const rk = regionHotspotKey(pick)
      pick.nav_to = dst
      pick.clickable = true
      pick.nav_label = String(meta.action_label || pick.nav_label || pick.label || '进入')
      if (rk) usedKeys.add(rk)
      continue
    }
    const synId = `to-${String(dst).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-24)}`
    const row = usedKeys.size
    out.regions.push({
      source: 'nav_hint',
      id: synId,
      label: String(meta.action_label || '进入'),
      clickable: true,
      nav_to: dst,
      nav_label: String(meta.action_label || '进入'),
      rect: {
        x: 0.1 + (row % 3) * 0.04,
        y: Math.min(0.82, 0.68 + row * 0.06),
        w: 0.8,
        h: 0.065,
      },
    })
    usedKeys.add(`nav_hint-${synId}`)
  }
  return out
}

function buildFlowBlockShellNodes(doc, layoutPos, wfW, wfH, { enabled = true } = {}) {
  if (!enabled) return []
  const stateIds = new Set(
    (Array.isArray(doc?.states) ? doc.states : []).map((s) => stateId(s)).filter(Boolean),
  )
  const blocks = Array.isArray(doc?.meta?.flow_blocks) ? doc.meta.flow_blocks : []
  const nameById = new Map(
    blocks.map((b) => [String(b?.flow_block_id || '').trim(), String(b?.display_name || '').trim()]),
  )
  const byBlock = new Map()
  for (const [sid, pos] of Object.entries(layoutPos || {})) {
    const bid = String(pos?.flow_block_id || '').trim()
    if (!bid || !Number.isFinite(Number(pos?.x)) || !Number.isFinite(Number(pos?.y))) continue
    if (!byBlock.has(bid)) byBlock.set(bid, [])
    byBlock.get(bid).push({ sid, x: Number(pos.x), y: Number(pos.y) })
  }
  const shells = []
  for (const [bid, members] of byBlock.entries()) {
    if (members.length < 2) continue
    if (!members.every((m) => stateIds.has(m.sid))) continue
    const spanX = Math.max(...members.map((m) => m.x)) - Math.min(...members.map((m) => m.x))
    if (spanX > wfW * 4) continue
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const m of members) {
      minX = Math.min(minX, m.x)
      minY = Math.min(minY, m.y)
      maxX = Math.max(maxX, m.x + wfW)
      maxY = Math.max(maxY, m.y + wfH)
    }
    shells.push({
      id: `__block__${bid}`,
      text: nameById.get(bid) || bid,
      width: Math.max(180, maxX - minX + 40),
      height: Math.max(80, maxY - minY + 52),
      x: minX - 20,
      y: minY - 44,
      fixed: true,
      data: {
        kind: 'flow_block_shell',
        showWireframe: false,
        blockShell: true,
        flowBlockId: bid,
      },
    })
  }
  return shells
}

function isConnectFromType(fromType) {
  const t = String(fromType || '')
  return t === RG_TARGET_CONNECT || t === RG_TARGET_HTML
}

function resolveNavLineFrom(stateSid, toState, wf, meta) {
  const hs = String(meta.from_hotspot_id || '').trim()
  if (hs.includes(HS_SEP)) {
    return { from: hs, fromType: RG_TARGET_CONNECT }
  }
  for (const r of wf?.regions || []) {
    if (String(r.nav_to || '') !== toState) continue
    const rk = regionHotspotKey(r)
    if (!rk) continue
    return { from: hotspotTargetId(stateSid, rk), fromType: RG_TARGET_CONNECT }
  }
  return { from: stateSid, fromType: RG_TARGET_NODE }
}

/** 架构图 nav：禁止降级为节点边框，必要时补合成锚区。 */
function ensureArchNavLineFrom(stateSid, toState, wf, meta) {
  let working = wf
  let lineFrom = resolveNavLineFrom(stateSid, toState, working, meta)
  if (isConnectFromType(lineFrom.fromType)) {
    return { lineFrom, wireframe: working }
  }
  working = applyNavHintsToWireframe(working, stateSid, [
    { kind: 'nav', from: stateSid, to: toState, meta: meta || {} },
  ])
  lineFrom = resolveNavLineFrom(stateSid, toState, working, meta)
  if (isConnectFromType(lineFrom.fromType)) {
    return { lineFrom, wireframe: working }
  }
  const synId = `to-${String(toState).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-24)}`
  const regions = [...(working.regions || [])]
  if (!regions.some((r) => String(r.nav_to || '') === toState && regionEligibleForNavAnchor(r))) {
    regions.push({
      source: 'nav_hint',
      id: synId,
      label: String(meta?.action_label || '进入'),
      clickable: true,
      nav_to: toState,
      nav_label: String(meta?.action_label || '进入'),
      rect: { x: 0.12, y: 0.74, w: 0.76, h: 0.065 },
    })
  }
  working = { ...working, regions }
  lineFrom = resolveNavLineFrom(stateSid, toState, working, meta)
  return { lineFrom, wireframe: working }
}

/** 与 Nexus `infer_transition_driver` 对齐（边 meta 缺 transition 时的回落）。 */
export function inferNavDriver(meta = {}) {
  const tr = meta.transition
  if (tr && tr.driver) return String(tr.driver).trim().toLowerCase()
  if (meta.reverse) return 'system'
  const at = String(meta.action_type || '').trim().toLowerCase()
  if (at === 'back') return 'system'
  if (at === 'tap' || at === 'tab' || at === 'swipe' || at === 'input') return 'manual'
  const label = String(meta.action_label || '')
  const low = label.toLowerCase()
  if (label.includes('完成') || label.includes('自动') || label.includes('下载完成') || low.includes('auto')) {
    return 'auto'
  }
  if (at === 'wait' || at === 'scroll' || at === 'launch') return 'auto'
  if (String(meta.source || '') === 'screen_atlas' || Number(meta.count || 0) > 0) return 'manual'
  return 'unknown'
}

/** auto / system：无同 turn 显式点击语义，锚点从页级底边出，不绑具体组件。 */
export function isPassiveNavDriver(driver) {
  const d = String(driver || '').trim().toLowerCase()
  return d === 'auto' || d === 'system'
}

export function formatArchNavLineText(rawLabel, driver, { jumpOnly = false } = {}) {
  let label = String(rawLabel || '进入')
    .replace(/observed×\d+/gi, '进入')
    .replace(/\s*·\s*system\s*$/i, '')
    .replace(/\s*system\s*$/i, '')
    .trim()
  if (!label) label = '进入'
  const d = String(driver || '').trim().toLowerCase()
  if (jumpOnly && d && d !== 'unknown') return `${label} · ${d}`
  if (d === 'auto') return `${label} · auto`
  return label
}

function driverDashType(driver) {
  const d = String(driver || '').trim().toLowerCase()
  if (d === 'auto' || d === 'system') return 4
  if (d === 'unknown') return 3
  return undefined
}

/** 架构图连线筛选（左侧面板开关，默认全开）。 */
export const DEFAULT_ARCH_LINE_FILTERS = {
  blueSolid: true,
  blueDash: true,
  orangeSolid: true,
  orangeDash: true,
  back: true,
  forward: true,
}

export function archNavLineFilterTags({ isRev, dashType, color, kind = 'nav' }) {
  if (kind !== 'nav') return null
  const dashed = dashType != null && Number(dashType) > 0
  if (isRev) {
    return { style: dashed ? 'orangeDash' : 'orangeSolid', direction: 'back' }
  }
  return { style: dashed ? 'blueDash' : 'blueSolid', direction: 'forward' }
}

export function archLineHiddenByFilters(line, filters = DEFAULT_ARCH_LINE_FILTERS) {
  const tags = line?.data?.archFilter
  if (!tags) return false
  if (tags.direction === 'forward' && filters.forward === false) return true
  if (tags.direction === 'back' && filters.back === false) return true
  const styleMap = {
    blueSolid: 'blueSolid',
    blueDash: 'blueDash',
    orangeSolid: 'orangeSolid',
    orangeDash: 'orangeDash',
  }
  const key = styleMap[tags.style]
  if (key && filters[key] === false) return true
  return false
}

export function loadArchLineFilters(storageKey = 'mino.archLineFilters') {
  try {
    const raw = sessionStorage.getItem(storageKey)
    if (!raw) return { ...DEFAULT_ARCH_LINE_FILTERS }
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_ARCH_LINE_FILTERS, ...parsed }
  } catch {
    return { ...DEFAULT_ARCH_LINE_FILTERS }
  }
}

export function saveArchLineFilters(filters, storageKey = 'mino.archLineFilters') {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(filters))
  } catch {
    /* ignore quota */
  }
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

function flowBlockMap(doc) {
  const blocks = doc?.meta?.flow_blocks
  if (!Array.isArray(blocks)) return new Map()
  const m = new Map()
  for (const b of blocks) {
    const bid = String(b?.flow_block_id || '').trim()
    if (!bid) continue
    const name = String(b?.display_name || bid).trim()
    for (const sid of b?.state_ids || []) {
      const id = String(sid || '').trim()
      if (id) m.set(id, { flow_block_id: bid, display_name: name })
    }
  }
  return m
}

function lineFromStateId(line) {
  let fromSid = String(line.from || '')
  if (isConnectFromType(line.fromType)) {
    fromSid = parseHotspotTargetId(fromSid).stateId || fromSid
  }
  return fromSid
}

/** 同对节点多条跳转合并为一条（标签拼接），减少叠线 */
function dedupeArchNavLines(lines) {
  const pairBest = new Map()
  const passthrough = []
  for (const line of lines) {
    if (line.dashType && !isConnectFromType(line.fromType)) {
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
    if (
      isConnectFromType(line.fromType) &&
      !isConnectFromType(prev.fromType)
    ) {
      const t1 = String(line.text || '')
      const t2 = String(prev.text || '')
      pairBest.set(key, {
        ...prev,
        ...line,
        text: t1 && t2 && !t1.includes(t2) ? `${t1} / ${t2}` : t1 || t2,
      })
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

function splitConnectFakeLines(routedLines) {
  const lines = []
  const fakeLines = []
  for (const line of routedLines) {
    if (isConnectFromType(line.fromType)) {
      fakeLines.push({
        ...line,
        isFakeLine: true,
        fromType: RG_TARGET_CONNECT,
        toType: line.toType || RG_TARGET_NODE,
        showEndArrow: line.showEndArrow !== false,
        showStartArrow: false,
      })
    } else {
      lines.push({
        ...line,
        showEndArrow: line.showEndArrow !== false,
        showStartArrow: false,
      })
    }
  }
  return { lines, fakeLines }
}

/** 架构图：贝塞尔曲线 + 边框锚点 + 平行线/标签错开 */
function routeArchLines(lines, nodes, { orth = false } = {}) {
  const byId = new Map(nodes.map((n) => [String(n.id || ''), n]))
  const laneByFrom = new Map()
  return lines.map((line) => {
    const out = {
      ...line,
      lineShape: line.lineShape ?? (orth ? RG_LINE_SHAPE_ORTH : RG_LINE_SHAPE_CURVE),
      polyLineStartDistance: isConnectFromType(line.fromType) ? 8 : 36,
      polyLineEndDistance: 36,
      force_elastic: line.force_elastic ?? 28,
      showEndArrow: line.showEndArrow !== false,
      showStartArrow: false,
    }
    const fromSid = lineFromStateId(line)
    if (line.data?.passiveAnchor || (line.fromType === RG_TARGET_NODE && line.fromJunctionPoint === 'bottom')) {
      out.fromJunctionPoint = 'bottom'
      out.toJunctionPoint = 'top'
      out.lineShape = RG_LINE_SHAPE_CURVE
      out.polyLineStartDistance = 24
      out.polyLineEndDistance = 48
      out.force_elastic = line.force_elastic ?? 32
      return out
    }
    if (isConnectFromType(line.fromType)) {
      out.lineShape = RG_LINE_SHAPE_CURVE
      out.polyLineStartDistance = 4
      out.polyLineEndDistance = 48
      out.force_elastic = line.force_elastic ?? 40
      out.toJunctionPoint = 'top'
      out.toType = RG_TARGET_NODE
      return out
    }
    {
      const fromN = byId.get(fromSid)
      const toN = byId.get(String(line.to || ''))
      if (fromN && toN && Number.isFinite(Number(fromN.x)) && Number.isFinite(Number(toN.x))) {
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
      }
    }
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
  const archEdgeKeys = new Set()
  const pushLine = (line) => {
    const f = String(line.from || '').trim()
    const t = String(line.to || '').trim()
    if (!f || !t || f === t) return
    if (archMode && isAtlas) {
      const pairKey = `${f}→${t}`
      if (archEdgeKeys.has(pairKey)) return
      archEdgeKeys.add(pairKey)
    }
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
  const layoutPos = doc?.meta?.studio_layout?.states || {}
  const flowBlockByState = flowBlockMap(doc)
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
  const studioLayoutMode = String(doc?.meta?.studio_layout?.layout_mode || '')
  const useFlowHotspots = archMode && isAtlas

  const wfByState = new Map()
  for (const st of states) {
    const sid = stateId(st)
    if (!sid) continue
    wfByState.set(sid, wireframeForStatePrepared(doc, sid, allEdges))
  }

  for (const st of states) {
    const sid = stateId(st)
    if (!sid) continue
    const fb = flowBlockByState.get(sid) || null
    const slot = layoutPos[sid] || null
    const layoutBlockId = String(slot?.flow_block_id || '').trim()
    const intel = {
      ...(overlay[sid] || {}),
      flowBlockName: layoutBlockId ? fb?.display_name || '' : '',
    }
    const isEntry = Boolean(st.entry) || entries.includes(sid)
    const labelsMap = doc?.meta?.tab_bar?.labels || {}
    const tabLabel = String(labelsMap[sid] || st?.meta?.tab || '').trim()
    const tabSlot = isEntry ? tabSlotForLabel(doc, tabLabel) : null
    const wf = wfByState.get(sid) || applyNavHintsToWireframe(wireframeForState(doc, sid), sid, allEdges)
    const meta = st?.meta || {}
    const outgoingNav = allEdges.filter(
      (e) => edgeKind(e) === 'nav' && edgeFrom(e) === sid,
    )
    const navOutgoing = outgoingNav.map((e) => edgeTo(e)).filter(Boolean)
    const hasHotspotEdge = (wf.regions || []).some(
      (r) => Boolean(r.nav_to) && navOutgoing.includes(String(r.nav_to)),
    )
    const layoutClass = String(meta.layout_class || '').trim()
    const layoutExtent = meta.layout_extent && typeof meta.layout_extent === 'object' ? meta.layout_extent : {}
    const morphCount = Number(meta.morph_count || 0)
    const evidenceTier = String(meta.evidence_tier || '').trim()
    const hasWf =
      showWireframe &&
      ((wf.regions?.length > 0) || (useFlowHotspots && outgoingNav.length > 0))
    if (hasWf && !(wf.regions?.length > 0) && outgoingNav.length > 0) {
      wf.regions = [
        ...(wf.regions || []),
        {
          source: 'nav_hint',
          id: 'nav-anchor-placeholder',
          label: '进入',
          clickable: true,
          nav_to: edgeTo(outgoingNav[0]),
          rect: { x: 0.14, y: 0.72, w: 0.72, h: 0.08 },
        },
      ]
      wfByState.set(sid, wf)
    }
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
        connectHotspots: useFlowHotspots && hasWf && navOutgoing.length > 0,
        editableHotspots: editableHotspots && useFlowHotspots && navOutgoing.length > 0,
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
        flowBlockId: layoutBlockId,
        flowBlockName: layoutBlockId ? fb?.display_name || '' : '',
        navOutgoing,
      },
    })
  }

  if (!rootId && nodes.length) {
    rootId = nodes[0].id
  }

  const tabEntrySet = new Set(entries)
  const archUnified = archMode && isAtlas
  const showNav = archUnified ? true : archView === 'nav' || archView === 'structure'
  const showHierarchy = archUnified ? false : archView === 'structure'
  const showAuxEdges = !archUnified && showHierarchy
  const jumpOnly = false
  for (const ed of allEdges) {
    const from = edgeFrom(ed)
    const to = edgeTo(ed)
    if (!from || !to) continue
    const kind = edgeKind(ed)
    const meta = ed.meta || {}
    if (kind === 'hierarchy') {
      if (!showAuxEdges) continue
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
      if (!showAuxEdges) continue
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
    if (jumpOnly) {
      const rel = String(meta.transition?.relation || '')
      if (rel === 'intra') continue
    }
    if (archMode && isAtlas && Boolean(meta.reverse) && !meta.observed_back) {
      continue
    }
    const eid = String(ed.id || '')
    if (eid.startsWith('edge.tab.')) continue
    const label = String(meta.action_label || meta.note || '进入').replace(/observed×\d+/, '进入')
    const driver = inferNavDriver(meta)
    const lineText = formatArchNavLineText(label, driver, { jumpOnly })
    const isRev = Boolean(meta.reverse)
    const passiveAnchor = archMode && isAtlas && isPassiveNavDriver(driver)
    const wf = wfByState.get(from) || applyNavHintsToWireframe(wireframeForState(doc, from), from, allEdges)
    let lineFrom
    if (archMode && isAtlas) {
      if (passiveAnchor) {
        lineFrom = { from, fromType: RG_TARGET_NODE, fromJunctionPoint: 'bottom' }
      } else {
        const ensured = ensureArchNavLineFrom(from, to, wf, meta)
        lineFrom = ensured.lineFrom
        wfByState.set(from, ensured.wireframe)
      }
    } else {
      lineFrom = resolveNavLineFrom(from, to, wf, meta)
    }
    const navColor = archMode ? (isRev ? '#c2410c' : '#1d4ed8') : isRev ? '#ea580c' : '#475569'
    const navWidth = archMode ? (isRev ? 2.5 : 3) : isRev ? 1.5 : 2
    const dash = driverDashType(driver)
    const resolvedDash = isRev && !dash ? 4 : dash
    pushLine({
      from: lineFrom.from,
      to,
      fromType: lineFrom.fromType,
      toType: RG_TARGET_NODE,
      fromJunctionPoint: lineFrom.fromJunctionPoint,
      text: lineText,
      color: navColor,
      lineWidth: navWidth,
      dashType: resolvedDash,
      lineShape: archMode ? RG_LINE_SHAPE_CURVE : undefined,
      force_elastic: archMode ? 32 : undefined,
      data: {
        edgeId: ed.id,
        manual: Boolean(meta.manual),
        driver,
        passiveAnchor,
        archFilter: archMode && isAtlas
          ? archNavLineFilterTags({ isRev, dashType: resolvedDash, color: navColor, kind: 'nav' })
          : null,
      },
    })
  }

  for (const st of states) {
    const sid = stateId(st)
    const parent = String(st?.meta?.parent_state_id || '').trim()
    if (!parent || parent === sid || tabEntrySet.has(parent)) continue
    if (!showAuxEdges) continue
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

  const layoutPosFinal = layoutPos
  const atlasLayout = String(doc?.meta?.atlas_layout || '')
  const useFlowBlockLayout =
    archMode && isAtlas && (atlasLayout === 'flow_blocks' || studioLayoutMode === 'free_canvas')
  const layoutKeys = Object.keys(layoutPosFinal || {})
  const stateNodeIds = nodes
    .filter((n) => !String(n.id || '').startsWith('__block__'))
    .map((n) => String(n.id || ''))
  const allStatesHaveLayout =
    stateNodeIds.length > 0 &&
    stateNodeIds.every(
      (id) => layoutPosFinal[id] && Number.isFinite(Number(layoutPosFinal[id].x)),
    )
  const layoutMatchesGraph = layoutKeys.length > 0 && allStatesHaveLayout
  let useFixed =
    layoutMatchesGraph &&
    (useFlowBlockLayout || studioLayoutMode === 'free_canvas' || !(archMode && isAtlas))
  let laidOutNodes = nodes.map((n) => {
    const pos = layoutPosFinal[n.id]
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

  if (useFlowBlockLayout && layoutKeys.length) {
    useFixed = true
    laidOutNodes = nodes.map((n) => {
      const pos = layoutPosFinal[n.id]
      if (!pos || !Number.isFinite(Number(pos.x)) || !Number.isFinite(Number(pos.y))) return n
      return { ...n, x: Number(pos.x), y: Number(pos.y), fixed: true }
    })
    const shells = buildFlowBlockShellNodes(doc, layoutPosFinal, WF_W, WF_H, {
      enabled: true,
    })
    laidOutNodes = [...shells, ...laidOutNodes]
  } else if (archMode && isAtlas && !useFixed) {
    useFixed = true
    laidOutNodes = layoutAtlasArchGrid(laidOutNodes, { wfW: WF_W, wfH: WF_H })
  }

  if (archMode && isAtlas) {
    laidOutNodes = laidOutNodes.map((n) => {
      const id = String(n.id || '')
      if (!id || id.startsWith('__block__') || !n.data?.showWireframe) return n
      const wf = wfByState.get(id)
      if (!wf) return n
      const outgoingNav = allEdges.filter((e) => edgeKind(e) === 'nav' && edgeFrom(e) === id)
      const hot = (wf.regions || []).some((r) => Boolean(r.nav_to)) || outgoingNav.length > 0
      return {
        ...n,
        data: {
          ...n.data,
          wireframe: wf,
          connectHotspots: useFlowHotspots && hot,
          editableHotspots: editableHotspots && useFlowHotspots && hot,
          navOutgoing: allEdges
            .filter((e) => edgeKind(e) === 'nav' && edgeFrom(e) === id)
            .map((e) => edgeTo(e))
            .filter(Boolean),
        },
      }
    })
  }

  laidOutNodes.sort((a, b) => {
    const sa = String(a.id || '').startsWith('__block__') ? 0 : 1
    const sb = String(b.id || '').startsWith('__block__') ? 0 : 1
    return sa - sb || String(a.id).localeCompare(String(b.id))
  })

  let graphRootId = rootId
  if (hideRoot) {
    graphRootId = launchId || homeStateId || (entries.length ? entries[0] : graphRootId)
  }

  const nodeIds = new Set(laidOutNodes.map((n) => String(n.id || '')))
  const visibleLines = lines.filter((line) => {
    const to = String(line.to || '').trim()
    if (!to || !nodeIds.has(to)) return false
    let fromNode = String(line.from || '').trim()
    if (fromNode.startsWith('__block__')) return false
    if (line.fromType === RG_TARGET_HTML) {
      fromNode = parseHotspotTargetId(fromNode).stateId || fromNode
    }
    if (isConnectFromType(line.fromType)) {
      fromNode = parseHotspotTargetId(fromNode).stateId || fromNode
    }
    return fromNode && nodeIds.has(fromNode)
  })

  let routedLines = visibleLines
  let fakeLines = []
  if (archMode) {
    routedLines = dedupeArchNavLines(visibleLines)
    const useOrth = false
    routedLines = routeArchLines(routedLines, laidOutNodes, { orth: useOrth })
    const split = splitConnectFakeLines(routedLines)
    routedLines = split.lines
    fakeLines = split.fakeLines
  }

  return {
    rootId: graphRootId,
    nodes: laidOutNodes,
    lines: routedLines,
    fakeLines,
    layoutName: useFixed ? 'fixed' : 'center',
    layoutFrom: 'left',
    useFlowBlockLayout,
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

export function relationGraphOptions(editable = false, { curved = false, archStyle = false } = {}) {
  return {
    definitelyNoDataProviderNeeded: true,
    debug: false,
    showToolBar: true,
    allowShowMiniToolBar: true,
    allowShowMiniView: true,
    allowSwitchLineShape: false,
    allowSwitchJunctionPoint: false,
    defaultJunctionPoint: 'border',
    defaultLineShape: curved ? RG_LINE_SHAPE_CURVE : archStyle ? RG_LINE_SHAPE_ORTH : 1,
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
