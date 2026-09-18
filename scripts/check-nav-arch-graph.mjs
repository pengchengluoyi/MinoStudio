#!/usr/bin/env node
/** 校验架构图：manual nav → fakeLines + NodePoint；auto/system → 页级边 + 箭头字段。 */
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = join(root, '../MinoNexus/tests/fixtures/nav_atlas_arch_golden.json')
const graphPath = pathToFileURL(join(root, 'src/utils/navRelationGraph.js')).href

const {
  docToRelationGraph,
  RG_TARGET_CONNECT,
  RG_TARGET_NODE,
  archLineHiddenByFilters,
  DEFAULT_ARCH_LINE_FILTERS,
} = await import(graphPath)
const doc = JSON.parse(readFileSync(fixture, 'utf8'))
const g = docToRelationGraph(doc, { variant: 'arch', archView: 'structure', showWireframe: true })
const fake = g.fakeLines || []
const navFake = fake.filter((l) => l.data?.edgeId || String(l.text || '').includes('步'))
if (navFake.length < 1) {
  console.error('expected >=1 nav fakeLine, got', fake.length)
  process.exit(1)
}
const bad = navFake.find((l) => l.fromType !== RG_TARGET_CONNECT)
if (bad) {
  console.error('fakeLine missing NodePoint fromType', bad)
  process.exit(1)
}
const noArrow = navFake.find((l) => l.showEndArrow === false)
if (noArrow) {
  console.error('fakeLine should showEndArrow', noArrow.id)
  process.exit(1)
}

const autoDoc = JSON.parse(JSON.stringify(doc))
autoDoc.edges = [
  ...(autoDoc.edges || []),
  {
    id: 'e-auto-test',
    kind: 'nav',
    from: 'page.login',
    to: 'page.home',
    meta: {
      action_label: '下载完成',
      transition: { driver: 'auto', relation: 'global' },
    },
  },
]
const gAuto = docToRelationGraph(autoDoc, { variant: 'arch', archView: 'structure', showWireframe: true })
const autoLine = (gAuto.lines || []).find((l) => l.data?.edgeId === 'e-auto-test')
if (!autoLine) {
  console.error('auto nav should be in lines, not fakeLines')
  process.exit(1)
}
if (autoLine.fromType !== RG_TARGET_NODE || !autoLine.data?.passiveAnchor) {
  console.error('auto nav should use page-level anchor', autoLine)
  process.exit(1)
}
if (autoLine.showEndArrow === false) {
  console.error('auto nav should showEndArrow')
  process.exit(1)
}

const unkDoc = JSON.parse(JSON.stringify(doc))
unkDoc.edges = [
  ...(unkDoc.edges || []),
  {
    id: 'e-unk-test',
    kind: 'nav',
    from: 'page.login',
    to: 'page.home',
    meta: { action_label: '未知跳转', action_type: 'observe' },
  },
]
const gUnk = docToRelationGraph(unkDoc, { variant: 'arch', archView: 'structure', showWireframe: true })
const unkLine = [...(gUnk.fakeLines || []), ...(gUnk.lines || [])].find(
  (l) => l.data?.edgeId === 'e-unk-test',
)
if (!unkLine || unkLine.dashType !== 3) {
  console.error('unknown driver should use fine dash (3)', unkLine)
  process.exit(1)
}

const sampleLine = {
  data: { archFilter: { style: 'blueSolid', direction: 'forward' } },
}
if (!archLineHiddenByFilters(sampleLine, { ...DEFAULT_ARCH_LINE_FILTERS, blueSolid: false })) {
  console.error('archLineHiddenByFilters should hide blueSolid when off')
  process.exit(1)
}
if (archLineHiddenByFilters(sampleLine, DEFAULT_ARCH_LINE_FILTERS)) {
  console.error('archLineHiddenByFilters should show when filters on')
  process.exit(1)
}

console.log('nav arch graph ok:', navFake.length, 'fakeLines, passive anchor ok')
