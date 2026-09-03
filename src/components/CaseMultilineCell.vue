<script setup>
import { computed } from 'vue'
import { caseFieldLines, normalizeCaseRow } from '@/utils/caseText'

const props = defineProps({
  row: { type: Object, default: () => ({}) },
  listKey: { type: String, default: '' },
  rawKey: { type: String, required: true },
  numsKey: { type: String, default: '' },
  numbered: { type: Boolean, default: true },
  clamp: { type: Number, default: 3 },
})

const lines = computed(() =>
  caseFieldLines(normalizeCaseRow(props.row), {
    listKey: props.listKey,
    rawKey: props.rawKey,
    numsKey: props.numsKey,
  }),
)
const plain = computed(() => lines.value.map((line) => `${line.num}. ${line.text}`).join('\n'))
</script>

<template>
  <div
    v-if="lines.length"
    class="case-multiline-cell"
    :class="{ 'is-clamp': clamp > 0 }"
    :style="clamp > 0 ? { maxHeight: `calc(1.4em * ${clamp})` } : undefined"
    :title="plain"
  >
    <div v-for="(line, i) in lines" :key="i" class="case-multiline-line">
      <span v-if="numbered" class="case-line-no">{{ line.num }}.</span>
      <span class="case-line-text">{{ line.text }}</span>
    </div>
  </div>
  <span v-else class="case-multiline-empty">—</span>
</template>

<style scoped>
.case-multiline-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0;
  white-space: normal;
  line-height: 1.4;
  font-size: 12px;
  color: #374151;
}
.case-multiline-cell.is-clamp {
  overflow: hidden;
}
.case-multiline-line {
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
.case-multiline-empty {
  color: #c0c4cc;
}
</style>
