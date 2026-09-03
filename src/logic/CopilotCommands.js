/**
 * Agent / 命令面板 可执行指令（含页面跳转与执行器动作提示）
 */
export const copilotCommands = [
  {
    id: 'nav.dialogue',
    title: 'Agent（首页）',
    keywords: ['home', 'copilot', '对话', '助手'],
    handler: (router) => router.push({ name: 'Dialogue' }),
  },
  {
    id: 'nav.agentHistory',
    title: 'Agent 对话记录',
    keywords: ['agent', 'history', '对话记录', '历史'],
    handler: (router) => router.push({ name: 'AgentHistory' }),
  },
  {
    id: 'nav.testing',
    title: '测试',
    keywords: ['testing', '回归', '任务', '测试', 'app'],
    handler: (router) => router.push({ name: 'TestingHome' }),
  },
  {
    id: 'nav.schedule',
    title: '定时任务',
    keywords: ['schedule', '定时'],
    handler: (router) => router.push({ name: 'SettingsSchedule' }),
  },
  {
    id: 'nav.settings',
    title: '设置',
    keywords: ['settings', '设置', '配置'],
    handler: (router) => router.push({ name: 'SettingsRuntime' }),
  },
  {
    id: 'nav.settings.env',
    title: '测试 · 应用列表',
    keywords: ['env', '环境', '包名', '应用'],
    handler: (router) => router.push({ name: 'TestingHome' }),
  },
  {
    id: 'nav.settings.apps',
    title: '测试 · 应用列表',
    keywords: ['app config', '应用配置', 'skills'],
    handler: (router) => router.push({ name: 'TestingHome' }),
  },
  {
    id: 'exec.open_app',
    title: '打开应用（示例）',
    keywords: ['open', '启动', '打开'],
    prompt: '打开 造物相机',
    isPrompt: true,
  },
  {
    id: 'exec.close_app',
    title: '关闭应用（示例）',
    keywords: ['close', '关闭', '退出'],
    prompt: '关闭 造物',
    isPrompt: true,
  },
  {
    id: 'exec.multi',
    title: '多步操作（示例）',
    keywords: ['multi', '多步', '然后'],
    prompt: '打开 造物相机，点击我的，上滑',
    isPrompt: true,
  },
  {
    id: 'exec.click',
    title: '点击坐标（示例）',
    keywords: ['click', '点击', 'tap'],
    prompt: '点击 600, 1200',
    isPrompt: true,
  },
  {
    id: 'exec.swipe',
    title: '上滑（示例）',
    keywords: ['swipe', '滑', 'scroll'],
    prompt: '上滑',
    isPrompt: true,
  },
]
