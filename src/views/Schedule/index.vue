<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getScheduleList } from '@/api/schedule'
import '../Settings/settings-ui.css'

const router = useRouter()
const loading = ref(true)

onMounted(async () => {
  loading.value = true
  try {
    await getScheduleList()
  } catch {
    /* 列表接口未通也只显示空态 */
  } finally {
    loading.value = false
  }
})

const goLabSchedule = () => {
  router.push({ name: 'TestingHome', query: { view: 'schedule' } })
}
</script>

<template>
  <div class="settings-panel schedule-page wide-panel" v-loading="loading">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">定时任务</h2>
      </div>
    </header>

    <p v-if="!loading" class="settings-page-desc">暂无数据</p>
    <el-button type="primary" @click="goLabSchedule">去实验室排期</el-button>
  </div>
</template>

<style scoped>
.schedule-page {
  width: 100%;
}

.schedule-page p {
  margin: 6px 0 0;
  color: var(--settings-text, #374151);
  font-size: 13px;
  line-height: 1.6;
}

.schedule-actions {
  margin-top: 14px;
}
</style>
