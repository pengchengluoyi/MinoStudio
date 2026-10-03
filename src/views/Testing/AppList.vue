<script setup>
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { createAppInProject, createProject, getProjects } from '@/api/workReport'
import { APP_PLATFORM_OPTIONS, APP_PLATFORM_OPTIONS_ADVANCED } from '@/constants/appPlatforms'
import { listCaseRunnerRuns, listTestingTaskSummary } from '@/api/caseRunner'
import { fetchTaskDetail } from '@/composables/useTestingTasks'
import { isMissingTaskEndpoint, normalizeTask } from '@/utils/testingTasks'
import WorkShell from '@/layouts/WorkShell.vue'
import '@/views/Settings/settings-ui.css'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const projects = ref([])
const liveByApp = ref({})
const runningCountByApp = ref({})
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

const findAppMeta = (appId) => {
  for (const p of projects.value) {
    const app = (p.apps || []).find((a) => a.id === appId)
    if (app) return { app, project: p }
  }
  return { app: { id: appId, name: '' }, project: { id: '', name: '' } }
}

const enterDefaultProject = () => {
  if (route.query.task) return false
  const wanted = String(route.query.projectId || '')
  const target = (wanted && projects.value.find((p) => p.id === wanted)) || projects.value[0]
  if (!target) return false
  openProject(target)
  return true
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
      tab: extra.tab || 'tasks',
      board: extra.board,
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
}

const goProjectEnvConfig = (project) => {
  const pid = String(project?.id || '').trim()
  if (!pid) {
    ElMessage.warning('请先新建项目')
    return
  }
  router.push({
    name: 'SettingsProjectEnv',
    params: { projectId: pid },
    query: { name: project?.name || '' },
  })
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
      const project = projects.value.find((p) => p.id === row.id) || { ...row, apps: [] }
      ElMessage.info('请在环境配置中添加应用与包名')
      goProjectEnvConfig(project)
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
    goProjectEnvConfig(p)
    return
  }
  const preferred = apps.find((a) => runningCountByApp.value[a.id]) || apps[0]
  openApp(preferred, p, extra)
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
</script>

<template>
  <WorkShell mode="testing" create-title="新建项目" @create="openCreateProject">
    <template #workspace>
      <div class="nav-workspace nav-workspace--chrome nav-workspace-static">
        <span class="nav-workspace-avatar">项</span>
        <div class="nav-workspace-text">
          <strong>项目</strong>
          <small>选择进入工作台</small>
        </div>
      </div>
    </template>
    <template #sidebar>
      <button
        v-for="p in projects"
        :key="p.id"
        type="button"
        class="side-item"
        @click="openProject(p)"
      >
        <strong>{{ p.name }}</strong>
        <small v-if="p.apps?.length">{{ p.apps.length }} 个应用</small>
      </button>
      <div v-if="!projects.length && !loading" class="side-empty">暂无项目</div>
    </template>

    <div class="testing-redirect" v-loading="loading">
      <template v-if="!loading">
        <p v-if="!projects.length" class="redirect-hint">暂无项目，点侧栏上方 <strong>+</strong> 新建</p>
        <p v-else class="redirect-hint muted">正在进入工作台…</p>
      </template>
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
.side-empty { padding: 8px 10px; font-size: 12px; color: #94a3b8; }

.testing-redirect {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
}
.redirect-hint {
  margin: 0;
  font-size: 14px;
  color: #374151;
  text-align: center;
}
.redirect-hint.muted { color: #94a3b8; }

.platform-pick {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.platform-pick :deep(.el-radio) {
  margin-right: 0;
}
</style>
