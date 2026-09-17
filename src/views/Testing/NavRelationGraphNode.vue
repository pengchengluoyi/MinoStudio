<script setup>
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import NavFsmWireframe from '@/views/Testing/NavFsmWireframe.vue'
import { archGraphContext, archGraphHover, archGraphLeave } from '@/utils/navGraphArchBridge'
import { LAYOUT_CLASS_LABELS } from '@/utils/navRelationGraph'

const props = defineProps({
  node: { type: Object, default: null },
})

const nodeData = computed(() => props.node?.data || {})
const isRoot = computed(() => props.node?.id === '__nav_app_root__')
const isBlockShell = computed(() => Boolean(nodeData.value.blockShell))
const isArch = computed(() => Boolean(nodeData.value.archInteract))

const onEnter = (e) => {
  if (!isArch.value || isRoot.value) return
  archGraphHover(props.node, e)
}
const onLeave = () => {
  if (!isArch.value) return
  archGraphLeave()
}

const onContextMenu = (e) => {
  if (!isArch.value || isRoot.value) return
  e.preventDefault()
  archGraphContext(props.node, e)
}

const onDblClick = async () => {
  if (!isArch.value || isRoot.value || isBlockShell.value) return
  const id = String(nodeData.value.stateId || props.node?.id || '').trim()
  if (!id) return
  try {
    await navigator.clipboard.writeText(id)
    ElMessage.success(`已复制 ${id}`)
  } catch {
    ElMessage.error('复制失败')
  }
}
</script>

<template>
  <div
    v-if="isBlockShell"
    class="rg-flow-block-shell"
  >
    <span class="shell-title">{{ node?.text || '业务流' }}</span>
  </div>
  <div
    v-else-if="isRoot"
    class="rg-nav-node root"
    @pointerenter.capture="onEnter"
    @pointerleave.capture="onLeave"
  >
    <strong class="title">{{ node?.text }}</strong>
  </div>
  <div
    v-else
    class="rg-nav-node"
    :class="{
      entry: nodeData.entry,
      dialog: nodeData.kind === 'dialog',
      'has-wf': nodeData.showWireframe,
      'is-arch-wf': isArch && nodeData.showWireframe,
      'flow-block': Boolean(nodeData.flowBlockId),
      'tab-icon': nodeData.tabSlotKind === 'icon',
      'tab-mixed': nodeData.tabSlotKind === 'mixed',
    }"
    @pointerenter.capture="onEnter"
    @pointerleave.capture="onLeave"
    @contextmenu.capture="onContextMenu"
    @dblclick.capture="onDblClick"
  >
    <strong v-if="nodeData.showWireframe" class="node-head">{{ node?.text || nodeData.stateId }}</strong>
    <p v-if="nodeData.showWireframe && nodeData.subhead" class="node-sub muted">{{ nodeData.subhead }}</p>
    <p v-if="nodeData.showWireframe && nodeData.flowBlockName" class="node-flow muted">
      流 · {{ nodeData.flowBlockName }}
    </p>
    <div
      v-if="nodeData.showWireframe && (nodeData.layoutClass || nodeData.morphCount)"
      class="layout-badges"
    >
      <span v-if="nodeData.layoutClass" class="lb layout">
        {{ LAYOUT_CLASS_LABELS[nodeData.layoutClass] || nodeData.layoutClass }}
      </span>
      <span v-if="nodeData.morphCount > 0" class="lb morph">多态 {{ nodeData.morphCount }}</span>
      <span v-if="nodeData.evidenceTier" class="lb tier">{{ nodeData.evidenceTier }}</span>
    </div>
    <NavFsmWireframe
      v-if="nodeData.showWireframe"
      :wireframe="nodeData.wireframe"
      :app-id="nodeData.appId || ''"
      :state-id="nodeData.stateId || node?.id || ''"
      :layout-class="nodeData.layoutClass || ''"
      :layout-extent="nodeData.layoutExtent || null"
      :connect-hotspots="Boolean(nodeData.connectHotspots)"
      :editable-hotspots="Boolean(nodeData.editableHotspots)"
      :nav-outgoing="nodeData.navOutgoing || []"
      graph-node
      :arch-canvas="isArch"
    />
    <template v-else>
      <span v-if="nodeData.entry" class="kind-tag">
        {{ nodeData.tabSlotKind === 'icon' ? 'Tab · 图标' : 'Tab' }}
      </span>
      <span v-else-if="nodeData.kind === 'dialog'" class="kind-tag warn">弹窗</span>
      <strong class="title">{{ node?.text || nodeData.stateId }}</strong>
      <span v-if="nodeData.tabSlotParts?.length" class="slot-parts muted">
        {{ nodeData.tabSlotParts.join(' + ') }}
      </span>
    </template>
    <div
      v-if="
        !nodeData.showWireframe
          && !isArch
          && (nodeData.intelWikiCount || nodeData.intelDocCount || nodeData.intelMissingWiki)
      "
      class="intel-badges"
    >
      <span v-if="nodeData.intelWikiCount" class="badge wiki">知 {{ nodeData.intelWikiCount }}</span>
      <span v-if="nodeData.intelDocCount" class="badge doc">文 {{ nodeData.intelDocCount }}</span>
      <span v-if="nodeData.intelMissingWiki" class="badge gap">缺 wiki</span>
    </div>
  </div>
</template>

<style scoped>
.rg-flow-block-shell {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-height: 100%;
  border: 2px dashed rgba(99, 102, 241, 0.45);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(238, 242, 255, 0.92) 0%, rgba(248, 250, 252, 0.55) 100%);
  pointer-events: none;
  position: relative;
}

.shell-title {
  position: absolute;
  top: 10px;
  left: 14px;
  font-size: 12px;
  font-weight: 700;
  color: #4338ca;
  letter-spacing: 0.02em;
}

.rg-nav-node {
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  height: auto;
  pointer-events: auto;
  padding: 6px;
  border-radius: 10px;
  background: #fff;
  border: 2px solid #93c5fd;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;
}

.rg-nav-node.root {
  border-color: #cbd5e1;
  background: #f1f5f9;
  justify-content: center;
  align-items: center;
  min-height: 40px;
}

.rg-nav-node.has-wf {
  padding: 4px 4px 6px;
  overflow: hidden;
  min-height: 0;
  height: 100%;
  max-height: 100%;
}

.rg-nav-node.is-arch-wf {
  overflow: hidden;
  height: 100% !important;
  max-height: 100% !important;
}

.rg-nav-node.is-arch-wf :deep(.nav-wireframe) {
  flex: 1 1 auto;
  min-height: 0;
}

.node-head {
  font-size: 11px;
  font-weight: 700;
  line-height: 1.3;
  color: #0f172a;
  word-break: break-word;
  flex-shrink: 0;
  max-height: 2.6em;
  overflow: hidden;
}

.node-sub {
  margin: 0;
  font-size: 10px;
  line-height: 1.25;
  flex-shrink: 0;
  max-height: 2.5em;
  overflow: hidden;
}

.layout-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex-shrink: 0;
}

.lb {
  font-size: 9px;
  line-height: 1.2;
  padding: 1px 5px;
  border-radius: 4px;
  background: #e2e8f0;
  color: #334155;
}

.lb.morph {
  background: #fef3c7;
  color: #92400e;
}

.lb.tier {
  background: #ede9fe;
  color: #5b21b6;
}

.rg-nav-node.flow-block {
  border-color: #6366f1;
  box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.15);
}

.node-flow {
  margin: 0;
  font-size: 10px;
  line-height: 1.25;
  color: #4f46e5;
  flex-shrink: 0;
}

.rg-nav-node.entry {
  border-color: #3b82f6;
  background: #eff6ff;
  justify-content: center;
  align-items: center;
  min-height: 56px;
  height: 100%;
}

.rg-nav-node.dialog {
  border-color: #f59e0b;
  background: #fffbeb;
}

.kind-tag {
  font-size: 10px;
  color: #64748b;
}

.kind-tag.warn {
  color: #b45309;
}

.title {
  font-size: 12px;
  line-height: 1.3;
  word-break: break-word;
}

.intel-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: auto;
}

.badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
}

.badge.wiki {
  background: #ecfdf5;
  color: #047857;
}

.badge.doc {
  background: #eff6ff;
  color: #1d4ed8;
}

.badge.gap {
  background: #fef2f2;
  color: #b91c1c;
}

.rg-nav-node.tab-icon {
  border-color: #a78bfa;
  background: #f5f3ff;
}

.slot-parts {
  font-size: 10px;
  line-height: 1.2;
}
</style>
