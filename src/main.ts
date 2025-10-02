import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './styles.css';
import { registerSW } from './plugins/pwa';


const app = createApp(App);

// Если используешь Vuetify 3 через UMD:
const Vuetify = (window as any).Vuetify
const vuetify = Vuetify?.createVuetify
  ? Vuetify.createVuetify({
      // ВАЖНО: говорим Vuetify, что иконки — webfont MDI
      icons: { defaultSet: 'mdi' },
      // theme: { defaultTheme: 'dark' }, // если тебе надо
    })
  : undefined

  if (vuetify) app.use(vuetify)

app.use(router).mount('#app');

registerSW();