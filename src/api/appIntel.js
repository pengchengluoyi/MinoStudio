import request from '@/utils/request'

export const intelSearch = (appId, params = {}) =>
  request({
    url: `/apps/${encodeURIComponent(appId)}/intel/search`,
    method: 'get',
    params,
  })

export const intelGaps = (appId, projectId = '') =>
  request({
    url: `/apps/${encodeURIComponent(appId)}/intel/gaps`,
    method: 'get',
    params: projectId ? { project_id: projectId } : {},
  })

export const intelAsk = (appId, data) =>
  request({
    url: `/apps/${encodeURIComponent(appId)}/intel/ask`,
    method: 'post',
    data,
    timeout: 120000,
  })

export const listIntelLinks = (appId, params = {}) =>
  request({
    url: `/apps/${encodeURIComponent(appId)}/intel/links`,
    method: 'get',
    params,
  })

export const intelGraph = (appId, params = {}) =>
  request({
    url: `/apps/${encodeURIComponent(appId)}/intel/graph`,
    method: 'get',
    params,
  })

export const listIntelProposals = (appId, params = {}) =>
  request({
    url: `/apps/${encodeURIComponent(appId)}/intel/proposals`,
    method: 'get',
    params,
  })

export const reviewIntelProposal = (appId, proposalId, data) =>
  request({
    url: `/apps/${encodeURIComponent(appId)}/intel/proposals/${encodeURIComponent(proposalId)}/review`,
    method: 'post',
    data,
  })
