<script setup>
import { computed } from 'vue'
import { alignCaseStepExpected } from '@/utils/caseText'

const props = defineProps({
  row: { type: Object, default: () => ({}) },
  field: { type: String, required: true }, // 'step' | 'expected'
  clamp: { type: Number, default: 3 },
})

const pairs = computed(() => alignCaseStepExpected(props.row))
const emptyLabel = computed(() => (props.field === 'expected' ? '不验' : '—'))
const plain = computed(() => pairs.value
  .map((p) => {
    const text = props.field === 'step' ? p.step : p.expected
    return text ? `${p.num}. ${text}` : `${p.num}. ${emptyLabel.value}`
  })
  .join('\n'))
</script>

<template>
  <div
    v-if="pairs.length"
    class="case-aligned-cell"
    :class="{ 'is-clamp': clamp > 0 }"
    :style="clamp > 0 ? { maxHeight: `calc(1.4em * ${clamp})` } : undefined"
    :title="plain"
  >
    <div v-for="p in pairs" :key="p.num" class="case-aligned-line">
      <template v-if="field === 'step' ? p.step : p.expected">
        <span class="case-line-no">{{ p.num }}.</span>
        <span class="case-line-text">{{ field === 'step' ? p.step : p.expected }}</span>
      </template>
      <span v-else class="case-line-empty">{{ p.num }}. {{ emptyLabel }}</span>
    </div>
  </div>
  <span v-else class="case-line-empty">—</span>
</template>

<style scoped>
.case-aligned-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0;
  white-space: normal;
  line-height: 1.4;
  font-size: 12px;
  color: #374151;
}
.case-aligned-cell.is-clamp {
  overflow: hidden;
}
.case-aligned-line {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  line-height: 1.4;
  word-break: break-word;
}
.case-line-no {
  flex-shrink: 0;
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
  min-width: 1.2em;
}
.case-line-text {
  flex: 1;
  min-width: 0;
}
.case-line-empty {
  color: #c0c4cc;
  font-size: 12px;
}
</style>
