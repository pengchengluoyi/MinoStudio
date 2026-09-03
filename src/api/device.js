import request from '@/utils/request'

// 获取设备列表
export const getDeviceList = () => {
  return request({
    url: '/device/list',
    method: 'get'
  })
}

// 下发指令
export const sendCommand = (data) => {
  return request({
    url: '/device/command',
    method: 'post',
    data
  })
}

// 设置设备密码
export const setDevicePassword = (data) => {
  return request({
    url: '/device/set_password',
    method: 'post',
    data
  })
}