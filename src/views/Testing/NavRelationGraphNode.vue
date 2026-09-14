<script setup>
import { computed } from 'vue'
import NavFsmWireframe from '@/views/Testing/NavFsmWireframe.vue'
import { archGraphContext, archGraphHover, archGraphLeave } from '@/utils/navGraphArchBridge'

const props = defineProps({
  node: { type: Object, default: null },
})

const nodeData = computed(() => props.node?.data || {})
const isRoot = computed(() => props.node?.id === '__nav_app_root__')
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
</script>

<template>
  <div
    v-if="isRoot"
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
      'tab-icon': nodeData.tabSlotKind === 'icon',
      'tab-mixed': nodeData.tabSlotKind === 'mixed',
    }"
    @pointerenter.capture="onEnter"
    @pointerleave.capture="onLeave"
    @contextmenu.capture="onContextMenu"
  >
    <strong v-if="nodeData.showWireframe" class="node-head">{{ node?.text || nodeData.stateId }}</strong>
    <p v-if="nodeData.showWireframe && nodeData.subhead" class="node-sub muted">{{ nodeData.subhead }}</p>
    <NavFsmWireframe
      v-if="nodeData.showWireframe"
      :wireframe="nodeData.wireframe"
      :app-id="nodeData.appId || ''"
      :state-id="nodeData.stateId || node?.id || ''"
      :connect-hotspots="Boolean(nodeData.connectHotspots)"
      :editable-hotspots="Boolean(nodeData.editableHotspots)"
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
