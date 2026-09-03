import { ref } from 'vue'
import * as api from '@/api/workReport'

export function useTaskLogic() {
  const tasks = ref([])
  const loading = ref(false)

  const fetchTasks = async (params) => {
    loading.value = true
    tasks.value = await api.getTasks(params)
    loading.value = false
  }

  const createTask = async (data) => {
    const newTask = await api.createTask(data)
    tasks.value.unshift(newTask)
  }

  return {
    tasks,
    loading,
    fetchTasks,
    createTask
  }
}