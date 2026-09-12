<script setup>
import { computed, ref } from 'vue'
import NavFsmWireframe from '@/views/Testing/NavFsmWireframe.vue'

const props = defineProps({
  trajectory: { type: Object, default: null },
})

const viewMode = ref('flow')

const collapsedSteps = computed(() => (Array.isArray(props.trajectory?.steps) ? props.trajectory.steps : []))
const rawSteps = computed(() => (Array.isArray(props.trajectory?.raw_steps) ? props.trajectory.raw_steps : []))
const flowEdges = computed(() => (Array.isArray(props.trajectory?.flow_edges) ? props.trajectory.flow_edges : []))
const flowNodes = computed(() => (Array.isArray(props.trajectory?.flow_nodes) ? props.trajectory.flow_nodes : []))

const shortId = (sid) => {
  const s = String(sid || '').trim()
  if (!s) return '—'
  return s.split('.').slice(-2).join('.')
}

const pkgLabel = (step) => {
  const pkg = String(step?.foreground_package || '').trim()
  const kind = String(step?.screen_kind || '').trim()
  if (!pkg) return kind === 'launcher' ? '系统桌面' : ''
  if (kind === 'launcher' || pkg.includes('launcher')) return `桌面 · ${pkg}`
  if (kind === 'foreign') return `非目标应用 · ${pkg}`
  return pkg
}

const pkgTagType = (step) => {
  const kind = String(step?.screen_kind || '')
  if (kind === 'launcher' || kind === 'foreign') return 'warning'
  if (kind === 'app') return 'success'
  return 'info'
}
</script>

<template>
  <div class="nav-trajectory">
    <div class="traj-head">
      <div class="traj-tabs">
        <button type="button" class="gv-tab" :class="{ active: viewMode === 'flow' }" @click="viewMode = 'flow'">转移图</button>
        <button type="button" class="gv-tab" :class="{ active: viewMode === 'timeline' }" @click="viewMode = 'timeline'">时间线</button>
      </div>
      <span class="muted">
        {{ trajectory?.raw_step_count || collapsedSteps.length }} 原始步
        · {{ trajectory?.collapsed_step_count || collapsedSteps.length }} 折叠后
        · {{ flowEdges.length }} 条转移
      </span>
    </div>

    <div v-if="viewMode === 'flow' && flowEdges.length" class="flow-panel">
      <div class="flow-nodes">
        <div v-for="node in flowNodes" :key="node.state_id" class="flow-node">
          <strong>{{ shortId(node.state_id) }}</strong>
          <span class="muted">×{{ node.visit_count }}</span>
          <el-tag
            v-if="pkgLabel(node.sample)"
            size="small"
            :type="pkgTagType(node.sample)"
            effect="plain"
            class="pkg-tag"
          >{{ pkgLabel(node.sample) }}</el-tag>
        </div>
      </div>
      <div class="traj-edges muted">
        <span v-for="e in flowEdges" :key="e.id" class="traj-edge-pill">
          {{ shortId(e.from) }} → {{ shortId(e.to) }} <strong>({{ e.count }})</strong>
        </span>
      </div>
      <p class="hint">转移图按屏态聚合，同一条边可多次走过（并行统计），不是时间线上的串行重复。</p>
    </div>

    <div v-else-if="viewMode === 'flow'" class="muted empty-hint">暂无转移 — localize 命中过少</div>

    <div v-if="viewMode === 'timeline' && collapsedSteps.length" class="traj-scroll">
      <div
        v-for="(step, idx) in collapsedSteps"
        :key="`${step.session_id}-${step.turn_from}-${step.turn_to}`"
        class="traj-step"
      >
        <div class="traj-meta">
          <strong>#{{ step.turn_from }}<template v-if="step.turn_to !== step.turn_from">–{{ step.turn_to }}</template></strong>
          <span class="muted">{{ shortId(step.localize_chosen || step.state_id) }}</span>
          <el-tag
            v-if="pkgLabel(step)"
            size="small"
            :type="pkgTagType(step)"
            effect="plain"
            class="pkg-tag"
          >{{ pkgLabel(step) }}</el-tag>
          <span v-if="(step.dwell_count || 1) > 1" class="dwell">停留 {{ step.dwell_count }} 步</span>
        </div>
        <NavFsmWireframe :wireframe="step.wireframe" />
        <span v-if="idx < collapsedSteps.length - 1" class="traj-arrow" aria-hidden="true">→</span>
      </div>
    </div>
    <p v-else-if="viewMode === 'timeline'" class="muted empty-hint">暂无轨迹 — 跑用例后自动出现</p>

    <details v-if="rawSteps.length" class="raw-detail">
      <summary class="muted">最近 {{ rawSteps.length }} 个原始 turn（调试用）</summary>
      <div class="raw-list">
        <span v-for="s in rawSteps" :key="`raw-${s.session_id}-${s.turn_id}`" class="raw-pill">
          #{{ s.turn_id }} {{ shortId(s.localize_chosen) || '—' }}
        </span>
      </div>
    </details>
  </div>
</template>

<style scoped>
.nav-trajectory {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.traj-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
}

.traj-tabs {
  display: flex;
  gap: 6px;
}

.gv-tab {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.gv-tab.active {
  border-color: #6366f1;
  color: #4338ca;
  background: #eef2ff;
}

.flow-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.flow-nodes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.flow-node {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
  font-size: 12px;
}

.pkg-tag {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hint {
  margin: 0;
  font-size: 11px;
  color: #64748b;
}

.traj-scroll {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 8px;
  align-items: flex-start;
}

.traj-step {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 160px;
}

.traj-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
}

.dwell {
  color: #64748b;
  font-size: 10px;
}

.traj-arrow {
  position: absolute;
  right: -14px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  font-size: 18px;
}

.traj-edges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 10px;
}

.traj-edge-pill {
  padding: 2px 8px;
  border-radius: 999px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
}

.empty-hint {
  margin: 0;
  font-size: 12px;
}

.raw-detail {
  font-size: 11px;
}

.raw-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.raw-pill {
  padding: 2px 6px;
  border-radius: 4px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
</style>
