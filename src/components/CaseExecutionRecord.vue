<script setup>
/** 选中步骤的可读记录。模型原文和原始事件默认收起。 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { getSessionEvents } from '@/api/caseRunner'
import { listDispatchCalls } from '@/api/settings'
import PayloadView from '@/components/PayloadView.vue'
import { fmtElapsed, fmtTokens, jobLabel, statusLabel } from '@/utils/dispatchLog'

const props = defineProps({
  sessionId: { type: String, default: '' },
  turn: { type: Number, default: null },
  live: { type: Boolean, default: false },
})

const NOISE = new Set([
  'context/slots',
  'context/trace',
  'context/menu',
  'stream/emit',
  'turn/start',
  'observe/hierarchy',
  'observe/screen',
  'app/version',
  'milestone/skip_applied',
  'llm/request',
  'tool/call',
])

const loading = ref(false)
const events = ref([])
const calls = ref([])
const scope = ref('turn')
const openId = ref('')
const showRaw = ref(false)
const pickedTurn = ref(null)
let pollTimer = 0

const callById = computed(() => {
  const map = new Map()
  for (const row of calls.value) {
    if (row?.id) map.set(row.id, row)
  }
  return map
})

const linkedIds = computed(() => {
  const ids = new Set()
  for (const ev of events.value) {
    const id = String(ev?.payload?.dispatch_id || '').trim()
    if (id) ids.add(id)
  }
  return ids
})

const orphans = computed(() => calls.value.filter((row) => row?.id && !linkedIds.value.has(row.id)))

const asObject = (value) => {
  if (value && typeof value === 'object') return value
  const text = String(value || '').trim()
  if (!text.startsWith('{') && !text.startsWith('[')) return null
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

const FACE = {
  'agent-vision-plan': '先看画面',
  'agent-vision-exec': '决定怎么做',
  'agent-decide': '看图决策',
  'assert-vision': '核对结果',
  'plan-overview': '规划步骤',
  'locate-vision': '找位置',
  'goal-extract': '看目标',
  'inspect-session': '看登录态',
  'case-scene': '看场景',
}

const sentence = (value) => {
  const obj = asObject(value)
  const text = obj
    ? (obj.thought || obj.summary || obj.reason || obj.goal || obj.ai_reasoning || obj.error || '')
    : String(value || '')
  return humanize(text)
}

const humanize = (value) => {
  let s = String(value || '')
  s = s.replace(/【[^】]{0,24}】/g, '')
  s = s.replace(/signal_done/g, '结束')
  s = s.replace(/signal_give_up/g, '放弃')
  s = s.replace(/signal_skip/g, '跳过')
  s = s.replace(/禁止再下发设备\s*mutate/g, '不能再操作界面')
  s = s.replace(/\bmutate\b/g, '操作')
  s = s.replace(/action_fuse/g, '')
  s = s.replace(/本阶段步数预算已用尽/g, '这一阶段的步数已经用完')
  s = s.replace(/若目标已达成请\s*结束/g, '做完了就结束')
  s = s.replace(/否则\s*放弃/g, '做不完就放弃')
  s = s.replace(/\s+/g, ' ').replace(/^[，。、;；\s]+/, '').replace(/[，。、;；\s]+$/, '')
  return s.trim()
}

const shortStop = (value) => {
  const s = String(value || '')
  if (/步数/.test(s)) return '这一阶段的步数用完了，不再操作界面'
  if (/死循环|重复|熔断/.test(s)) return '同样的情况重复出现，停下来了'
  if (/放弃/.test(s)) return '这一步放弃了'
  if (/跳过/.test(s)) return '这一步跳过了'
  const line = humanize(s)
  return line.length > 42 ? `${line.slice(0, 42)}…` : (line || '没有继续')
}

const faceJob = (id) => FACE[String(id || '')] || '模型'

const nearbySummary = (list, index) => {
  for (let j = index + 1; j < list.length && j < index + 5; j += 1) {
    const typ = list[j].type
    if (typ === 'llm/response' || typ === 'llm/request') break
    if (typ !== 'stream/emit') continue
    const line = sentence(list[j].payload?.summary || list[j].payload?.thought)
    if (line) return line
  }
  return ''
}

const beatFrom = (ev, list, index) => {
  const p = ev.payload || {}
  const typ = String(ev.type || '')
  if (typ === 'llm/response') {
    const call = callById.value.get(String(p.dispatch_id || '').trim()) || null
    const headline = sentence(call?.output) || nearbySummary(list, index) || sentence(p.error)
    return {
      id: `m-${ev.seq}`,
      kind: 'model',
      title: faceJob(p.job || call?.job),
      headline: headline || '没有写下结论',
      meta: '',
      call,
      missingId: call ? '' : (p.dispatch_id || ''),
    }
  }
  if (typ === 'tool/result') {
    return {
      id: `t-${ev.seq}`,
      kind: 'tool',
      title: '实际做了',
      headline: sentence(p.summary) || '已执行',
      meta: '',
      call: null,
    }
  }
  if (typ === 'guard/block' || typ === 'preflight/block' || typ.startsWith('decision/')) {
    return {
      id: `a-${ev.seq}`,
      kind: 'alert',
      title: '停下',
      headline: shortStop(p.reason || p.thought || p.summary),
      meta: '',
      call: null,
    }
  }
  if (typ.startsWith('nav/')) {
    const headline = sentence(p.summary || p.reason || p.status)
    if (!headline) return null
    return { id: `n-${ev.seq}`, kind: 'nav', title: '导航', headline, meta: '', call: null }
  }
  if (typ === 'session/end') {
    return {
      id: `e-${ev.seq}`,
      kind: p.status === 'pass' ? 'tool' : 'alert',
      title: '结束',
      headline: sentence(p.summary) || p.status || '',
      meta: p.status || '',
      call: null,
    }
  }
  return null
}

const beatsOf = (list) => {
  const beats = []
  list.forEach((ev, index) => {
    if (NOISE.has(ev.type)) return
    const beat = beatFrom(ev, list, index)
    if (beat?.headline) beats.push(beat)
  })
  return beats
}

const turnEvents = (turn) => events.value.filter((ev) => Number(ev.turn || 0) === Number(turn))

const currentTurn = computed(() => pickedTurn.value || props.turn || null)

const activeEvents = computed(() => {
  if (scope.value === 'turn') {
    if (!currentTurn.value) return []
    return turnEvents(currentTurn.value)
  }
  return events.value
})

const activeBeats = computed(() => beatsOf(activeEvents.value))

const stepIndex = computed(() => {
  const turns = []
  const seen = new Set()
  for (const ev of events.value) {
    const turn = Number(ev.turn || 0)
    if (!turn || seen.has(turn)) continue
    seen.add(turn)
    const beats = beatsOf(turnEvents(turn))
    const last = beats[beats.length - 1]
    turns.push({
      turn,
      headline: last?.headline || '这一步没有结论',
      alert: beats.some((b) => b.kind === 'alert'),
    })
  }
  return turns
})

const headline = computed(() => {
  if (scope.value === 'turn' && currentTurn.value) return `第 ${currentTurn.value} 步`
  return '全部步骤'
})

const subline = computed(() => {
  if (scope.value !== 'turn') {
    const alerts = stepIndex.value.filter((s) => s.alert).length
    return alerts ? `${stepIndex.value.length} 步，${alerts} 步停下了` : `共 ${stepIndex.value.length} 步`
  }
  if (!currentTurn.value) return '点左侧某一步'
  if (activeBeats.value.some((b) => b.kind === 'alert')) return '这一步停下了'
  if (activeBeats.value.some((b) => b.kind === 'model')) return '看了画面'
  return '没有额外说明'
})

const rawCount = computed(() => activeEvents.value.length)

const toggle = (id) => {
  openId.value = openId.value === id ? '' : id
}

const loadEvents = async (sessionId) => {
  const all = []
  let from = 0
  for (let page = 0; page < 20; page += 1) {
    const res = await getSessionEvents(sessionId, { fromSeq: from, limit: 500 })
    const batch = res?.data?.events || []
    all.push(...batch)
    if (!res?.data?.has_more || !res?.data?.next_from_seq) break
    from = res.data.next_from_seq
  }
  return all
}

const loadCalls = async (sessionId) => {
  const all = []
  let offset = 0
  for (let page = 0; page < 20; page += 1) {
    const res = await listDispatchCalls({ pipeline_id: sessionId, limit: 500, offset })
    const batch = res?.data?.calls || []
    all.push(...batch)
    const total = Number(res?.data?.total ?? batch.length)
    offset += batch.length
    if (!batch.length || offset >= total) break
  }
  return all
}

const load = async () => {
  const sid = String(props.sessionId || '').trim()
  if (!sid) {
    events.value = []
    calls.value = []
    return
  }
  loading.value = true
  try {
    const [evs, rows] = await Promise.all([loadEvents(sid), loadCalls(sid)])
    events.value = evs
    calls.value = rows
  } catch {
    events.value = []
    calls.value = []
  } finally {
    loading.value = false
  }
}

const stopPoll = () => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = 0
  }
}

watch(() => props.sessionId, () => {
  openId.value = ''
  showRaw.value = false
  scope.value = 'turn'
  load()
}, { immediate: true })

const openTurn = (turn) => {
  pickedTurn.value = turn
  scope.value = 'turn'
  openId.value = ''
  showRaw.value = false
}

watch(() => props.turn, (turn) => {
  pickedTurn.value = turn || null
  openId.value = ''
  showRaw.value = false
  scope.value = 'turn'
})

watch(() => props.live, (live) => {
  stopPoll()
  if (!live) return
  pollTimer = setInterval(load, 4000)
}, { immediate: true })

onUnmounted(stopPoll)
</script>

<template>
  <section class="cer" v-loading="loading">
    <header class="cer-head">
      <div class="cer-title">
        <h3>{{ headline }}</h3>
        <p>{{ subline }}</p>
      </div>
      <div class="cer-scopes">
        <button type="button" :class="{ on: scope === 'turn' }" :disabled="!currentTurn" @click="scope = 'turn'">这一步</button>
        <button type="button" :class="{ on: scope === 'all' }" @click="scope = 'all'">各步</button>
      </div>
    </header>

    <div class="cer-list">
      <p v-if="!loading && scope === 'turn' && !currentTurn" class="cer-empty">点左侧某一步，这里只显示这一步做了什么。</p>
      <p v-else-if="!loading && scope === 'turn' && !activeBeats.length" class="cer-empty">这一步没有模型结论或拦截。</p>

      <template v-if="scope === 'turn'">
        <article v-for="beat in activeBeats" :key="beat.id" class="beat" :class="beat.kind">
          <button type="button" class="beat-main" @click="toggle(beat.id)">
            <span class="beat-k">{{ beat.title }}</span>
            <span class="beat-h">{{ beat.headline }}</span>
            <span v-if="beat.call" class="beat-m">展开原文</span>
          </button>
          <div v-if="openId === beat.id" class="beat-body">
            <p v-if="beat.missingId" class="cer-miss">模型原文已经不在调用记录里（{{ beat.missingId }}）</p>
            <template v-else-if="beat.call">
              <PayloadView title="Prompt" :value="beat.call.system_prompt" />
              <PayloadView title="输入" :value="beat.call.input" :images="beat.call.images || []" />
              <PayloadView title="输出" :value="beat.call.output || beat.call.error" />
              <p class="cer-meta">{{ beat.call.id }} · {{ fmtTokens(beat.call) }} tokens · {{ fmtElapsed(beat.call.elapsed_ms) }}</p>
            </template>
            <p v-else class="beat-full">{{ beat.headline }}</p>
          </div>
        </article>
      </template>

      <template v-else>
        <button
          v-for="step in stepIndex"
          :key="step.turn"
          type="button"
          class="step-row"
          :class="{ on: step.turn === currentTurn, alert: step.alert }"
          @click="openTurn(step.turn)"
        >
          <span class="step-no">{{ step.turn }}</span>
          <span class="step-h">{{ step.headline }}</span>
        </button>
        <p v-if="!loading && !stepIndex.length" class="cer-empty">还没有步骤记录。</p>
      </template>

      <article v-if="scope === 'all' && orphans.length" class="raw-block">
        <h4>未挂到步骤上的调用</h4>
        <button v-for="row in orphans" :key="row.id" type="button" class="step-row" @click="toggle(row.id)">
          <span class="step-h">{{ jobLabel(row.job) }} · {{ statusLabel(row.status) }}</span>
        </button>
        <div v-for="row in orphans" :key="`${row.id}-body`">
          <div v-if="openId === row.id" class="beat-body">
            <PayloadView title="Prompt" :value="row.system_prompt" />
            <PayloadView title="输入" :value="row.input" :images="row.images || []" />
            <PayloadView title="输出" :value="row.output || row.error" />
          </div>
        </div>
      </article>

      <div v-if="scope === 'turn' && rawCount" class="raw-block">
        <button type="button" class="raw-toggle" @click="showRaw = !showRaw">
          {{ showRaw ? '收起原始事件' : `原始事件 ${rawCount} 条` }}
        </button>
        <ol v-if="showRaw" class="raw-list">
          <li v-for="ev in activeEvents" :key="ev.seq">
            <span>#{{ ev.seq }} {{ ev.type }}</span>
            <PayloadView :value="ev.payload" />
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cer {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid var(--mo-border, #e3e8f0);
  border-radius: 12px;
  overflow: hidden;
}
.cer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 10px;
  border-bottom: 1px solid #eef2f7;
}
.cer-title { min-width: 0; }
.cer-head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
  color: #111827;
}
.cer-head p {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.45;
  color: #334155;
}
.cer-scopes { display: flex; gap: 4px; flex-shrink: 0; }
.cer-scopes button {
  border: none;
  background: #f1f5f9;
  color: #475569;
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.cer-scopes button.on { background: #eef2ff; color: #4338ca; }
.cer-scopes button:disabled { opacity: 0.45; cursor: default; }
.cer-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
}
.cer-empty {
  margin: 28px 10px;
  font-size: 13px;
  line-height: 1.5;
  color: #64748b;
}
.beat {
  border: 1px solid #e8edf5;
  border-radius: 10px;
  margin-bottom: 8px;
  background: #fff;
}
.beat.alert { border-color: #fecaca; background: #fffafa; }
.beat.model { border-color: #e0e7ff; }
.beat-main {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.beat-k {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #6366f1;
}
.beat.alert .beat-k { color: #dc2626; }
.beat.tool .beat-k,
.beat.nav .beat-k { color: #0f766e; }
.beat-h {
  font-size: 14px;
  line-height: 1.55;
  color: #1e293b;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.beat-m { font-size: 11px; color: #94a3b8; }
.beat-body { padding: 0 12px 12px; }
.beat-full { margin: 0; font-size: 13px; line-height: 1.5; color: #334155; }
.cer-meta, .cer-miss { margin: 8px 0 0; font-size: 11px; color: #64748b; }
.step-row {
  width: 100%;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 8px;
  border: none;
  border-bottom: 1px solid #f1f5f9;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.step-row.on { background: #f8fafc; }
.step-row.alert .step-h { color: #b91c1c; }
.step-no {
  flex-shrink: 0;
  width: 22px;
  font-size: 12px;
  font-weight: 700;
  color: #94a3b8;
}
.step-h { font-size: 13px; line-height: 1.45; color: #1e293b; }
.raw-block { margin-top: 12px; padding-top: 8px; }
.raw-toggle {
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 12px;
  cursor: pointer;
  padding: 4px;
}
.raw-list {
  margin: 8px 0 0;
  padding: 0 0 0 18px;
  font-size: 12px;
  color: #475569;
}
.raw-list li { margin-bottom: 10px; }
.raw-block h4 {
  margin: 0 8px 4px;
  font-size: 12px;
  color: #64748b;
}
</style>
