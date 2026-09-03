import request from '@/utils/request'
import { sendWsRequest } from '@/api/mWebSocket'

export const getServerInfo = () => {
  return sendWsRequest('get_server_info')
}

export const joinCluster = (target_urls, token) => {
  return sendWsRequest('join_cluster', { target_urls, token })
}

export const leaveCluster = () => {
  return sendWsRequest('leave_cluster')
}

export const updateConfig = (data) => {
  return sendWsRequest('update_server_config', data)
}

export const getNodeStatus = () => {
  return sendWsRequest('get_node_status')
}

export const getRuntimeStatusHttp = () =>
  request({ url: '/sys/runtime', method: 'get' })