<script setup>
import { computed, ref } from 'vue'

defineOptions({ name: 'AtlasBoardView' })

const props = defineProps({
  root: { type: Object, default: () => ({ children: [] }) },
  mode: { type: String, default: 'outline' },
  nested: { type: Boolean, default: false },
  focusReq: { type: Boolean, default: false },
})

const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
const dragging = ref(false)
let last = { x: 0, y: 0 }

const kids = (node) => (Array.isArray(node?.children) ? node.children : [])
const rawLabel = (node) => String(node?.full || node?.name || '').trim() || '未命名'
const label = (node) => rawLabel(node)

const showReqTag = (node) => {
  if (props.focusReq) return false
  if (!node?.reqTitles?.length) return false
  return node.kind === 'point' || node.kind === 'feature'
}

const cardTitle = (node) => {
  const bits = [rawLabel(node)]
  if (node?.kind === 'platform') bits.unshift('端')
  if (node?.orphan) bits.push('图谱里已找不到对应节点')
  if (node?.reqTitles?.length) bits.push(`需求：${node.reqTitles.join('、')}`)
  if (node?.change === 'new') bits.push('相对上一版新增')
  else if (node?.change === 'kept') bits.push('上一版已有')
  return bits.join(' · ')
}

const labelClass = (node) => {
  const bits = []
  if (node?.kind === 'root') bits.push('is-root')
  else if (node?.kind === 'platform') bits.push('is-plat')
  else if (node?.kind === 'feature') bits.push('is-feat')
  else if (node?.kind === 'point') bits.push('is-point')
  else bits.push('is-module')
  if (node?.orphan) bits.push('is-orphan')
  return bits.join(' ')
}

const changeClass = (node) => {
  if (node?.kind === 'root') return ''
  if (node?.change === 'new') return 'is-new'
  return ''
}

const dotClass = (node) => {
  if (node?.kind === 'point') return 'is-point'
  if (node?.kind === 'feature') return 'is-soft'
  return ''
}

const clampZoom = (v) => Math.min(1.6, Math.max(0.55, Math.round(v * 20) / 20))
const zoomPct = computed(() => Math.round(zoom.value * 100))
const scaleStyle = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})`,
  transformOrigin: '0 0',
}))

const zoomIn = () => { zoom.value = clampZoom(zoom.value + 0.05) }
const zoomOut = () => { zoom.value = clampZoom(zoom.value - 0.05) }
const resetView = () => {
  zoom.value = 1
  panX.value = 0
  panY.value = 0
}

const onWheel = (e) => {
  if (!e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  const step = Math.max(0.05, Math.min(0.12, Math.abs(e.deltaY) / 900))
  zoom.value = clampZoom(zoom.value + (e.deltaY > 0 ? -step : step))
}

const onDown = (e) => {
  if (props.mode !== 'tree' || e.button !== 0) return
  dragging.value = true
  last = { x: e.clientX, y: e.clientY }
  e.currentTarget.setPointerCapture?.(e.pointerId)
}

const onMove = (e) => {
  if (!dragging.value) return
  panX.value += e.clientX - last.x
  panY.value += e.clientY - last.y
  last = { x: e.clientX, y: e.clientY }
}

const onUp = () => { dragging.value = false }
</script>

<template>
  <div v-if="!nested" class="board-shell">
    <div class="zoombar">
      <button type="button" class="zbtn" @click="zoomOut">−</button>
      <span>{{ zoomPct }}%</span>
      <button type="button" class="zbtn" @click="zoomIn">+</button>
      <button type="button" class="zbtn" @click="resetView">重置</button>
    </div>
    <div
      class="mm-board"
      :class="{ 'is-outline': mode !== 'tree', grabbing: dragging }"
      @wheel="onWheel"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <div class="mm-scale" :style="scaleStyle">
        <AtlasBoardView nested :mode="mode" :root="root" :focus-req="focusReq" />
      </div>
    </div>
  </div>
  <div v-else-if="mode === 'tree'" class="mm-node">
    <div class="mm-card" :class="[labelClass(root), changeClass(root)]" :title="cardTitle(root)">
      {{ label(root) }}
      <em v-if="root.change === 'new' && root.kind !== 'root'" class="chg">新</em>
      <small v-if="showReqTag(root)" class="req-tag">{{ root.reqTitles.join('、') }}</small>
    </div>
    <div v-if="kids(root).length" class="mm-branch">
      <div v-for="child in kids(root)" :key="child.id" class="mm-slot">
        <AtlasBoardView nested mode="tree" :root="child" :focus-req="focusReq" />
      </div>
    </div>
  </div>
  <ul v-else-if="mode === 'outline' && root.kind === 'root'" class="outline">
    <AtlasBoardView
      v-for="child in kids(root)"
      :key="child.id"
      nested
      mode="outline"
      :root="child"
      :focus-req="focusReq"
    />
  </ul>
  <li v-else class="outline-item">
    <span class="dot" :class="[dotClass(root), root.change === 'new' ? 'is-new' : '']" />
    <div>
      <strong v-if="root.kind === 'module' || root.kind === 'root' || root.kind === 'platform'" :title="cardTitle(root)">{{ label(root) }}</strong>
      <span v-else :title="cardTitle(root)">{{ label(root) }}</span>
      <em v-if="root.change === 'new' && root.kind !== 'root'" class="chg">新</em>
      <small v-if="showReqTag(root)" class="req-tag">{{ root.reqTitles.join('、') }}</small>
      <ul v-if="kids(root).length">
        <AtlasBoardView
          v-for="child in kids(root)"
          :key="child.id"
          nested
          mode="outline"
          :root="child"
          :focus-req="focusReq"
        />
      </ul>
    </div>
  </li>
</template>

<style scoped>
.board-shell {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

.zoombar {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.08);
}

.zoombar span {
  min-width: 44px;
  text-align: center;
  color: #1e40af;
  font-size: 12px;
  font-weight: 700;
}

.zbtn {
  min-width: 28px;
  height: 26px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.zbtn:hover {
  background: #dbeafe;
}

.outline {
  margin: 0;
  padding: 12px 8px 20px;
  list-style: none;
}

.outline ul {
  margin: 4px 0 0;
  padding: 0 0 0 16px;
  list-style: none;
  border-left: 2px solid #bfdbfe;
}

.outline-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 5px 0;
  font-size: 13px;
  line-height: 1.55;
}

.outline-item span,
.outline-item strong {
  overflow-wrap: anywhere;
}

.req-tag {
  display: block;
  margin: 2px 0 0 0;
  color: #6366f1;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
}

.dot {
  width: 8px;
  height: 8px;
  margin-top: 7px;
  border-radius: 999px;
  background: #3b82f6;
  flex-shrink: 0;
}

.dot.is-soft { background: #60a5fa; }
.dot.is-point { background: #93c5fd; }
.dot.is-new { background: #f59e0b; }

.chg {
  margin-left: 6px;
  padding: 0 5px;
  border-radius: 999px;
  background: #fef3c7;
  color: #b45309;
  font-size: 10px;
  font-style: normal;
  font-weight: 800;
  vertical-align: middle;
}

.mm-board {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px 16px 28px;
  cursor: grab;
  touch-action: pan-y;
  background:
    radial-gradient(circle at 1px 1px, #e8eef7 1px, transparent 0) 0 0 / 22px 22px;
}

.mm-board.is-outline {
  cursor: default;
}

.mm-board.grabbing {
  cursor: grabbing;
  user-select: none;
}

.mm-scale {
  display: inline-block;
  min-width: 100%;
}

.mm-node {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.mm-card {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  max-width: 220px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.45;
  white-space: normal;
  overflow-wrap: anywhere;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.08);
}

.mm-card.is-root {
  background: linear-gradient(180deg, #4f8df7 0%, #3b82f6 100%);
  color: #fff;
  border: 0;
  font-weight: 800;
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.28);
}

.mm-card.is-plat {
  background: #eef2ff;
  color: #3730a3;
  border: 1px solid #c7d2fe;
  font-weight: 800;
}

.mm-card.is-module {
  background: #dbeafe;
  border: 1px solid #93c5fd;
  color: #1e3a8a;
}

.mm-card.is-feat {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
}

.mm-card.is-point {
  background: #fff;
  border: 1px solid #bfdbfe;
  color: #334155;
  font-weight: 500;
}

.mm-card.is-new {
  box-shadow: inset 0 0 0 1px #f59e0b;
}

.mm-card.is-orphan {
  opacity: 0.75;
  box-shadow: inset 0 0 0 1px #d97706;
}

.mm-card.is-orphan::after {
  content: '已失联';
  margin-left: 6px;
  font-size: 11px;
  color: #b45309;
  font-weight: 700;
}

.mm-branch {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin-left: 22px;
  padding-left: 22px;
}

.mm-branch::before {
  content: '';
  position: absolute;
  left: -22px;
  top: 50%;
  width: 22px;
  height: 2px;
  background: #7eb6ea;
}

.mm-slot {
  position: relative;
  padding: 7px 0;
}

.mm-slot::before {
  content: '';
  position: absolute;
  left: -22px;
  top: 50%;
  width: 22px;
  height: 2px;
  background: #7eb6ea;
}

.mm-slot::after {
  content: '';
  position: absolute;
  left: -22px;
  width: 2px;
  background: #7eb6ea;
}

.mm-slot:first-child::after {
  top: 50%;
  bottom: 0;
}

.mm-slot:last-child::after {
  top: 0;
  height: 50%;
}

.mm-slot:not(:first-child):not(:last-child)::after {
  top: 0;
  bottom: 0;
}

.mm-slot:first-child:last-child::after {
  display: none;
}
</style>
