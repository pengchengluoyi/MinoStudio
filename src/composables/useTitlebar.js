import { ref } from 'vue'

/** 当前占用顶部 TitleBar 门户的页面 ID */
export const titlebarOwner = ref(null)

const stack = []

export function claimTitlebar(id) {
  const i = stack.indexOf(id)
  if (i >= 0) stack.splice(i, 1)
  stack.push(id)
  titlebarOwner.value = id
}

export function releaseTitlebar(id) {
  const i = stack.indexOf(id)
  if (i < 0) return
  stack.splice(i, 1)
  titlebarOwner.value = stack[stack.length - 1] || null
}

export function clearTitlebar() {
  stack.length = 0
  titlebarOwner.value = null
}
