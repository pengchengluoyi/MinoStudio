/** 技能结果布局注册表。JSON 只填槽，未知 view_id 回退时间线，禁止按 JSON 生成组件。 */

export const VIEW_IDS = ['case-three-column', 'job-timeline', 'flow-doc']

export const DEFAULT_VIEW = 'job-timeline'

export const VIEW_LABEL = {
  'case-three-column': '前置 / 操作 / 校验',
  'job-timeline': '调用时间线',
  'flow-doc': '流程文档',
}

/** 布局落地页。JSON 只填槽，这里才是组件。 */
export const VIEW_HOST = {
  'case-three-column': 'ExecutionTimeline',
  'job-timeline': 'ExecutionTimeline',
  'flow-doc': 'QaProcessPanel',
}

export function resolveView(viewId) {
  const id = String(viewId || '').trim()
  return VIEW_IDS.includes(id) ? id : DEFAULT_VIEW
}
