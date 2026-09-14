<script setup>
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import {
  intelAsk,
  intelGaps,
  intelSearch,
  listIntelProposals,
  reviewIntelProposal,
} from '@/api/appIntel'
import '../Settings/settings-ui.css'

function errMsg(e, fallback) {
  return e?.response?.data?.detail || e?.message || fallback
}

const props = defineProps({
  appId: { type: String, required: true },
  projectId: { type: String, default: '' },
  appName: { type: String, default: '' },
  hideNav: { type: Boolean, default: false },
})

const KIND_LABEL = {
  nav_state: '导航页',
  nav_edge: '导航边',
  knowledge: '知识',
  doc_chunk: '文档',
}

const STATUS_LABEL = { pending: '待审', approved: '已通过', rejected: '已驳回' }
const STATUS_TYPE = { pending: 'warning', approved: 'success', rejected: 'info' }

const panel = ref('search')
const searchQ = ref('')
const searchKinds = ref(['nav', 'knowledge', 'doc'])
const searching = ref(false)
const searchHits = ref([])

const gapsLoading = ref(false)
const gapsData = ref(null)

const proposalsLoading = ref(false)
const proposals = ref([])
const proposalStatus = ref('pending')
const reviewing = ref('')

const askQ = ref('')
const asking = ref(false)
const askAnswer = ref('')
const askCitations = ref([])

const runSearch = async () => {
  const q = searchQ.value.trim()
  if (!q) {
    ElMessage.warning('输入检索词')
    return
  }
  searching.value = true
  try {
    const kinds = (searchKinds.value || []).join(',') || 'nav,knowledge,doc'
    const res = await intelSearch(props.appId, {
      q,
      kinds,
      project_id: props.projectId,
      limit: 30,
    })
    searchHits.value = res?.data?.items || []
  } catch (e) {
    searchHits.value = []
    ElMessage.error(errMsg(e, '检索失败'))
  } finally {
    searching.value = false
  }
}

const loadGaps = async () => {
  gapsLoading.value = true
  try {
    const res = await intelGaps(props.appId, props.projectId)
    gapsData.value = res?.data || null
  } catch (e) {
    gapsData.value = null
    ElMessage.error(errMsg(e, '缺口扫描失败'))
  } finally {
    gapsLoading.value = false
  }
}

const loadProposals = async () => {
  proposalsLoading.value = true
  try {
    const res = await listIntelProposals(props.appId, {
      status: proposalStatus.value || '',
      limit: 100,
    })
    proposals.value = res?.data?.items || []
  } catch (e) {
    proposals.value = []
    ElMessage.error(errMsg(e, '读取待审队列失败'))
  } finally {
    proposalsLoading.value = false
  }
}

const reviewProposal = async (row, status) => {
  if (!row?.id) return
  reviewing.value = row.id
  try {
    await reviewIntelProposal(props.appId, row.id, { status })
    ElMessage.success(status === 'approved' ? '已通过' : '已驳回')
    await loadProposals()
  } catch (e) {
    ElMessage.error(errMsg(e, '审核失败'))
  } finally {
    reviewing.value = ''
  }
}

const runAsk = async () => {
  const q = askQ.value.trim()
  if (!q) return
  asking.value = true
  askAnswer.value = ''
  askCitations.value = []
  try {
    const res = await intelAsk(props.appId, { question: q, project_id: props.projectId })
    const data = res?.data || {}
    if (!data.ok) {
      ElMessage.error(data.error || '问答失败')
      askCitations.value = data.citations || []
      return
    }
    askAnswer.value = data.answer || ''
    askCitations.value = data.citations || []
  } catch (e) {
    ElMessage.error(errMsg(e, '问答失败（需在设置中配置模型 Key）'))
  } finally {
    asking.value = false
  }
}

const refreshPanel = () => {
  if (panel.value === 'gaps') loadGaps()
  else if (panel.value === 'proposals') loadProposals()
}

watch(() => [props.appId, props.projectId], () => {
  searchHits.value = []
  refreshPanel()
})

watch(panel, refreshPanel)
watch(proposalStatus, () => {
  if (panel.value === 'proposals') loadProposals()
})

onMounted(refreshPanel)
</script>

<template>
  <div class="intel-panel settings-panel">
    <header v-if="!hideNav" class="settings-page-header">
      <div>
        <h2 class="settings-page-title">信息基座</h2>
        <p class="settings-page-desc">
          当前应用：{{ appName || '—' }} · 与导航图徽标（知/文/缺 wiki）同一套数据
        </p>
      </div>
    </header>

    <div class="settings-toolbar">
      <el-radio-group v-model="panel" size="small">
        <el-radio-button value="search">统一检索</el-radio-button>
        <el-radio-button value="gaps">缺口扫描</el-radio-button>
        <el-radio-button value="proposals">待审队列</el-radio-button>
        <el-radio-button value="ask">问答</el-radio-button>
      </el-radio-group>
    </div>

    <section v-if="panel === 'search'" class="settings-table-card search-panel">
      <div class="search-bar">
        <el-input
          v-model="searchQ"
          clearable
          placeholder="跨导航 / 知识 / 文档检索…"
          :prefix-icon="Search"
          @keyup.enter="runSearch"
        />
        <el-button type="primary" :loading="searching" @click="runSearch">检索</el-button>
      </div>
      <div class="kind-filters">
        <el-checkbox-group v-model="searchKinds">
          <el-checkbox label="nav">导航</el-checkbox>
          <el-checkbox label="knowledge">知识</el-checkbox>
          <el-checkbox label="doc">文档</el-checkbox>
        </el-checkbox-group>
      </div>
      <el-table v-loading="searching" :data="searchHits" border stripe size="small" empty-text="输入关键词后检索">
        <el-table-column label="类型" width="100">
          <template #default="{ row }">{{ KIND_LABEL[row.kind] || row.kind }}</template>
        </el-table-column>
        <el-table-column label="标题" min-width="180" prop="title" show-overflow-tooltip />
        <el-table-column label="摘要" min-width="320" show-overflow-tooltip>
          <template #default="{ row }">{{ row.summary }}</template>
        </el-table-column>
        <el-table-column label="引用" width="200" show-overflow-tooltip prop="ref" />
      </el-table>
    </section>

    <section v-else-if="panel === 'gaps'" class="settings-table-card" v-loading="gapsLoading">
      <div v-if="gapsData" class="gaps-summary">
        <el-tag :type="gapsData.has_nav_fsm ? 'success' : 'info'" effect="plain">
          NavFSM {{ gapsData.has_nav_fsm ? '已配置' : '未配置' }}
        </el-tag>
        <span class="muted">知识 {{ gapsData.knowledge_count }} 条</span>
        <span class="muted">文档 {{ gapsData.doc_source_count }} 篇</span>
        <el-button size="small" link type="primary" @click="loadGaps">刷新</el-button>
      </div>
      <h3 class="section-sub">缺少 wiki_ref 的屏态（{{ gapsData?.states_missing_wiki_count ?? 0 }}）</h3>
      <el-table
        :data="gapsData?.states_missing_wiki || []"
        border stripe size="small"
        empty-text="无缺口或尚未配置 NavFSM"
      >
        <el-table-column label="屏态" min-width="200" prop="state_id" />
        <el-table-column label="role" width="120" prop="role" />
        <el-table-column label="kind" width="88" prop="kind" />
      </el-table>
      <p class="hint muted">可在「导航 → 架构/配置」中编辑 NavFSM；深度文档治理在 Console 应用目录。</p>
    </section>

    <section v-else-if="panel === 'proposals'" class="settings-table-card">
      <div class="inner-toolbar">
        <el-select v-model="proposalStatus" size="small" style="width: 140px">
          <el-option label="待审" value="pending" />
          <el-option label="已通过" value="approved" />
          <el-option label="已驳回" value="rejected" />
          <el-option label="全部" value="" />
        </el-select>
        <el-button size="small" :loading="proposalsLoading" @click="loadProposals">刷新</el-button>
      </div>
      <el-table v-loading="proposalsLoading" :data="proposals" border stripe size="small" empty-text="暂无提案">
        <el-table-column label="类型" width="140" prop="kind" />
        <el-table-column label="状态" width="88">
          <template #default="{ row }">
            <el-tag size="small" :type="STATUS_TYPE[row.status] || 'info'" effect="light">
              {{ STATUS_LABEL[row.status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="摘要" min-width="280" show-overflow-tooltip>
          <template #default="{ row }">{{ row.note || JSON.stringify(row.payload || {}).slice(0, 120) }}</template>
        </el-table-column>
        <el-table-column label="" width="160">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button link type="primary" size="small" :loading="reviewing === row.id" @click="reviewProposal(row, 'approved')">通过</el-button>
              <el-button link type="danger" size="small" :loading="reviewing === row.id" @click="reviewProposal(row, 'rejected')">驳回</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section v-else class="settings-table-card ask-panel">
      <div class="search-bar">
        <el-input v-model="askQ" type="textarea" :rows="3" placeholder="基于三渠道检索回答问题…" />
        <el-button type="primary" :loading="asking" @click="runAsk">提问</el-button>
      </div>
      <div v-if="askAnswer" class="ask-answer">
        <h3>回答</h3>
        <pre class="answer-body">{{ askAnswer }}</pre>
        <div v-if="askCitations.length" class="citations">
          <strong>引用</strong>
          <ul>
            <li v-for="(c, i) in askCitations" :key="i">[{{ i + 1 }}] {{ c.title || c.ref }} ({{ c.kind }})</li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.settings-page-desc { margin: 4px 0 0; font-size: 13px; color: var(--el-text-color-secondary); }
.kind-filters { margin: 8px 0 12px; }
.gaps-summary { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 16px; }
.section-sub { font-size: 14px; margin: 0 0 8px; }
.inner-toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
.search-bar { display: flex; gap: 8px; margin-bottom: 12px; max-width: 640px; }
.ask-panel .search-bar { align-items: flex-start; }
.answer-body { white-space: pre-wrap; font-family: inherit; font-size: 13px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
.muted { color: var(--el-text-color-secondary); font-size: 13px; }
.hint { margin-top: 12px; }
</style>
