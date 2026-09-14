/** 架构图悬停桥接：relation-graph setJsonData 会丢掉 data 里的函数，故用模块级回调。 */

let hoverHandler = null
let leaveHandler = null
let contextHandler = null

export function setArchGraphHoverHandlers({ onHover, onLeave, onContext } = {}) {
  hoverHandler = typeof onHover === 'function' ? onHover : null
  leaveHandler = typeof onLeave === 'function' ? onLeave : null
  contextHandler = typeof onContext === 'function' ? onContext : null
}

export function clearArchGraphHoverHandlers() {
  hoverHandler = null
  leaveHandler = null
  contextHandler = null
}

export function archGraphContext(node, event) {
  contextHandler?.(node, event)
}

export function archGraphHover(node, event) {
  hoverHandler?.(node, event)
}

export function archGraphLeave() {
  leaveHandler?.()
}
