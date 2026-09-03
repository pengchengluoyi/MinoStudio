import request from '@/utils/request'
import { getBaseUrl } from '@/utils/config'

// --- App Graph API (适配 Python rAppGraph.py) ---

// 1. 获取图谱列表
export const fetchAppList = (appId) => {
  return request({
    url: '/app_graph/list',
    method: 'get',
    params: { app_id: appId }
  })
}

export const getAppGraphs = fetchAppList

// 2. 创建图谱
export const createAppGraph = (data) => {
  return request({
    url: '/app_graph/create',
    method: 'post',
    data
  })
}

// 3. 获取图谱详情 (Nodes + Edges)
export const getGraphDetail = (graphId) => {
  return request({
    url: `/app_graph/detail/${graphId}`,
    method: 'get'
  })
}

// 4. 保存节点详情 (截图、DOM、组件)
export const saveNodeDetail = (data) => {
  return request({
    url: '/app_graph/save_node_detail',
    method: 'post',
    data
  })
}

// 5. 同步布局 (保存节点位置、连线关系)
export const syncGraphLayout = (data) => {
  return request({
    url: '/app_graph/sync_layout',
    method: 'post',
    data
  })
}

// 6. 添加空节点
export const addEmptyNode = (data) => {
  return request({
    url: '/app_graph/add_empty_node',
    method: 'post',
    data // graph_id, node_id, x, y
  })
}

export const uploadSnapshot = (blob) => {
  const formData = new FormData()
  formData.append('file', blob, `snapshot-${Date.now()}.png`)
  return request({
    url: '/file/upload',
    method: 'post',
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
}

export const getImageUrl = (path) => {
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('blob:')) return path
  const rel = path.startsWith('/') ? path : `/file/${path}`
  return `${getBaseUrl()}${rel}`
}