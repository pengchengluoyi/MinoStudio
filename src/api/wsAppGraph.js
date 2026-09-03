import { sendWsRequest } from '@/api/mWebSocket'

/**
 * 获取应用图谱列表
 * Action: app_graph/list
 * @param {string} appId
 * @returns {Promise}
 */
export const wsGetAppGraphList = (appId) => {
  return sendWsRequest('app_graph/list', { app_id: appId })
}

/**
 * 创建图谱
 * Action: app_graph/create
 * @param {Object} params
 * @param {string} params.name
 * @param {string} params.desc
 * @param {string} params.app_id
 * @param {Object} [params.variables]
 * @returns {Promise}
 */
export const wsCreateAppGraph = (params) => {
  return sendWsRequest('app_graph/create', params)
}

/**
 * 获取图谱详情 (核心)
 * Action: app_graph/detail
 * @param {number|string} graphId
 * @returns {Promise}
 */
export const wsGetAppGraphDetail = (graphId) => {
  return sendWsRequest('app_graph/detail', { graph_id: graphId })
}

/**
 * 创建 SOP
 * Action: sop/create
 * @param {Object} params
 * @param {number|string} params.graph_id
 * @param {string} params.name
 * @param {string} [params.desc]
 * @param {number} [params.priority]
 * @param {Array<string>} [params.nodes] Node IDs
 * @param {Object} [params.variables]
 * @returns {Promise}
 */
export const wsCreateSOP = (params) => {
  return sendWsRequest('sop/create', params)
}

/**
 * 更新 SOP
 * Action: sop/update
 * @param {Object} params
 * @param {number|string} params.sop_id
 * @param {string} [params.name]
 * @param {Array<string>} [params.nodes]
 * @param {Array<string>} [params.workflows] Workflow IDs
 * @returns {Promise}
 */
export const wsUpdateSOP = (params) => {
  return sendWsRequest('sop/update', params)
}

/**
 * 删除 SOP
 * Action: sop/delete
 * @param {number|string} sopId
 * @returns {Promise}
 */
export const wsDeleteSOP = (sopId) => {
  return sendWsRequest('sop/delete', { sop_id: sopId })
}

/**
 * 保存节点详情
 * Action: app_graph/save_node_detail
 * @param {Object} params
 * @returns {Promise}
 */
export const wsSaveNodeDetail = (params) => {
  return sendWsRequest('app_graph/save_node_detail', params)
}

/**
 * 同步图谱布局
 * Action: app_graph/sync_layout
 * @param {Object} params
 * @returns {Promise}
 */
export const wsSyncGraphLayout = (params) => {
  return sendWsRequest('app_graph/sync_layout', params)
}

/**
  * 添加空节点
  * Action: app_graph/add_empty_node
  * @param {Object} params
  * @returns {Promise}
  */
 export const wsAddEmptyNode = (params) => {
   return sendWsRequest('app_graph/add_empty_node', params)
 }

 /**
  * 更新图谱信息
  * Action: app_graph/update
  * @param {Object} params
  * @returns {Promise}
  */
 export const wsUpdateAppGraph = (params) => {
   return sendWsRequest('app_graph/update', params)
 }

/**
 * 创建 Workflow (测试用例)
 * Action: workflow/create
 * @param {Object} params - { name, description, content }
 * @returns {Promise}
 */
export const wsCreateWorkflow = (params) => {
  return sendWsRequest('workflow/create', params)
}

/**
 * 骨架训练 (CV)
 * Action: app_graph/train_skeleton
 * @param {Object} params - { image_names: [], threshold: 10 }
 * @returns {Promise}
 */
export const wsTrainSkeleton = (params) => {
  return sendWsRequest('app_graph/train_skeleton', params)
}

export const wsDetectSharedComponents = (params) => {
  return sendWsRequest('app_graph/detect_shared_components', params)
}

export const wsSaveSharedComponents = (params) => {
  return sendWsRequest('app_graph/save_shared_components', params)
}

export const wsDetectPageComponents = (params) => {
  return sendWsRequest('app_graph/detect_page_components', params)
}

/**
 * 根据骨架蒙版识别截图属于图谱中的哪个页面
 * Action: app_graph/identify_page
 * @param {Object} params - { graph_id, content|image_name, min_score?, top_k? }
 */
export const wsIdentifyPage = (params) => {
  return sendWsRequest('app_graph/identify_page', params)
}

/**
 * 跑图：遍历应用页面并写入图谱
 * Action: app_graph/crawl
 */
export const wsCrawlApp = (params) => {
  return sendWsRequest('app_graph/crawl', params, { timeout: 3600000 })
}

export const wsGetDeviceList = () => {
  return sendWsRequest('get_device_list', {})
}
