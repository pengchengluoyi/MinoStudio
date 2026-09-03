import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStore = defineStore('app', () => {
  const isCanvasDirty = ref(false)

  function setCanvasDirty(isDirty) {
    isCanvasDirty.value = isDirty
  }

  return {
    isCanvasDirty,
    setCanvasDirty,
  }
})