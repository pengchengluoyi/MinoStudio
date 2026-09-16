import request from '@/utils/request'

export const listNavFsm = () =>
  request({ url: '/nav-fsm', method: 'get' })

export const getNavFsm = (appId, params = {}) =>
  request({ url: `/nav-fsm/${appId}`, method: 'get', params })

export const putNavFsm = (appId, doc) =>
  request({ url: `/nav-fsm/${appId}`, method: 'put', data: doc })

export const putAtlasManualEdges = (appId, data) =>
  request({ url: `/nav-fsm/${appId}/atlas-manual-edges`, method: 'put', data })

export const deleteNavFsm = (appId, params = {}) =>
  request({ url: `/nav-fsm/${appId}`, method: 'delete', params })

export const getNavFsmTemplate = (appId) =>
  request({ url: `/nav-fsm/${appId}/template`, method: 'get' })

export const getNavFsmDraft = (appId) =>
  request({ url: `/nav-fsm/${appId}/draft`, method: 'get' })

export const putNavFsmDraft = (appId, doc) =>
  request({ url: `/nav-fsm/${appId}/draft`, method: 'put', data: { doc } })

export const deleteNavFsmDraft = (appId) =>
  request({ url: `/nav-fsm/${appId}/draft`, method: 'delete' })

export const promoteNavFsmDraft = (appId) =>
  request({ url: `/nav-fsm/${appId}/draft/promote`, method: 'post' })

export const listNavCalibrations = (appId) =>
  request({ url: `/nav-fsm/${appId}/calibration`, method: 'get' })

export const getNavCalibration = (appId, calibrationId) =>
  request({ url: `/nav-fsm/${appId}/calibration/${calibrationId}`, method: 'get' })

export const startNavCalibration = (appId, data) =>
  request({ url: `/nav-fsm/${appId}/calibration`, method: 'post', data })

export const finishNavCalibration = (appId, calibrationId, data = {}) =>
  request({ url: `/nav-fsm/${appId}/calibration/${calibrationId}/finish`, method: 'post', data })

export const getNavCalibrationStep = (appId, calibrationId, index) =>
  request({ url: `/nav-fsm/${appId}/calibration/${calibrationId}/step/${index}`, method: 'get' })

export const getNavMetrics = (appId, params = {}) =>
  request({ url: `/nav-fsm/${appId}/metrics`, method: 'get', params })

export const getNavReviews = (appId, params = {}) =>
  request({ url: `/nav-fsm/${appId}/reviews`, method: 'get', params })

export const annotateNavGuard = (appId, data) =>
  request({ url: `/nav-fsm/${appId}/annotate`, method: 'post', data })

export const listNavCaptures = (appId, params = {}) =>
  request({ url: `/nav-fsm/${appId}/captures`, method: 'get', params })

export const clearNavCaptures = (appId, params = {}) =>
  request({ url: `/nav-fsm/${appId}/captures`, method: 'delete', params })

export const getNavCaptureSession = (appId, sessionId) =>
  request({ url: `/nav-fsm/${appId}/captures/${sessionId}`, method: 'get' })

export const getNavCaptureTurn = (appId, sessionId, turnId) =>
  request({ url: `/nav-fsm/${appId}/captures/${sessionId}/turn/${turnId}`, method: 'get' })

export const getNavCalibrationReport = (appId) =>
  request({ url: `/nav-fsm/${appId}/calibration-report`, method: 'get' })

export const getNavFsmLiveGraph = (appId, params = {}) =>
  request({ url: `/nav-fsm/${appId}/live-graph`, method: 'get', params })

export const getNavScreenAtlas = (appId, params = {}) =>
  request({ url: `/nav-fsm/${appId}/screen-atlas`, method: 'get', params })

export const getNavCandidates = (appId) =>
  request({ url: `/nav-fsm/${appId}/candidates`, method: 'get' })

export const compileNavCandidates = (appId) =>
  request({ url: `/nav-fsm/${appId}/candidates/compile`, method: 'post' })

export const reviewNavCandidate = (appId, candidateId, data) =>
  request({ url: `/nav-fsm/${appId}/candidates/${candidateId}/review`, method: 'post', data })

export const applyNavCandidatesToDraft = (appId) =>
  request({ url: `/nav-fsm/${appId}/candidates/apply-to-draft`, method: 'post' })

export const publishNavFsm = (appId) =>
  request({ url: `/nav-fsm/${appId}/publish`, method: 'post' })

export const submitNavFeedback = (appId, data) =>
  request({ url: `/nav-fsm/${appId}/feedback`, method: 'post', data })

export const planNavRoute = (appId, data) =>
  request({ url: `/nav-fsm/${appId}/route`, method: 'post', data })

export const patchNavStateLabels = (appId, stateId, data) =>
  request({
    url: `/nav-fsm/${appId}/states/${encodeURIComponent(stateId)}/labels`,
    method: 'patch',
    data,
  })

export const postAtlasMergeStates = (appId, data) =>
  request({
    url: `/nav-fsm/${appId}/atlas-merge-states`,
    method: 'post',
    data,
  })

export const postAtlasPinCapture = (appId, data) =>
  request({
    url: `/nav-fsm/${appId}/atlas-pin-capture`,
    method: 'post',
    data,
  })

export const postAtlasSplitCapture = (appId, data) =>
  request({
    url: `/nav-fsm/${appId}/atlas-split-capture`,
    method: 'post',
    data,
  })

export const postAtlasMorphVlm = (appId, data) =>
  request({
    url: `/nav-fsm/${appId}/atlas-morph-vlm`,
    method: 'post',
    data,
  })

export const postAliasGovernanceApply = (appId, doc) =>
  request({
    url: `/nav-fsm/${appId}/alias-governance/apply`,
    method: 'post',
    data: { doc },
  })
