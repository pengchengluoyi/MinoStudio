<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  forkSession,
  getSessionAudit,
  getSessionEval,
  getSessionForkPlan,
  getSessionReplayPlan,
  replaySession,
} from '@/api/caseRunner'
import PayloadView from '@/components/PayloadView.vue'

const props = defineProps({
  sessionId: { type: String, default: '' },
  appId: { type: String, default: '' },
})

const emit = defineEmits(['loaded', 'forked', 'replayed'])

const loading = ref(false)
const evalData = ref(null)
const auditData = ref(null)
const replayPlan = ref(null)
const forkPlan = ref(null)
const forkTurn = ref(1)
const forkProvider = ref('')

const checks = computed(() => evalData.value?.checks || {})
const menuCaps = computed(() => evalData.value?.menu_caps || {})

const load = async () => {
  const sid = String(props.sessionId || '').trim()
  if (!sid) return
  loading.value = true
  try {
    const [ev, au] = await Promise.all([
      getSessionEval(sid),
      getSessionAudit(sid),
    ])
    evalData.value = ev?.data || null
    auditData.value = au?.data || null
    emit('loaded', { eval: evalData.value, audit: auditData.value })
  } catch (e) {
    evalData.value = null
    auditData.value = null
    ElMessage.error(e?.response?.data?.detail || e?.message || '加载 Harness 失败')
  } finally {
    loading.value = false
  }
}

const loadReplayPlan = async () => {
  const sid = String(props.sessionId || '').trim()
  if (!sid) return
  try {
    const res = await getSessionReplayPlan(sid)
    replayPlan.value = res?.data || null
  } catch (e) {
    replayPlan.value = null
    ElMessage.error(e?.response?.data?.detail || '加载 Replay 计划失败')
  }
}

const loadForkPlan = async () => {
  const sid = String(props.sessionId || '').trim()
  if (!sid) return
  try {
    const res = await getSessionForkPlan(sid, {
      fromTurn: forkTurn.value,
      providerId: forkProvider.value || undefined,
    })
    forkPlan.value = res?.data || null
  } catch (e) {
    forkPlan.value = null
    ElMessage.error(e?.response?.data?.detail || '加载 Fork 计划失败')
  }
}

const runReplay = async () => {
  const sid = String(props.sessionId || '').trim()
  if (!sid) return
  try {
    await ElMessageBox.confirm('将用相同 case 重新跑一轮，并链到 parent session。继续？', 'Replay')
    loading.value = true
    const res = await replaySession(sid, {})
    ElMessage.success(`Replay 已启动：${res?.data?.session_id || ''}`)
    emit('replayed', res?.data)
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.detail || e?.message || 'Replay 失败')
  } finally {
    loading.value = false
  }
}

const runFork = async () => {
  const sid = String(props.sessionId || '').trim()
  if (!sid) return
  try {
    await ElMessageBox.confirm(
      `从 Turn ${forkTurn.value} 切开 Fork，继承 history 继续跑。继续？`,
      'Fork',
    )
    loading.value = true
    const res = await forkSession(sid, {
      from_turn: forkTurn.value,
      provider_id: forkProvider.value || undefined,
    })
    ElMessage.success(`Fork 已启动：${res?.data?.session_id || ''}`)
    emit('forked', res?.data)
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.detail || e?.message || 'Fork 失败')
  } finally {
    loading.value = false
  }
}

watch(
  () => props.sessionId,
  (sid) => {
    if (sid) load()
    else {
      evalData.value = null
      auditData.value = null
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="harness" v-loading="loading">
    <section v-if="evalData" class="harness-card">
      <h3>Eval 指标</h3>
      <div class="harness-metrics">
        <span>LLM {{ evalData.llm_calls }} 次 / {{ evalData.llm_tokens }} tokens</span>
        <span>工具 {{ evalData.tool_calls }} 步</span>
        <span>非法/decline {{ evalData.invalid_tool_calls }}</span>
        <span>recovery {{ evalData.recovery_hits }} 命中</span>
        <span v-if="evalData.stuck_turn != null">卡在 Turn {{ evalData.stuck_turn }}</span>
      </div>
      <div v-if="Object.keys(menuCaps).length" class="harness-menu-caps">
        <span class="h-label">菜单能力</span>
        <span v-for="(turns, cap) in menuCaps" :key="cap">
          <code>{{ cap }}</code> → turn {{ turns.join(', ') || '—' }}
        </span>
      </div>
      <div v-if="Object.keys(checks).length" class="harness-checks">
        <span
          v-for="(ok, key) in checks"
          :key="key"
          class="h-check"
          :class="ok ? 'ok' : 'bad'"
        >{{ key }}: {{ ok ? '✓' : '✗' }}</span>
      </div>
    </section>

    <section v-if="auditData" class="harness-card">
      <h3>审计证据链</h3>
      <p class="h-summary">{{ auditData.summary || auditData.status }}</p>
      <ul v-if="auditData.findings?.length" class="h-findings">
        <li v-for="(f, i) in auditData.findings" :key="i">{{ f }}</li>
      </ul>
      <details v-if="auditData.evidence_chain?.length">
        <summary>{{ auditData.evidence_chain.length }} 条关键 event</summary>
        <PayloadView :value="auditData.evidence_chain" />
      </details>
    </section>

    <section class="harness-card">
      <h3>Replay / Fork</h3>
      <p class="h-hint">Replay 整案重跑（验证 prompt 改动）；Fork 从某 turn 切开继续（可换 provider）。</p>
      <div class="h-actions">
        <el-button size="small" @click="loadReplayPlan">查看 Replay 计划</el-button>
        <el-button size="small" type="primary" plain @click="runReplay">执行 Replay</el-button>
      </div>
      <PayloadView v-if="replayPlan" title="Replay plan" :value="replayPlan" />

      <div class="h-fork-row">
        <el-input-number v-model="forkTurn" :min="1" :max="80" size="small" />
        <el-input v-model="forkProvider" size="small" placeholder="provider_id 覆盖（可选）" clearable />
        <el-button size="small" @click="loadForkPlan">Fork 计划</el-button>
        <el-button size="small" type="warning" plain @click="runFork">执行 Fork</el-button>
      </div>
      <PayloadView v-if="forkPlan" title="Fork plan" :value="forkPlan" />
    </section>
  </div>
</template>

<style scoped>
.harness {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.harness-card {
  padding: 14px 16px;
  background: #fff;
  border: 1px solid #e3e8f0;
  border-radius: 12px;
}
.harness-card h3 {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 700;
  color: #6b7280;
}
.harness-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  font-size: 12px;
  color: #334155;
}
.harness-menu-caps {
  margin-top: 10px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.harness-menu-caps code {
  color: #4338ca;
  margin-right: 6px;
}
.h-label {
  font-size: 11px;
  color: #9ca3af;
  text-transform: uppercase;
}
.harness-checks {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.h-check {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #f1f5f9;
}
.h-check.ok { background: #ecfdf5; color: #047857; }
.h-check.bad { background: #fef2f2; color: #b91c1c; }
.h-summary {
  margin: 0 0 8px;
  font-size: 13px;
  color: #1f2937;
}
.h-findings {
  margin: 0 0 12px;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.55;
}
.h-hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: #6b7280;
}
.h-actions, .h-fork-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}
.h-fork-row .el-input {
  width: 180px;
}
</style>
