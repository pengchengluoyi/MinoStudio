export function parseScoutNodes(res) {
  const data = res?.data || res || {}
  if (Array.isArray(data)) return data
  if (Array.isArray(data.nodes)) return data.nodes
  if (Array.isArray(data.items)) return data.items
  return []
}

export function isLocalNode(node, localScoutId) {
  const id = String(localScoutId || '').toLowerCase()
  const nid = String(node?.node_id || node?.scout_id || '').toLowerCase()
  return Boolean(id && nid && id === nid)
}

export function nodeOnline(node) {
  return node?.status === 'online' || node?.online === true || node?.alive === true
}

export function ownershipLabel(node, { studioId = '', userId = '' } = {}) {
  if (node?.ownership) return node.ownership
  const owner = String(node?.owner_user_id || '').toLowerCase()
  const sid = String(node?.studio_id || '').toLowerCase()
  const uid = String(userId || '').toLowerCase()
  const want = String(studioId || '').toLowerCase()
  if (!owner && !sid) return '未归属'
  if (uid && owner === uid) return node?.owner_name || '当前账号'
  if (want && sid === want) return '本工作台'
  return node?.owner_name || sid || owner || '未归属'
}

export function nodeActionState(node, { localScoutId = '', isElectron = false, installed = false } = {}) {
  const local = isLocalNode(node, localScoutId)
  const online = nodeOnline(node)
  const desktop = Boolean(isElectron)
  if (local) {
    const ready = desktop && (installed || online)
    return {
      local: true,
      via: 'ipc',
      start: {
        visible: ready && !online,
        enabled: ready && !online,
        reason: '',
      },
      stop: {
        visible: ready && online,
        enabled: ready && online,
        reason: '',
      },
      restart: {
        visible: ready && online,
        enabled: ready && online,
        reason: '',
      },
      update: {
        visible: desktop,
        enabled: desktop,
        reason: desktop ? '' : '请在桌面端更新本机执行器',
      },
    }
  }
  return {
    local: false,
    via: 'remote',
    start: {
      visible: false,
      enabled: false,
      reason: '离线专机无法远程启动',
    },
    stop: {
      visible: online,
      enabled: online,
      reason: online ? '' : '节点离线，无法下发',
    },
    restart: {
      visible: online,
      enabled: online,
      reason: online ? '' : '节点离线，无法下发',
    },
    update: {
      visible: false,
      enabled: false,
      reason: '请在该节点本机 Studio 更新',
    },
  }
}

export const EMPTY_HINT = '暂无节点'
