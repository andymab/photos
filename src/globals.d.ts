// src/globals.d.ts
export {};

declare global {
  interface Window {
    VueRouter: {
      createRouter: typeof import('vue-router')['createRouter'];
      createWebHistory: typeof import('vue-router')['createWebHistory'];
      // при необходимости: createWebHashHistory и т.п.
    };
    Vuetify: any; // если используешь Vuetify UMD
  }
}
