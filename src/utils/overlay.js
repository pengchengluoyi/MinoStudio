import { ElDialog, ElMessageBox } from 'element-plus'

function setPropDefault(comp, name, value) {
  const prop = comp?.props?.[name]
  if (!prop) return
  if (typeof prop === 'function') {
    comp.props[name] = { type: prop, default: value }
    return
  }
  if (typeof prop === 'object') prop.default = value
}

export function installOverlayDefaults() {
  setPropDefault(ElDialog, 'alignCenter', true)
  setPropDefault(ElDialog, 'appendToBody', true)
  ElMessageBox.setDefaults?.({
    customClass: 'mo-message-box',
    appendTo: typeof document !== 'undefined' ? document.body : undefined,
  })
}
