<script setup>
import { computed, ref } from 'vue'
import { classifyPrepLine, PREP_CATALOG } from '@/utils/caseCatalog'
import { splitPreconditionLines } from '@/utils/caseText'

const props = defineProps({
  modelValue: { type: String, default: '' },
  editable: { type: Boolean, default: true },
})
const emit = defineEmits(['update:modelValue'])

const custom = ref('')
const lines = computed(() => splitPreconditionLines(props.modelValue))
const chips = computed(() => lines.value.map((text) => ({ text, ...classifyPrepLine(text) })))

const emitLines = (next) => {
  const numbered = next.map((t, i) => `${i + 1}. ${t}`).join('\n')
  emit('update:modelValue', numbered)
}

const addSample = (sample) => {
  if (!props.editable) return
  if (lines.value.includes(sample)) return
  emitLines([...lines.value, sample])
}

const addCustom = () => {
  const t = custom.value.trim()
  if (!t) return
  emitLines([...lines.value, t])
  custom.value = ''
}

const removeAt = (idx) => {
  emitLines(lines.value.filter((_, i) => i !== idx))
}
</script>

<template>
  <div class="prep-chips">
    <div v-if="chips.length" class="chip-row">
      <span
        v-for="(chip, i) in chips"
        :key="chip.text + i"
        class="prep-chip"
        :class="chip.tone"
        :title="chip.code"
      >
        {{ chip.text }}
        <em>{{ chip.label }}</em>
        <button v-if="editable" type="button" class="x" @click="removeAt(i)">×</button>
      </span>
    </div>
    <p v-else class="muted">还没有前置。点选库内项。库外 / 做不到的句子会标「无法执行」并跳过，不挡住开跑。</p>
    <template v-if="editable">
      <div class="catalog">
        <button
          v-for="item in PREP_CATALOG"
          :key="item.kind"
          type="button"
          class="ghost"
          :title="item.note || item.sample"
          @click="addSample(item.sample)"
        >{{ item.label }}</button>
      </div>
      <div class="custom">
        <input v-model="custom" placeholder="库外环境句（会标无法识别并跳过）" @keydown.enter.prevent="addCustom" />
        <button type="button" class="ghost" @click="addCustom">添加</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.prep-chips { display: flex; flex-direction: column; gap: 8px; }
.chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
.prep-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  background: #f3f4f6;
  color: #374151;
}
.prep-chip em { font-style: normal; font-size: 11px; color: #6b7280; }
.prep-chip.success { background: #ecfdf5; color: #047857; }
.prep-chip.warning { background: #fffbeb; color: #b45309; }
.prep-chip.danger { background: #fef2f2; color: #b91c1c; }
.prep-chip .x {
  border: 0;
  background: transparent;
  cursor: pointer;
  color: inherit;
  padding: 0 0 0 2px;
}
.catalog, .custom { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.ghost {
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
  color: #374151;
}
.custom input {
  flex: 1;
  min-width: 160px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
}
.muted { margin: 0; font-size: 12px; color: #9ca3af; }
</style>
