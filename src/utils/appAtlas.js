/** 应用图谱：多层模块树，以及用例/需求怎么挂上去。 */

export const MIND_PLATFORMS = [
  { id: 'app', label: 'App' },
  { id: 'web', label: 'Web' },
  { id: 'e2e', label: '端到端' },
]

export function normalizeMindPlatform(raw) {
  const s = String(raw || '').trim().toLowerCase()
  if (!s) return ''
  if (/(e2e|端到端|跨端)/.test(s)) return 'e2e'
  if (/(web|h5|pc|后台|管理端|网页|官网)/.test(s)) return 'web'
  if (/(app|android|ios|移动|客户端|iphone|安卓|苹果)/.test(s)) return 'app'
  return ''
}

export function platformLabel(id) {
  const hit = MIND_PLATFORMS.find((p) => p.id === id)
  if (hit) return hit.label
  return id || ''
}

export function inferReqPlatforms(req) {
  const impact = req?.understanding?.impact && typeof req.understanding.impact === 'object'
    ? req.understanding.impact
    : {}
  const found = []
  const push = (raw) => {
    const p = normalizeMindPlatform(raw)
    if (p && !found.includes(p)) found.push(p)
  }
  for (const x of impact.platforms || []) push(x)
  if (impact.e2e) push('e2e')
  for (const p of req?.understanding?.points || []) {
    if (p && typeof p === 'object') push(p.platform)
  }
  return found
}

export function atlasModules(atlas) {
  return Array.isArray(atlas?.modules) ? atlas.modules : []
}

export function flattenAtlas(atlas, { includeFeatures = true } = {}) {
  const rows = []
  const walk = (mod, depth, path, parentId = '') => {
    const nextPath = [...path, mod.name]
    rows.push({
      id: mod.id,
      kind: 'module',
      name: mod.name,
      summary: mod.summary || '',
      depth,
      path: nextPath.join(' / '),
      parentId,
      reqIds: [...(mod.req_ids || [])],
      caseIds: [...(mod.case_ids || [])],
      childModules: (mod.children || []).length,
      featureCount: (mod.features || []).length,
      node: mod,
    })
    for (const child of mod.children || []) walk(child, depth + 1, nextPath, mod.id)
    if (!includeFeatures) return
    for (const feat of mod.features || []) {
      rows.push({
        id: feat.id,
        kind: 'feature',
        name: feat.name,
        summary: feat.summary || '',
        depth: depth + 1,
        path: [...nextPath, feat.name].join(' / '),
        parentId: mod.id,
        reqIds: [...(feat.req_ids || [])],
        caseIds: [...(feat.case_ids || [])],
        childModules: 0,
        featureCount: 0,
        node: feat,
      })
    }
  }
  for (const mod of atlasModules(atlas)) walk(mod, 0, [])
  return rows
}

export function alignAtlasDiff(before, after) {
  const left = new Map(flattenAtlas(before).map((row) => [row.path, row]))
  const right = new Map(flattenAtlas(after).map((row) => [row.path, row]))
  const paths = []
  for (const row of flattenAtlas(before)) {
    if (!paths.includes(row.path)) paths.push(row.path)
  }
  for (const row of flattenAtlas(after)) {
    if (!paths.includes(row.path)) paths.push(row.path)
  }
  return paths.map((path) => {
    const a = left.get(path) || null
    const b = right.get(path) || null
    let op = 'same'
    if (!a && b) op = 'add'
    else if (a && !b) op = 'remove'
    else if ((a?.summary || '') !== (b?.summary || '')) op = 'update'
    else {
      const leftReqs = [...(a?.reqIds || [])].sort().join(',')
      const rightReqs = [...(b?.reqIds || [])].sort().join(',')
      if (leftReqs !== rightReqs) op = 'hang'
    }
    return {
      path,
      op,
      depth: (b || a)?.depth || 0,
      kind: (b || a)?.kind || 'module',
      left: a,
      right: b,
    }
  })
}

export function diffBuckets(rows = []) {
  const add = []
  const remove = []
  const update = []
  const hang = []
  for (const row of rows) {
    if (row.op === 'add') add.push(row)
    else if (row.op === 'remove') remove.push(row)
    else if (row.op === 'update') update.push(row)
    else if (row.op === 'hang') hang.push(row)
  }
  return { add, remove, update, hang, structural: add.length + remove.length + update.length }
}

function caseBlob(c) {
  return `${c?.case_id || ''} ${c?.name || ''} ${c?.title || ''} ${c?.module || ''}`
}

export function assignCasesToAtlas(atlas, cases = [], requirements = []) {
  const assigned = new Set()
  const byNode = new Map()
  const drafts = []
  for (const req of requirements || []) {
    for (const c of req.draft_cases || []) {
      if (c?.case_id) drafts.push({ ...c, requirement_id: req.id, _draft: true })
    }
  }
  const pool = [...(cases || []), ...drafts]
  const rows = flattenAtlas(atlas).filter((row) => row.kind === 'feature').reverse()

  const take = (nodeId, pred) => {
    const hit = []
    for (const c of pool) {
      const id = c.case_id
      if (!id || assigned.has(id) || !pred(c)) continue
      assigned.add(id)
      hit.push(c)
    }
    if (hit.length) byNode.set(nodeId, [...(byNode.get(nodeId) || []), ...hit])
  }

  for (const row of rows) {
    const ids = new Set(row.caseIds)
    take(row.id, (c) => ids.has(c.case_id))
  }
  for (const row of rows) {
    const reqSet = new Set(row.reqIds)
    take(row.id, (c) => reqSet.has(c.requirement_id))
  }
  for (const row of rows) {
    take(row.id, (c) => {
      const blob = caseBlob(c)
      return blob.includes(row.path) || (row.name && blob.includes(row.name) && blob.includes(row.path.split(' / ')[0] || ''))
    })
  }
  for (const row of rows) {
    take(row.id, (c) => row.name && String(c.module || '') === row.name)
  }

  const orphan = pool.filter((c) => c.case_id && !assigned.has(c.case_id))
  return { byNode, orphan, assigned }
}

export function hangLabel(row, atlas) {
  const names = []
  for (const item of flattenAtlas(atlas)) {
    if ((row.module_ids || []).includes(item.id) && item.kind === 'module') names.push(item.path)
    if ((row.feature_ids || []).includes(item.id) && item.kind === 'feature') names.push(item.path)
  }
  return [...new Set(row.atlas_paths?.length ? row.atlas_paths : names)].join(' · ')
}

export function shortLabel(text, max = 16) {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  return s.length > max ? `${s.slice(0, max)}…` : s
}

export function pathParts(path) {
  const parts = String(path || '')
    .split(/\s*\/\s*|\s*>\s*|\s*-\s*/)
    .map((x) => x.trim())
    .filter(Boolean)
  if (parts.length >= 3) {
    return { module: parts[0], submodule: parts.slice(1, -1).join(' / '), feature: parts[parts.length - 1] }
  }
  if (parts.length === 2) return { module: parts[0], submodule: '', feature: parts[1] }
  if (parts.length === 1) return { module: parts[0], submodule: '', feature: '' }
  return { module: '', submodule: '', feature: '' }
}

export function moduleLabel(path) {
  return String(path || '')
    .split(/\s*\/\s*|\s*>\s*/)
    .map((x) => x.trim())
    .filter(Boolean)
    .join('-')
}

function isIdentityName(name, names = []) {
  const n = String(name || '').trim()
  if (!n) return false
  return (names || []).some((b) => {
    const key = String(b || '').trim()
    if (key.length < 2) return false
    return n === key
      || n.startsWith(`${key} `)
      || n.startsWith(`${key}【`)
      || n.startsWith(`${key}[`)
      || n.startsWith(`${key}·`)
      || n.startsWith(`${key}-`)
  })
}

function unwrapIdentity(node, names = []) {
  if (!node) return []
  const kids = (node.children || []).flatMap((c) => unwrapIdentity(c, names))
  if (node.kind === 'platform' || node.kind === 'root') {
    return [{ ...node, children: kids }]
  }
  if (isIdentityName(node.name, names) || isIdentityName(node.full, names)) {
    return kids.length ? kids : []
  }
  return [{ ...node, children: kids }]
}

export function atlasBoard(atlas, { stripNames = [] } = {}) {
  const walk = (mod) => ({
    id: mod.id,
    name: String(mod.name || '').trim(),
    full: String(mod.name || '').trim(),
    kind: 'module',
    summary: mod.summary || '',
    children: [
      ...(mod.children || []).map(walk),
      ...(mod.features || []).map((feat) => ({
        id: feat.id,
        name: String(feat.name || '').trim(),
        full: String(feat.name || '').trim(),
        kind: 'feature',
        summary: feat.summary || '',
        children: [],
      })),
    ],
  })
  const board = {
    id: 'atlas-root',
    name: '应用图谱',
    kind: 'root',
    children: (atlas?.modules || []).map(walk),
  }
  if (!(stripNames || []).length) return board
  return unwrapIdentity(board, stripNames)[0] || board
}

function normName(s) {
  return String(s || '').replace(/\s+/g, '').toLowerCase()
}

function namesMatch(a, b) {
  const names = [a?.name, a?.full].map(normName).filter(Boolean)
  const other = [b?.name, b?.full].map(normName).filter(Boolean)
  return names.some((n) => other.includes(n))
}

function findById(node, id) {
  if (!node || !id) return null
  if (node.id === id) return node
  for (const child of node.children || []) {
    const hit = findById(child, id)
    if (hit) return hit
  }
  return null
}

function findDeep(node, name) {
  if (!node || !name) return null
  if (normName(node.name) === normName(name) || normName(node.full) === normName(name)) return node
  for (const child of node.children || []) {
    const hit = findDeep(child, name)
    if (hit) return hit
  }
  return null
}

function findLoose(node, name) {
  const n = normName(name)
  if (!node || n.length < 4) return null
  let best = null
  const walk = (cur) => {
    const cn = normName(cur.name) || normName(cur.full)
    if (cn && (cn.includes(n) || n.includes(cn))) {
      if (!best || cn.length > (normName(best.name) || normName(best.full)).length) best = cur
    }
    for (const child of cur.children || []) walk(child)
  }
  walk(node)
  return best
}

function walkPath(node, parts) {
  let cur = node
  for (const part of parts || []) {
    if (!part) continue
    const next = (cur.children || []).find((c) => normName(c.name) === normName(part) || normName(c.full) === normName(part))
    if (!next) return null
    cur = next
  }
  return cur
}

function refIdOf(node) {
  return String(node?.atlasRef?.feature_id || node?.atlasRef?.module_id || '')
}

function mergeChild(parent, child) {
  if (!parent || !child) return
  if (!parent.children) parent.children = []
  // 名字被改过时（别名命中）只有 id 能对上，所以 id 优先于名字。少了这一层，
  // 图谱里叫「本地上传提交」、脑图里叫「图片上传」的同一个功能会在看板上并排出现两份。
  const refId = refIdOf(child)
  const exist = (refId && parent.children.find((c) => c.id === refId)) || parent.children.find((c) => namesMatch(c, child))
  if (!exist) {
    parent.children.push(child)
    return
  }
  mergeMeta(exist, child)
  for (const grand of child.children || []) mergeChild(exist, grand)
}

function mergeMeta(target, src) {
  if (!target || !src) return
  target.reqIds = [...new Set([...(target.reqIds || []), ...(src.reqIds || [])])]
  target.reqTitles = [...new Set([...(target.reqTitles || []), ...(src.reqTitles || [])])]
}

function stampReq(node, req) {
  if (!node || !req) return node
  const id = String(req.id || '')
  const title = String(req.title || req.name || id).trim()
  const walk = (n) => {
    if (id) n.reqIds = [...new Set([...(n.reqIds || []), id])]
    if (title) n.reqTitles = [...new Set([...(n.reqTitles || []), title])]
    for (const child of n.children || []) walk(child)
  }
  walk(node)
  return node
}

function bubbleReq(node) {
  if (!node) return
  for (const child of node.children || []) bubbleReq(child)
  const ids = [...(node.reqIds || [])]
  const titles = [...(node.reqTitles || [])]
  for (const child of node.children || []) {
    ids.push(...(child.reqIds || []))
    titles.push(...(child.reqTitles || []))
  }
  node.reqIds = [...new Set(ids)]
  node.reqTitles = [...new Set(titles)]
}

function pruneToReq(node, reqId) {
  if (!node || !reqId) return node
  const kids = (node.children || []).map((c) => pruneToReq(c, reqId)).filter(Boolean)
  if (node.kind === 'root') return { ...node, children: kids }
  const mine = (node.reqIds || []).includes(reqId)
  if (mine || kids.length) return { ...node, children: kids }
  return null
}

function atlasPathSet(atlas) {
  const rows = new Set()
  const walk = (mod, path) => {
    const next = [...path, String(mod.name || '').trim()].filter(Boolean)
    if (next.length) rows.add(next.join('-'))
    for (const child of mod.children || []) walk(child, next)
    for (const feat of mod.features || []) {
      const p = [...next, String(feat.name || '').trim()].filter(Boolean)
      if (p.length) rows.add(p.join('-'))
    }
  }
  for (const mod of atlas?.modules || []) walk(mod, [])
  return rows
}

function markChange(node, prevPaths, allNew, prefix = []) {
  if (!node) return
  const skip = node.kind === 'root' || node.kind === 'platform'
  const here = skip ? prefix : [...prefix, String(node.name || '').trim()].filter(Boolean)
  if (!skip && here.length) {
    const key = here.join('-')
    if (allNew) node.change = 'new'
    else if (node.kind === 'point') node.change = prevPaths.has(here.slice(0, -1).join('-')) ? 'kept' : 'new'
    else node.change = prevPaths.has(key) ? 'kept' : 'new'
  } else if (node.kind === 'platform') {
    node.change = ''
  }
  for (const child of node.children || []) markChange(child, prevPaths, allNew, here)
}

export function summarizeMindDiff(root) {
  const added = []
  const kept = []
  const walk = (n, prefix) => {
    const skip = n.kind === 'root' || n.kind === 'platform'
    const here = skip ? prefix : [...prefix, String(n.name || '').trim()].filter(Boolean)
    if (!skip && here.length) {
      const row = { kind: n.kind, path: here.join('-'), name: n.name, reqTitles: n.reqTitles || [] }
      if (n.change === 'new') added.push(row)
      else if (n.change === 'kept') kept.push(row)
    }
    for (const child of n.children || []) walk(child, here)
  }
  walk(root, [])
  return {
    added,
    kept,
    addedPoints: added.filter((x) => x.kind === 'point'),
    addedFeatures: added.filter((x) => x.kind !== 'point'),
  }
}

function placeBranch(root, branch) {
  // 后端对齐层的结论写在 atlas_ref 上，那是权威的：前端再靠 findLoose 猜一遍，看板画的
  // 归属就会和实际合并进图谱的归属不一致，而人只能在「图谱变更」里改后者，无从干预前者。
  // 所以 id 优先、path 次之，findDeep / findLoose 只兜没走过对齐层的老数据。
  const refId = refIdOf(branch)
  const byId = refId ? findById(root, refId) : null
  if (byId && byId !== root) {
    mergeMeta(byId, branch)
    for (const child of branch.children || []) mergeChild(byId, child)
    return
  }
  const path = Array.isArray(branch.path) ? branch.path.map((x) => String(x || '').trim()).filter(Boolean) : []
  if (path.length >= 2) {
    const host = walkPath(root, path.slice(0, -1)) || walkPath(root, path) || findDeep(root, path[0])
    if (host) {
      mergeMeta(host, branch)
      if (namesMatch(host, branch)) {
        for (const child of branch.children || []) mergeChild(host, child)
      } else {
        mergeChild(host, branch)
      }
      return
    }
  }
  const named = findDeep(root, branch.name) || findDeep(root, branch.full) || findLoose(root, branch.name)

  if (named && named !== root) {
    mergeMeta(named, branch)
    if ((branch.children || []).length) {
      for (const child of branch.children) mergeChild(named, child)
    } else {
      mergeChild(named, branch)
    }
    return
  }
  const slash = String(branch.name || '').split(/\s*\/\s*/).map((x) => x.trim()).filter(Boolean)
  if (slash.length > 1) {
    const host = walkPath(root, slash.slice(0, -1)) || findDeep(root, slash[0])
    if (host) {
      mergeChild(host, { ...branch, name: slash[slash.length - 1], full: slash[slash.length - 1] })
      return
    }
  }
  mergeChild(root, branch)
}

function mindNode(raw) {
  if (!raw || typeof raw !== 'object') return null
  const full = String(raw.title || raw.text || '').trim()
  const children = (raw.children || []).map(mindNode).filter(Boolean)
  if (!full && !children.length) return null
  const platform = normalizeMindPlatform(raw.platform) || normalizeMindPlatform(raw.kind === 'platform' ? full : '')
  let kind = raw.kind || (children.length ? 'module' : 'point')
  if (platform && (kind === 'platform' || ['app', 'web', 'e2e', 'App', 'Web', '端到端'].includes(full))) {
    kind = 'platform'
  }
  return {
    id: raw.id || full,
    name: kind === 'platform' ? platformLabel(platform || 'app') : (full || '未命名'),
    full: full || '未命名',
    kind,
    platform: platform || undefined,
    path: Array.isArray(raw.path) ? raw.path : undefined,
    atlasRef: raw.atlas_ref && typeof raw.atlas_ref === 'object' ? raw.atlas_ref : undefined,
    orphan: Boolean(raw.orphan),
    children,
  }
}

function collectPlatformGroups(node, req) {
  if (!node) return []
  const kids = node.children || []
  const platKids = kids.filter((c) => c.kind === 'platform' || normalizeMindPlatform(c.platform) || normalizeMindPlatform(c.name))
  if (platKids.length && platKids.length === kids.length) {
    return platKids.map((c) => ({
      platform: normalizeMindPlatform(c.platform || c.name) || 'app',
      branches: (c.children && c.children.length) ? c.children : [],
    })).filter((g) => g.branches.length)
  }
  const fallback = inferReqPlatforms(req)[0] || 'app'
  const buckets = new Map()
  const list = kids.length ? kids : [node]
  for (const branch of list) {
    const p = normalizeMindPlatform(branch.platform) || fallback
    if (!buckets.has(p)) buckets.set(p, [])
    buckets.get(p).push(branch)
  }
  return [...buckets.entries()].map(([platform, branches]) => ({ platform, branches }))
}

/** 脑图按端拆开，再挂到应用图谱路径上。可按需求 / 端切开，并标出相对上一版哪些是新增。 */
export function mindBoard(requirements = [], atlas = null, { focusReqId = '', prevAtlas = null, platform = '', projectName = '', appName = '' } = {}) {
  const focus = String(focusReqId || '').trim()
  const wantPlat = normalizeMindPlatform(platform)
  const reqs = focus ? (requirements || []).filter((r) => r.id === focus) : (requirements || [])
  const identity = [
    projectName,
    appName,
    ...reqs.map((r) => r.title || r.name),
  ]
  const groups = []
  for (const req of reqs) {
    const node = stampReq(mindNode(req.mindmap), req)
    if (!node) continue
    const unwrappedList = unwrapIdentity(node, identity)
    const unwrapped = unwrappedList.length === 1
      ? unwrappedList[0]
      : { ...node, kind: node.kind || 'module', children: unwrappedList }
    for (const g of collectPlatformGroups(unwrapped, req)) {
      groups.push({
        ...g,
        branches: (g.branches || []).flatMap((b) => unwrapIdentity(b, identity)),
      })
    }
  }
  const plats = []
  for (const g of groups) {
    if (wantPlat && g.platform !== wantPlat) continue
    if (!plats.includes(g.platform)) plats.push(g.platform)
  }
  const order = ['app', 'web', 'e2e']
  const ordered = [...plats].sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)))
  const children = ordered.map((plat) => {
    const root = atlasBoard(atlas, { stripNames: identity })
    for (const g of groups) {
      if (g.platform !== plat) continue
      for (const branch of g.branches) placeBranch(root, branch)
    }
    bubbleReq(root)
    const pruned = focus ? pruneToReq(root, focus) : root
    const cleaned = unwrapIdentity({ ...pruned, kind: pruned.kind || 'root' }, identity)[0] || pruned
    return {
      id: `plat-${plat}`,
      name: platformLabel(plat),
      kind: 'platform',
      platform: plat,
      children: cleaned?.children || [],
    }
  }).filter((n) => (n.children || []).length)
  const board = { id: 'mind-root', name: '测试脑图', kind: 'root', children }
  markChange(board, atlasPathSet(prevAtlas), !prevAtlas || !atlasPathSet(prevAtlas).size)
  return board
}

/** 用例筛选：按图谱嵌套成 cascader 选项。 */
export function atlasCascaderOptions(atlas) {
  const walk = (mod) => {
    const children = [
      ...(mod.children || []).map(walk),
      ...(mod.features || []).map((feat) => ({
        value: String(feat.name || '').trim(),
        label: String(feat.name || '').trim() || '功能',
      })),
    ].filter((x) => x.value)
    return {
      value: String(mod.name || '').trim(),
      label: String(mod.name || '').trim() || '模块',
      children: children.length ? children : undefined,
    }
  }
  return (atlas?.modules || []).map(walk).filter((x) => x.value)
}

export function moveNode(atlas, nodeId, dir) {
  const doc = structuredClone(atlas || { modules: [] })
  const lists = [doc.modules || []]
  const walk = (mod) => {
    lists.push(mod.children || [])
    lists.push(mod.features || [])
    for (const child of mod.children || []) walk(child)
  }
  for (const mod of doc.modules || []) walk(mod)
  for (const list of lists) {
    const i = list.findIndex((n) => n && n.id === nodeId)
    if (i < 0) continue
    const j = i + dir
    if (j < 0 || j >= list.length) return doc
    const [item] = list.splice(i, 1)
    list.splice(j, 0, item)
    return doc
  }
  return doc
}

export function renameNode(atlas, nodeId, name) {
  const doc = structuredClone(atlas || { modules: [] })
  const next = String(name || '').trim()
  if (!next) return doc
  const walk = (mod) => {
    if (mod.id === nodeId) mod.name = next
    for (const child of mod.children || []) walk(child)
    for (const feat of mod.features || []) {
      if (feat.id === nodeId) feat.name = next
    }
  }
  for (const mod of doc.modules || []) walk(mod)
  return doc
}

export function walkMind(node, depth = 0, acc = []) {
  if (!node || typeof node !== 'object') return acc
  const title = node.title || node.text || ''
  const children = Array.isArray(node.children) ? node.children : []
  if (title) {
    acc.push({
      id: node.id || `${depth}-${title}`,
      kind: node.kind || (depth === 0 ? 'root' : 'node'),
      name: title,
      depth,
      caseIds: node.case_ids || [],
      pointId: node.point_id || '',
      node,
    })
  }
  for (const child of children) walkMind(child, title ? depth + 1 : depth, acc)
  return acc
}
