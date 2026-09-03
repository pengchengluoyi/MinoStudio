<script setup>
import { computed } from 'vue'
import { COVERAGE_LABEL, COVERAGE_TONE } from '@/utils/caseCatalog'
import { alignCaseStepExpected } from '@/utils/caseText'

const props = defineProps({
  coverage: { type: Object, default: null },
  spec: { type: Object, default: null },
})

const prep = computed(() => props.coverage?.prep || [])
const steps = computed(() => {
  if (props.coverage?.steps?.length) return props.coverage.steps
  return alignCaseStepExpected(props.spec || {}).map((p) => ({
    n: p.num,
    text: p.step,
    code: '',
  }))
})
const expects = computed(() => {
  const map = {}
  if (props.coverage?.expects?.length) {
    for (const e of props.coverage.expects) map[e.n] = e
    return map
  }
  for (const p of alignCaseStepExpected(props.spec || {})) {
    map[p.num] = {
      n: p.num,
      text: p.expected,
      code: p.expected ? '' : 'EXPECT.SKIPPED.no_expect',
    }
  }
  return map
})
const cls = computed(() => props.coverage?.coverage_class || '')
const label = computed(() => props.coverage?.coverage_label || COVERAGE_LABEL[cls.value] || '')

const expectText = (n) => {
  const e = expects.value[n]
  if (!e) return ''
  if (e.code === 'EXPECT.SKIPPED.no_expect') {
    return cls.value === 'step_unexecutable' ? '无法执行' : '不验'
  }
  return e.text || ''
}
const expectCode = (n) => expects.value[n]?.code || ''
const stepTone = (code) => {
  const c = String(code || '')
  if (c.startsWith('STEP.OK') || c.startsWith('STEP.HEALED')) return 'ok'
  if (c.includes('UNSUPPORTED') || c.includes('UNKNOWN') || c.includes('FAIL')) return 'bad'
  if (c.includes('SKIPPED') || (c.includes('no_expect') && cls.value !== 'step_unexecutable')) return 'skip'
  if (c.includes('no_expect')) return 'bad'
  return ''
}
</script>

<template>
  <section v-if="prep.length || steps.length" class="rail">
    <div class="kicker">
      <span>用例步骤</span>
      <span v-if="label" class="cls" :class="COVERAGE_TONE[cls] || ''">{{ label }}</span>
    </div>
    <div v-if="prep.length" class="prep">
      <span
        v-for="p in prep"
        :key="p.seq"
        class="chip"
        :class="{ bad: (p.code || '').includes('UNKNOWN') || (p.code || '').includes('UNSUPPORTED') || (p.code || '').includes('UNMET') || (p.code || '').includes('FAIL') }"
        :title="p.code"
      >{{ p.text || p.kind }}</span>
    </div>
    <ol>
      <li v-for="s in steps" :key="s.n" :class="stepTone(s.code)">
        <strong>{{ s.n }}</strong>
        <div>
          <p>{{ s.text }}</p>
          <small>{{ expectText(s.n) || '不验' }} · {{ expectCode(s.n) || s.code }}</small>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.rail { margin: 0 0 12px; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; }
.kicker { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #6b7280; margin-bottom: 8px; }
.cls { padding: 1px 8px; border-radius: 999px; background: #f3f4f6; }
.cls.success { background: #ecfdf5; color: #047857; }
.cls.warning { background: #fffbeb; color: #b45309; }
.cls.danger { background: #fef2f2; color: #b91c1c; }
.prep { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.chip { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #ecfdf5; color: #047857; }
.chip.bad { background: #fef2f2; color: #b91c1c; }
ol { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
li { display: flex; gap: 8px; font-size: 12px; color: #374151; }
li strong { width: 18px; color: #9ca3af; font-variant-numeric: tabular-nums; }
li p { margin: 0; }
li small { color: #9ca3af; }
li.ok strong { color: #047857; }
li.bad strong { color: #b91c1c; }
li.skip { opacity: 0.7; }
</style>
