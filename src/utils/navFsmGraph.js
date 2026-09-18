/** NavFSM 文档工具（校准骨架、模板）；图形展示见 navRelationGraph.js。 */

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

function stateId(state) {
  return String(state?.id || state?.state_id || '').trim()
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

export function newStateSkeleton(stateIdVal, kind = 'page') {
  const sid = String(stateIdVal || '').trim()
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
      lease_requirements: {},
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
