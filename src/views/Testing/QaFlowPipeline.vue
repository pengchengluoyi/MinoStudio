<script setup>
import { computed } from 'vue'
import { kindMeta, leaveLabel } from '@/utils/qaWorkflow'

const props = defineProps({
  steps: { type: Array, default: () => [] },
  currentId: { type: String, default: '' },
  selectedId: { type: String, default: '' },
  mode: { type: String, default: 'ticket' },
  showStart: { type: Boolean, default: true },
  track: { type: String, default: '' },
  envSummaries: { type: Array, default: () => [] },
})

const emit = defineEmits(['select'])

const currentIndex = computed(() => props.steps.findIndex((s) => s.id === props.currentId))

const statusOf = (step, idx) => {
  if (props.mode === 'edit') return 'idle'
  const cur = currentIndex.value
  if (cur < 0) return idx === 0 ? 'on' : 'todo'
  if (idx < cur) return 'done'
  if (idx === cur) return 'on'
  return 'todo'
}

const edgeOf = (step) => leaveLabel(step, props.track)

const envTag = (step) => {
  if (step?.kind !== 'dispatch' || !step.env) return ''
  const hit = (props.envSummaries || []).find((s) => s.key === step.env)
  return hit?.label || step.env
}

const onNode = (step) => emit('select', step)
</script>

<template>
  <div class="qa-pipe" :class="`is-${mode}`">
    <template v-if="mode !== 'mini'">
      <div v-if="showStart" class="qa-pipe-unit is-start">
        <span class="qa-pipe-node is-start">
          <i class="qa-pipe-dot done" />
          开始
        </span>
        <span class="qa-pipe-edge" aria-hidden="true">
          <span class="qa-pipe-line" />
        </span>
      </div>
      <div
        v-for="(step, idx) in steps"
        :key="step.id"
        class="qa-pipe-unit"
      >
        <button
          type="button"
          class="qa-pipe-node"
          :class="[
            statusOf(step, idx),
            { selected: selectedId && selectedId === step.id },
          ]"
          :title="step.hint || kindMeta(step.kind).label"
          @click="onNode(step)"
        >
          <i class="qa-pipe-dot" :class="statusOf(step, idx)" />
          <span class="qa-pipe-name">{{ step.label }}</span>
          <span v-if="envTag(step)" class="qa-pipe-env">{{ envTag(step) }}</span>
        </button>
        <span v-if="idx < steps.length - 1" class="qa-pipe-edge">
          <span class="qa-pipe-line" />
          <span v-if="edgeOf(step)" class="qa-pipe-how">{{ edgeOf(step) }}</span>
        </span>
      </div>
    </template>
    <div v-else class="qa-mini" :title="steps.map((s) => s.label).join(' → ')">
      <i
        v-for="(step, idx) in steps"
        :key="step.id"
        class="qa-mini-dot"
        :class="statusOf(step, idx)"
      />
      <span class="qa-mini-name">{{ steps.find((s) => s.id === currentId)?.label || steps[0]?.label || '—' }}</span>
    </div>
  </div>
</template>

<style scoped>
.qa-pipe {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 0;
  row-gap: 18px;
}
.qa-pipe-unit {
  display: inline-flex;
  align-items: center;
}
.qa-pipe-node {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 6px 12px 6px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  background: #fff;
  color: #374151;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.2;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
.qa-pipe-node.is-start {
  cursor: default;
  color: #6b7280;
  background: #f8fafc;
}
.qa-pipe-node.done {
  color: #4b5563;
  background: #f8fafc;
}
.qa-pipe-node.busy {
  border-color: #fcd34d;
}
.qa-pipe-node.next {
  border-color: #c7d2fe;
  color: #4338ca;
}
.qa-pipe-node.on {
  border-color: #f59e0b;
  background: #fffbeb;
  color: #92400e;
  box-shadow: 0 0 0 1px #fcd34d;
}
.qa-pipe-node.selected {
  border-color: #60a5fa;
  background: #eff6ff;
  color: #1d4ed8;
  box-shadow: 0 0 0 1px #93c5fd;
}
.qa-pipe-env {
  font-size: 10px;
  font-weight: 700;
  color: #4f46e5;
  background: #eef2ff;
  padding: 1px 6px;
  border-radius: 999px;
}
.qa-pipe-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #d1d5db;
  flex-shrink: 0;
}
.qa-pipe-dot.done { background: #22c55e; }
.qa-pipe-dot.on { background: #f59e0b; }
.qa-pipe-dot.next { background: #d1d5db; }
.qa-pipe-dot.busy { background: #f59e0b; }
.qa-pipe-dot.idle { background: #d1d5db; }
.qa-pipe-dot.todo { background: #d1d5db; }
.qa-pipe-edge {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 52px;
  height: 28px;
  flex-shrink: 0;
}
.qa-pipe-line {
  display: block;
  width: 100%;
  height: 1px;
  background: #d1d5db;
}
.qa-pipe-how {
  position: absolute;
  left: 50%;
  top: 2px;
  transform: translateX(-50%);
  max-width: 52px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #9ca3af;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  pointer-events: none;
}
.qa-mini {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.qa-mini-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #d1d5db;
  flex-shrink: 0;
}
.qa-mini-dot.done { background: #22c55e; }
.qa-mini-dot.on { background: #f59e0b; }
.qa-mini-dot.next { background: #d1d5db; }
.qa-mini-name {
  margin-left: 4px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #374151;
  font-size: 12px;
  font-weight: 650;
}
</style>
