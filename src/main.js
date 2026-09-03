import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { initServiceConfig } from '@/utils/config'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import './styles/tokens.css'
import './global-loading.css'
import './styles/overlay.css'
import { installOverlayDefaults } from './utils/overlay'
import PayloadView from './components/PayloadView.vue'

initServiceConfig().then((origin) => {
  console.log(`[Studio] Nexus origin: ${origin}`)
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(ElementPlus)
app.component('PayloadView', PayloadView)
installOverlayDefaults()
app.mount('#app')
