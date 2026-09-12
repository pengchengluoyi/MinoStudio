<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import NavFsmStateNode from '@/views/Testing/NavFsmStateNode.vue'
import {
  CALIBRATE_MARK,
  docToFlow,
  flowToDoc,
  newNavEdgeSkeleton,
  newStateSkeleton,
  removeStateFromDoc,
  renameStateInDoc,
} from '@/utils/navFsmGraph'

const props = defineProps({
  doc: { type: Object, default: null },
  appId: { type: String, default: '' },
  projectId: { type: String, default: '' },
  /** preview：只读缩略图；edit：完整编辑 */
  mode: { type: String, default: 'edit' },
  /** 架构预览：structure=Tab+子页；nav=页面跳转 */
  archView: { type: String, default: 'structure' },
})

const isPreview = computed(() => props.mode === 'preview')

const emit = defineEmits(['update:doc'])

const nodes = ref([])
const edges = ref([])
const ready = ref(false)
const flowReady = ref(false)
const selectedNodeId = ref('')
const selectedEdgeId = ref('')
const inspectorJson = ref('')
const lastImportedSig = ref('')

const { fitView } = useVueFlow()

let emitTimer = null
const scheduleEmit = () => {
  if (emitTimer) clearTimeout(emitTimer)
  emitTimer = setTimeout(() => {
    emitTimer = null
    emitDoc()
  }, 120)
}

const baseDoc = computed(() => {
  if (!props.doc || typeof props.doc !== 'object') {
    return {
      app_id: props.appId,
      project_id: props.projectId,
      version: 'v1',
      meta: {},
      test_data: {},
      states: [],
      edges: [],
    }
  }
  return props.doc
})

const selectedNode = computed(() => nodes.value.find((n) => n.id === selectedNodeId.value && n.type === 'navState'))
const selectedEdge = computed(() => edges.value.find((e) => e.id === selectedEdgeId.value))

const stateOptions = computed(() =>
  nodes.value
    .filter((n) => n.type === 'navState')
    .map((n) => ({ id: n.id, label: n.data?.stateId || n.id })),
)

const syncFromDoc = (doc) => {
  const { nodes: n, edges: e } = docToFlow(doc || baseDoc.value, {
    preferAutoLayout: isPreview.value,
    previewMode: isPreview.value,
    archView: props.archView,
    appId: props.appId,
  })
  nodes.value = n
  edges.value = e
  ready.value = true
  if (flowReady.value) {
    nextTick(() => fitView({ padding: 0.2, duration: 200 }))
  }
}

const onPaneReady = () => {
  flowReady.value = true
  nextTick(() => fitView({ padding: 0.2, duration: 200 }))
}

const emitDoc = () => {
  const next = flowToDoc(nodes.value, edges.value, baseDoc.value)
  if (props.appId && !next.app_id) next.app_id = props.appId
  if (props.projectId && !next.project_id) next.project_id = props.projectId
  try {
    lastImportedSig.value = JSON.stringify(next)
  } catch {
    lastImportedSig.value = String(Date.now())
  }
  emit('update:doc', next)
}

watch(() => props.doc, (doc) => {
  let sig = ''
  try {
    sig = JSON.stringify(doc || {})
  } catch {
    sig = String(Date.now())
  }
  if (sig === lastImportedSig.value) return
  lastImportedSig.value = sig
  syncFromDoc(doc)
}, { immediate: true })

watch(() => props.archView, () => {
  syncFromDoc(props.doc || baseDoc.value)
})

const onConnect = (params) => {
  if (isPreview.value) return
  const source = String(params.source || '')
  const target = String(params.target || '')
  if (!source || !target) return

  const dup = edges.value.some(
    (e) => (e.type === 'navEdge' || e.type === 'smoothstep') && e.source === source && e.target === target,
  )
  if (dup) {
    ElMessage.warning('这条导航边已存在')
    return
  }
  const sk = newNavEdgeSkeleton(source, target)
  edges.value = [
    ...edges.value,
    {
      id: sk.id,
      source,
      target,
      type: 'smoothstep',
      data: { edge: sk },
      style: { stroke: '#64748b', strokeWidth: 1.5 },
    },
  ]
  emitDoc()
}

const onSelectionChange = ({ nodes: selNodes = [], edges: selEdges = [] }) => {
  selectedNodeId.value = selNodes[0]?.id || ''
  selectedEdgeId.value = selEdges[0]?.id || ''
  if (selNodes[0]?.type === 'navState') {
    inspectorJson.value = JSON.stringify(selNodes[0].data?.state || {}, null, 2)
  } else if (selEdges[0]) {
    inspectorJson.value = JSON.stringify(selEdges[0].data?.edge || {}, null, 2)
  } else {
    inspectorJson.value = ''
  }
}

const onNodesChange = () => {
  if (!isPreview.value) scheduleEmit()
}

const onEdgesChange = () => {
  if (!isPreview.value) scheduleEmit()
}

const addState = async (kind) => {
  const label = kind === 'dialog' ? '弹窗' : '页面'
  try {
    const { value } = await ElMessageBox.prompt(`新状态 id（如 page.feed.list）`, `添加${label}`, {
      confirmButtonText: '添加',
      inputPattern: /^[a-z][a-z0-9_.-]+$/i,
      inputErrorMessage: '用小写字母、数字、点、下划线',
      inputValue: kind === 'dialog' ? 'dialog.new' : 'page.new',
    })
    const sid = String(value || '').trim()
    if (nodes.value.some((n) => n.id === sid)) {
      ElMessage.error('state_id 已存在')
      return
    }
    const st = newStateSkeleton(sid, kind)
    const pos = { x: 120 + nodes.value.length * 40, y: 120 + (kind === 'dialog' ? 80 : 0) }
    nodes.value = [
      ...nodes.value,
      {
        id: sid,
        type: 'navState',
        position: pos,
        data: {
          stateId: sid,
          kind,
          guardsCount: 0,
          hasCalibrate: true,
          state: st,
        },
      },
    ]
    emitDoc()
  } catch (_) { /* cancel */ }
}

const removeSelected = async () => {
  if (selectedNode.value) {
    try {
      await ElMessageBox.confirm(`删除状态 ${selectedNode.value.id}？关联边会一并移除。`, '删除', { type: 'warning' })
      const nextDoc = removeStateFromDoc(flowToDoc(nodes.value, edges.value, baseDoc.value), selectedNode.value.id)
      syncFromDoc(nextDoc)
      emit('update:doc', nextDoc)
      selectedNodeId.value = ''
    } catch (_) { /* cancel */ }
    return
  }
  if (selectedEdge.value) {
    edges.value = edges.value.filter((e) => e.id !== selectedEdge.value.id)
    selectedEdgeId.value = ''
    emitDoc()
  }
}

const applyInspector = () => {
  try {
    const parsed = JSON.parse(inspectorJson.value || '{}')
    if (selectedNode.value) {
      const sid = String(parsed.id || selectedNode.value.id).trim()
      const oldId = selectedNode.value.id
      nodes.value = nodes.value.map((n) => {
        if (n.id !== oldId) return n
        const kind = String(parsed.kind || n.data.kind)
        const guards = parsed.guards || {}
        return {
          ...n,
          id: sid,
          data: {
            ...n.data,
            stateId: sid,
            kind,
            guardsCount: Object.keys(guards).length,
            hasCalibrate: JSON.stringify(parsed).includes(CALIBRATE_MARK),
            state: parsed,
          },
        }
      })
      if (sid !== oldId) {
        edges.value = edges.value.map((e) => {
          if (e.type !== 'navEdge' && e.type !== 'smoothstep') return e
          return {
            ...e,
            source: e.source === oldId ? sid : e.source,
            target: e.target === oldId ? sid : e.target,
            data: {
              edge: {
                ...(e.data?.edge || {}),
                from: e.source === oldId ? sid : e.source,
                to: e.target === oldId ? sid : e.target,
              },
            },
          }
        })
      }
      let next = flowToDoc(nodes.value, edges.value, baseDoc.value)
      if (sid !== oldId) next = renameStateInDoc(next, oldId, sid)
      syncFromDoc(next)
      emit('update:doc', next)
      ElMessage.success('状态已更新')
      return
    }
    if (selectedEdge.value) {
      const eid = String(parsed.id || selectedEdge.value.id).trim()
      edges.value = edges.value.map((e) => {
        if (e.id !== selectedEdge.value.id) return e
        const from = String(parsed.from || e.source)
        const to = String(parsed.to || e.target)
        return {
          ...e,
          id: eid,
          source: from,
          target: to,
          type: 'smoothstep',
          data: { edge: { ...parsed, id: eid, kind: 'nav', from, to } },
        }
      })
      emitDoc()
      ElMessage.success('边已更新')
    }
  } catch (e) {
    ElMessage.error(e?.message || 'JSON 无效')
  }
}

const fit = () => fitView({ padding: 0.2, duration: 300 })
</script>

<template>
  <div class="nav-graph-editor" :class="{ 'is-preview': isPreview }">
    <div class="graph-toolbar">
      <template v-if="!isPreview">
        <el-button size="small" @click="addState('page')">+ 页面</el-button>
        <el-button size="small" @click="addState('dialog')">+ 弹窗</el-button>
        <el-button size="small" type="danger" plain :disabled="!selectedNode && !selectedEdge" @click="removeSelected">
          删除选中
        </el-button>
      </template>
      <el-button size="small" @click="fit">适配视图</el-button>
    </div>

    <div class="graph-layout" :class="{ 'is-preview': isPreview }">
      <div class="graph-canvas-wrap">
        <VueFlow
          v-if="ready"
          v-model:nodes="nodes"
          v-model:edges="edges"
          :default-zoom="1"
          :min-zoom="0.25"
          :max-zoom="2.5"
          :nodes-draggable="!isPreview"
          :nodes-connectable="!isPreview"
          :elements-selectable="!isPreview"
          fit-view-on-init
          class="graph-canvas"
          @connect="onConnect"
          @nodes-change="onNodesChange"
          @edges-change="onEdgesChange"
          @selection-change="onSelectionChange"
          @pane-ready="onPaneReady"
        >
          <template #node-navState="nodeProps">
            <NavFsmStateNode v-bind="nodeProps" />
          </template>
          <Background pattern-color="rgba(203, 213, 225, 0.45)" :gap="18" />
          <Controls v-if="!isPreview" />
          <MiniMap v-if="!isPreview" />
        </VueFlow>
        <p v-else class="empty-hint">加载中…</p>
      </div>

      <aside v-if="!isPreview" class="graph-inspector">
        <div class="inspector-title">属性</div>
        <p v-if="!selectedNode && !selectedEdge" class="inspector-empty">
          选中节点或边以编辑 JSON。位置拖拽会自动写入 <code>meta.studio_layout</code>。
        </p>
        <template v-else>
          <p class="inspector-kind">
            {{ selectedNode ? `状态 · ${selectedNode.data?.stateId}` : `边 · ${selectedEdge?.id}` }}
          </p>
          <el-input
            v-model="inspectorJson"
            type="textarea"
            :rows="18"
            class="inspector-json"
          />
          <el-button size="small" type="primary" @click="applyInspector">应用 JSON</el-button>
        </template>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.nav-graph-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
  height: 100%;
}

.nav-graph-editor.is-preview {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.nav-graph-editor.is-preview .graph-canvas-wrap {
  flex: 1;
  min-height: 200px;
  height: 100%;
}

.graph-layout.is-preview {
  grid-template-columns: minmax(0, 1fr);
}

.graph-canvas-wrap :deep(.vue-flow__node) {
  overflow: visible;
}

.graph-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.toolbar-hint {
  font-size: 12px;
  color: var(--settings-muted, #64748b);
}

.graph-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 12px;
  flex: 1;
  min-height: 200px;
  overflow: hidden;
}

.graph-canvas-wrap {
  min-height: 200px;
  height: 100%;
  border: 1px solid var(--settings-border, #e2e8f0);
  border-radius: 10px;
  overflow: hidden;
  background: #f8fafc;
}

.graph-canvas {
  width: 100%;
  height: 100%;
  min-height: 200px;
}

.graph-inspector {
  border: 1px solid var(--settings-border, #e2e8f0);
  border-radius: 10px;
  padding: 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow: auto;
}

.inspector-title {
  font-size: 13px;
  font-weight: 700;
}

.inspector-kind {
  margin: 0;
  font-size: 12px;
  color: #475569;
}

.inspector-empty {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}

.inspector-json :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}

.empty-hint {
  padding: 24px;
  color: #64748b;
  font-size: 13px;
}

@media (max-width: 1100px) {
  .graph-layout {
    grid-template-columns: 1fr;
  }

  .graph-inspector {
    min-height: 280px;
  }
}
</style>
