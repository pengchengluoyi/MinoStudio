<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import '@/views/Settings/settings-ui.css'
import QaEnvLinkMap from '@/views/Testing/QaEnvLinkMap.vue'
import {
  DISPATCH_RUNS,
  ENV_PROFILES,
  PROCESS_JOBS,
  STEP_KINDS,
  chainLabel,
  cloneWorkflow,
  defaultChainIdForKind,
  defaultChains,
  defaultJobsForKind,
  defaultWorkflow,
  ensurePipelineDispatch,
  envGapsForWorkflow,
  envLabel,
  jobMeta,
  jobsOfStep,
  kindMeta,
  leaveLabel,
  makeStep,
  validateWorkflow,
} from '@/utils/qaWorkflow'

const props = defineProps({
  workflow: { type: Object, default: null },
  requirements: { type: Array, default: () => [] },
  releases: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false },
  envSummaries: { type: Array, default: () => [] },
  mode: { type: String, default: 'all' },
  track: { type: String, default: '' },
  hideNav: { type: Boolean, default: false },
})

const emit = defineEmits(['save', 'go-env', 'go-process'])

const envNameList = computed(() => (props.envSummaries || []).map((s) => ({ key: s.key, label: s.label })))
const pipelineEnvKeys = computed(() => {
  const list = props.envSummaries || []
  const pipe = list.filter((s) => s.inPipeline).map((s) => s.key)
  if (pipe.length) return pipe
  const filled = list.filter((s) => s.filled).map((s) => s.key)
  return filled.length ? filled : list.map((s) => s.key)
})
const envChoices = computed(() => {
  const list = props.envSummaries || []
  if (!list.length) {
    return ENV_PROFILES.map((key) => ({ key, label: envLabel(key), filled: true }))
  }
  return list.map((s) => ({
    key: s.key,
    label: s.filled ? s.label : `${s.label}（未填渠道）`,
    filled: s.filled,
  }))
})
const knownEnvKeys = computed(() => new Set(envChoices.value.map((e) => e.key)))
const envOf = (key) => (props.envSummaries || []).find((s) => s.key === key) || null

const withPipeline = (doc) => ensurePipelineDispatch(
  cloneWorkflow(doc || defaultWorkflow({
    envKeys: pipelineEnvKeys.value,
    environments: envNameList.value,
  })),
  pipelineEnvKeys.value,
  envNameList.value,
)

const draft = ref(withPipeline(props.workflow))
const envGaps = computed(() => envGapsForWorkflow(draft.value, pipelineEnvKeys.value, envNameList.value))
const addKind = ref({ req: 'checkpoint', rel: 'checkpoint' })
const selectedId = ref({
  req: draft.value.tracks.req.steps[0]?.id || '',
  rel: draft.value.tracks.rel.steps[0]?.id || '',
})
const dirty = ref(false)
const editorTab = ref(props.mode === 'chains' ? 'chains' : (props.track === 'rel' ? 'rel' : 'req'))
const selectedChainId = ref('')
const page = ref('list')
const editing = ref(false)
const showTracks = computed(() => props.mode !== 'chains')
const showChains = computed(() => props.mode !== 'tracks')
const showTrackTabs = computed(() => !props.hideNav && !props.track && showTracks.value)

watch(() => props.mode, (mode) => {
  if (mode === 'chains') editorTab.value = 'chains'
  else if (mode === 'tracks' && editorTab.value === 'chains') editorTab.value = props.track === 'rel' ? 'rel' : 'req'
})

watch(() => props.track, (t) => {
  if (t === 'req' || t === 'rel') editorTab.value = t
})

watch(editorTab, () => {
  page.value = 'list'
  editing.value = false
})

watch(() => props.workflow, (wf) => {
  if (dirty.value) return
  draft.value = withPipeline(wf)
  selectedId.value = {
    req: selectedId.value.req && draft.value.tracks.req.steps.some((s) => s.id === selectedId.value.req)
      ? selectedId.value.req
      : (draft.value.tracks.req.steps[0]?.id || ''),
    rel: selectedId.value.rel && draft.value.tracks.rel.steps.some((s) => s.id === selectedId.value.rel)
      ? selectedId.value.rel
      : (draft.value.tracks.rel.steps[0]?.id || ''),
  }
  if (!draft.value.chains?.length) draft.value.chains = defaultChains()
  selectedChainId.value = draft.value.chains[0]?.id || ''
}, { deep: true })

watch(pipelineEnvKeys, () => {
  draft.value = ensurePipelineDispatch(draft.value, pipelineEnvKeys.value, envNameList.value)
})

const runOptions = Object.entries(DISPATCH_RUNS).map(([id, meta]) => ({ id, label: meta.label }))

const selectedReqStep = computed(() => {
  const steps = draft.value.tracks.req.steps
  return steps.find((s) => s.id === selectedId.value.req) || steps[0] || null
})
const selectedRelStep = computed(() => {
  const steps = draft.value.tracks.rel.steps
  return steps.find((s) => s.id === selectedId.value.rel) || steps[0] || null
})
const selectedOf = (track) => (track === 'req' ? selectedReqStep.value : selectedRelStep.value)
const selectedIndex = (track) => draft.value.tracks[track].steps.findIndex((s) => s.id === selectedId.value[track])

const markDirty = () => { dirty.value = true }

const setStepField = (track, key, value) => {
  const idx = selectedIndex(track)
  const step = draft.value.tracks[track].steps[idx]
  if (!step) return
  step[key] = value
  if (key === 'kind') {
    if (value === 'dispatch') {
      const fallback = track === 'rel' ? 'release_regression' : 'req_test'
      if (!DISPATCH_RUNS[step.run]) step.run = fallback
      if (!knownEnvKeys.value.has(step.env)) step.env = DISPATCH_RUNS[step.run]?.defaultEnv || pipelineEnvKeys.value[0] || 'test'
      step.auto_advance = Boolean(step.auto_advance)
      if (!step.jobs?.length) step.jobs = defaultJobsForKind('dispatch')
    } else {
      delete step.run
      delete step.env
      delete step.auto_advance
      if (!step.workflow_id) step.workflow_id = defaultChainIdForKind(value, track)
      if (!step.jobs?.length) step.jobs = defaultJobsForKind(value, track)
    }
  }
  if (key === 'run' && DISPATCH_RUNS[value] && !knownEnvKeys.value.has(step.env)) {
    step.env = knownEnvKeys.value.has(DISPATCH_RUNS[value].defaultEnv)
      ? DISPATCH_RUNS[value].defaultEnv
      : (pipelineEnvKeys.value[0] || 'test')
  }
  markDirty()
}

const moveStep = (track, dir) => {
  const steps = draft.value.tracks[track].steps
  const idx = selectedIndex(track)
  const j = idx + dir
  if (idx < 0 || j < 0 || j >= steps.length) return
  const copy = [...steps]
  const [row] = copy.splice(idx, 1)
  copy.splice(j, 0, row)
  draft.value.tracks[track].steps = copy
  markDirty()
}

const removeSelected = (track) => {
  const idx = selectedIndex(track)
  const step = draft.value.tracks[track].steps[idx]
  if (!step) return
  if (draft.value.tracks[track].steps.length <= 2) {
    ElMessage.warning('每条轨至少 2 个阶段')
    return
  }
  const next = draft.value.tracks[track].steps.filter((_, i) => i !== idx)
  draft.value.tracks[track].steps = next
  selectedId.value[track] = next[Math.max(0, idx - 1)]?.id || ''
  page.value = 'list'
  editing.value = false
  markDirty()
}

const addStep = (track) => {
  const kind = addKind.value[track]
  const step = makeStep(kind, { track })
  draft.value.tracks[track].steps = [...draft.value.tracks[track].steps, step]
  selectedId.value[track] = step.id
  markDirty()
}

const chainOptions = computed(() => draft.value.chains || [])
const selectedChain = computed(() => chainOptions.value.find((c) => c.id === selectedChainId.value) || chainOptions.value[0] || null)
const boundJobs = (step, track) => jobsOfStep(step, draft.value, track).map((id) => jobMeta(id).label).join('、') || '—'
const jobLine = (step, track) => boundJobs(step, track)

const selectStep = (track, row) => {
  if (row?.id) selectedId.value[track] = row.id
}

const openStep = (track, row) => {
  selectStep(track, row)
  page.value = 'item'
  editing.value = false
}

const openChain = (row) => {
  if (row?.id) selectedChainId.value = row.id
  page.value = 'item'
  editing.value = false
}

const backToList = () => {
  page.value = 'list'
  editing.value = false
}

const goProcess = (track) => {
  emit('go-process', { track, stepId: selectedId.value[track] })
}

const setChainField = (key, value) => {
  const chain = selectedChain.value
  if (!chain) return
  chain[key] = value
  markDirty()
}

const addJobPick = ref('')

const addChainJob = (capabilityId) => {
  const chain = selectedChain.value
  if (!chain || !capabilityId) return
  const meta = jobMeta(capabilityId)
  chain.steps = [...(chain.steps || []), { capability_id: meta.id, role_id: meta.role_id, label: meta.label }]
  markDirty()
}

const onAddChainJob = (id) => {
  addChainJob(id)
  addJobPick.value = ''
}

const removeChainJob = (idx) => {
  const chain = selectedChain.value
  if (!chain) return
  chain.steps = (chain.steps || []).filter((_, i) => i !== idx)
  markDirty()
}

const moveChainJob = (idx, dir) => {
  const chain = selectedChain.value
  if (!chain) return
  const next = [...(chain.steps || [])]
  const j = idx + dir
  if (j < 0 || j >= next.length) return
  const [row] = next.splice(idx, 1)
  next.splice(j, 0, row)
  chain.steps = next
  markDirty()
}

const addChain = () => {
  const id = `wf-${Date.now().toString(36)}`
  const chain = { id, name: '新工作流', summary: '', steps: [] }
  draft.value.chains = [...(draft.value.chains || []), chain]
  selectedChainId.value = id
  editorTab.value = 'chains'
  page.value = 'item'
  editing.value = true
  markDirty()
}

const removeChain = () => {
  const id = selectedChain.value?.id
  if (!id) return
  if ((draft.value.chains || []).length <= 1) {
    ElMessage.warning('至少保留一条工作流')
    return
  }
  draft.value.chains = draft.value.chains.filter((c) => c.id !== id)
  for (const key of ['req', 'rel']) {
    for (const step of draft.value.tracks[key].steps) {
      if (step.workflow_id === id) step.workflow_id = ''
    }
  }
  selectedChainId.value = draft.value.chains[0]?.id || ''
  page.value = 'list'
  editing.value = false
  markDirty()
}

const restoreDefault = async () => {
  try {
    await ElMessageBox.confirm(
      pipelineEnvKeys.value.length
        ? `按上线顺序（${pipelineEnvKeys.value.map((k) => envLabel(k, envNameList.value)).join(' → ')}）生成？需求测试会覆盖每一套环境；版本测试纳入需求并回归历史功能。未保存的改名和增删会丢掉。`
        : '还没配上线顺序，会按测试 → 预发 → 正式生成。未保存的改名和增删会丢掉。',
      '恢复默认模板',
      { type: 'warning' },
    )
  } catch { return }
  draft.value = defaultWorkflow({
    envKeys: pipelineEnvKeys.value,
    environments: envNameList.value,
  })
  selectedId.value = {
    req: draft.value.tracks.req.steps[0]?.id || '',
    rel: draft.value.tracks.rel.steps[0]?.id || '',
  }
  selectedChainId.value = draft.value.chains?.[0]?.id || ''
  markDirty()
}

const save = async () => {
  const check = validateWorkflow(draft.value)
  if (!check.ok) {
    ElMessage.warning(check.errors[0] || '流程模板不合法')
    return
  }
  emit('save', cloneWorkflow(draft.value))
  dirty.value = false
}

const howText = (step, track) => {
  if (!step) return ''
  if (step.kind === 'human_verdict') {
    return track === 'rel'
      ? '发版评审：只能判定通过 / 带风险发版 / 不发版，不能自动走进下一步。'
      : '测试验收：只能判定通过 / 带风险 / 退回重测，不能自动走进下一步。'
  }
  if (step.kind === 'dispatch' && step.auto_advance) return `任务跑完后自动走进下一阶段（${DISPATCH_RUNS[step.run]?.label || step.run} · ${envOf(step.env)?.label || envLabel(step.env)}）。`
  if (step.kind === 'dispatch') return `点「进入下一步」才走。下发 ${DISPATCH_RUNS[step.run]?.label || step.run} 到${envOf(step.env)?.label || envLabel(step.env)}环境。`
  const how = leaveLabel(step, track)
  return how ? `离开本阶段：${how}。` : '终点，不再往下走。'
}
</script>

<template>
  <div class="qa-flow-editor">
    <div class="flow-toolbar-row">
      <p class="flow-lead">
        <template v-if="mode === 'chains'">把角色 prompt 按顺序排好，再挂到流程模板的阶段上。</template>
        <template v-else>
          需求测试：每个需求按上线顺序覆盖全部环境。
          版本测试：纳入本版需求，再回归历史功能，确认能发版。
        </template>
      </p>
      <div class="flow-toolbar">
        <button type="button" class="settings-action-pill" @click="emit('go-env')">
          去改环境<span class="settings-action-arrow">→</span>
        </button>
        <button v-if="showTracks" type="button" class="settings-action-pill" @click="restoreDefault">
          按上线顺序生成默认阶段<span class="settings-action-arrow">↺</span>
        </button>
        <el-button size="small" type="primary" :loading="saving" :disabled="!dirty" @click="save">{{ mode === 'chains' ? '保存工作流' : '保存模板' }}</el-button>
      </div>
    </div>
    <QaEnvLinkMap v-if="page === 'list' && showTracks" :workflow="draft" :env-summaries="envSummaries" />
    <p v-if="page === 'list' && showTracks && envGaps.length" class="hint warn-line">
      {{ envGaps.map((g) => g.hint).join('；') }}。可改阶段环境，或按上线顺序生成默认阶段。
    </p>

    <template v-if="page === 'list'">
    <div v-if="mode === 'all' && !hideNav" class="settings-tabbar">
      <button type="button" class="settings-tab" :class="{ active: editorTab === 'req' }" @click="editorTab = 'req'">
        <strong>{{ draft.tracks.req.label }}</strong>
        <span>点一行进入该阶段</span>
      </button>
      <button type="button" class="settings-tab" :class="{ active: editorTab === 'rel' }" @click="editorTab = 'rel'">
        <strong>{{ draft.tracks.rel.label }}</strong>
        <span>点一行进入该阶段</span>
      </button>
      <button type="button" class="settings-tab" :class="{ active: editorTab === 'chains' }" @click="editorTab = 'chains'">
        <strong>工作流</strong>
        <span>搭配 prompt，挂到阶段上</span>
      </button>
    </div>
    <div v-else-if="showTrackTabs" class="settings-tabbar">
      <button type="button" class="settings-tab" :class="{ active: editorTab === 'req' }" @click="editorTab = 'req'">
        <strong>{{ draft.tracks.req.label }}</strong>
        <span>点一行进入该阶段</span>
      </button>
      <button type="button" class="settings-tab" :class="{ active: editorTab === 'rel' }" @click="editorTab = 'rel'">
        <strong>{{ draft.tracks.rel.label }}</strong>
        <span>点一行进入该阶段</span>
      </button>
    </div>

    <section v-if="editorTab !== 'chains'" class="settings-table-card is-fill flow-track">
      <header class="flow-col-head">
        <strong>{{ draft.tracks[editorTab].label }}</strong>
        <span class="muted">{{ draft.tracks[editorTab].steps.length }} 个阶段</span>
        <el-button link type="primary" size="small" @click="goProcess(editorTab)">在流程里查看</el-button>
      </header>
      <div class="table-pane">
      <el-table
        :data="draft.tracks[editorTab].steps"
        size="small"
        border
        stripe
        height="100%"
        row-key="id"
        empty-text="还没有阶段"
        @row-click="(row) => openStep(editorTab, row)"
      >
        <el-table-column label="#" width="52">
          <template #default="{ $index }">{{ $index + 1 }}</template>
        </el-table-column>
        <el-table-column label="阶段" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.label }}</template>
        </el-table-column>
        <el-table-column label="类型" width="110">
          <template #default="{ row }">{{ kindMeta(row.kind).label }}</template>
        </el-table-column>
        <el-table-column label="绑定工作流" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.kind === 'dispatch' ? '下发真机任务' : chainLabel(draft, row.workflow_id) }}</template>
        </el-table-column>
        <el-table-column label="会跑的 Job" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">{{ row.kind === 'dispatch' ? (DISPATCH_RUNS[row.run]?.label || '—') : jobLine(row, editorTab) }}</template>
        </el-table-column>
        <el-table-column label="离开" width="100">
          <template #default="{ row }">{{ leaveLabel(row, editorTab) || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="72" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click.stop="openStep(editorTab, row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>
      </div>
      <div class="flow-add">
        <el-select v-model="addKind[editorTab]" size="small">
          <el-option v-for="k in STEP_KINDS" :key="k.id" :label="k.label" :value="k.id" />
        </el-select>
        <el-button size="small" @click="addStep(editorTab)">在末尾加阶段</el-button>
      </div>
    </section>

    <section v-else class="settings-table-card is-fill flow-track">
      <header class="flow-col-head">
        <strong>工作流</strong>
        <span class="muted">把角色 prompt 按顺序排好，再挂到上面的阶段</span>
        <el-button size="small" @click="addChain">新建工作流</el-button>
      </header>
      <div class="table-pane">
      <el-table
        :data="chainOptions"
        size="small"
        border
        stripe
        height="100%"
        row-key="id"
        empty-text="还没有工作流"
        @row-click="openChain"
      >
        <el-table-column label="名称" min-width="140" prop="name" />
        <el-table-column label="说明" min-width="180" show-overflow-tooltip prop="summary" />
        <el-table-column label="Prompt / Job" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ (row.steps || []).map((s) => s.label || jobMeta(s.capability_id).label).join(' → ') || '还没搭配' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="72" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click.stop="openChain(row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>
      </div>
    </section>
    </template>

    <section v-else-if="editorTab !== 'chains' && selectedOf(editorTab)" class="settings-card flow-page">
      <div class="ticket-back">
        <el-button link type="primary" @click="backToList">← 返回阶段列表</el-button>
      </div>
      <div class="flow-inspector-head">
        <strong>{{ selectedOf(editorTab).label }}</strong>
        <span class="muted">{{ kindMeta(selectedOf(editorTab).kind).label }}</span>
        <el-button v-if="!editing" size="small" @click="editing = true">编辑</el-button>
        <el-button v-else size="small" @click="editing = false">完成</el-button>
      </div>
      <p class="how">{{ howText(selectedOf(editorTab), editorTab) }}</p>
      <dl v-if="!editing" class="flow-view">
        <div>
          <dt>阶段名称</dt>
          <dd>{{ selectedOf(editorTab).label }}</dd>
        </div>
        <div>
          <dt>这一步做什么</dt>
          <dd>{{ kindMeta(selectedOf(editorTab).kind).label }}</dd>
        </div>
        <div>
          <dt>提示</dt>
          <dd>{{ selectedOf(editorTab).hint || '—' }}</dd>
        </div>
        <div v-if="selectedOf(editorTab).kind !== 'dispatch'">
          <dt>绑定工作流</dt>
          <dd>{{ chainLabel(draft, selectedOf(editorTab).workflow_id) }} · {{ jobLine(selectedOf(editorTab), editorTab) }}</dd>
        </div>
        <template v-else>
          <div>
            <dt>环境</dt>
            <dd>{{ envOf(selectedOf(editorTab).env)?.label || envLabel(selectedOf(editorTab).env) }}</dd>
          </div>
          <div>
            <dt>下发种类</dt>
            <dd>{{ DISPATCH_RUNS[selectedOf(editorTab).run]?.label || selectedOf(editorTab).run }}</dd>
          </div>
          <div>
            <dt>Prompt / Job</dt>
            <dd>{{ jobLine(selectedOf(editorTab), editorTab) }}</dd>
          </div>
          <div>
            <dt>任务结束后</dt>
            <dd>{{ selectedOf(editorTab).auto_advance ? '走进下一阶段' : '停在本阶段' }}</dd>
          </div>
        </template>
      </dl>
      <template v-else>
        <div class="flow-inspector-head">
          <el-button size="small" text :disabled="selectedIndex(editorTab) <= 0" @click="moveStep(editorTab, -1)">上移</el-button>
          <el-button
            size="small"
            text
            :disabled="selectedIndex(editorTab) === draft.tracks[editorTab].steps.length - 1"
            @click="moveStep(editorTab, 1)"
          >下移</el-button>
          <el-button
            size="small"
            text
            type="danger"
            :disabled="draft.tracks[editorTab].steps.length <= 2"
            @click="removeSelected(editorTab)"
          >删除阶段</el-button>
        </div>
        <div class="flow-grid">
          <label>
            阶段名称
            <el-input
              :model-value="selectedOf(editorTab).label"
              size="small"
              @update:model-value="(v) => setStepField(editorTab, 'label', v)"
            />
          </label>
          <label>
            这一步做什么
            <el-select
              :model-value="selectedOf(editorTab).kind"
              size="small"
              @update:model-value="(v) => setStepField(editorTab, 'kind', v)"
            >
              <el-option v-for="k in STEP_KINDS" :key="k.id" :label="k.label" :value="k.id" />
            </el-select>
          </label>
        </div>
        <label class="flow-hint">
          提示
          <el-input
            :model-value="selectedOf(editorTab).hint"
            size="small"
            placeholder="停在这步时给测试看的说明"
            @update:model-value="(v) => setStepField(editorTab, 'hint', v)"
          />
        </label>
        <label v-if="selectedOf(editorTab).kind !== 'dispatch'" class="flow-hint">
          绑定工作流
          <el-select
            :model-value="selectedOf(editorTab).workflow_id || ''"
            size="small"
            clearable
            placeholder="选一条工作流，进入该阶段时按顺序跑"
            @update:model-value="(v) => setStepField(editorTab, 'workflow_id', v)"
          >
            <el-option v-for="c in chainOptions" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
          <span class="muted">{{ jobLine(selectedOf(editorTab), editorTab) }}</span>
        </label>
        <div v-if="selectedOf(editorTab).kind === 'dispatch'" class="flow-dispatch">
          <label>
            环境
            <el-select
              :model-value="selectedOf(editorTab).env"
              size="small"
              @update:model-value="(v) => setStepField(editorTab, 'env', v)"
            >
              <el-option v-for="env in envChoices" :key="env.key" :label="env.label" :value="env.key" />
            </el-select>
            <span v-if="envOf(selectedOf(editorTab).env)" class="muted env-note">
              <template v-if="envOf(selectedOf(editorTab).env).filled">
                下发时用：{{ envOf(selectedOf(editorTab).env).channelText || envOf(selectedOf(editorTab).env).preview }}
              </template>
              <template v-else>「{{ envOf(selectedOf(editorTab).env).label }}」还没填渠道，下发会拉不起应用。</template>
            </span>
          </label>
          <label>
            下发种类
            <el-select
              :model-value="selectedOf(editorTab).run"
              size="small"
              @update:model-value="(v) => setStepField(editorTab, 'run', v)"
            >
              <el-option v-for="r in runOptions" :key="r.id" :label="r.label" :value="r.id" />
            </el-select>
          </label>
          <el-checkbox
            :model-value="Boolean(selectedOf(editorTab).auto_advance)"
            @update:model-value="(v) => setStepField(editorTab, 'auto_advance', v)"
          >任务结束后走进下一阶段</el-checkbox>
        </div>
      </template>
    </section>

    <section v-else-if="selectedChain" class="settings-card flow-page">
      <div class="ticket-back">
        <el-button link type="primary" @click="backToList">← 返回工作流列表</el-button>
      </div>
      <div class="flow-inspector-head">
        <strong>{{ selectedChain.name }}</strong>
        <el-button v-if="!editing" size="small" @click="editing = true">编辑</el-button>
        <el-button v-else size="small" @click="editing = false">完成</el-button>
      </div>
      <dl v-if="!editing" class="flow-view">
        <div>
          <dt>名称</dt>
          <dd>{{ selectedChain.name }}</dd>
        </div>
        <div>
          <dt>说明</dt>
          <dd>{{ selectedChain.summary || '—' }}</dd>
        </div>
        <div>
          <dt>Prompt / Job</dt>
          <dd>{{ (selectedChain.steps || []).map((s) => s.label || jobMeta(s.capability_id).label).join(' → ') || '还没搭配' }}</dd>
        </div>
      </dl>
      <template v-else>
        <div class="flow-inspector-head">
          <el-button size="small" text type="danger" @click="removeChain">删除工作流</el-button>
        </div>
        <div class="flow-grid">
          <label>
            名称
            <el-input :model-value="selectedChain.name" size="small" @update:model-value="(v) => setChainField('name', v)" />
          </label>
          <label>
            说明
            <el-input :model-value="selectedChain.summary" size="small" @update:model-value="(v) => setChainField('summary', v)" />
          </label>
        </div>
        <div class="chain-jobs">
          <div v-for="(job, idx) in selectedChain.steps" :key="`${job.capability_id}-${idx}`" class="chain-job">
            <span>{{ idx + 1 }}. {{ job.label || jobMeta(job.capability_id).label }}</span>
            <span class="muted">{{ jobMeta(job.capability_id).output }}</span>
            <el-button link size="small" :disabled="idx === 0" @click="moveChainJob(idx, -1)">上</el-button>
            <el-button link size="small" :disabled="idx === selectedChain.steps.length - 1" @click="moveChainJob(idx, 1)">下</el-button>
            <el-button link size="small" type="danger" @click="removeChainJob(idx)">移除</el-button>
          </div>
          <el-select v-model="addJobPick" placeholder="加一个 prompt / Job" size="small" clearable @change="onAddChainJob">
            <el-option
              v-for="j in PROCESS_JOBS"
              :key="j.id"
              :label="`${j.label} · ${j.output}`"
              :value="j.id"
            />
          </el-select>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.qa-flow-editor {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.qa-flow-editor .settings-info-card p {
  margin: 6px 0 0;
  font-size: 13px;
  color: #374151;
  line-height: 1.5;
}
.flow-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.flow-toolbar-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}
.flow-lead {
  margin: 0;
  flex: 1;
  min-width: 220px;
  font-size: 13px;
  color: #374151;
  line-height: 1.5;
}
.track-hint {
  margin-left: auto;
  font-size: 12px;
  color: #6b7280;
}
.flow-track {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.flow-col-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.flow-col-head :deep(.el-input) { width: 220px; }
.muted { color: #6b7280; font-size: 12px; }
.warn-line { color: #b45309 !important; }
.env-note { margin-top: 4px; font-weight: 400; }
.how {
  margin: 0;
  padding: 8px 10px;
  border-radius: 10px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 12px;
  line-height: 1.5;
}
.flow-inspector {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid #e3e8f0;
  border-radius: 12px;
  background: #f8fafc;
}
.flow-inspector-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.flow-inspector-head strong { font-size: 16px; color: #111827; }
.ticket-back { margin-bottom: 4px; }
.flow-page { display: flex; flex-direction: column; gap: 12px; flex: 1; min-height: 0; overflow: auto; }
.table-pane {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.flow-col-head,
.flow-add { flex-shrink: 0; }
.flow-view {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px 16px;
  margin: 0;
}
.flow-view dt {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
}
.flow-view dd {
  margin: 4px 0 0;
  font-size: 13px;
  color: #111827;
  line-height: 1.5;
}
.flow-track :deep(.el-table .el-table__row) { cursor: pointer; }
.flow-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
}
.flow-grid label,
.flow-hint,
.flow-dispatch label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.flow-dispatch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  align-items: center;
}
.flow-dispatch :deep(.el-checkbox) { grid-column: 1 / -1; }
.flow-add {
  display: flex;
  gap: 8px;
  align-items: center;
}
.flow-add :deep(.el-select) { width: 180px; }
.chain-jobs {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.chain-job {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 10px;
  border: 1px solid #e3e8f0;
  border-radius: 10px;
  background: #fff;
  font-size: 13px;
}
@media (max-width: 720px) {
  .flow-grid,
  .flow-dispatch,
  .flow-view { grid-template-columns: minmax(0, 1fr); }
}
</style>
