<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getNavCaptureTurn } from '@/api/navFsm'
import NavFsmWireframe from '@/views/Testing/NavFsmWireframe.vue'

const props = defineProps({
  appId: { type: String, default: '' },
  stateId: { type: String, default: '' },
  turnRefs: { type: Array, default: () => [] },
  fallbackWireframe: { type: Object, default: null },
  title: { type: String, default: '' },
  showCaptureActions: { type: Boolean, default: true },
})

const emit = defineEmits(['split-capture', 'pin-capture'])

const PAGE_SIZE = 12

const page = ref(1)
const activeIndex = ref(0)
const loadingTurn = ref(false)
const activeWireframe = ref(null)
const loadError = ref('')
const listPanelRef = ref(null)
let wheelLock = false

const stateTurns = computed(() => {
  const sid = String(props.stateId || '').trim()
  if (!sid) return []
  return (props.turnRefs || [])
    .filter((r) => String(r?.state_id || '') === sid)
    .sort((a, b) => Number(a?.at || 0) - Number(b?.at || 0))
})

const total = computed(() => stateTurns.value.length)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

const pageTurns = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return stateTurns.value.slice(start, start + PAGE_SIZE)
})

const globalActiveIndex = computed(() => (page.value - 1) * PAGE_SIZE + activeIndex.value)

const displayWireframe = computed(() => activeWireframe.value || props.fallbackWireframe)

function formatAt(at) {
  const n = Number(at || 0)
  if (!n) return '—'
  const d = new Date(n * 1000)
  return d.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function turnLabel(ref, idx) {
  const tid = Number(ref?.turn_id || 0)
  return `#${idx + 1} · turn ${tid}`
}

function captureId(ref) {
  const sessionId = String(ref?.session_id || '').trim()
  const turnId = Number(ref?.turn_id || 0)
  if (!sessionId || !turnId) return ''
  return `${sessionId}/${turnId}`
}

async function copyCaptureId(ref) {
  const id = captureId(ref)
  if (!id) return
  try {
    await navigator.clipboard.writeText(id)
    ElMessage.success('已复制采集 ID')
  } catch {
    ElMessage.error('复制失败')
  }
}

function onListKeydown(e) {
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    prevTurn()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    nextTurn()
  }
}

function onListWheel(e) {
  if (!total.value) return
  e.preventDefault()
  if (wheelLock) return
  wheelLock = true
  if (e.deltaY > 0) nextTurn()
  else if (e.deltaY < 0) prevTurn()
  window.setTimeout(() => {
    wheelLock = false
  }, 120)
}

function onItemClick(idx, ref) {
  selectLocal(idx)
  copyCaptureId(ref)
}

function activeTurnRef() {
  return stateTurns.value[globalActiveIndex.value] || null
}

function onSplitCapture() {
  const ref = activeTurnRef()
  if (!ref) return
  emit('split-capture', {
    sessionId: String(ref.session_id || ''),
    turnId: Number(ref.turn_id || 0),
  })
}

function onPinCapture() {
  const ref = activeTurnRef()
  if (!ref || !props.stateId) return
  emit('pin-capture', {
    sessionId: String(ref.session_id || ''),
    turnId: Number(ref.turn_id || 0),
    stateId: String(props.stateId || ''),
  })
}

async function loadTurnAt(globalIdx) {
  const ref = stateTurns.value[globalIdx]
  if (!ref || !props.appId) {
    activeWireframe.value = null
    return
  }
  const sessionId = String(ref.session_id || '').trim()
  const turnId = Number(ref.turn_id || 0)
  if (!sessionId || !turnId) return
  loadingTurn.value = true
  loadError.value = ''
  try {
    const res = await getNavCaptureTurn(props.appId, sessionId, turnId)
    const row = res?.data || {}
    activeWireframe.value = row.layout_wireframe || null
  } catch (e) {
    loadError.value = e?.response?.data?.detail || e?.message || '加载失败'
    activeWireframe.value = null
  } finally {
    loadingTurn.value = false
  }
}

function selectLocal(idx) {
  activeIndex.value = idx
  loadTurnAt(globalActiveIndex.value)
}

function prevPage() {
  if (page.value <= 1) return
  page.value -= 1
  activeIndex.value = 0
  loadTurnAt(globalActiveIndex.value)
}

function nextPage() {
  if (page.value >= pageCount.value) return
  page.value += 1
  activeIndex.value = 0
  loadTurnAt(globalActiveIndex.value)
}

function prevTurn() {
  if (globalActiveIndex.value <= 0) return
  if (activeIndex.value > 0) {
    activeIndex.value -= 1
  } else if (page.value > 1) {
    page.value -= 1
    activeIndex.value = PAGE_SIZE - 1
  }
  loadTurnAt(globalActiveIndex.value)
}

function nextTurn() {
  if (globalActiveIndex.value >= total.value - 1) return
  if (activeIndex.value < pageTurns.value.length - 1) {
    activeIndex.value += 1
  } else if (page.value < pageCount.value) {
    page.value += 1
    activeIndex.value = 0
  }
  loadTurnAt(globalActiveIndex.value)
}

watch(
  () => [props.stateId, props.turnRefs],
  () => {
    page.value = 1
    activeIndex.value = 0
    activeWireframe.value = null
    if (stateTurns.value.length) loadTurnAt(0)
  },
  { deep: true, immediate: true },
)

onMounted(() => {
  listPanelRef.value?.focus?.()
})

onUnmounted(() => {
  wheelLock = false
})
</script>

<template>
  <div class="capture-preview-layout">
    <aside
      ref="listPanelRef"
      class="capture-list-panel"
      tabindex="0"
      @keydown="onListKeydown"
      @wheel="onListWheel"
    >
      <div class="panel-head">
        <span class="panel-title">采集记录</span>
        <span class="panel-count">{{ total }} 步</span>
      </div>
      <p v-if="total" class="panel-hint">滚轮 / ↑↓ 切换 · 单击复制采集 ID</p>
      <el-empty v-if="!total" description="该页暂无命中采集" :image-size="56" />
      <el-scrollbar v-else class="capture-scroll" max-height="min(72vh, 640px)">
        <button
          v-for="(ref, idx) in pageTurns"
          :key="`${ref.session_id}-${ref.turn_id}`"
          type="button"
          class="capture-item"
          :class="{ active: idx === activeIndex }"
          @click="onItemClick(idx, ref)"
        >
          <span class="capture-item-label">{{ turnLabel(ref, (page - 1) * PAGE_SIZE + idx) }}</span>
          <span class="capture-item-id" :title="captureId(ref)">{{ captureId(ref) }}</span>
          <span class="capture-item-time">{{ formatAt(ref.at) }}</span>
        </button>
      </el-scrollbar>
      <div v-if="total > PAGE_SIZE" class="pager">
        <el-button size="small" :disabled="page <= 1" @click="prevPage">上一页</el-button>
        <span class="pager-text">{{ page }} / {{ pageCount }}</span>
        <el-button size="small" :disabled="page >= pageCount" @click="nextPage">下一页</el-button>
      </div>
      <div v-if="total > 1" class="step-nav">
        <el-button size="small" :disabled="globalActiveIndex <= 0" @click="prevTurn">上一条</el-button>
        <span class="pager-text">{{ globalActiveIndex + 1 }} / {{ total }}</span>
        <el-button size="small" :disabled="globalActiveIndex >= total - 1" @click="nextTurn">下一条</el-button>
      </div>
      <div v-if="showCaptureActions && total" class="capture-actions">
        <el-button size="small" type="warning" plain @click="onSplitCapture">拆成独立页</el-button>
        <el-button size="small" plain @click="onPinCapture">钉到本页</el-button>
      </div>
    </aside>

    <div class="structure-panel" v-loading="loadingTurn">
      <p v-if="loadError" class="load-err">{{ loadError }}</p>
      <NavFsmWireframe
        v-if="displayWireframe"
        :wireframe="displayWireframe"
        :turn-label="title"
        :app-id="appId"
        :state-id="stateId"
        :connect-hotspots="false"
        preview
      />
      <el-empty v-else-if="!loadingTurn" description="无线框数据" :image-size="64" />
    </div>
  </div>
</template>

<style scoped>
.capture-preview-layout {
  display: grid;
  grid-template-columns: minmax(200px, 240px) 1fr;
  gap: 16px;
  align-items: start;
  min-height: 360px;
}

.capture-list-panel {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 10px 10px 12px;
  background: var(--el-fill-color-blank);
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
}

.panel-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.panel-hint {
  margin: 0 0 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

.capture-list-panel:focus {
  outline: none;
}

.capture-list-panel:focus-visible {
  box-shadow: 0 0 0 2px var(--el-color-primary-light-5);
  border-radius: 8px;
}

.capture-scroll {
  margin-bottom: 8px;
}

.capture-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  margin-bottom: 6px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  cursor: pointer;
  font: inherit;
  color: inherit;
}

.capture-item:hover {
  border-color: var(--el-border-color);
}

.capture-item.active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.capture-item-label {
  font-size: 12px;
  font-weight: 600;
}

.capture-item-id {
  margin-top: 4px;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  word-break: break-all;
  color: var(--el-color-primary);
  user-select: none;
}

.capture-item-time {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.capture-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.pager,
.step-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 6px;
}

.pager-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  min-width: 4.5em;
  text-align: center;
}

.structure-panel {
  display: flex;
  justify-content: center;
  min-height: 360px;
}

.load-err {
  color: var(--el-color-danger);
  font-size: 12px;
  margin: 0 0 8px;
}
</style>
