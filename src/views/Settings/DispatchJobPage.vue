<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getDispatchCall, listDispatchCalls } from '@/api/settings'
import PayloadView from '@/components/PayloadView.vue'
import {
  clipText,
  findDispatchGroup,
  fmtElapsed,
  fmtTime,
  fmtTokens,
  jobSummary,
  jobTitle,
  relatedWork,
  roleLabel,
  skillLabel,
  sourceLabel,
  statusLabel,
  statusTagType,
  toolCallLabel,
} from '@/utils/dispatchLog'
import './settings-ui.css'

const props = defineProps({
  callId: { type: String, default: '' },
  appId: { type: String, default: '' },
  embedded: { type: Boolean, default: false },
})

const emit = defineEmits(['back'])

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const seed = ref(null)
const steps = ref([])
const selectedId = ref('')

const activeId = computed(() => String(props.callId || route.params.callId || '').trim())
const selected = computed(() => steps.value.find((r) => r.id === selectedId.value) || steps.value[0] || seed.value || null)
const head = computed(() => seed.value || selected.value)
const related = computed(() => relatedWork(head.value))
const tokenTotal = computed(() => steps.value.reduce((n, s) => n + Number(s.total_tokens || 0), 0))
const elapsedTotal = computed(() => steps.value.reduce((n, s) => n + Number(s.elapsed_ms || 0), 0))

const detailBlocks = computed(() => {
  const row = selected.value
  if (!row) return []
  const extras = Array.isArray(row.images) ? row.images : []
  const blocks = []
  if (row.kind === 'llm') {
    blocks.push({ title: 'Prompt', value: row.system_prompt })
    blocks.push({ title: '输入', value: row.input, images: extras })
  } else {
    blocks.push({ title: '输入', value: row.input, images: extras })
  }
  blocks.push({ title: '原始产出', value: row.output || row.detail || row.error })
  return blocks.filter((block) => block.value || block.images?.length)
})

const load = async () => {
  const id = activeId.value
  if (!id) return
  loading.value = true
  try {
    const res = await getDispatchCall(id)
    const row = res?.data || null
    if (!row?.id) {
      ElMessage.error('没有这条调用记录')
      seed.value = null
      steps.value = []
      return
    }
    seed.value = row
    selectedId.value = row.id
    const pid = row.pipeline_id
    if (pid) {
      const list = await listDispatchCalls({ pipeline_id: pid, limit: 300 })
      const group = findDispatchGroup(list?.data?.calls || [], id)
      steps.value = group?._steps?.length ? group._steps : [row]
      if (group?.headline) seed.value = { ...row, ...group, id: row.id }
    } else {
      const list = await listDispatchCalls({
        limit: 300,
        app_id: props.appId || row.app_id || '',
      })
      const group = findDispatchGroup(list?.data?.calls || [row], id)
      steps.value = group?._steps?.length ? group._steps : [row]
      if (group?.headline) seed.value = { ...row, ...group, id: row.id }
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '加载调用记录失败')
  } finally {
    loading.value = false
  }
}

const goBack = () => {
  if (props.embedded) {
    emit('back')
    return
  }
  router.push({ name: 'SettingsDispatch' })
}

const goRelated = () => {
  const work = related.value
  const appId = props.appId || head.value?.app_id || route.params.appId
  if (!appId || !work.tab) return
  router.push({
    name: 'TestingApp',
    params: { appId },
    query: { tab: work.tab, view: work.view },
  })
}

watch(activeId, load)
onMounted(load)
</script>

<template>
  <div class="settings-panel dispatch-job-page wide-panel" v-loading="loading">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">{{ head?.headline || jobTitle(head) }}</h2>
        <p class="settings-page-desc">
          {{ sourceLabel(head?.source || head?.trigger) }}
          <span v-if="head?.app_name"> · {{ head.app_name }}</span>
          · {{ statusLabel(head?.status) }}
          · {{ steps.length }} 步
          · {{ fmtElapsed(elapsedTotal) }}
          · {{ fmtTokens({ total_tokens: tokenTotal }) }} tokens
        </p>
      </div>
      <div class="header-actions">
        <button v-if="related.tab && (embedded || head?.app_id)" type="button" class="settings-action-pill" @click="goRelated">
          {{ related.label }}
          <span class="settings-action-arrow">→</span>
        </button>
        <button type="button" class="ghost-pill" @click="goBack">返回调用记录</button>
      </div>
    </header>

    <p v-if="!loading && !steps.length" class="settings-page-desc">暂无数据</p>

    <div v-else class="job-layout">
      <section class="settings-card flow-card">
        <div class="settings-kicker">执行流程</div>
        <ol class="pipe-flow">
          <li
            v-for="(step, idx) in steps"
            :key="step.id"
            class="pipe-node"
            :class="{ on: step.id === selected?.id }"
            @click="selectedId = step.id"
          >
            <span v-if="idx" class="pipe-line" />
            <span class="pipe-index">{{ idx + 1 }}</span>
            <div class="pipe-body">
              <strong>{{ skillLabel(step.skill || step.job) }}</strong>
              <small>{{ jobSummary(step) }}</small>
              <small>{{ roleLabel(step.role) }} · {{ fmtTime(step.at) }}</small>
            </div>
            <el-tag :type="statusTagType(step.status)" size="small" effect="light">{{ statusLabel(step.status) }}</el-tag>
          </li>
        </ol>
      </section>

      <section v-if="selected" class="settings-card detail-card">
        <div class="settings-kicker">{{ sourceLabel(selected.source || selected.trigger) }} · {{ roleLabel(selected.role) }} · {{ skillLabel(selected.skill || selected.job) }}</div>
        <p class="step-lead">{{ jobSummary(selected) }}</p>
        <dl class="facts">
          <div><dt>来源</dt><dd>{{ sourceLabel(selected.source || selected.trigger) }}</dd></div>
          <div><dt>角色</dt><dd>{{ roleLabel(selected.role) }}</dd></div>
          <div><dt>技能</dt><dd>{{ skillLabel(selected.skill || selected.job) }}</dd></div>
          <div><dt>时间</dt><dd>{{ fmtTime(selected.at) }}</dd></div>
          <div><dt>耗时</dt><dd>{{ fmtElapsed(selected.elapsed_ms) }}</dd></div>
          <div><dt>tokens</dt><dd>{{ selected.kind === 'llm' ? `${selected.prompt_tokens || 0} / ${selected.completion_tokens || 0}` : '—' }}</dd></div>
          <div><dt>模型</dt><dd>{{ selected.model || (selected.kind === 'job' ? '流水线节点' : '—') }}</dd></div>
          <div v-if="selected.kind === 'llm' && (selected.job === 'agent-decide' || selected.used_tool_calls || selected.tools_downgraded || selected.tool_name)">
            <dt>Function Calling</dt>
            <dd>{{ toolCallLabel(selected) || '—' }}</dd>
          </div>
        </dl>
        <p v-if="selected.error && selected.status === 'error'" class="err">{{ clipText(selected.error, 240) }}</p>
        <PayloadView
          v-for="block in detailBlocks"
          :key="block.title"
          :title="block.title"
          :value="block.value"
          :images="block.images || []"
        />
      </section>
    </div>
  </div>
</template>

<style scoped>
.dispatch-job-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  gap: 12px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ghost-pill {
  min-height: 28px;
  padding: 0 12px;
  border: 1px solid var(--settings-border);
  border-radius: 999px;
  background: #fff;
  color: var(--settings-muted);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.job-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(280px, 0.9fr) minmax(0, 1.3fr);
  gap: 12px;
  overflow: hidden;
}

.flow-card,
.detail-card {
  min-height: 0;
  overflow: auto;
}

.pipe-flow {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.pipe-node {
  position: relative;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px 8px;
  border: 1px solid var(--settings-border);
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
}

.pipe-node + .pipe-node {
  margin-top: 10px;
}

.pipe-node.on {
  border-color: color-mix(in srgb, var(--settings-primary) 42%, white);
  background: var(--settings-primary-soft);
}

.pipe-line {
  position: absolute;
  left: 21px;
  top: -10px;
  width: 2px;
  height: 10px;
  background: #c7d2fe;
}

.pipe-index {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 12px;
  font-weight: 800;
}

.pipe-body {
  min-width: 0;
}

.pipe-body strong {
  display: block;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pipe-body small {
  display: block;
  margin-top: 2px;
  color: var(--settings-muted);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-lead {
  margin: 8px 0 0;
  color: #111827;
  font-size: 14px;
  line-height: 1.55;
}

.facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 12px 0;
}

.facts dt {
  color: var(--settings-muted);
  font-size: 11px;
  font-weight: 700;
}

.facts dd {
  margin: 4px 0 0;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-card :deep(.pv:not(.nested)) {
  margin-top: 12px;
}

.err {
  margin: 8px 0 0;
  color: #b91c1c;
  font-size: 12px;
}

@media (max-width: 960px) {
  .job-layout {
    grid-template-columns: 1fr;
    overflow: auto;
  }
  .facts {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
