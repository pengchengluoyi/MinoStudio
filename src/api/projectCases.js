import request from '@/utils/request'

export const getProjectCases = (projectId) =>
  request({ url: `/project/${projectId}/cases`, method: 'get' })

export const updateProjectCase = (projectId, caseId, data) =>
  request({
    url: `/project/${projectId}/cases/${encodeURIComponent(caseId)}`,
    method: 'put',
    data,
  })

export const listProjectRequirements = (projectId) =>
  request({ url: `/project/${projectId}/requirements`, method: 'get' })

export const previewCaseImport = (projectId, data) =>
  request({
    url: `/project/${projectId}/cases/import/preview`,
    method: 'post',
    data,
    timeout: 120000,
  })

export const commitCaseImport = (projectId, data) =>
  request({
    url: `/project/${projectId}/cases/import/commit`,
    method: 'post',
    data,
    timeout: 120000,
  })

export const deleteProjectCase = (projectId, caseId) =>
  request({ url: `/project/${projectId}/cases/${encodeURIComponent(caseId)}`, method: 'delete' })

export const deleteProjectCases = (projectId, caseIds) =>
  request({
    url: `/project/${projectId}/cases/delete`,
    method: 'post',
    data: { case_ids: caseIds },
  })
