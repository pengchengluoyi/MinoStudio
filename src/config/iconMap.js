// 1. 🔥 核心改变：导入所有图标为一个对象
import * as LucideIcons from 'lucide-vue-next'

/**
 * 2. 自定义别名映射 (可选)
 * 如果你想保留之前的简写习惯 (比如写 'start' 实际显示 'Flag')，可以在这里定义。
 * 如果 Python 里直接写 'Flag'，这里就不需要配置。
 */
const ALIAS_MAP = {
  // --- 系统 ---
  'start': 'Flag',
  'init': 'Settings',
  'default': 'Puzzle',

  // --- 移动端 ---
  'list': 'List',
  'rocket': 'Rocket',
  'stop': 'CircleStop',
  'click': 'MousePointerClick',

  // --- 逻辑 ---
  'if': 'Split',
  'loop': 'Repeat',

  // --- 其他 ---
  'text': 'Type',
  'db': 'Database',
  'code': 'Code'
}

/**
 * 3. 动态获取图标组件
 * @param {string} iconName - Python 传来的图标名称 (如 "Camera", "user", "start")
 */
export const getIcon = (iconName) => {
  if (!iconName) return LucideIcons.Puzzle

  // ------------------------------------------------
  // 步骤 A: 检查别名 (Alias)
  // ------------------------------------------------
  const alias = ALIAS_MAP[iconName]
  if (alias && LucideIcons[alias]) {
    return LucideIcons[alias]
  }

  // ------------------------------------------------
  // 步骤 B: 直接匹配库中的名字
  // Lucide 的图标名都是大驼峰 (PascalCase)，如 "ArrowRight", "User"
  // ------------------------------------------------

  // 1. 尝试直接匹配 (如果你在 Python 里写的已经是 "Camera")
  if (LucideIcons[iconName]) {
    return LucideIcons[iconName]
  }

  // 2. 尝试首字母大写兼容 (如果你在 Python 里写的是 "camera")
  const titleCase = iconName.charAt(0).toUpperCase() + iconName.slice(1)
  if (LucideIcons[titleCase]) {
    return LucideIcons[titleCase]
  }

  // 3. 尝试下划线转大驼峰兼容 (如果你在 Python 里写的是 "arrow_right")
  // file_text -> FileText
  const camelCase = iconName.replace(/(?:^|_)([a-z])/g, (_, c) => c.toUpperCase())
  if (LucideIcons[camelCase]) {
    return LucideIcons[camelCase]
  }

  // ------------------------------------------------
  // 步骤 C: 实在找不到，返回默认图标
  // ------------------------------------------------
  // console.warn(`[IconMap] 未找到图标: ${iconName}, 使用默认图标。`)
  return LucideIcons.Puzzle
}