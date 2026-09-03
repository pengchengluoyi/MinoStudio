export const PLUGIN_CATEGORIES = [
  { id: 'all', label: '全部', desc: '所有外部系统' },
  { id: 'docs', label: '文档', desc: 'Wiki 副本' },
  { id: 'im', label: 'IM', desc: '群通知、对话与提缺陷' },
  { id: 'defect', label: '缺陷', desc: '禅道等缺陷库' },
  { id: 'design', label: '设计', desc: '设计稿学习' },
]

export function normalizePluginCat(cat) {
  const id = String(cat || 'all')
  return PLUGIN_CATEGORIES.some((c) => c.id === id) ? id : 'all'
}

export function pluginCategories(plugin) {
  const list = plugin?.categories
  if (Array.isArray(list) && list.length) return list
  return plugin?.kind ? [plugin.kind] : []
}

export function pluginInCategory(plugin, cat) {
  const id = normalizePluginCat(cat)
  if (id === 'all') return true
  return pluginCategories(plugin).includes(id)
}

export function capsForCategory(plugin, cat) {
  const caps = plugin?.capabilities || []
  const id = normalizePluginCat(cat)
  if (id === 'all') return caps
  return caps.filter((c) => {
    const cats = c.categories
    if (!Array.isArray(cats) || !cats.length) return true
    return cats.includes(id)
  })
}

export function defaultPluginTab(plugin, cat) {
  const id = normalizePluginCat(cat)
  const caps = capsForCategory(plugin, cat)
  if (id === 'im' && caps.some((c) => c.id === 'chat')) return 'chat'
  if (id === 'im' && caps.some((c) => c.id === 'notify')) return 'notify'
  if (id === 'docs' && caps.some((c) => c.id === 'cases')) return 'cases'
  if (caps.some((c) => c.id === 'connect')) return 'connect'
  return caps[0]?.id || 'connect'
}

export function categoryLabel(id) {
  return PLUGIN_CATEGORIES.find((c) => c.id === id)?.label || id
}
