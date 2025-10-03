import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './styles.css'
import { registerSW } from './plugins/pwa'

const app = createApp(App)

// Vuetify через UMD-глобал (из public/vuetify.min.js)
const Vuetify = (window as any).Vuetify
const vuetify = Vuetify?.createVuetify ? Vuetify.createVuetify() : null
if (vuetify) app.use(vuetify)

app.use(router)
app.mount('#app')

// аккуратно обрабатываем HMR
if (import.meta.hot) {
  import.meta.hot.accept()
  import.meta.hot.dispose(() => app.unmount())
}

registerSW()
