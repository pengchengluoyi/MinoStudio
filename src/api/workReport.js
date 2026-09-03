// src/api/workReport.js

import request from '@/utils/request'
import { serializePlatformSelection } from '@/constants/appPlatforms'

export const getProjects = () => {
    return request({
        url: '/project/list',
        method: 'get'
    })
}

export const createProject = (data) => {
    return request({
        url: '/project/create',
        method: 'post',
        data
    })
}

export const deleteProject = (projectId) => {
    return request({
        url: `/project/${projectId}`,
        method: 'delete'
    })
}

export const createAppInProject = (projectId, appData) => {
    const list = Array.isArray(appData.platforms)
        ? appData.platforms
        : (appData.platforms || '').split(',').filter(Boolean)
    const platforms = serializePlatformSelection(list).join(',')

    return request({
        url: '/project/app/create',
        method: 'post',
        data: {
            project_id: projectId,
            name: appData.name,
            description: appData.description,
            platforms: platforms,
            env: appData.env || {}
        }
    })
}

export const getAppDetail = (appId) => {
    return request({
        url: `/project/app/${appId}`,
        method: 'get'
    })
}

export const deleteAppInProject = (appId) => {
    return request({
        url: `/project/app/${appId}`,
        method: 'delete'
    })
}

export const updateAppEnv = (appId, env) => {
    return request({
        url: `/project/app/${appId}/env`,
        method: 'put',
        data: { env }
    })
}

export const getProjectEnv = (projectId) => {
    return request({
        url: `/project/${projectId}/env`,
        method: 'get'
    })
}

export const updateProjectEnv = (projectId, payload) => {
    return request({
        url: `/project/${projectId}/env`,
        method: 'put',
        data: payload
    })
}

export const getProjectAccounts = (projectId, env = '') => {
    return request({
        url: `/project/${projectId}/accounts`,
        method: 'get',
        params: env ? { env } : {},
    })
}

export const saveProjectAccounts = (projectId, accounts) => {
    return request({
        url: `/project/${projectId}/accounts`,
        method: 'put',
        data: { accounts },
    })
}

export const pickProjectAccounts = (projectId, { prompt = '', env = '', surface = '' } = {}) => {
    return request({
        url: `/project/${projectId}/accounts/pick`,
        method: 'post',
        data: { prompt, env, surface },
    })
}

// --- Tasks (对接 rTask.py) ---

export const getTasks = (params = {}) => {
    return request({
        url: '/task/list',
        method: 'get',
        params: {
            appId: params.appId,
            type: params.type,
            keyword: params.keyword
        }
    })
}

export const createTask = (data) => {
    return request({
        url: '/task/create',
        method: 'post',
        data
    })
}

// --- App Graph / Case Library (对接 rAppGraph.py) ---

export const getAppGraphList = (appId) => {
    return request({
        url: '/app_graph/list',
        method: 'get',
        params: {app_id: appId}
    })
}

export const createAppGraph = (data) => {
    return request({
        url: '/app_graph/create',
        method: 'post',
        data
    })
}

// 替代原有的 getCaseLibrary，现在需要传入 graphId
export const getAppGraphDetail = (graphId) => {
    return request({
        url: `/app_graph/detail/${graphId}`,
        method: 'get'
    })
}

export const saveNodeDetail = (data) => {
    return request({
        url: '/app_graph/save_node_detail',
        method: 'post',
        data
    })
}

export const syncGraphLayout = (data) => {
    return request({
        url: '/app_graph/sync_layout',
        method: 'post',
        data
    })
}

export const addEmptyNode = (data) => {
    return request({
        url: '/app_graph/add_empty_node',
        method: 'post',
        data
    })
}

export const ocrRecognition = (imageUrl) => {
    return request({
        url: `/ability/execute`,
        method: 'post',
        data: {
            "nodeCode": "public/ocr",
            "path": imageUrl,
            "data": {
                "id": "ocr",
                "nodeCode": "public/ocr",
                "platform": "common",
                "nodeType": "normal",
                "displayName": "ocr",
                "lastCodes": [],
                "nextCodes": [],//唯一ID
                "data": {
                    "path": imageUrl,
                }
            }
        }
    })
}