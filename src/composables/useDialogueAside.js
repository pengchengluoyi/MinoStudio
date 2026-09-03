import { ref } from 'vue'

const collapsed = ref(localStorage.getItem('dialogue-aside-collapsed') === '1')

export function useDialogueAside() {
  const toggleAside = () => {
    collapsed.value = !collapsed.value
    localStorage.setItem('dialogue-aside-collapsed', collapsed.value ? '1' : '0')
  }
  return { collapsed, toggleAside }
}
