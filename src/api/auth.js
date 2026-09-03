import request from '@/utils/request'

export const getAuthStatus = () =>
  request({ url: '/auth/status', method: 'get' })

export const registerAccount = ({ email, password, name = '' }) =>
  request({ url: '/auth/register', method: 'post', data: { email, password, name } })

export const loginAccount = ({ email = '', password }) => {
  const em = String(email || '').trim()
  return request({
    url: '/auth/login',
    method: 'post',
    data: {
      email: em,
      username: em,
      password,
    },
  })
}

export const logoutAccount = () =>
  request({ url: '/auth/logout', method: 'post' })

export const listAuthUsers = () =>
  request({ url: '/auth/users', method: 'get' })

export const createAuthUser = ({ username, password, name = '', email = '' }) =>
  request({ url: '/auth/users', method: 'post', data: { username, password, name, email } })

export const deleteAuthUser = (userId) =>
  request({ url: `/auth/users/${userId}`, method: 'delete' })

export const listAgentSessions = () =>
  request({ url: '/auth/agent-sessions', method: 'get' })

export const saveAgentSessions = (sessions) =>
  request({ url: '/auth/agent-sessions', method: 'put', data: { sessions } })
