<script setup>
import { computed, ref, watch } from 'vue'
import { getPack } from '@/api/packs'
import { formatElapsed, capabilityLabel, formatCapabilityAction, channelLabel } from '@/utils/testingTasks'
import { checkpointLabel, resolveCheckpointHits } from '@/utils/checkpoints'
import PayloadView from '@/components/PayloadView.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  step: { type: Object, default: null },
  focusUid: { type: String, default: '' },
  hasShot: { type: Boolean, default: false },
  checkpointCatalog: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'focus'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const step = computed(() => props.step || {})
const packMap = ref({})

const packUidOf = (p) => {
  const uid = String(p?.uid || '').trim()
  if (uid) return uid
  if (!p?.id) return ''
  const kind = p.kind || 'recovery'
  return `builtin/${kind}/${p.id}`
}

const statusText = (s) => ({
  continue: '决策',
  done: '完成',
  give_up: '放弃',
  ask_human: '请求人工',
  pass: '成功',
  fail: '失败',
  blocked: '阻塞',
  skipped: '跳过',
  declined: '拒绝',
  partial: '执行超时',
})[s] || s || ''

const statusTone = (s) => {
  if (['done', 'pass'].includes(s)) return 'ok'
  if (['give_up', 'fail', 'declined'].includes(s)) return 'bad'
  if (['ask_human', 'blocked', 'partial'].includes(s)) return 'warn'
  return 'info'
}

const fmtMs = (ms) => formatElapsed(ms) || (ms ? `${ms}ms` : '')

const hasLlmInput = computed(() => step.value?.llm_input != null && step.value?.llm_input !== '')
const hasLlmOutput = computed(() => step.value?.llm_output != null && step.value?.llm_output !== '')
const hasLlmMeta = computed(() => step.value?.llm_meta != null && step.value?.llm_meta !== '')

const recovery = computed(() => step.value?.recovery || null)
const recoveryActions = computed(() => {
  const list = recovery.value?.actions
  return Array.isArray(list) ? list : []
})
const actionLine = computed(() => formatCapabilityAction(step.value?.action))
const isRecoveryStep = computed(() => !!(recovery.value || (step.value?.packs || []).length
  || String(step.value?.cap || '').startsWith('recovery_')))

const systemTrigger = computed(() => recovery.value?.trigger || '')
const systemMatched = computed(() => recovery.value?.matched === true)
const packs = computed(() => step.value?.packs || [])
const knowledge = computed(() => {
  const list = Array.isArray(step.value?.knowledge) ? [...step.value.knowledge] : []
  const seenIds = new Set()
  const seenTitles = new Set()
  const seenBody = new Set()
  const unique = []
  for (const k of list) {
    if (!k) continue
    const id = String(k.uid || k.id || '').trim()
    const titleKey = String(k.title || '').replace(/\s+/g, '').toLowerCase()
    const body = `${String(k.title || '').trim()}\n${String(k.content || '').replace(/\s+/g, ' ').trim()}`
    if (id && seenIds.has(id)) continue
    if (titleKey && seenTitles.has(titleKey)) continue
    if (body !== '\n' && seenBody.has(body)) continue
    if (id) seenIds.add(id)
    if (titleKey) seenTitles.add(titleKey)
    if (body !== '\n') seenBody.add(body)
    unique.push(k)
  }
  unique.sort((a, b) => (Number(b.match_pct) || 0) - (Number(a.match_pct) || 0))
  return unique.slice(0, 3)
})
const checkpoints = computed(() => {
  const ids = step.value?.checkpoints_hit || step.value?.checkpoint_ids || []
  return resolveCheckpointHits(ids, props.checkpointCatalog)
})

const systemLine = computed(() => {
  if (!systemTrigger.value) return ''
  if (systemMatched.value && recovery.value?.rule_id) {
    return `${systemTrigger.value} · 命中 ${recovery.value.rule_id}`
  }
  return `${systemTrigger.value} · 无规则命中`
})

const stepTitle = computed(() => {
  const cap = String(step.value?.cap || step.value?.action?.capability_id || '')
  return capabilityLabel(cap) || '本步详情'
})

const kv = (obj) => Object.entries(obj || {}).map(([k, v]) => `${k}=${v}`)

watch(
  () => [props.modelValue, packs.value.map((p) => packUidOf(p)).filter(Boolean).join('|')].join(':'),
  async () => {
    if (!props.modelValue) return
    const uids = packs.value.map((p) => packUidOf(p)).filter(Boolean)
    await Promise.all(uids.map(async (uid) => {
      if (packMap.value[uid] !== undefined) return
      try {
        const res = await getPack(uid)
        packMap.value = { ...packMap.value, [uid]: res?.data?.item || null }
      } catch {
        packMap.value = { ...packMap.value, [uid]: null }
      }
    }))
  },
  { immediate: true },
)
</script>


<template>
  <el-drawer
    v-model="visible"
    direction="rtl"
    size="35%"
    :modal="!hasShot"
    :with-header="false"
    show-close
    append-to-body
    class="step-detail-drawer"
  >
    <div class="sd">
      <header class="sd-head">
        <p class="sd-kicker">步骤 {{ step.step }}</p>
        <div class="sd-title-row">
          <h3 class="sd-title">{{ stepTitle }}</h3>
          <span v-if="step.status" class="sd-badge" :class="statusTone(step.status)">{{ statusText(step.status) }}</span>
          <span
            v-if="step.result_status && step.result_status !== step.status"
            class="sd-badge"
            :class="statusTone(step.result_status)"
          >{{ statusText(step.result_status) }}</span>
        </div>
        <div class="sd-meta">
          <span v-if="isRecoveryStep">系统恢复</span>
          <span v-if="channelLabel(step.executor)">{{ channelLabel(step.executor) }}</span>
          <span v-if="fmtMs(step.elapsed)">{{ fmtMs(step.elapsed) }}</span>
        </div>
      </header>

      <div class="sd-body">
        <section class="sd-card">
          <h4>本步摘要</h4>
          <div v-if="actionLine" class="sd-field">
            <span class="sd-label">动作</span>
            <span>{{ actionLine }}</span>
          </div>
          <div v-else-if="recoveryActions.length" class="sd-field">
            <span class="sd-label">处置动作</span>
            <ol class="sd-acts">
              <li v-for="(a, i) in recoveryActions" :key="i">
                <code>{{ capabilityLabel(a.capability) || a.capability }}</code>
                <i v-if="a.status">{{ a.status }}</i>
                <span v-if="a.skipped">跳过 {{ a.skipped }}</span>
                <span v-else-if="a.summary">{{ a.summary }}</span>
              </li>
            </ol>
          </div>
          <div v-if="step.thought" class="sd-field">
            <span class="sd-label">思考</span>
            <p>{{ step.thought }}</p>
          </div>
          <div v-if="step.summary" class="sd-field">
            <span class="sd-label">判定</span>
            <p>{{ step.summary }}</p>
          </div>
          <div v-if="step.recoverySummary" class="sd-field">
            <span class="sd-label">恢复</span>
            <p>{{ step.recoverySummary }}</p>
          </div>
          <div v-if="recovery?.error" class="sd-field">
            <span class="sd-label">错误</span>
            <p>{{ recovery.error }}</p>
          </div>
          <p
            v-if="!actionLine && !recoveryActions.length && !step.thought && !step.summary && !step.recoverySummary"
            class="sd-empty"
          >无</p>
        </section>

        <section class="sd-card">
          <h4>策略命中</h4>

          <div class="sd-block">
            <h5>系统预筛</h5>
            <div class="sd-panel">
              <p v-if="systemLine">{{ systemLine }}</p>
              <span v-else class="sd-empty">无</span>
            </div>
          </div>

          <div class="sd-block">
            <h5>恢复规则</h5>
            <div v-if="packs.length" class="sd-stack">
              <article v-for="p in packs" :key="packUidOf(p) || p.id" class="sd-panel">
                <div class="sd-panel-head">
                  <strong>{{ packMap[packUidOf(p)]?.title || p.id }}</strong>
                  <span v-if="p.recovered" class="sd-badge ok">已恢复</span>
                  <span v-else-if="p.mode === 'advise'" class="sd-badge">建议</span>
                </div>
                <dl class="sd-dl">
                  <dt>标识</dt>
                  <dd><code>{{ p.id }}</code></dd>
                  <dt v-if="packMap[packUidOf(p)]?.when">何时</dt>
                  <dd v-if="packMap[packUidOf(p)]?.when">{{ packMap[packUidOf(p)].when }}</dd>
                  <dt v-if="packMap[packUidOf(p)]?.detail?.mode">形态</dt>
                  <dd v-if="packMap[packUidOf(p)]?.detail?.mode">
                    {{ packMap[packUidOf(p)].detail.mode === 'deterministic' ? '命中即执行' : packMap[packUidOf(p)].detail.mode }}
                  </dd>
                  <dt v-if="packMap[packUidOf(p)]?.detail?.match?.evidence && Object.keys(packMap[packUidOf(p)].detail.match.evidence).length">匹配</dt>
                  <dd v-if="packMap[packUidOf(p)]?.detail?.match?.evidence && Object.keys(packMap[packUidOf(p)].detail.match.evidence).length">
                    <code v-for="s in kv(packMap[packUidOf(p)].detail.match.evidence)" :key="s" class="sd-tag">{{ s }}</code>
                  </dd>
                  <dt v-if="packMap[packUidOf(p)]?.detail?.actions?.length">规则动作</dt>
                  <dd v-if="packMap[packUidOf(p)]?.detail?.actions?.length">
                    {{ packMap[packUidOf(p)].detail.actions.map((a) => capabilityLabel(a.capability) || a.capability).join(' → ') }}
                  </dd>
                  <dt v-if="recoveryActions.length">本步实跑</dt>
                  <dd v-if="recoveryActions.length">
                    <ol class="sd-acts">
                      <li v-for="(a, i) in recoveryActions" :key="i">
                        <code>{{ capabilityLabel(a.capability) || a.capability }}</code>
                        <i v-if="a.status">{{ a.status }}</i>
                        <span v-if="a.summary">{{ a.summary }}</span>
                      </li>
                    </ol>
                  </dd>
                </dl>
              </article>
            </div>
            <div v-else class="sd-panel"><span class="sd-empty">无</span></div>
          </div>

          <div class="sd-block">
            <h5>知识库</h5>
            <div v-if="knowledge.length" class="sd-stack">
              <article
                v-for="(k, ki) in knowledge"
                :key="k.uid || k.id || ki"
                class="sd-panel"
                :class="{ skipped: k.used === false }"
              >
                <div class="sd-panel-head">
                  <strong>{{ k.title || k.id }}</strong>
                  <span v-if="k.match_pct != null" class="sd-pct">{{ Number(k.match_pct) || 0 }}%</span>
                </div>
                <div class="sd-bar" aria-hidden="true">
                  <span :style="{ width: `${Math.min(100, Number(k.match_pct) || 0)}%` }" />
                </div>
                <p class="sd-know-note">
                  {{ k.used === false
                    ? (k.skip_reason || '匹配度过低，未注入本步，避免误导模型')
                    : '已注入模型提示' }}
                </p>
                <pre v-if="k.content" class="sd-pre light">{{ k.content }}</pre>
              </article>
            </div>
            <div v-else class="sd-panel"><span class="sd-empty">无</span></div>
          </div>

          <div class="sd-block">
            <h5>本步核对的预期</h5>
            <div class="sd-panel">
              <div v-if="checkpoints.length" class="sd-cp-list">
                <article v-for="cp in checkpoints" :key="cp.id" class="sd-cp">
                  <strong>{{ checkpointLabel(cp) }}</strong>
                  <small v-if="cp.kind">{{ cp.kind === 'process' ? '过程态' : '终态' }}</small>
                </article>
              </div>
              <span v-else class="sd-empty">无</span>
            </div>
          </div>
        </section>

        <section v-if="hasLlmInput" class="sd-card">
          <h4>模型输入</h4>
          <PayloadView :value="step.llm_input" />
        </section>

        <section v-if="hasLlmOutput || hasLlmMeta || step.parse_warnings?.length" class="sd-card">
          <h4>模型输出</h4>
          <PayloadView v-if="hasLlmOutput" :value="step.llm_output" />
          <PayloadView v-if="hasLlmMeta" title="元数据" :value="step.llm_meta" />
          <p v-if="step.parse_warnings?.length" class="sd-warn">
            {{ step.parse_warnings.join('；') }}
          </p>
        </section>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.sd {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #f6f7fb;
}
.sd-head {
  flex-shrink: 0;
  padding: 18px 48px 14px 20px;
  background: #fff;
  border-bottom: 1px solid #e3e8f0;
}
.sd-kicker {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.06em;
  color: #6b7280;
}
.sd-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.sd-title {
  margin: 0;
  font-size: 18px;
  font-weight: 720;
  color: #111827;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-all;
}
.sd-badge {
  font-size: 11px;
  font-weight: 650;
  padding: 2px 8px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4338ca;
}
.sd-badge.ok { background: #ecfdf5; color: #047857; }
.sd-badge.bad { background: #fef2f2; color: #b91c1c; }
.sd-badge.warn { background: #fffbeb; color: #b45309; }
.sd-meta {
  margin-top: 8px;
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #6b7280;
}

.sd-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px;
}
.sd-card {
  background: #fff;
  border: 1px solid #e3e8f0;
  border-radius: 12px;
  padding: 14px 16px 12px;
  margin-bottom: 12px;
}
.sd-card h4 {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 700;
  color: #6b7280;
  letter-spacing: 0.04em;
}
.sd-block { margin-top: 16px; }
.sd-block:first-of-type { margin-top: 10px; }
.sd-block h5 {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 750;
  color: #111827;
  letter-spacing: -0.02em;
  line-height: 1.3;
}
.sd-stack { display: flex; flex-direction: column; gap: 8px; }
.sd-panel {
  padding: 12px 14px;
  border: 1px solid #e3e8f0;
  border-radius: 12px;
  background: #f8fafc;
}
.sd-panel.skipped {
  background: #fffaf5;
  border-color: #fde68a;
}
.sd-panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.sd-panel-head strong {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}
.sd-panel > p {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: #1f2937;
}
.sd-field { margin-bottom: 12px; }
.sd-field:last-child { margin-bottom: 0; }
.sd-label {
  display: block;
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 650;
  color: #9ca3af;
}
.sd-field p {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: #1f2937;
  white-space: pre-wrap;
  word-break: break-word;
}
.sd-field code, .sd-acts code, .sd-dl code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #3730a3;
  word-break: break-all;
}
.sd-field > code { display: block; line-height: 1.5; }
.sd-empty { font-size: 13px; color: #c4c9d4; }

.sd-acts {
  margin: 0;
  padding-left: 18px;
}
.sd-acts li {
  margin-bottom: 6px;
  font-size: 13px;
  color: #1f2937;
  line-height: 1.5;
}
.sd-acts i {
  font-style: normal;
  margin-left: 6px;
  font-size: 11px;
  color: #047857;
}
.sd-acts span { margin-left: 6px; color: #6b7280; font-size: 12px; }

.sd-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.sd-cp-list { display: flex; flex-direction: column; gap: 8px; }
.sd-cp {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sd-cp strong {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  line-height: 1.45;
}
.sd-cp small { font-size: 11px; color: #9ca3af; }
.sd-chip {
  border: 1px solid #e3e8f0;
  background: #f8fafc;
  color: #334155;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
}
.sd-chip.static { cursor: default; }
.sd-chip.active {
  border-color: #c7d2fe;
  background: #eef2ff;
  color: #3730a3;
}
.sd-chip i { font-style: normal; margin-left: 4px; color: #6b7280; }

.sd-know { display: flex; flex-direction: column; gap: 8px; }
.sd-know-item {
  text-align: left;
  padding: 10px 12px;
  border: 1px solid #e3e8f0;
  border-radius: 10px;
  background: #fafbff;
  cursor: pointer;
}
.sd-know-item.skipped {
  background: #fffaf5;
  border-color: #fde68a;
}
.sd-know-item.active {
  border-color: #c7d2fe;
  box-shadow: 0 0 0 1px #c7d2fe;
}
.sd-know-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.sd-know-top strong {
  font-size: 13px;
  font-weight: 650;
  color: #111827;
}
.sd-pct {
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #4f46e5;
}
.sd-panel.skipped .sd-pct { color: #c2410c; }
.sd-panel.skipped .sd-bar { background: #fef3c7; }
.sd-panel.skipped .sd-bar span { background: #f59e0b; }
.sd-panel.skipped .sd-know-note { color: #c2410c; }
.sd-bar {
  margin: 8px 0 6px;
  height: 4px;
  border-radius: 999px;
  background: #eef2ff;
  overflow: hidden;
}
.sd-bar span {
  display: block;
  height: 100%;
  background: #6366f1;
  border-radius: 999px;
}
.sd-know-item.skipped .sd-bar { background: #fef3c7; }
.sd-know-item.skipped .sd-bar span { background: #f59e0b; }
.sd-know-note { font-size: 11px; color: #6b7280; line-height: 1.45; }
.sd-know-item.skipped .sd-know-note { color: #c2410c; }

.sd-inline-pack {
  margin: 4px 0 12px;
  padding: 10px 12px 8px;
  border: 1px solid #e3e8f0;
  border-radius: 10px;
  background: #f8fafc;
}
.sd-inline-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 650;
  color: #111827;
}
.sd-inline-head button {
  border: none;
  background: none;
  padding: 0;
  font-size: 12px;
  color: #6366f1;
  cursor: pointer;
  font-weight: 600;
}
.sd-dl {
  margin: 0;
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 8px 10px;
}
.sd-dl dt { font-size: 11px; color: #9ca3af; padding-top: 2px; }
.sd-dl dd { margin: 0; font-size: 13px; line-height: 1.55; color: #1f2937; }
.sd-tag {
  display: inline-block;
  margin: 0 6px 4px 0;
  padding: 1px 6px;
  border-radius: 4px;
  background: #eef2ff;
  font-size: 12px;
}

.sd-pre {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: #111827;
  color: #e5e7eb;
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 22vh;
  overflow: auto;
}
.sd-pre.light {
  background: #fff;
  color: #1f2937;
  border: 1px solid #e3e8f0;
  max-height: 18vh;
}
.sd-pre.dim { margin-top: 8px; background: #1f2937; color: #cbd5e1; max-height: 12vh; }
.sd-warn { margin: 8px 0 0; font-size: 12px; color: #b45309; }
</style>
