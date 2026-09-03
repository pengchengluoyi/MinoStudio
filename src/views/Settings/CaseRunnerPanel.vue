<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  runCaseRunner,
  listCaseRunnerTraces,
  getCaseRunnerTraceDetail,
  promoteCaseRunnerBaseline,
  listCaseRunnerDevices,
} from '@/api/caseRunner'
import { getAppAutomationConfig } from '@/api/appAutomation'
import { listAIProviders } from '@/api/settings'
import { generatedCasesFromProcess } from '@/utils/qaProcess'
import ExecutionTimeline from '@/components/ExecutionTimeline.vue'

const props = defineProps({
  appId: { type: String, required: true },
  appName: { type: String, default: '应用' },
  embedded: { type: Boolean, default: true },
})

// ============== state ==============
const devices = ref([])
const providers = ref([])
const cases = ref([])
const casesLoading = ref(false)

const runForm = ref({ sn: '', platform: 'android', use_persisted_baseline: true, use_cache: true, async_exec: true })
const selectedCaseIds = ref([])
const submitting = ref(false)
const newRunVisible = ref(false)

// 左栏 Runs 列表（合并"执行历史 + Trace"：都是同一批 run）
const traceFilter = ref({ caseId: '', onlyPass: false })
const runsList = ref([])
const runsLoading = ref(false)

// 右栏选中 run
const selectedRunId = ref('')
const runningRunId = ref('')          // 刚启动、正在实时跑的 run
const headerMeta = ref(null)          // 选中 run 的头带信息（来自 trace detail）

// ============== helpers ==============
const statusTagType = (s) => {
  if (['pass', 'done'].includes(s)) return 'success'
  if (['fail', 'failed'].includes(s)) return 'danger'
  if (s === 'blocked') return 'warning'
  if (s === 'partial') return 'warning'
  if (s === 'running') return 'primary'
  return 'info'
}
const channelTagType = (s) => {
  if (['connected', 'online', 'available'].includes(s)) return 'success'
  if (s === 'unauthorized') return 'warning'
  if (['disconnected', 'offline'].includes(s)) return 'danger'
  return 'info'
}
const channelLabel = (s) => ({ connected: '已连', disconnected: '断开', unauthorized: '未授权', not_applicable: '不适用' }[s] || s || '?')

const caseExecutionProvider = computed(() =>
  (providers.value || []).find((p) => p.configured && p.enabled !== false && p.case_execution_use === true) || null)
const caseExecutionModelLabel = computed(() => {
  const p = caseExecutionProvider.value
  return p ? `${p.name || p.id} · ${p.model || '默认模型'}` : '未配置（密钥配置 → 大模型 Key，开启「可用」并勾选「用例」）'
})
const selectedDevice = computed(() => devices.value.find((d) => d.sn === runForm.value.sn) || null)

// ============== loaders ==============
const loadDevices = async () => {
  try { const r = await listCaseRunnerDevices(false); devices.value = r?.data?.items || [] } catch (_) {}
}
const loadProviders = async () => {
  try { const r = await listAIProviders(); providers.value = r?.data?.providers || [] } catch (_) {}
}
const loadCases = async () => {
  if (!props.appId) return
  casesLoading.value = true
  try {
    const r = await getAppAutomationConfig(props.appId)
    const reqs = r?.data?.automation?.qa_process?.requirements || []
    cases.value = generatedCasesFromProcess(reqs)
  } catch (_) { ElMessage.warning('未拉到用例，先在流程里写出用例草稿') }
  finally { casesLoading.value = false }
}
const loadRuns = async () => {
  runsLoading.value = true
  try {
    const r = await listCaseRunnerTraces({
      caseId: traceFilter.value.caseId || undefined,
      onlyPass: traceFilter.value.onlyPass,
      limit: 50,
    })
    const items = r?.data?.items || []
    // 若有正在实时跑但还没落库的 run，保留在顶部
    const live = runsList.value.find((x) => x.run_id === runningRunId.value && x.status === 'running')
    const merged = live && !items.some((i) => i.run_id === live.run_id) ? [live, ...items] : items
    runsList.value = merged
  } finally { runsLoading.value = false }
}

const selectRun = async (runId) => {
  if (!runId) return
  selectedRunId.value = runId
  headerMeta.value = null
  try {
    const r = await getCaseRunnerTraceDetail(runId)
    const d = r?.data || {}
    const rc = d.run_context || {}
    headerMeta.value = {
      sn: d.sn || rc.sn || '',
      fingerprint: d.device_signature || rc.device_signature || '',
      model: d.ai_provider_id || d.model_name || '',
      overall: d.overall_status || '',
      adb: (rc.adb && rc.adb.state) || (rc.connectivity && rc.connectivity.adb) || '',
      remote: (rc.remote && rc.remote.state) || (rc.connectivity && rc.connectivity.remote) || '',
      passed: d.passed, failed: d.failed, blocked: d.blocked, skipped: d.skipped,
      elapsed: d.elapsed_ms,
    }
  } catch (_) { headerMeta.value = { live: true } }  // 实时 run 尚未落库
}

const isLive = computed(() => selectedRunId.value && selectedRunId.value === runningRunId.value)

// ============== actions ==============
const submitRun = async () => {
  if (!runForm.value.sn) { ElMessage.warning('请先选择设备'); return }
  if (!selectedCaseIds.value.length) { ElMessage.warning('请至少选择一条用例'); return }
  submitting.value = true
  try {
    const res = await runCaseRunner({
      app_id: props.appId, sn: runForm.value.sn, platform: runForm.value.platform,
      case_ids: selectedCaseIds.value, async_exec: runForm.value.async_exec,
      use_persisted_baseline: runForm.value.use_persisted_baseline, use_cache: runForm.value.use_cache,
    })
    const batch = res?.data?.run_id
    if (!batch) { ElMessage.error('启动失败：未拿到 run_id'); return }
    const firstCaseRun = `${batch}::${selectedCaseIds.value[0]}`
    runningRunId.value = firstCaseRun
    // 顶部插入实时行
    runsList.value = [{ run_id: firstCaseRun, case: selectedCaseIds.value[0], status: 'running' }, ...runsList.value]
    newRunVisible.value = false
    ElMessage.success('已启动，正在实时执行')
    await selectRun(firstCaseRun)
    // 稍后刷新列表拿到真实状态
    setTimeout(loadRuns, 6000)
    setTimeout(loadRuns, 20000)
  } catch (e) {
    ElMessage.error(`启动失败: ${e?.message || e}`)
  } finally { submitting.value = false }
}

const promoteRun = async (runId) => {
  if (!runId) return
  try {
    const note = await ElMessageBox.prompt(`把 ${runId} 提升为 baseline 的备注（可空）`, '提升为 Baseline',
      { confirmButtonText: '确认', cancelButtonText: '取消', inputValue: '' })
    await promoteCaseRunnerBaseline({ run_id: runId, blessed_by: 'manual', notes: note?.value || '' })
    ElMessage.success('已提升为 baseline')
    loadRuns()
  } catch (e) { if (e !== 'cancel') ElMessage.error(`promote 失败: ${e?.message || e}`) }
}

const openNewRun = () => { newRunVisible.value = true; if (!cases.value.length) loadCases() }

onMounted(async () => {
  await Promise.all([loadDevices(), loadProviders(), loadRuns()])
  loadCases()
  if (runsList.value.length) selectRun(runsList.value[0].run_id)
})
</script>

<template>
  <div class="cr">
    <!-- 左栏：Runs 列表 -->
    <div class="cr-left">
      <div class="cr-left-head">
        <el-button type="primary" size="small" @click="openNewRun">▶ 新建执行</el-button>
        <el-button size="small" text @click="loadRuns" :loading="runsLoading">刷新</el-button>
      </div>
      <div class="cr-filter">
        <el-input v-model="traceFilter.caseId" size="small" placeholder="case_id 筛选" clearable @change="loadRuns" style="flex:1" />
        <el-checkbox v-model="traceFilter.onlyPass" size="small" @change="loadRuns">仅pass</el-checkbox>
      </div>
      <div class="cr-runs">
        <div
          v-for="r in runsList" :key="r.run_id"
          class="cr-run" :class="{ active: r.run_id === selectedRunId }"
          @click="selectRun(r.run_id)"
        >
          <div class="cr-run-top">
            <span class="cr-run-case">{{ r.case || r.case_id || r.run_id }}</span>
            <el-tag :type="statusTagType(r.status)" size="small" effect="light">{{ r.status }}</el-tag>
          </div>
          <div class="cr-run-id">{{ r.run_id }}</div>
        </div>
        <el-empty v-if="!runsList.length && !runsLoading" description="暂无执行记录，点「新建执行」开始" :image-size="60" />
      </div>
    </div>

    <!-- 右栏：run 详情 = 头带 + 时间线 -->
    <div class="cr-right">
      <template v-if="selectedRunId">
        <div class="cr-header">
          <div class="cr-header-title">{{ selectedRunId }}</div>
          <div v-if="headerMeta && !headerMeta.live" class="cr-header-meta">
            <span v-if="headerMeta.overall"><el-tag :type="statusTagType(headerMeta.overall)" size="small">{{ headerMeta.overall }}</el-tag></span>
            <span v-if="headerMeta.sn">设备 {{ headerMeta.sn }}</span>
            <span v-if="headerMeta.fingerprint">指纹 {{ headerMeta.fingerprint }}</span>
            <span v-if="headerMeta.model">模型 {{ headerMeta.model }}</span>
            <span v-if="headerMeta.adb">adb <el-tag :type="channelTagType(headerMeta.adb)" size="small" effect="plain">{{ channelLabel(headerMeta.adb) }}</el-tag></span>
            <span v-if="headerMeta.passed !== undefined">P{{ headerMeta.passed }} F{{ headerMeta.failed }} B{{ headerMeta.blocked }} S{{ headerMeta.skipped }}</span>
            <span v-if="headerMeta.elapsed">{{ headerMeta.elapsed }}ms</span>
            <el-button size="small" text type="primary" @click="promoteRun(selectedRunId)">提升为 Baseline</el-button>
          </div>
          <div v-else class="cr-header-meta"><el-tag type="primary" size="small">运行中</el-tag></div>
        </div>
        <ExecutionTimeline class="cr-timeline" :run-id="selectedRunId" :live="isLive" />
      </template>
      <el-empty v-else description="选择左侧一次执行查看步骤时间线" />
    </div>

    <!-- 新建执行弹窗 -->
    <el-dialog v-model="newRunVisible" title="新建执行" width="560px" append-to-body>
      <div class="cr-form">
        <div class="cr-field">
          <label>设备</label>
          <el-select v-model="runForm.sn" placeholder="选择设备" style="width:100%">
            <el-option v-for="d in devices" :key="d.sn" :label="`${d.model || d.sn}（${d.sn}）`" :value="d.sn" />
          </el-select>
          <div v-if="selectedDevice" class="cr-hint">
            adb <el-tag size="small" :type="channelTagType(selectedDevice.channels?.adb_state)" effect="plain">{{ channelLabel(selectedDevice.channels?.adb_state) }}</el-tag>
            · adb 设备将走 agent 模式（实时看每步）
          </div>
        </div>
        <div class="cr-field">
          <label>执行模型</label>
          <div class="cr-hint">{{ caseExecutionModelLabel }}</div>
        </div>
        <div class="cr-field">
          <label>用例（可多选）</label>
          <div class="cr-cases">
            <el-checkbox-group v-model="selectedCaseIds">
              <el-checkbox v-for="c in cases" :key="c.case_id" :value="c.case_id" class="cr-case">
                {{ c.case_id }} · {{ c.name || c.title || '' }}
              </el-checkbox>
            </el-checkbox-group>
            <el-empty v-if="!cases.length && !casesLoading" description="未拉到用例" :image-size="50" />
          </div>
        </div>
        <div class="cr-field cr-opts">
          <el-checkbox v-model="runForm.use_persisted_baseline">用历史 baseline</el-checkbox>
          <el-checkbox v-model="runForm.use_cache">用缓存用例</el-checkbox>
        </div>
      </div>
      <template #footer>
        <el-button @click="newRunVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitRun">▶ 启动</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.cr { display: flex; height: 100%; min-height: 520px; gap: 12px; }
.cr-left { width: 280px; display: flex; flex-direction: column; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; overflow: hidden; }
.cr-left-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #f0f0f0; }
.cr-filter { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid #f0f0f0; }
.cr-runs { flex: 1; overflow-y: auto; padding: 8px; }
.cr-run { padding: 8px 10px; border-radius: 8px; cursor: pointer; border: 1px solid transparent; margin-bottom: 4px; }
.cr-run:hover { background: #f3f4f6; }
.cr-run.active { background: #eff6ff; border-color: #bfdbfe; }
.cr-run-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.cr-run-case { font-size: 13px; font-weight: 500; color: #1f2937; }
.cr-run-id { font-size: 11px; color: #9ca3af; margin-top: 2px; font-family: ui-monospace, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cr-right { flex: 1; display: flex; flex-direction: column; min-width: 0; border: 1px solid #e5e7eb; border-radius: 10px; background: #f8fafc; padding: 12px; }
.cr-header { margin-bottom: 10px; }
.cr-header-title { font-size: 14px; font-weight: 600; color: #111827; font-family: ui-monospace, monospace; }
.cr-header-meta { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; font-size: 12px; color: #6b7280; margin-top: 6px; }
.cr-timeline { flex: 1; min-height: 0; }
.cr-form { display: flex; flex-direction: column; gap: 14px; }
.cr-field label { display: block; font-size: 13px; color: #374151; margin-bottom: 6px; font-weight: 500; }
.cr-hint { font-size: 12px; color: #6b7280; }
.cr-cases { max-height: 240px; overflow-y: auto; border: 1px solid #eee; border-radius: 6px; padding: 8px; }
.cr-case { display: block; margin: 0 0 6px; }
.cr-opts { display: flex; gap: 16px; }
</style>
