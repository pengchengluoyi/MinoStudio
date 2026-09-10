<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  getSessionEvents,
  getSessionLlmCalls,
  getSessionMetrics,
  getSessionTrajectory,
  getSessionTurns,
  listSessions,
} from '@/api/caseRunner'
import PayloadView from '@/components/PayloadView.vue'
import SessionTrajectoryDebug from '@/components/SessionTrajectoryDebug.vue'
import SessionHarnessPanel from '@/components/SessionHarnessPanel.vue'
import { clipText, TABLE_PAGE_SIZES } from '@/utils/tablePage'
import '@/views/Settings/settings-ui.css'

const props = defineProps({
  appId: { type: String, default: '' },
  initialSessionId: { type: String, default: '' },
})

const route = useRoute()
const router = useRouter()

const EVENT_PAGE = 100

const loading = ref(false)
const listLoading = ref(false)
const eventsLoading = ref(false)
const sessionInput = ref('')
const meta = ref(null)
const metrics = ref(null)
const events = ref([])
const llmCalls = ref([])
const trajectory = ref(null)
const turnsData = ref(null)
const mainView = ref('trajectory')
const typeFilter = ref('')
const panel = ref('events')
const selected = ref(null)
const eventTotal = ref(0)
const hasMoreEvents = ref(false)

const sessions = ref([])
const listTotal = ref(0)
const listPage = ref(1)
const listPageSize = ref(20)
const listStatus = ref('')

const sessionId = computed(() => String(sessionInput.value || '').trim())

const typeOptions = computed(() => {
  const set = new Set((events.value || []).map((e) => e.type).filter(Boolean))
  return [...set].sort()
})

const filteredEvents = computed(() => {
  const f = typeFilter.value
  if (!f) return events.value || []
  return (events.value || []).filter((e) => e.type === f)
})

const payloadPreview = (payload) => {
  if (payload == null) return ''
  if (typeof payload === 'string') return clipText(payload, 160)
  try {
    return clipText(JSON.stringify(payload), 160)
  } catch {
    return ''
  }
}

const statusTone = (s) => {
  const v = String(s || '').toLowerCase()
  if (['pass', 'done', 'running'].includes(v)) return 'ok'
  if (['fail', 'failed', 'cancelled', 'blocked'].includes(v)) return 'bad'
  return 'info'
}

const syncSessionQuery = (sid) => {
  const next = { ...route.query, tab: 'session-log' }
  if (sid) next.session = sid
  else delete next.session
  router.replace({ name: route.name, params: route.params, query: next }).catch(() => {})
}

const fetchSessions = async () => {
  listLoading.value = true
  try {
    const res = await listSessions({
      appId: props.appId || undefined,
      status: listStatus.value || undefined,
      limit: listPageSize.value,
      offset: (listPage.value - 1) * listPageSize.value,
    })
    sessions.value = res?.data?.items || []
    listTotal.value = Number(res?.data?.total || 0)
  } catch (e) {
    sessions.value = []
    listTotal.value = 0
    ElMessage.error(e?.response?.data?.detail || e?.message || '加载 Session 列表失败')
  } finally {
    listLoading.value = false
  }
}

const applyEventsPage = (res, append) => {
  const batch = res?.data?.events || []
  events.value = append ? [...events.value, ...batch] : batch
  eventTotal.value = Number(res?.data?.total ?? res?.data?.meta?.event_count ?? events.value.length)
  hasMoreEvents.value = Boolean(res?.data?.has_more)
  if (!meta.value && res?.data?.meta) meta.value = res.data.meta
}

const loadMoreEvents = async () => {
  const sid = sessionId.value
  if (!sid || !hasMoreEvents.value || eventsLoading.value) return
  eventsLoading.value = true
  try {
    const last = events.value[events.value.length - 1]
    const fromSeq = last ? last.seq + 1 : 0
    const res = await getSessionEvents(sid, { fromSeq, limit: EVENT_PAGE })
    applyEventsPage(res, true)
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '加载更多事件失败')
  } finally {
    eventsLoading.value = false
  }
}

const load = async () => {
  const sid = sessionId.value
  if (!sid) {
    ElMessage.warning('请输入 session_id，例如 cr-xxx::case-yyy')
    return
  }
  loading.value = true
  selected.value = null
  syncSessionQuery(sid)
  try {
    const [evRes, llmRes, metRes, trajRes, turnsRes] = await Promise.all([
      getSessionEvents(sid, { fromSeq: 0, limit: EVENT_PAGE }),
      getSessionLlmCalls(sid),
      getSessionMetrics(sid),
      getSessionTrajectory(sid),
      getSessionTurns(sid),
    ])
    meta.value = evRes?.data?.meta || null
    applyEventsPage(evRes, false)
    llmCalls.value = llmRes?.data?.items || []
    metrics.value = metRes?.data || null
    trajectory.value = trajRes?.data || null
    turnsData.value = turnsRes?.data || null
    if (!events.value.length && !meta.value) {
      ElMessage.error('未找到该 session')
    }
  } catch (e) {
    meta.value = null
    events.value = []
    llmCalls.value = []
    metrics.value = null
    trajectory.value = null
    turnsData.value = null
    eventTotal.value = 0
    hasMoreEvents.value = false
    ElMessage.error(e?.response?.data?.detail || e?.message || '加载 Session Log 失败')
  } finally {
    loading.value = false
  }
}

const onForked = (data) => {
  const sid = data?.session_id
  if (sid) {
    sessionInput.value = sid
    load()
  }
}

const onReplayed = onForked

const pickSession = (row) => {
  if (!row?.session_id) return
  sessionInput.value = row.session_id
  load()
}

const onListFilter = () => {
  listPage.value = 1
  fetchSessions()
}

const openDispatch = (id) => {
  const callId = String(id || '').trim()
  if (!callId) return
  router.push({
    name: 'TestingApp',
    params: { appId: props.appId || route.params.appId },
    query: {
      ...route.query,
      tab: 'dispatch',
      call: callId,
      session: sessionId.value || undefined,
    },
  })
}

const selectEvent = (row) => {
  selected.value = row
}

watch(
  () => props.initialSessionId || route.query.session,
  (v) => {
    const sid = String(v || '').trim()
    if (sid && sid !== sessionInput.value) {
      sessionInput.value = sid
      load()
    }
  },
  { immediate: true },
)

watch(
  () => props.appId,
  () => {
    listPage.value = 1
    fetchSessions()
  },
)

onMounted(() => {
  if (!sessionId.value) fetchSessions()
})
</script>

<template>
  <div class="settings-panel session-log-page wide-panel" v-loading="loading">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">Session Log</h2>
        <p class="settings-page-desc">append-only 事件真源：浏览最近 session、分页查看原始 event 与 LLM 链。</p>
      </div>
      <div v-if="meta" class="settings-summary-pill" :class="statusTone(meta.status)">
        {{ meta.status || '—' }} · {{ eventTotal || meta.event_count || events.length }} events
      </div>
    </header>

    <section class="settings-table-card sl-list-card" v-loading="listLoading">
      <div class="col-head">
        <h3>最近 Session</h3>
        <div class="col-actions">
          <el-select
            v-model="listStatus"
            size="small"
            clearable
            placeholder="状态"
            class="filter-item"
            @change="onListFilter"
          >
            <el-option label="running" value="running" />
            <el-option label="pass" value="pass" />
            <el-option label="fail" value="fail" />
            <el-option label="blocked" value="blocked" />
            <el-option label="cancelled" value="cancelled" />
          </el-select>
          <el-button size="small" @click="fetchSessions">刷新</el-button>
        </div>
      </div>
      <div class="table-wrap sl-sessions-wrap">
        <el-table
          :data="sessions"
          border
          stripe
          size="small"
          highlight-current-row
          :current-row-key="sessionId"
          row-key="session_id"
          @row-click="pickSession"
        >
          <el-table-column prop="session_id" label="session" min-width="200" show-overflow-tooltip />
          <el-table-column prop="case_id" label="case" width="140" show-overflow-tooltip />
          <el-table-column prop="status" label="status" width="88">
            <template #default="{ row }">
              <el-tag size="small" :type="statusTone(row.status) === 'ok' ? 'success' : statusTone(row.status) === 'bad' ? 'danger' : 'info'">
                {{ row.status || '—' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="event_count" label="events" width="72" />
          <el-table-column prop="started_at" label="开始" width="160" show-overflow-tooltip />
          <el-table-column label="摘要" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ clipText(row.summary, 80) }}</template>
          </el-table-column>
        </el-table>
      </div>
      <div class="sl-list-pager">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next"
          :total="listTotal"
          :page-sizes="TABLE_PAGE_SIZES"
          v-model:page-size="listPageSize"
          v-model:current-page="listPage"
          @size-change="onListFilter"
          @current-change="fetchSessions"
        />
      </div>
    </section>

    <section class="settings-table-card sl-toolbar">
      <div class="sl-load-row">
        <el-input
          v-model="sessionInput"
          placeholder="session_id，如 cr-e8ab80fbd38c::case-demo-001"
          clearable
          @keyup.enter="load"
        />
        <el-button type="primary" @click="load">加载</el-button>
      </div>
      <p v-if="trajectory?.source" class="sl-hint">
        轨迹来源 <code>{{ trajectory.source }}</code>
        <span v-if="trajectory.finished"> · 已结束</span>
        <span v-if="trajectory.overall"> · {{ trajectory.overall }}</span>
        <span v-if="events.length"> · 已加载 {{ events.length }}/{{ eventTotal || '?' }} events</span>
      </p>
    </section>

    <section v-if="metrics" class="sl-metrics">
      <span>LLM {{ metrics.llm_calls }} 次 / {{ metrics.llm_tokens }} tokens</span>
      <span>工具 {{ metrics.tool_calls }} 次</span>
      <span v-if="metrics.tool_failures">失败 {{ metrics.tool_failures }}</span>
      <span v-if="metrics.recovery_hits">恢复 {{ metrics.recovery_hits }}</span>
      <span v-if="metrics.inspection_count">巡检 {{ metrics.inspection_count }}</span>
      <span v-if="metrics.guard_blocks">拦截 {{ metrics.guard_blocks }}</span>
    </section>

    <section v-if="meta" class="sl-meta">
      <div><dt>run</dt><dd>{{ meta.run_id }}</dd></div>
      <div><dt>case</dt><dd>{{ meta.case_id || '—' }}</dd></div>
      <div><dt>开始</dt><dd>{{ meta.started_at || '—' }}</dd></div>
      <div><dt>结束</dt><dd>{{ meta.finished_at || '—' }}</dd></div>
      <div v-if="meta.summary" class="sl-summary"><dt>摘要</dt><dd>{{ meta.summary }}</dd></div>
    </section>

    <section v-if="meta" class="sl-view-tabs">
      <el-radio-group v-model="mainView" size="small">
        <el-radio-button value="trajectory">Debug / Trajectory</el-radio-button>
        <el-radio-button value="harness">Eval / Audit</el-radio-button>
        <el-radio-button value="events">Raw Events</el-radio-button>
      </el-radio-group>
    </section>

    <div v-if="meta && mainView === 'harness'" class="sl-traj-pane">
      <SessionHarnessPanel
        :session-id="sessionId"
        :app-id="appId"
        @forked="onForked"
        @replayed="onReplayed"
      />
    </div>

    <div v-else-if="meta && mainView === 'trajectory'" class="sl-traj-pane">
      <SessionTrajectoryDebug
        :session-id="sessionId"
        :turns-data="turnsData"
        :app-id="appId"
      />
    </div>

    <div v-else-if="events.length" class="sl-body">
      <div class="sl-list">
        <div class="col-head">
          <h3>Events</h3>
          <div class="col-actions">
            <el-select v-model="typeFilter" size="small" clearable placeholder="类型" class="filter-item">
              <el-option v-for="t in typeOptions" :key="t" :label="t" :value="t" />
            </el-select>
            <el-radio-group v-model="panel" size="small">
              <el-radio-button value="events">事件</el-radio-button>
              <el-radio-button value="llm">LLM</el-radio-button>
            </el-radio-group>
          </div>
        </div>

        <div v-show="panel === 'events'" class="table-wrap sl-table-wrap">
          <el-table
            :data="filteredEvents"
            border
            stripe
            size="small"
            height="100%"
            highlight-current-row
            @row-click="selectEvent"
          >
            <el-table-column prop="seq" label="#" width="56" />
            <el-table-column prop="type" label="type" width="140" show-overflow-tooltip />
            <el-table-column prop="turn" label="turn" width="56" />
            <el-table-column prop="phase" label="phase" width="72" />
            <el-table-column label="payload" min-width="240" show-overflow-tooltip>
              <template #default="{ row }">{{ payloadPreview(row.payload) }}</template>
            </el-table-column>
            <el-table-column label="dispatch" width="120">
              <template #default="{ row }">
                <el-button
                  v-if="row.payload?.dispatch_id"
                  link
                  type="primary"
                  size="small"
                  @click.stop="openDispatch(row.payload.dispatch_id)"
                >{{ row.payload.dispatch_id }}</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="hasMoreEvents" class="sl-more-row">
            <el-button :loading="eventsLoading" @click="loadMoreEvents">
              加载更多（{{ events.length }}/{{ eventTotal }}）
            </el-button>
          </div>
        </div>

        <div v-show="panel === 'llm'" class="table-wrap sl-table-wrap">
          <el-table :data="llmCalls" border stripe size="small" height="100%">
            <el-table-column prop="turn" label="turn" width="56" />
            <el-table-column prop="job" label="job" width="120" />
            <el-table-column prop="model" label="model" width="120" show-overflow-tooltip />
            <el-table-column prop="status" label="status" width="72" />
            <el-table-column prop="total_tokens" label="tokens" width="72" />
            <el-table-column prop="elapsed_ms" label="ms" width="72" />
            <el-table-column label="dispatch" min-width="120">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="openDispatch(row.dispatch_id)">
                  {{ row.dispatch_id || '—' }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <aside v-if="selected" class="sl-detail">
        <header class="sl-detail-head">
          <strong>#{{ selected.seq }} {{ selected.type }}</strong>
          <span>turn {{ selected.turn }} · {{ selected.phase || '—' }}</span>
        </header>
        <p class="sl-detail-ts">{{ selected.ts }}</p>
        <PayloadView :value="selected.payload" />
        <el-button
          v-if="selected.payload?.dispatch_id"
          class="sl-dispatch-btn"
          type="primary"
          plain
          @click="openDispatch(selected.payload.dispatch_id)"
        >查看调度记录</el-button>
      </aside>
      <aside v-else class="sl-detail sl-detail-empty">
        <p>点击左侧事件查看完整 payload</p>
      </aside>
    </div>

    <el-empty v-else-if="!loading" description="从上方列表选择 session，或输入 session_id 后加载" />
  </div>
</template>

<style scoped>
.session-log-page {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  gap: 12px;
  overflow: auto;
}
.sl-list-card {
  flex-shrink: 0;
  padding: 0;
  overflow: hidden;
}
.sl-list-card .col-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--settings-border, #e3e8f0);
}
.sl-list-card .col-head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}
.sl-list-card .col-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.sl-sessions-wrap {
  max-height: 220px;
}
.sl-list-pager {
  display: flex;
  justify-content: flex-end;
  padding: 10px 14px;
  border-top: 1px solid var(--settings-border, #e3e8f0);
}
.sl-toolbar {
  flex-shrink: 0;
  padding: 14px 16px;
}
.sl-load-row {
  display: flex;
  gap: 10px;
  align-items: center;
}
.sl-load-row .el-input {
  flex: 1;
}
.sl-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--settings-muted, #6b7280);
}
.sl-hint code {
  font-size: 11px;
}
.sl-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 18px;
  padding: 0 4px;
  font-size: 12px;
  color: var(--settings-text, #334155);
}
.sl-meta {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 8px 16px;
  padding: 12px 16px;
  background: var(--settings-soft, #f8fafc);
  border: 1px solid var(--settings-border, #e3e8f0);
  border-radius: 12px;
  font-size: 12px;
}
.sl-meta dt {
  color: var(--settings-muted, #6b7280);
  margin: 0;
}
.sl-meta dd {
  margin: 2px 0 0;
  word-break: break-all;
}
.sl-summary {
  grid-column: 1 / -1;
}
.sl-view-tabs {
  padding: 0 4px;
}
.sl-traj-pane {
  flex: 1;
  min-height: 360px;
  overflow: auto;
  padding: 0 4px 12px;
}
.sl-body {
  flex: 1;
  min-height: 360px;
  display: grid;
  grid-template-columns: 1fr minmax(280px, 36%);
  gap: 12px;
}
.sl-list {
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid var(--settings-border, #e3e8f0);
  border-radius: 12px;
  overflow: hidden;
}
.sl-list .col-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--settings-border, #e3e8f0);
}
.sl-list .col-head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}
.sl-list .col-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.sl-table-wrap {
  flex: 1;
  min-height: 280px;
  display: flex;
  flex-direction: column;
}
.sl-more-row {
  display: flex;
  justify-content: center;
  padding: 10px;
  border-top: 1px solid var(--settings-border, #e3e8f0);
}
.sl-detail {
  min-height: 0;
  overflow: auto;
  padding: 14px 16px;
  background: #fff;
  border: 1px solid var(--settings-border, #e3e8f0);
  border-radius: 12px;
}
.sl-detail-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
  font-size: 13px;
}
.sl-detail-ts {
  font-size: 11px;
  color: var(--settings-muted, #6b7280);
  margin: 0 0 12px;
}
.sl-detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--settings-muted, #6b7280);
  font-size: 13px;
}
.sl-dispatch-btn {
  margin-top: 12px;
}
.settings-summary-pill.ok {
  background: #ecfdf5;
  color: #047857;
}
.settings-summary-pill.bad {
  background: #fef2f2;
  color: #b91c1c;
}
</style>
