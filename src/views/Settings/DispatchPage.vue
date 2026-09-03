<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { listDispatchCalls } from '@/api/settings'
import {
  ROLE_LABEL,
  TRIGGER_LABEL,
  flattenDispatchJobs,
  fmtElapsed,
  fmtTimeShort,
  fmtTokens,
  groupDispatchJobs,
  jobLabel,
  jobSummary,
  matchDispatchFilters,
  relatedWork,
  roleLabel,
  skillLabel,
  sourceLabel,
  statusLabel,
  statusTagType,
} from '@/utils/dispatchLog'
import './settings-ui.css'

const props = defineProps({
  appId: { type: String, default: '' },
  embedded: { type: Boolean, default: false },
  hideNav: { type: Boolean, default: false },
  view: { type: String, default: '' },
})

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const calls = ref([])
const filters = ref({ role: '', trigger: '', status: '' })
const localView = ref(props.view === 'jobs' ? 'jobs' : 'pipeline')
watch(() => props.view, (v) => {
  if (v === 'jobs' || v === 'pipeline') localView.value = v
})
const view = computed(() => localView.value)
const pageTitle = computed(() => {
  if (!props.hideNav) return '调用记录'
  return view.value === 'jobs' ? '按次查看' : '按推进分组'
})

const triggerOptions = computed(() => Object.entries(TRIGGER_LABEL).filter(([id]) => id !== 'unknown'))
const grouped = computed(() => groupDispatchJobs(calls.value))
const pipelineRows = computed(() => grouped.value.filter((row) => matchDispatchFilters(row, filters.value)))
const jobRows = computed(() => flattenDispatchJobs(calls.value).filter((row) => matchDispatchFilters(row, filters.value)))
const rows = computed(() => (view.value === 'jobs' ? jobRows.value : pipelineRows.value))
const pillText = computed(() => (
  view.value === 'jobs' ? `${rows.value.length} 次调用` : `${rows.value.length} 组推进`
))

const load = async () => {
  loading.value = true
  try {
    const res = await listDispatchCalls({
      limit: 300,
      app_id: props.appId || '',
    })
    calls.value = res?.data?.calls || []
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '加载调用记录失败')
  } finally {
    loading.value = false
  }
}

const openJob = (row) => {
  if (!row?.id) return
  if (props.embedded) {
    router.push({
      name: 'TestingApp',
      params: { appId: props.appId || route.params.appId },
      query: { ...route.query, tab: 'dispatch', call: row.id },
    })
    return
  }
  router.push({ name: 'SettingsDispatchJob', params: { callId: row.id } })
}

const openRelated = (row) => {
  const work = relatedWork(row)
  const appId = props.appId || route.params.appId
  if (!props.embedded || !appId || !work.tab) return openJob(row)
  router.push({
    name: 'TestingApp',
    params: { appId },
    query: { ...route.query, tab: work.tab, view: work.view, call: undefined },
  })
}

watch(() => props.appId, load)
onMounted(load)
</script>

<template>
  <div class="settings-panel dispatch-page wide-panel" v-loading="loading">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">{{ pageTitle }}</h2>
      </div>
      <div class="settings-summary-pill">{{ pillText }}</div>
    </header>

    <div v-if="!hideNav" class="settings-tabbar is-compact">
      <button type="button" class="settings-tab" :class="{ active: localView === 'pipeline' }" @click="localView = 'pipeline'">
        <strong>按推进分组</strong>
        <span>一次推进或一次跑次</span>
      </button>
      <button type="button" class="settings-tab" :class="{ active: localView === 'jobs' }" @click="localView = 'jobs'">
        <strong>按次查看</strong>
        <span>每一次模型调用</span>
      </button>
    </div>

    <div class="settings-toolbar">
      <el-select v-model="filters.trigger" size="small" clearable placeholder="来源" class="filter-item">
        <el-option v-for="([id, label]) in triggerOptions" :key="id" :label="label" :value="id" />
      </el-select>
      <el-select v-model="filters.role" size="small" clearable placeholder="角色" class="filter-item">
        <el-option v-for="(label, id) in ROLE_LABEL" :key="id" :label="label" :value="id" />
      </el-select>
      <el-select v-model="filters.status" size="small" clearable placeholder="状态" class="filter-item">
        <el-option label="完成" value="done" />
        <el-option label="失败" value="error" />
        <el-option label="进行中" value="running" />
        <el-option label="跳过" value="skipped" />
      </el-select>
      <button type="button" class="settings-action-pill" @click="load">
        刷新
        <span class="settings-action-arrow">→</span>
      </button>
    </div>

    <p v-if="!rows.length && !loading" class="settings-page-desc">暂无数据</p>

    <section v-else class="settings-table-card is-fill">
      <el-table
        :data="rows"
        size="small"
        border
        stripe
        height="100%"
        highlight-current-row
        @row-click="openJob"
      >
        <el-table-column label="时间" width="108">
          <template #default="{ row }">{{ fmtTimeShort(row.at) }}</template>
        </el-table-column>
        <el-table-column label="来源" width="120">
          <template #default="{ row }">{{ sourceLabel(row.source || row.trigger) }}</template>
        </el-table-column>
        <el-table-column v-if="!appId" label="应用" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.app_name || '—' }}</template>
        </el-table-column>
        <template v-if="view === 'pipeline'">
          <el-table-column label="分析师之后" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">{{ row.headline || jobLabel(row.job) }}</template>
          </el-table-column>
          <el-table-column label="角色" width="110">
            <template #default="{ row }">{{ roleLabel(row.role) }}</template>
          </el-table-column>
          <el-table-column label="技能" width="120" show-overflow-tooltip>
            <template #default="{ row }">{{ skillLabel(row.skill || row.job) }}</template>
          </el-table-column>
          <el-table-column label="步数" width="64">
            <template #default="{ row }">{{ row.step_total || 1 }}</template>
          </el-table-column>
          <el-table-column label="状态" width="88">
            <template #default="{ row }">
              <el-tag :type="statusTagType(row.status)" size="small" effect="light">{{ statusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="耗时 / tokens" width="120">
            <template #default="{ row }">{{ fmtElapsed(row.elapsed_ms) }} · {{ fmtTokens(row) }}</template>
          </el-table-column>
          <el-table-column label="摘要" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">{{ row.summary || jobSummary(row) }}</template>
          </el-table-column>
        </template>
        <template v-else>
          <el-table-column label="技能" min-width="120" show-overflow-tooltip>
            <template #default="{ row }">{{ row.step_label || skillLabel(row.skill || row.job) }}</template>
          </el-table-column>
          <el-table-column label="序号" width="64">
            <template #default="{ row }">{{ row.step_index_label || '—' }}</template>
          </el-table-column>
          <el-table-column label="角色" width="110">
            <template #default="{ row }">{{ roleLabel(row.role) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="88">
            <template #default="{ row }">
              <el-tag :type="statusTagType(row.status)" size="small" effect="light">{{ statusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="摘要" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">{{ row.summary || jobSummary(row) }}</template>
          </el-table-column>
        </template>
        <el-table-column label="操作" width="88" align="right">
          <template #default="{ row }">
            <button type="button" class="link-btn" @click.stop="openRelated(row)">
              {{ embedded ? relatedWork(row).label : '详情' }}
            </button>
          </template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<style scoped>
.dispatch-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.filter-item {
  width: 120px;
}

.link-btn {
  border: 0;
  background: transparent;
  color: var(--settings-primary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.settings-table-card.is-fill {
  min-height: 280px;
}

:deep(.el-table__row) {
  cursor: pointer;
}
</style>
