import request from '@/utils/request'

export const getFlowBlockCatalog = () =>
  request({ url: '/flow-blocks/catalog', method: 'get' })

export const getFlowBlockCatalogOne = (blockId) =>
  request({ url: `/flow-blocks/catalog/${encodeURIComponent(blockId)}`, method: 'get' })

export const getAppFlowBlockOverrides = (appId) =>
  request({ url: `/flow-blocks/apps/${appId}/overrides`, method: 'get' })

export const putAppFlowBlockOverrides = (appId, overrides) =>
  request({
    url: `/flow-blocks/apps/${appId}/overrides`,
    method: 'put',
    data: { overrides },
  })
