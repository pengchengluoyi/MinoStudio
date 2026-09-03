/**
 * ClawNode 设备详情页 · 下发指令预设（与 server wClawNode / EXEC_SCRIPT 对齐）
 */

export const CLAWNODE_COMMAND_GROUPS = [
  {
    label: '脚本 (EXEC_SCRIPT)',
    commands: [
      {
        id: 'exec_open_settings',
        label: '打开系统设置',
        command: 'EXEC_SCRIPT',
        params: { script_id: 'open_settings', timeout_ms: 60000 },
      },
      {
        id: 'exec_open_app_settings',
        label: '打开应用详情页',
        command: 'EXEC_SCRIPT',
        params: { script_id: 'open_app_settings', timeout_ms: 60000, script_vars: { package: '' } },
        fields: [
          { path: 'script_vars.package', label: '应用包名', placeholder: 'com.example.app', required: true },
        ],
      },
      {
        id: 'open_app_launch',
        label: '启动应用 (OPEN_APP)',
        command: 'OPEN_APP',
        params: { package: '' },
        fields: [
          { path: 'package', label: '应用包名', placeholder: 'com.example.app', required: true },
        ],
        hint: '会先点亮屏幕再启动；若仍停在桌面，请手动解锁后重试',
      },
      {
        id: 'exec_home',
        label: '返回桌面',
        command: 'EXEC_SCRIPT',
        params: { script_id: 'home' },
      },
      {
        id: 'exec_custom_script_id',
        label: '自定义 script_id',
        command: 'EXEC_SCRIPT',
        params: { script_id: '', timeout_ms: 60000, script_vars: {} },
        fields: [
          { path: 'script_id', label: 'script_id', placeholder: 'open_settings', required: true },
          { path: 'script_vars.package', label: 'script_vars.package（可选）', placeholder: '' },
        ],
      },
      {
        id: 'exec_custom_inline',
        label: '自定义内联脚本 (EXEC_SCRIPT)',
        command: 'EXEC_SCRIPT',
        params: { language: 'js', script: '', timeout_ms: 60000 },
        fields: [
          { path: 'language', label: '语言', placeholder: 'js（推荐）或 dsl' },
          {
            path: 'script',
            label: '脚本正文',
            type: 'textarea',
            placeholder: 'claw.wake();\nclaw.openApp("com.android.settings");\nclaw.foreground();',
            required: true,
          },
        ],
        hint: '命令固定为 EXEC_SCRIPT；language=js 时可用 claw.* / context / importClass',
      },
    ],
  },
  {
    label: '应用与界面',
    commands: [
      {
        id: 'open_app',
        label: '打开应用 (OPEN_APP)',
        command: 'OPEN_APP',
        params: { package: '' },
        fields: [
          { path: 'package', label: '包名', placeholder: 'com.example.app', required: true },
          { path: 'activity', label: 'Activity（可选）', placeholder: '' },
        ],
      },
      {
        id: 'get_foreground',
        label: '查询前台包名',
        command: 'GET_FOREGROUND_APP',
        params: {},
      },
      {
        id: 'wake_up',
        label: '点亮屏幕',
        command: 'WAKE_UP',
        params: {},
        hint: '会拉起唤醒页；若仍黑屏请手动按电源键并解锁',
      },
      {
        id: 'screenshot',
        label: '截屏',
        command: 'GET_SCREENSHOT',
        params: { quality: 80 },
        fields: [
          { path: 'quality', label: 'JPEG 质量', type: 'number', placeholder: '80' },
        ],
      },
      {
        id: 'tap',
        label: '点击坐标',
        command: 'TAP',
        params: { x: 540, y: 1200, duration_ms: 80 },
        fields: [
          { path: 'x', label: 'X', type: 'number', required: true },
          { path: 'y', label: 'Y', type: 'number', required: true },
        ],
      },
      {
        id: 'key_home',
        label: '按键 · Home',
        command: 'KEY_EVENT',
        params: { keyevent: 'home' },
      },
      {
        id: 'key_back',
        label: '按键 · 返回',
        command: 'KEY_EVENT',
        params: { keyevent: 'back' },
      },
      {
        id: 'set_clipboard',
        label: '设置剪贴板',
        command: 'SET_CLIPBOARD',
        params: { text: '' },
        fields: [
          { path: 'text', label: '文本', placeholder: '要复制的内容', required: true },
        ],
      },
      {
        id: 'input_text_clipboard',
        label: '输入文字 (剪贴板+粘贴)',
        command: 'EXEC_SCRIPT',
        params: {
          language: 'js',
          timeout_ms: 60000,
          script: '',
        },
        fields: [
          { path: 'text', label: '要输入的文字', required: true },
          { path: 'x', label: '先点击输入框 X（推荐）', type: 'number' },
          { path: 'y', label: '先点击输入框 Y（推荐）', type: 'number' },
        ],
        hint: '会先点亮屏幕 → 点击坐标 → 写剪贴板 → 粘贴。需先打开有输入框的页面',
      },
      {
        id: 'input_text',
        label: '输入文字 (INPUT_TEXT 原生)',
        command: 'INPUT_TEXT',
        params: { text: '' },
        fields: [
          { path: 'text', label: '文本', required: true },
          { path: 'x', label: '输入框 X（强烈建议填写）', type: 'number' },
          { path: 'y', label: '输入框 Y（强烈建议填写）', type: 'number' },
        ],
        hint: '需屏幕点亮且输入框可见；失败时请改用「剪贴板+粘贴」',
      },
    ],
  },
  {
    label: '系统',
    commands: [
      {
        id: 'run_shell_getprop',
        label: 'Shell · 设备型号',
        command: 'RUN_SHELL',
        params: { command: 'getprop ro.product.model' },
      },
      {
        id: 'export_logs',
        label: '导出设备日志',
        command: 'EXPORT_LOGS',
        params: { minutes: 5 },
        fields: [
          { path: 'minutes', label: '最近分钟数', type: 'number', placeholder: '5' },
        ],
      },
      {
        id: 'custom',
        label: '自定义命令…',
        command: '',
        params: {},
        custom: true,
      },
    ],
  },
]

/** 扁平列表，供 el-select */
export function flattenCommandPresets(groups = CLAWNODE_COMMAND_GROUPS) {
  const out = []
  for (const g of groups) {
    for (const c of g.commands) {
      out.push({ ...c, group: g.label })
    }
  }
  return out
}

/** 按 path 设置嵌套对象，如 script_vars.package */
export function setByPath(obj, path, value) {
  const keys = String(path || '').split('.').filter(Boolean)
  if (!keys.length) return obj
  let cur = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}
    cur = cur[k]
  }
  const last = keys[keys.length - 1]
  if (value === '' || value === null || value === undefined) {
    delete cur[last]
  } else {
    cur[last] = value
  }
  return obj
}

export function getByPath(obj, path) {
  const keys = String(path || '').split('.').filter(Boolean)
  let cur = obj
  for (const k of keys) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = cur[k]
  }
  return cur
}

export function deepClone(v) {
  return JSON.parse(JSON.stringify(v ?? {}))
}

export function applyFieldValues(baseParams, fields, fieldValues) {
  const params = deepClone(baseParams)
  if (!fields?.length) return params
  for (const f of fields) {
    const raw = fieldValues[f.path]
    if (raw === undefined || raw === '') {
      if (!f.required) continue
    }
    let val = raw
    if (f.type === 'number' && raw !== '' && raw != null) {
      val = Number(raw)
      if (Number.isNaN(val)) continue
    }
    setByPath(params, f.path, val)
  }
  return params
}

export function formatParamsJson(params) {
  return JSON.stringify(params ?? {}, null, 2)
}
