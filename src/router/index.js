import { createRouter, createWebHashHistory } from 'vue-router'
import { getAuthStatus } from '@/api/auth'
import { useAppStore } from '@/store/appStore'
import { ElMessageBox } from 'element-plus'
import { clearTitlebar } from '@/composables/useTitlebar'
import { firstAllowedSettingsPath, loadStudioNav, settingsEntryForPath, studioNavAllowed } from '@/utils/studioNav'
import Schedule from '../views/Schedule/index.vue'
import Login from '../views/Login/index.vue'

const CaseEditor = () => import('../views/WorkReport/components/CaseEditor.vue')
const Dialogue = () => import('../views/Dialogue/index.vue')
const AgentHistory = () => import('../views/AgentHistory/index.vue')
const TestingHome = () => import('../views/Testing/AppList.vue')
const TestingApp = () => import('../views/Testing/AppShell.vue')
const SettingsLayout = () => import('../views/Settings/index.vue')
const SettingsKeys = () => import('../views/Settings/KeysPage.vue')
const SettingsRuntime = () => import('../views/Settings/RuntimeStatusPage.vue')
const SettingsDeviceDetail = () => import('../views/Settings/DeviceDetailPage.vue')
const SettingsProjectEnv = () => import('../views/Settings/ProjectEnvPage.vue')
const SettingsAppConfig = () => import('../views/Settings/AppConfigPage.vue')
const SettingsDispatch = () => import('../views/Settings/DispatchPage.vue')
const SettingsDispatchJob = () => import('../views/Settings/DispatchJobPage.vue')
const SettingsPlugins = () => import('../views/Settings/PluginsPage.vue')
const SettingsPluginDetail = () => import('../views/Settings/PluginDetailPage.vue')

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { requiresGuest: true },
  },
  {
    path: '/',
    redirect: '/testing',
  },
  {
    path: '/settings',
    component: SettingsLayout,
    meta: { title: '设置', requiresAuth: true },
    redirect: '/settings/runtime?view=overview',
    children: [
      { path: 'hub', name: 'SettingsHub', redirect: { name: 'TestingHome' } },
      { path: 'runtime', name: 'SettingsRuntime', component: SettingsRuntime, meta: { title: '运行与设备' } },
      { path: 'runtime/device/:sn', name: 'SettingsDeviceDetail', component: SettingsDeviceDetail, meta: { title: '设备详情' } },
      { path: 'scout', name: 'SettingsScout', redirect: { path: '/settings/runtime', query: { view: 'scout' } } },
      { path: 'schedule', name: 'SettingsSchedule', component: Schedule, meta: { title: '定时任务' } },
      { path: 'dispatch', name: 'SettingsDispatch', component: SettingsDispatch, meta: { title: '调用记录' } },
      { path: 'dispatch/:callId', name: 'SettingsDispatchJob', component: SettingsDispatchJob, meta: { title: '调用详情' } },
      { path: 'plugins', name: 'SettingsPlugins', component: SettingsPlugins, meta: { title: '插件' } },
      { path: 'plugins/:pluginId', name: 'SettingsPluginDetail', component: SettingsPluginDetail, meta: { title: '插件' } },
      { path: 'keys', name: 'SettingsKeys', component: SettingsKeys, meta: { title: '模型密钥' } },
      { path: 'ai', redirect: { name: 'SettingsKeys', query: { tab: 'model-keys' } } },
      { path: 'feishu', redirect: { name: 'SettingsPluginDetail', params: { pluginId: 'feishu' } } },
      { path: 'knowledge', redirect: { name: 'TestingHome' } },
      { path: 'projects', redirect: { name: 'TestingHome' } },
      { path: 'apps', redirect: { name: 'TestingHome' } },
      { path: 'projects/:projectId/env', name: 'SettingsProjectEnv', component: SettingsProjectEnv, meta: { title: '项目环境' } },
      {
        path: 'apps/:appId',
        redirect: (to) => ({
          name: 'TestingApp',
          params: { appId: to.params.appId },
          query: { ...to.query, tab: 'process', board: to.query.board || 'req' },
        }),
      },
      {
        path: 'apps/:appId/regression',
        redirect: (to) => ({
          name: 'TestingApp',
          params: { appId: to.params.appId },
          query: { ...to.query, tab: 'process', board: to.query.board || 'req' },
        }),
      },
      {
        path: 'apps/:appId/:section',
        name: 'SettingsAppConfig',
        component: SettingsAppConfig,
        meta: { title: '应用配置' },
      },
    ],
  },
  {
    path: '/report/feishu/:appId',
    redirect: (to) => ({
      name: 'TestingApp',
      params: { appId: to.params.appId },
      query: { ...to.query, tab: 'cases', view: 'library' },
    }),
  },
  {
    path: '/report/app/:appId/automation',
    redirect: (to) => ({
      path: `/settings/apps/${to.params.appId}/env`,
      query: to.query,
    }),
  },
  {
    path: '/dialogue',
    name: 'Dialogue',
    component: Dialogue,
    meta: { title: 'Agent', requiresAuth: true, workMode: 'agent' },
  },
  {
    path: '/agents',
    name: 'AgentHistory',
    component: AgentHistory,
    meta: { title: 'Agent 对话记录', requiresAuth: true, workMode: 'agent' },
  },
  {
    path: '/testing',
    name: 'TestingHome',
    component: TestingHome,
    meta: { title: '测试', requiresAuth: true, workMode: 'testing' },
  },
  {
    path: '/testing/:appId',
    name: 'TestingApp',
    component: TestingApp,
    meta: { title: '测试工作台', requiresAuth: true, workMode: 'testing' },
  },
  {
    path: '/testing/:appId/tasks/:taskId',
    name: 'TestingTask',
    component: TestingApp,
    meta: { title: '任务详情', requiresAuth: true, workMode: 'testing' },
  },
  {
    path: '/testing/:appId/tasks/:taskId/cases/:caseId',
    name: 'TestingTaskCase',
    component: TestingApp,
    meta: { title: '用例详情', requiresAuth: true, workMode: 'testing' },
  },
  {
    path: '/report/apps',
    redirect: { name: 'TestingHome' },
    meta: { title: '应用列表', requiresAuth: true },
  },
  {
    path: '/report/tasks',
    name: 'TaskList',
    redirect: { name: 'TestingHome' },
    meta: { title: '测试任务', requiresAuth: true },
  },
  {
    path: '/report/task/:id',
    name: 'TaskDetail',
    redirect: (to) => ({ name: 'TestingHome', query: { task: to.params.id } }),
  },
  {
    path: '/report/case/:id',
    name: 'CaseResult',
    redirect: { name: 'TestingHome' },
  },
  {
    path: '/report/editor/:appId',
    name: 'CaseEditor',
    component: CaseEditor,
    meta: { title: '用例编辑', requiresAuth: true },
  },
  {
    path: '/schedule',
    redirect: { name: 'SettingsSchedule' },
    meta: { title: '定时任务', requiresAuth: true },
  },
  {
    path: '/timeline',
    name: 'Timeline',
    redirect: { name: 'SettingsRuntime', query: { view: 'overview' } },
  },
  {
    path: '/editor/:id?',
    name: 'Editor',
    redirect: { name: 'TestingHome' },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/testing',
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

const AUTH_CHECK_MS = 8000

function withTimeout(promise, ms = AUTH_CHECK_MS) {
  let timer
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('auth-timeout')), ms)
    }),
  ])
}

router.beforeEach(async (to, from, next) => {
  if (to.fullPath !== from.fullPath) clearTitlebar()
  const appStore = useAppStore()

  if (appStore.isCanvasDirty) {
    try {
      await ElMessageBox.confirm(
        'You have unsaved changes. Are you sure you want to leave?',
        'Unsaved Changes',
        { confirmButtonText: 'Leave', cancelButtonText: 'Stay', type: 'warning' },
      )
      appStore.setCanvasDirty(false)
    } catch {
      return next(false)
    }
  }

  if (to.meta.requiresGuest || (!to.meta.requiresAuth && !to.meta.requiresGuest)) return next()

  const hasToken = typeof localStorage !== 'undefined' && !!localStorage.getItem('token')
  try {
    const auth = await withTimeout(getAuthStatus(), 8000)
    const loggedIn = !!auth?.data?.logged_in
    if (!loggedIn) return next('/login')
    await loadStudioNav()
    const entry = settingsEntryForPath(to.path)
    if (entry && !studioNavAllowed(entry)) {
      return next(firstAllowedSettingsPath())
    }
    next()
  } catch {
    if (hasToken) return next()
    return next('/login')
  }
})

export default router
