<script setup>
import { Handle, Position } from '@vue-flow/core'
import NavFsmWireframe from '@/views/Testing/NavFsmWireframe.vue'

defineProps({
  id: String,
  data: {
    type: Object,
    default: () => ({
      stateId: '',
      kind: 'page',
      guardsCount: 0,
      hasCalibrate: false,
      wireframe: null,
      showWireframe: false,
    }),
  },
  selected: Boolean,
})
</script>

<template>
  <div
    class="nav-state-node"
    :class="[data.kind, { selected, calibrate: data.hasCalibrate, 'has-wireframe': data.showWireframe }]"
  >
    <Handle type="target" :position="Position.Left" class="nav-handle" />
    <div class="node-body">
      <NavFsmWireframe
        v-if="data.showWireframe"
        :wireframe="data.wireframe"
        :turn-label="data.label || data.stateId"
        :app-id="data.appId || ''"
        compact
      />
      <template v-else>
        <span class="kind-tag">{{ data.kind === 'dialog' ? '弹窗' : '页面' }}</span>
        <strong class="sid" :title="data.stateId">{{ data.label || data.stateId }}</strong>
        <span v-if="data.label && data.label !== data.stateId" class="meta sid-sub">{{ data.stateId }}</span>
      </template>
      <span v-if="data.guardsCount" class="meta">{{ data.guardsCount }} guard</span>
      <span v-if="data.hasCalibrate" class="meta warn">待校准</span>
    </div>
    <Handle type="source" :position="Position.Right" class="nav-handle" />
  </div>
</template>

<style scoped>
.nav-state-node {
  min-width: 148px;
  max-width: 220px;
  border-radius: 10px;
  border: 2px solid #cbd5e1;
  background: #fff;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
  font-size: 12px;
}

.nav-state-node.has-wireframe {
  min-width: 210px;
  max-width: 220px;
}

.nav-state-node.page {
  border-color: #60a5fa;
}

.nav-state-node.dialog {
  border-color: #f59e0b;
  background: #fffbeb;
}

.nav-state-node.selected {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.18);
}

.nav-state-node.calibrate {
  border-style: dashed;
}

.node-body {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.has-wireframe .node-body {
  padding: 6px;
}

.kind-tag {
  font-size: 10px;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.sid {
  font-size: 12px;
  line-height: 1.35;
  word-break: break-all;
}

.sid-sub {
  font-size: 10px;
  opacity: 0.75;
}

.meta {
  font-size: 11px;
  color: #64748b;
}

.meta.warn {
  color: #b45309;
}

.nav-handle {
  width: 8px;
  height: 8px;
  background: #64748b;
  border: 2px solid #fff;
}
</style>
