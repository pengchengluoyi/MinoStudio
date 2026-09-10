<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PayloadView from '@/components/PayloadView.vue'
import { clipText } from '@/utils/tablePage'

const props = defineProps({
  sessionId: { type: String, default: '' },
  turnsData: { type: Object, default: null },
  appId: { type: String, default: '' },
})

const router = useRouter()
const route = useRoute()

const expanded = ref([])

const data = computed(() => props.turnsData || null)
const turns = computed(() => data.value?.turns || [])

const turnTitle = (t) => {
  const n = t?.turn ?? '?'
  const phase = t?.phase || '—'
  const cap = t?.outcome_cap || t?.think?.capability_id || ''
  const st = t?.outcome_status || t?.think?.status || ''
  const bits = [`Turn ${n}`, phase]
  if (cap) bits.push(cap)
  if (st) bits.push(st)
  return bits.join(' · ')
}

const turnTone = (t) => {
  const st = String(t?.outcome_status || t?.think?.status || '').toLowerCase()
  if (['pass', 'done', 'skipped'].includes(st)) return 'ok'
  if (['fail', 'failed', 'give_up'].includes(st)) return 'bad'
  if (['ask_human', 'blocked', 'ask_human'].includes(st) || (t?.decisions || []).length) return 'warn'
  return 'info'
}

const decisionLabel = (d) => {
  const typ = String(d?.type || '')
  if (typ === 'decision/ask_human') return 'ask_human'
  if (typ === 'decision/give_up') return 'give_up'
  return typ.replace('decision/', '')
}

const toolPairs = (t) => {
  const rows = t?.tools || []
  const out = []
  let pending = null
  for (const row of rows) {
    if (row.kind === 'call') {
      if (pending) out.push({ call: pending, result: null })
      pending = row
    } else if (row.kind === 'result') {
      out.push({ call: pending, result: row })
      pending = null
    }
  }
  if (pending) out.push({ call: pending, result: null })
  return out
}

const capInMenu = (t, capId) => {
  const flags = t?.menu_flags
  if (!flags?.cap_ids?.length) return false
  return flags.cap_ids.includes(capId)
}

const openDispatch = (id) => {
  const callId = String(id || '').trim()
  if (!callId) return
  router.push({
    name: 'TestingApp',
    params: { appId: props.appId || route.params.appId },
    query: { ...route.query, tab: 'dispatch', call: callId, session: props.sessionId || undefined },
  })
}

watch(
  () => props.sessionId,
  () => {
    expanded.value = []
  },
)
</script>

<template>
  <div v-if="!turns.length" class="traj-empty">加载 session 后查看按 turn 聚合的 debug 轨迹</div>
  <div v-else class="traj-debug">
    <header v-if="data?.goal" class="traj-goal">
      <span class="traj-label">目标</span>
      <p>{{ data.goal }}</p>
    </header>

    <el-collapse v-model="expanded" class="traj-collapse">
      <el-collapse-item
        v-for="t in turns"
        :key="t.turn"
        :name="t.turn"
        class="traj-turn"
      >
        <template #title>
          <div class="traj-turn-head" :class="turnTone(t)">
            <strong>{{ turnTitle(t) }}</strong>
            <span v-if="t.menu_flags?.recovery_in_menu" class="traj-chip recovery">recovery 在菜单</span>
            <span v-if="t.decisions?.length" class="traj-chip warn">决策 {{ decisionLabel(t.decisions[0]) }}</span>
            <span v-if="t.guards?.length" class="traj-chip">guard ×{{ t.guards.length }}</span>
          </div>
        </template>

        <div class="traj-body">
          <section v-if="t.think?.thought || t.decisions?.length" class="traj-card">
            <h4>为何这么选？</h4>
            <p v-if="t.think?.thought" class="traj-thought">{{ t.think.thought }}</p>
            <div v-for="(d, i) in t.decisions" :key="i" class="traj-decision">
              <el-tag type="warning" size="small">{{ decisionLabel(d) }}</el-tag>
              <span>{{ d.thought || '—' }}</span>
              <el-button
                v-if="d.dispatch_id"
                link
                type="primary"
                size="small"
                @click="openDispatch(d.dispatch_id)"
              >{{ d.dispatch_id }}</el-button>
            </div>
            <p v-if="t.turn_end?.decision_cap" class="traj-outcome">
              落锤：<code>{{ t.turn_end.decision_cap }}</code>
              <span v-if="t.turn_end.decision_status">（{{ t.turn_end.decision_status }}）</span>
            </p>
          </section>

          <section v-if="t.menu || t.menu_flags" class="traj-card">
            <h4>Menu 快照</h4>
            <div class="traj-menu-flags">
              <span>{{ t.menu_flags?.menu_count || 0 }} 项能力</span>
              <span>tool_kinds: {{ (t.menu_flags?.tool_kinds || []).join(', ') || '—' }}</span>
              <el-tag
                v-if="t.menu_flags?.recovery_in_menu"
                type="success"
                size="small"
                effect="plain"
              >recovery 已进菜单</el-tag>
              <el-tag v-else type="info" size="small" effect="plain">recovery 未进菜单</el-tag>
              <el-tag
                v-if="t.menu_flags?.ask_human_in_menu"
                type="warning"
                size="small"
                effect="plain"
              >signal_ask_human 在菜单</el-tag>
            </div>
            <div v-if="t.menu_flags?.recovery_caps?.length" class="traj-cap-row">
              <span class="traj-label">recovery caps</span>
              <code v-for="c in t.menu_flags.recovery_caps" :key="c" class="traj-cap recovery">{{ c }}</code>
            </div>
            <div v-if="t.menu_flags?.cap_ids?.length" class="traj-cap-grid">
              <code
                v-for="c in t.menu_flags.cap_ids"
                :key="c"
                class="traj-cap"
                :class="{
                  recovery: c.startsWith('recover_'),
                  ask: c === 'signal_ask_human',
                  picked: c === t.outcome_cap || c === t.think?.capability_id,
                }"
              >{{ c }}</code>
            </div>
            <PayloadView v-if="t.menu" title="原始 menu event" :value="t.menu" />
          </section>

          <section v-if="t.llm_calls?.length" class="traj-card">
            <h4>LLM 调用</h4>
            <article v-for="(llm, i) in t.llm_calls" :key="i" class="traj-llm">
              <header>
                <strong>{{ llm.job || 'llm' }}</strong>
                <span>{{ llm.model }}</span>
                <span>{{ llm.total_tokens }} tokens · {{ llm.elapsed_ms }}ms</span>
                <el-button
                  v-if="llm.dispatch_id"
                  link
                  type="primary"
                  size="small"
                  @click="openDispatch(llm.dispatch_id)"
                >{{ llm.dispatch_id }}</el-button>
              </header>
              <div v-if="llm.request?.messages?.length" class="traj-msg-hint">
                messages: {{ llm.request.messages.map((m) => `${m.role}(${m.len})`).join(' · ') }}
              </div>
            </article>
          </section>

          <section v-if="t.slots" class="traj-card">
            <h4>注入 Slots</h4>
            <div v-if="t.slots.session_block" class="traj-slot">
              <span class="traj-label">session_block</span>
              <pre>{{ clipText(t.slots.session_block, 400) }}</pre>
            </div>
            <div v-if="t.slots.goal" class="traj-slot">
              <span class="traj-label">goal</span>
              <pre>{{ clipText(t.slots.goal, 200) }}</pre>
            </div>
            <PayloadView title="完整 slots" :value="t.slots" />
          </section>

          <section v-if="toolPairs(t).length" class="traj-card">
            <h4>工具链</h4>
            <div v-for="(pair, i) in toolPairs(t)" :key="i" class="traj-tool">
              <code>{{ pair.call?.capability_id || '?' }}</code>
              <span v-if="pair.result" :class="pair.result.status">{{ pair.result.status }}</span>
              <span>{{ clipText(pair.result?.summary || pair.call?.params ? JSON.stringify(pair.call.params) : '', 120) }}</span>
            </div>
          </section>

          <section v-if="t.recovery?.length" class="traj-card">
            <h4>Recovery</h4>
            <PayloadView :value="t.recovery" />
          </section>

          <section v-if="t.guards?.length" class="traj-card">
            <h4>Guard 拦截</h4>
            <PayloadView :value="t.guards" />
          </section>

          <section v-if="t.inspections?.length" class="traj-card">
            <h4>巡检</h4>
            <PayloadView :value="t.inspections" />
          </section>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
.traj-empty {
  padding: 24px;
  text-align: center;
  color: #6b7280;
  font-size: 13px;
}
.traj-debug {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
.traj-goal {
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px solid #e3e8f0;
  border-radius: 10px;
  font-size: 12px;
}
.traj-goal p {
  margin: 4px 0 0;
  white-space: pre-wrap;
  line-height: 1.55;
  color: #1f2937;
}
.traj-label {
  font-size: 11px;
  font-weight: 650;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.traj-collapse {
  border: none;
}
.traj-turn :deep(.el-collapse-item__header) {
  height: auto;
  min-height: 44px;
  line-height: 1.4;
  padding: 8px 12px;
  border-bottom: 1px solid #e3e8f0;
}
.traj-turn-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
  font-size: 13px;
}
.traj-turn-head.ok strong { color: #047857; }
.traj-turn-head.bad strong { color: #b91c1c; }
.traj-turn-head.warn strong { color: #b45309; }
.traj-chip {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4338ca;
}
.traj-chip.recovery { background: #ecfdf5; color: #047857; }
.traj-chip.warn { background: #fffbeb; color: #b45309; }
.traj-body {
  padding: 8px 4px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.traj-card {
  padding: 12px 14px;
  border: 1px solid #e3e8f0;
  border-radius: 10px;
  background: #fff;
}
.traj-card h4 {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 700;
  color: #6b7280;
  letter-spacing: 0.04em;
}
.traj-thought {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #1f2937;
  white-space: pre-wrap;
}
.traj-decision {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  font-size: 13px;
}
.traj-outcome {
  margin: 10px 0 0;
  font-size: 12px;
  color: #4b5563;
}
.traj-outcome code {
  color: #4338ca;
}
.traj-menu-flags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
  font-size: 12px;
  color: #4b5563;
}
.traj-cap-row {
  margin-bottom: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.traj-cap-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.traj-cap {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  background: #f1f5f9;
  color: #334155;
}
.traj-cap.recovery {
  background: #ecfdf5;
  color: #047857;
}
.traj-cap.ask {
  background: #fffbeb;
  color: #b45309;
}
.traj-cap.picked {
  outline: 2px solid #6366f1;
  background: #eef2ff;
  color: #3730a3;
}
.traj-llm {
  padding: 10px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 12px;
}
.traj-llm:last-child { border-bottom: none; }
.traj-llm header {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.traj-msg-hint {
  margin-top: 6px;
  color: #6b7280;
  font-size: 11px;
}
.traj-slot pre {
  margin: 4px 0 0;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  color: #1f2937;
}
.traj-tool {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
  font-size: 12px;
  padding: 6px 0;
  border-bottom: 1px solid #f1f5f9;
}
.traj-tool code {
  color: #4338ca;
  font-weight: 600;
}
.traj-tool .pass { color: #047857; }
.traj-tool .fail { color: #b91c1c; }
</style>
