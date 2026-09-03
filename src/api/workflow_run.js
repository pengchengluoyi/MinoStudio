// src/api/componentService.js
import request from '@/utils/request'



/**
 * 获取运行日志 (轮询)
 */
export const fetchRunLog = (run_id) => {
  return request({
    url: `/logs/${run_id}`,
    method: 'get'
  })
}

/**
 * 获取运行日志 (轮询)
 */
export const fetchRunReport = (run_id) => {
  return request({
    url: `/workflow_run/detail/${run_id}`,
    method: 'get'
  })
}