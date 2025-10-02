import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './styles.css';
import { registerSW } from './plugins/pwa';


const app = createApp(App);

// Если используешь Vuetify 3 через UMD:
const vuetify = (window as any).Vuetify?.createVuetify
  ? (window as any).Vuetify.createVuetify({})
  : undefined;
if (vuetify) app.use(vuetify);

app.use(router).mount('#app');

registerSW();