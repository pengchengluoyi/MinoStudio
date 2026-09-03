<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { createAppInProject, createProject, deleteAppInProject, deleteProject, getProjects } from '@/api/workReport'
import { getAppAutomationConfig, listQaProcessSummary, updateAppAutomationConfig } from '@/api/appAutomation'
import { APP_PLATFORM_OPTIONS, APP_PLATFORM_OPTIONS_ADVANCED, formatPlatformTags } from '@/constants/appPlatforms'
import { listCaseRunnerDevices, listCaseRunnerRuns, listTestingTaskSummary } from '@/api/caseRunner'
import { fetchTaskDetail } from '@/composables/useTestingTasks'
import { isMissingTaskEndpoint, normalizeTask, statusLabel, statusTagType, taskCountLabel } from '@/utils/testingTasks'
import { filterExecutableDevices } from '@/utils/testingDevices'
import { formatSlotCardLine, nextUpcomingSlot, nowIso, persistableSlot } from '@/utils/qaProcess'
import WorkShell from '@/layouts/WorkShell.vue'
import QaScheduleBoard from '@/views/Testing/QaScheduleBoard.vue'
import '@/views/Settings/settings-ui.css'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const projects = ref([])
const liveByApp = ref({})
const runningCountByApp = ref({})
const filterProjectId = ref('')
const homeView = ref(['schedule', 'manage'].includes(String(route.query.view || '')) ? String(route.query.view) : 'apps')
const processItems = ref([])
const devices = ref([])
const deleting = ref(false)
const deleteOpen = ref(false)
const deleteStep = ref(1)
const deleteConfirmName = ref('')
const deleteTarget = ref(null)
const creating = ref(false)
const createOpen = ref(false)
const createKind = ref('project')
const createTargetProject = ref(null)
const createForm = reactive({
  name: '',
  description: '',
  platform: 'Mobile',
})
const platformChoices = [...APP_PLATFORM_OPTIONS, ...APP_PLATFORM_OPTIONS_ADVANCED]

const unwrapRow = (res) => (res?.id ? res : (res?.data || res || {}))

const filteredProjects = computed(() => {
  if (!filterProjectId.value) return projects.value
  return projects.value.filter((p) => p.id === filterProjectId.value)
})

const appOptions = computed(() => processItems.value.map((row) => ({
  id: row.app_id,
  name: row.app_name,
  projectId: row.project_id,
  projectName: row.project_name,
})))

const labSlots = computed(() => processItems.value.flatMap((row) => (
  (row.schedule || []).map((s) => ({
    ...s,
    app_id: row.app_id,
    app_name: row.app_name,
    project_id: row.project_id,
    project_name: row.project_name,
  }))
)))

const labRequirements = computed(() => processItems.value.flatMap((row) => (
  (row.requirements || []).map((r) => ({ ...r, app_id: row.app_id }))
)))

const labReleases = computed(() => processItems.value.flatMap((row) => (
  (row.releases || []).map((r) => ({ ...r, app_id: row.app_id }))
)))

const workflowsByApp = computed(() => {
  const map = {}
  for (const row of processItems.value) {
    if (row.app_id && row.workflow) map[row.app_id] = row.workflow
  }
  return map
})

const nextSlotByApp = computed(() => {
  const map = {}
  for (const row of processItems.value) {
    const hit = nextUpcomingSlot(row.schedule || [])
    if (hit) map[row.app_id] = hit
  }
  return map
})

const findAppMeta = (appId) => {
  for (const p of projects.value) {
    const app = (p.apps || []).find((a) => a.id === appId)
    if (app) return { app, project: p }
  }
  const row = processItems.value.find((x) => x.app_id === appId)
  return {
    app: { id: appId, name: row?.app_name || '' },
    project: { id: row?.project_id || '', name: row?.project_name || '' },
  }
}

const inventory = computed(() => ({
  projects: filteredProjects.value.length,
  apps: filteredProjects.value.reduce((n, p) => n + (p.apps || []).length, 0),
}))

const stayOnHome = () => {
  const view = String(route.query.view || '')
  return view === 'manage' || view === 'schedule' || !!route.query.task
}

const enterDefaultProject = () => {
  if (stayOnHome()) return false
  const wanted = String(route.query.projectId || '')
  const target = (wanted && projects.value.find((p) => p.id === wanted)) || projects.value[0]
  if (!target) return false
  openProject(target)
  return true
}

const setHomeView = (v) => {
  if (v === 'apps' || !v) {
    if (projects.value[0]) {
      enterDefaultProject()
      return
    }
    homeView.value = 'apps'
    const q = { ...route.query }
    delete q.view
    router.replace({ query: q }).catch(() => {})
    return
  }
  homeView.value = ['schedule', 'manage'].includes(v) ? v : 'apps'
  const q = { ...route.query }
  if (homeView.value === 'apps') delete q.view
  else q.view = homeView.value
  router.replace({ query: q }).catch(() => {})
}

const writeProcessCache = (appId, proc) => {
  try {
    localStorage.setItem(`mo.qa-process.${appId}`, JSON.stringify({ ...proc, updated_at: nowIso() }))
  } catch (_) { /* ignore */ }
}

const loadProcess = async () => {
  try {
    const r = await listQaProcessSummary()
    processItems.value = r?.data?.items || []
  } catch (_) {
    processItems.value = []
  }
}

const loadDevices = async () => {
  try {
    const r = await listCaseRunnerDevices(true)
    devices.value = filterExecutableDevices(r?.data?.items || [])
  } catch (_) {
    devices.value = []
  }
}

const load = async () => {
  loading.value = true
  try {
    const res = await getProjects()
    projects.value = Array.isArray(res) ? res : (res?.data || [])
  } catch (_) {
    projects.value = []
  } finally {
    loading.value = false
  }
  liveByApp.value = {}
  runningCountByApp.value = {}
  const appIds = projects.value.flatMap((p) => (p.apps || []).map((a) => a.id)).filter(Boolean)
  loadProcess()
  loadDevices()
  try {
    const s = await listTestingTaskSummary(appIds)
    const rows = s?.data?.items || s?.data || []
    const list = Array.isArray(rows) ? rows : []
    if (list.length) {
      const live = {}
      const counts = {}
      for (const row of list) {
        const id = row.app_id || row.appId
        if (!id) continue
        counts[id] = Number(row.running_count || 0)
        if (row.latest || row.status) {
          live[id] = normalizeTask({
            task_id: row.latest_task_id || row.task_id || `app-${id}`,
            app_id: id,
            status: row.status || row.latest?.status,
            completed: row.completed ?? row.latest?.completed,
            total: row.total ?? row.latest?.total,
            started_at: row.started_at || row.latest?.started_at,
          })
        }
      }
      liveByApp.value = live
      runningCountByApp.value = counts
      return
    }
  } catch (e) {
    if (!isMissingTaskEndpoint(e)) console.warn('[testing] summary failed', e)
  }
  try {
    const r = await listCaseRunnerRuns(40)
    const runs = (r?.data?.runs || []).map((row) => normalizeTask(row, { source: 'memory' })).filter(Boolean)
    const map = {}
    const counts = {}
    for (const t of runs) {
      if (!t.appId) continue
      if (t.status === 'running') counts[t.appId] = (counts[t.appId] || 0) + 1
      if (!map[t.appId] || String(t.startedAt) > String(map[t.appId].startedAt || '')) {
        map[t.appId] = t
      }
    }
    liveByApp.value = map
    runningCountByApp.value = counts
  } catch (_) {
    liveByApp.value = {}
  }
}

const openApp = (app, project, extra = {}) => {
  router.push({
    name: 'TestingApp',
    params: { appId: app.id },
    query: {
      appName: app.name,
      projectName: project?.name || '',
      projectId: project?.id || '',
      tab: extra.tab || 'process',
      board: extra.board || ((extra.tab || 'process') === 'process' ? 'req' : undefined),
      pid: extra.pid,
      task: extra.task,
    },
  })
}

const resetCreateForm = () => {
  createForm.name = ''
  createForm.description = ''
  createForm.platform = 'Mobile'
}

const openCreateProject = () => {
  createKind.value = 'project'
  createTargetProject.value = null
  resetCreateForm()
  createOpen.value = true
  if (homeView.value !== 'manage') setHomeView('manage')
}

const openCreateApp = (project) => {
  if (!project?.id) {
    ElMessage.warning('请先新建项目')
    openCreateProject()
    return
  }
  createKind.value = 'app'
  createTargetProject.value = project
  resetCreateForm()
  createOpen.value = true
  if (homeView.value !== 'manage') setHomeView('manage')
}

const submitCreate = async () => {
  const name = createForm.name.trim()
  if (!name) {
    ElMessage.warning(createKind.value === 'project' ? '请填写项目名称' : '请填写应用名称')
    return
  }
  creating.value = true
  try {
    if (createKind.value === 'project') {
      const row = unwrapRow(await createProject({
        name,
        description: createForm.description.trim(),
      }))
      ElMessage.success(`已创建项目「${name}」`)
      createOpen.value = false
      await load()
      if (row.id) filterProjectId.value = row.id
      const project = projects.value.find((p) => p.id === row.id) || { ...row, apps: [] }
      openCreateApp(project)
      return
    }
    const project = createTargetProject.value
    if (!project?.id) throw new Error('请先选择项目')
    const row = unwrapRow(await createAppInProject(project.id, {
      name,
      description: createForm.description.trim(),
      platforms: createForm.platform,
    }))
    ElMessage.success(`已创建应用「${name}」`)
    createOpen.value = false
    await load()
    const fresh = projects.value.find((p) => p.id === project.id) || project
    const created = (fresh.apps || []).find((a) => a.id === row.id) || { ...row, name }
    if (created.id) openApp(created, fresh)
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '创建失败')
  } finally {
    creating.value = false
  }
}

const openProject = (p, extra = {}) => {
  const apps = p?.apps || []
  if (!apps.length) {
    openCreateApp(p)
    return
  }
  const preferred = apps.find((a) => runningCountByApp.value[a.id]) || apps[0]
  openApp(preferred, p, extra)
}

const openProcess = (appId, board, pid) => {
  const { app, project } = findAppMeta(appId)
  openApp(app, project, { tab: 'process', board, pid })
}

const onLabSave = async (slot) => {
  const appId = slot.app_id
  if (!appId) return
  const res = await getAppAutomationConfig(appId)
  const proc = {
    requirements: [],
    releases: [],
    schedule: [],
    ...(res?.data?.automation?.qa_process || {}),
  }
  const next = persistableSlot(slot)
  const i = (proc.schedule || []).findIndex((s) => s.id === next.id)
  if (i >= 0) proc.schedule.splice(i, 1, next)
  else proc.schedule = [next, ...(proc.schedule || [])]
  proc.updated_at = nowIso()
  try {
    await updateAppAutomationConfig(appId, { qa_process: proc })
    writeProcessCache(appId, proc)
  } catch (e) {
    ElMessage.error(e?.message || '保存排期失败')
    return
  }
  await loadProcess()
}

const onLabRemove = async (id, appId) => {
  const aid = appId || labSlots.value.find((s) => s.id === id)?.app_id
  if (!aid || !id) return
  const res = await getAppAutomationConfig(aid)
  const proc = {
    requirements: [],
    releases: [],
    schedule: [],
    ...(res?.data?.automation?.qa_process || {}),
  }
  proc.schedule = (proc.schedule || []).filter((s) => s.id !== id)
  proc.updated_at = nowIso()
  try {
    await updateAppAutomationConfig(aid, { qa_process: proc })
    writeProcessCache(aid, proc)
  } catch (e) {
    ElMessage.error(e?.message || '删除排期失败')
    return
  }
  await loadProcess()
}

const selectProject = (id) => {
  filterProjectId.value = filterProjectId.value === id ? '' : id
}

const openDeleteApp = (app, project) => {
  deleteTarget.value = { kind: 'app', app, project }
  deleteStep.value = 1
  deleteConfirmName.value = ''
  deleteOpen.value = true
}

const openDeleteProject = (project) => {
  deleteTarget.value = { kind: 'project', app: null, project }
  deleteStep.value = 1
  deleteConfirmName.value = ''
  deleteOpen.value = true
}

const closeDeleteApp = () => {
  if (deleting.value) return
  deleteOpen.value = false
  deleteTarget.value = null
  deleteConfirmName.value = ''
  deleteStep.value = 1
}

const deleteKind = computed(() => deleteTarget.value?.kind || 'app')
const deleteName = computed(() => (
  deleteKind.value === 'project'
    ? String(deleteTarget.value?.project?.name || '').trim()
    : String(deleteTarget.value?.app?.name || '').trim()
))
const deleteAppNames = computed(() => (
  (deleteTarget.value?.project?.apps || []).map((a) => a.name).filter(Boolean)
))
const canConfirmDelete = computed(() => {
  const name = deleteName.value
  return name && String(deleteConfirmName.value || '').trim() === name
})

const confirmDeleteApp = async () => {
  if (!canConfirmDelete.value || !deleteTarget.value) return
  deleting.value = true
  try {
    if (deleteKind.value === 'project') {
      const project = deleteTarget.value.project
      const appIds = (project?.apps || []).map((a) => a.id).filter(Boolean)
      await deleteProject(project.id)
      for (const id of appIds) {
        try { localStorage.removeItem(`mo.qa-process.${id}`) } catch (_) { /* ignore */ }
      }
      if (filterProjectId.value === project.id) filterProjectId.value = ''
      ElMessage.success(`已删除项目「${project.name}」`)
    } else {
      const app = deleteTarget.value.app
      await deleteAppInProject(app.id)
      try { localStorage.removeItem(`mo.qa-process.${app.id}`) } catch (_) { /* ignore */ }
      ElMessage.success(`已删除应用「${app.name}」`)
    }
    deleteOpen.value = false
    deleteTarget.value = null
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '删除失败')
  } finally {
    deleting.value = false
  }
}

const consumeTaskQuery = async () => {
  const tid = String(route.query.task || '')
  if (!tid) return false
  const detail = await fetchTaskDetail(tid)
  const appId = detail?.appId
  if (!appId) return false
  const { app, project } = findAppMeta(appId)
  if (!app?.id) return false
  openApp(app, project, { tab: 'tasks', task: tid })
  return true
}

onMounted(async () => {
  await load()
  const jumped = await consumeTaskQuery()
  if (!jumped) enterDefaultProject()
})
watch(() => route.name, async (name) => {
  if (name !== 'TestingHome') return
  await load()
  const jumped = await consumeTaskQuery()
  if (!jumped) enterDefaultProject()
})
watch(() => route.query.view, (v) => {
  if (route.name !== 'TestingHome') return
  homeView.value = ['schedule', 'manage'].includes(String(v || '')) ? String(v) : 'apps'
})
</script>

<template>
  <WorkShell mode="testing" create-title="新建项目" @create="openCreateProject">
    <template #sidebar>
      <div class="side-label">项目</div>
      <button
        type="button"
        class="side-item"
        :class="{ active: !filterProjectId }"
        @click="filterProjectId = ''"
      >
        全部项目
      </button>
      <button
        v-for="p in projects"
        :key="p.id"
        type="button"
        class="side-item"
        :class="{ active: filterProjectId === p.id }"
        @click="selectProject(p.id)"
      >
        <strong>{{ p.name }}</strong>
      </button>
      <div v-if="!projects.length" class="side-empty">暂无项目</div>
    </template>

    <div class="testing-home" :class="{ 'is-schedule': homeView === 'schedule' }" v-loading="loading">
      <header class="home-head">
        <div>
          <h2>测试</h2>
        </div>
        <div class="home-head-actions">
          <div v-if="homeView === 'manage'" class="settings-summary-pill">
            {{ inventory.projects }} 个项目 · {{ inventory.apps }} 个应用
          </div>
          <el-button v-if="homeView === 'manage'" type="primary" @click="openCreateProject">新建项目</el-button>
          <el-button text :loading="loading" @click="load">刷新</el-button>
        </div>
      </header>

      <div class="home-tabs">
        <button type="button" class="home-tab" :class="{ on: homeView === 'apps' }" @click="setHomeView('apps')">
          <strong>项目</strong>
          <span>进工作台</span>
        </button>
        <button type="button" class="home-tab" :class="{ on: homeView === 'schedule' }" @click="setHomeView('schedule')">
          <strong>实验室排期</strong>
          <span>{{ filterProjectId ? '本项目高亮，仍显示全实验室日历' : '全实验室开测日历' }}</span>
        </button>
        <button type="button" class="home-tab" :class="{ on: homeView === 'manage' }" @click="setHomeView('manage')">
          <strong>管理</strong>
          <span>增删项目</span>
        </button>
      </div>

      <div v-if="homeView === 'schedule'" class="home-schedule">
        <QaScheduleBoard
          lab-mode
          :slots="labSlots"
          :requirements="labRequirements"
          :releases="labReleases"
          :devices="devices"
          :app-options="appOptions"
          :workflows-by-app="workflowsByApp"
          :focus-project-id="filterProjectId"
          @save="onLabSave"
          @remove="onLabRemove"
          @open-req="(id, appId) => openProcess(appId, 'req', id)"
          @open-rel="(id, appId) => openProcess(appId, 'rel', id)"
        />
      </div>

      <div v-else-if="homeView === 'manage'" class="home-manage">
        <section
          v-for="p in filteredProjects"
          :key="p.id"
          class="settings-table-card manage-card"
        >
          <div class="project-head">
            <h3>{{ p.name }}</h3>
            <span class="sub">{{ p.apps?.length || 0 }} 个应用</span>
            <el-button link type="primary" size="small" @click="openCreateApp(p)">添加应用</el-button>
            <el-button link type="danger" size="small" class="project-del" @click="openDeleteProject(p)">删除项目</el-button>
          </div>
          <p v-if="p.description" class="project-desc">{{ p.description }}</p>
          <el-table :data="p.apps || []" border stripe size="small" empty-text="暂无应用">
            <el-table-column label="应用" min-width="160">
              <template #default="{ row }">
                <span class="task-name">{{ row.name }}</span>
              </template>
            </el-table-column>
            <el-table-column label="平台" width="140">
              <template #default="{ row }">
                <span class="meta">
                  <span v-for="t in formatPlatformTags(row.platforms)" :key="t" class="tag">{{ t }}</span>
                  <span v-if="!formatPlatformTags(row.platforms).length" class="muted">—</span>
                </span>
              </template>
            </el-table-column>
            <el-table-column label="用例 / 图标" width="120">
              <template #default="{ row }">
                {{ row.automation_stats?.case_count ?? 0 }} / {{ row.automation_stats?.icon_targets || 0 }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="148" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="openApp(row, p)">进入</el-button>
                <el-button link type="danger" size="small" @click="openDeleteApp(row, p)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>
        <el-empty v-if="!filteredProjects.length && !loading" description="暂无项目">
          <el-button type="primary" @click="openCreateProject">新建项目</el-button>
        </el-empty>
      </div>

      <div v-else class="home-apps">
        <el-empty v-if="!projects.length && !loading" description="暂无数据">
          <el-button type="primary" @click="openCreateProject">新建项目</el-button>
        </el-empty>
      </div>
    </div>

    <el-dialog
      v-model="createOpen"
      :title="createKind === 'project' ? '新建项目' : `添加应用 · ${createTargetProject?.name || ''}`"
      width="480px"
      class="mo-confirm-dialog"
      align-center
      append-to-body
      destroy-on-close
      :close-on-click-modal="!creating"
    >
      <el-form label-position="top" @submit.prevent="submitCreate">
        <el-form-item :label="createKind === 'project' ? '项目名称' : '应用名称'" required>
          <el-input
            v-model="createForm.name"
            :placeholder="createKind === 'project' ? '例如 造物秀' : '例如 客户端'"
            maxlength="40"
            @keyup.enter="submitCreate"
          />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="createForm.description" type="textarea" :rows="2" placeholder="可选" />
        </el-form-item>
        <el-form-item v-if="createKind === 'app'" label="覆盖端">
          <el-radio-group v-model="createForm.platform" class="platform-pick">
            <el-radio
              v-for="opt in platformChoices"
              :key="opt.value"
              :value="opt.value"
              border
            >
              {{ opt.label }}
            </el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="creating" @click="createOpen = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">
          {{ createKind === 'project' ? '创建项目' : '创建应用' }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="deleteOpen"
      :title="deleteStep === 1 ? (deleteKind === 'project' ? '删除项目' : '删除应用') : '再次确认'"
      width="420px"
      class="mo-confirm-dialog"
      align-center
      append-to-body
      destroy-on-close
      :close-on-click-modal="!deleting"
      @closed="closeDeleteApp"
    >
      <div v-if="deleteStep === 1" class="del-box">
        <p class="del-kicker">{{ deleteKind === 'project' ? '项目' : (deleteTarget?.project?.name || '—') }}</p>
        <p class="del-lead">删除 <strong>{{ deleteName }}</strong></p>
        <ul class="del-list">
          <template v-if="deleteKind === 'project'">
            <li v-if="deleteAppNames.length">将同时删除 {{ deleteAppNames.length }} 个应用：{{ deleteAppNames.join('、') }}</li>
            <li v-else>这个项目下还没有应用</li>
            <li>各应用的工作台配置、图标目标会删掉</li>
            <li>图谱只解绑，历史任务会留下</li>
            <li>删除后不能恢复</li>
          </template>
          <template v-else>
            <li>工作台配置、图标目标会删掉</li>
            <li>图谱只解绑，历史任务会留下</li>
            <li>删除后不能恢复</li>
          </template>
        </ul>
      </div>
      <div v-else class="del-box">
        <p class="del-lead">输入{{ deleteKind === 'project' ? '项目' : '应用' }}名称以确认</p>
        <p class="del-name">{{ deleteName }}</p>
        <el-input
          v-model="deleteConfirmName"
          size="large"
          placeholder="输入上方名称"
          @keyup.enter="confirmDeleteApp"
        />
      </div>
      <template #footer>
        <el-button :disabled="deleting" @click="deleteStep === 2 ? deleteStep = 1 : closeDeleteApp()">
          {{ deleteStep === 2 ? '上一步' : '取消' }}
        </el-button>
        <el-button
          v-if="deleteStep === 1"
          type="danger"
          @click="deleteStep = 2"
        >继续删除</el-button>
        <el-button
          v-else
          type="danger"
          :loading="deleting"
          :disabled="!canConfirmDelete"
          @click="confirmDeleteApp"
        >确认删除</el-button>
      </template>
    </el-dialog>
  </WorkShell>
</template>

<style scoped>
.side-label {
  padding: 4px 8px 6px;
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  letter-spacing: 0.02em;
}
.side-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: #374151;
  font-size: 13px;
}
.side-item strong { font-size: 13px; font-weight: 600; color: #111827; }
.side-item small { font-size: 11px; color: #94a3b8; }
.side-item:hover { background: #f1f5f9; }
.side-item.active { background: #eef2ff; color: #4f46e5; }
.side-item.active strong { color: #4f46e5; }
.side-empty { padding: 8px 10px; font-size: 12px; color: #94a3b8; }

.testing-home {
  height: 100%;
  overflow: auto;
  padding: 20px 24px 40px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.testing-home.is-schedule {
  overflow: hidden;
  padding-bottom: 16px;
}
.home-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.home-head h2 { margin: 0; font-size: 22px; color: #111827; }
.home-head p { margin: 6px 0 0; color: #6b7280; font-size: 13px; }
.home-head-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.home-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-shrink: 0;
  border-bottom: 1px solid #e3e8f0;
  padding-bottom: 10px;
}
.home-tab {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: #6b7280;
}
.home-tab strong { font-size: 14px; font-weight: 700; color: #111827; }
.home-tab span { font-size: 12px; color: #94a3b8; }
.home-tab:hover { background: #f8fafc; }
.home-tab.on {
  background: #eef2ff;
  border-color: #c7d2fe;
}
.home-tab.on strong { color: #4338ca; }
.home-schedule {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.home-schedule :deep(.sch-board) {
  flex: 1;
  min-height: 0;
  background: #fff;
  border: 1px solid #e3e8f0;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
}
.home-apps {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  align-content: start;
}
.home-manage { flex: 1; min-height: 0; overflow: auto; }
.home-manage .settings-info-card { margin: 0 0 14px; padding: 12px 14px; overflow: visible; }
.home-manage .settings-info-card p { margin: 4px 0 0; font-size: 13px; color: #374151; line-height: 1.55; white-space: normal; }
.manage-card { margin-bottom: 14px; padding: 14px; }
.project-desc { margin: 0 0 10px; font-size: 12px; color: #6b7280; }
.task-name { font-weight: 600; color: #111827; }
.muted { color: #94a3b8; font-size: 12px; }
.del-box { display: flex; flex-direction: column; gap: 8px; }
.del-kicker {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  color: #6366f1;
}
.del-lead { margin: 0; font-size: 15px; color: #111827; line-height: 1.5; }
.del-list {
  margin: 0;
  padding: 10px 12px 10px 28px;
  border-radius: 12px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
  font-size: 13px;
  line-height: 1.6;
}
.del-name {
  margin: 0;
  padding: 8px 10px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e3e8f0;
  font-weight: 700;
  color: #111827;
}
.project-block { margin-bottom: 22px; }
.project-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.project-head h3 { margin: 0; font-size: 15px; color: #111827; }
.project-head .sub { font-size: 12px; color: #94a3b8; }
.project-del { margin-left: auto; }
.app-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.app-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 16px;
  border: 1px solid #e3e8f0;
  border-radius: 16px;
  background: #fff;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
}
.app-card:hover {
  border-color: #c7d2fe;
  background: #f8faff;
}
.app-card strong { font-size: 15px; color: #111827; }
.meta { display: flex; flex-wrap: wrap; gap: 4px; min-height: 20px; }
.tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 999px;
  background: #f3f4f6;
  color: #4b5563;
  font-size: 11px;
}
.recent {
  font-size: 12px;
  color: #6b7280;
  display: flex;
  align-items: center;
  gap: 6px;
}
.recent.muted { color: #94a3b8; }
.platform-pick {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.platform-pick :deep(.el-radio) {
  margin-right: 0;
}
</style>
