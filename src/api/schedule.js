import request from '@/utils/request'

export function getScheduleList() {
  return request({
    url: '/schedule/list',
    method: 'get'
  })
}

export function createSchedule(data) {
  return request({
    url: '/schedule/create',
    method: 'post',
    data
  })
}

export function updateSchedule(taskId, data) {
  return request({
    url: `/schedule/update/${taskId}`,
    method: 'post',
    data
  })
}

export function deleteSchedule(taskId) {
  return request({
    url: `/schedule/delete/${taskId}`,
    method: 'delete'
  })
}

export function getScheduleHistory(taskId, limit = 20) {
  return request({
    url: `/schedule/${taskId}/history`,
    method: 'get',
    params: { limit }
  })
}