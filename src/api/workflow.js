// src/api/componentService.js
import request from '@/utils/request'
import managementWsService from './managementWebSocket'

// 辅助函数：确保 content 是对象格式
const parseContent = (content) => {
    if (typeof content === 'string') {
        try {
            return JSON.parse(content)
        } catch (e) {
            return {}
        }
    }
    return content || {}
}

/**
 * 扫描组件 (替代原 electronAPI.scanComponents)
 * @param {string} rootPath - 项目根路径
 */
export const scanComponentsApi = () => {
    return request({
        url: '/get_api', // 后端对应的路由地址
        method: 'get',          // 建议用 POST，因为路径可能包含特殊字符，放 body 里更安全
    })
}

/**
 * 获取所有的脚本
 */
export const fetchWorkflowList = () => {
    return request({
        url: '/workflow/list',
        method: 'get'
    })
}

/**
 * 新增一个flow
 */
export const fetchWorkflowAdd = (name, desc, content) => {
    return request({
        url: `/workflow/add`,
        method: 'post',
        data: {
            "name": name || '未命名流程',
            "desc": desc || '',
            "nodes": parseContent(content)
        }
    })
}

/**
 * 保存一个flow
 */
export const fetchWorkflowSave = (workflow_id, name, desc, content) => {
    return request({
        url: `/workflow/save`,
        method: 'post',
        data: {
            "id": workflow_id,
            "name": name || '未命名流程',
            "desc": desc || '',
            "nodes": parseContent(content)
        }
    })
}
/**
 * 获取某个flow的详情
 */
export const fetchWorkflowDetail = (workflow_id) => {
    return request({
        url: `/workflow/detail/${workflow_id}`,
        method: 'get'
    })
}

/**
 * 获取某个flow的简要详情 (name, desc)
 */
export const fetchWorkflowDetailSimple = (workflow_id) => {
    return request({
        url: `/workflow/detail_simple/${workflow_id}`,
        method: 'get'
    })
}

/**
 * 获取删除某个flow
 */
export const fetchWorkflowDelete = (workflow_id) => {
    return request({
        url: `/workflow/delete/${workflow_id}`,
        method: 'get'
    })
}

/**
 * 简单保存 flow 信息 (只更新 name, desc)
 */
export const fetchWorkflowSaveSimple = (id, name, desc) => {
    return request({
        url: `/workflow/save_simple`,
        method: 'post',
        data: {
            id, name, desc: desc || ''
        }
    })
}

/**
 * 运行某个flow (通过 WebSocket)
 */
export const fetchWorkflowRun = (workflow_id, sn, envProfile) => {
    return new Promise((resolve, reject) => {
        // 1. 定义一个一次性的响应处理器
        const handler = (data) => {
            console.log('run_workflow response:', data)
            // 修正：监听 run_workflow 的响应，后端返回 { code: 200, run_id: ... }
            if (data && data.code === 200) {
                managementWsService.removeListener('run_workflow', handler);
                clearTimeout(timeout);
                resolve(data);
            }
        };

        // 2. 设置一个超时，防止后端不响应
        const timeout = setTimeout(() => {
            managementWsService.removeListener('run_workflow', handler);
            reject(new Error('触发工作流运行超时'));
        }, 10000); // 10秒超时

        // 3. 注册监听器
        managementWsService.addListener('run_workflow', handler);

        // 4. 发送运行指令, 假设后端的 action 是 'run_workflow'
        // 后端期望参数为 flow_id
        const payload = { flow_id: workflow_id, sn }
        if (envProfile) payload.env_profile = envProfile
        console.log('Sending run_workflow:', payload)
        managementWsService.sendMessage('run_workflow', payload);
    })
}

/**
 * 获取运行日志 (轮询)
 */
export const fetchRunLog = (run_id) => {
    return request({
        url: `/logs/${run_id}`,
        method: 'get',
    })

}
