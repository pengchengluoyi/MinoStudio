<script setup>
import { ref, watch } from 'vue'
import { classifyExpectLine, classifyStepLine } from '@/utils/caseCatalog'
import { alignCaseStepExpected, fieldsFromPairedCase, splitPreconditionLines } from '@/utils/caseText'
import CasePreconditionChips from '@/components/CasePreconditionChips.vue'

const props = defineProps({
  row: { type: Object, default: () => ({}) },
  editable: { type: Boolean, default: true },
})
const emit = defineEmits(['change'])

const prepText = ref('')
const pairs = ref([])
let hydrating = false

const syncFromRow = () => {
  hydrating = true
  prepText.value = String(props.row?.precondition || props.row?.precondition_raw || '')
  const aligned = alignCaseStepExpected(props.row)
  pairs.value = aligned.length
    ? aligned.map((p) => ({
      num: p.num,
      step: p.step,
      expected: p.expected,
      verify: Boolean(p.expected),
    }))
    : [{ num: 1, step: '', expected: '', verify: false }]
  hydrating = false
}

watch(() => String(props.row?.case_id || props.row?._rowKey || ''), syncFromRow, { immediate: true })

const emitChange = () => {
  if (hydrating) return
  emit('change', fieldsFromPairedCase({
    prepLines: splitPreconditionLines(prepText.value),
    pairs: pairs.value,
  }))
}

watch(prepText, emitChange)

const onPair = () => {
  pairs.value.forEach((p, i) => { p.num = i + 1 })
  emitChange()
}

const addStep = () => {
  const n = (pairs.value[pairs.value.length - 1]?.num || 0) + 1
  pairs.value.push({ num: n, step: '', expected: '', verify: false })
}

const removeStep = (idx) => {
  pairs.value.splice(idx, 1)
  onPair()
}

const lintStep = (text) => classifyStepLine(text)
const lintExpect = (p) => (p.verify ? classifyExpectLine(p.expected) : classifyExpectLine(''))
</script>

<template>
  <div class="paired">
    <section>
      <h5>前置条件</h5>
      <CasePreconditionChips v-model="prepText" :editable="editable" />
    </section>
    <section>
      <h5>测试步骤 × 预期（按编号对照，关掉校验即不验）</h5>
      <div class="head">
        <span class="n">#</span>
        <span>测试步骤</span>
        <span class="tog">校验</span>
        <span>预期效果</span>
        <span class="lint" />
      </div>
      <div v-for="(p, i) in pairs" :key="p.num" class="row">
        <span class="n">{{ p.num }}</span>
        <textarea
          v-if="editable"
          v-model="p.step"
          rows="2"
          placeholder="一步一个动词，如 点击「立即领取」"
          @input="onPair"
        />
        <span v-else class="ro">{{ p.step || '—' }}</span>
        <label class="tog">
          <input v-model="p.verify" type="checkbox" :disabled="!editable" @change="onPair" />
          {{ p.verify ? '要验' : '不验' }}
        </label>
        <textarea
          v-if="editable && p.verify"
          v-model="p.expected"
          rows="2"
          placeholder="与步骤同号，如 出现「领取成功」"
          @input="onPair"
        />
        <span v-else-if="!p.verify" class="skip">不验</span>
        <span v-else class="ro">{{ p.expected || '—' }}</span>
        <span class="lint" :class="p.verify ? lintExpect(p).tone : lintStep(p.step).tone">
          {{ p.verify ? lintExpect(p).label : lintStep(p.step).label }}
        </span>
        <button v-if="editable && pairs.length > 1" type="button" class="x" @click="removeStep(i)">删除</button>
      </div>
      <button v-if="editable" type="button" class="ghost" @click="addStep">添加步骤</button>
    </section>
  </div>
</template>

<style scoped>
.paired { display: flex; flex-direction: column; gap: 14px; }
h5 { margin: 0 0 8px; font-size: 12px; font-weight: 650; color: #6b7280; }
.head, .row {
  display: grid;
  grid-template-columns: 28px minmax(120px, 1.2fr) 64px minmax(120px, 1fr) 88px 48px;
  gap: 8px;
  align-items: start;
  font-size: 12px;
}
.head { color: #9ca3af; }
.n { color: #9ca3af; font-variant-numeric: tabular-nums; padding-top: 6px; }
textarea, .ro, .skip {
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 6px 8px;
  font: inherit;
  line-height: 1.4;
  resize: vertical;
}
.ro, .skip { border-style: dashed; color: #6b7280; background: #f9fafb; min-height: 2.8em; }
.skip { color: #9ca3af; }
.tog { display: flex; align-items: center; gap: 4px; padding-top: 6px; color: #374151; }
.lint { padding-top: 6px; color: #6b7280; }
.lint.success { color: #047857; }
.lint.warning { color: #b45309; }
.lint.danger { color: #b91c1c; }
.ghost, .x {
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
}
.x { color: #9ca3af; }
</style>
