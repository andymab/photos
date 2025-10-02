import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { viteExternalsPlugin } from "vite-plugin-externals";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  base: "./",
  plugins: [
    vue(),
    viteExternalsPlugin({
      vue: "Vue",
      vuetify: "Vuetify",
      "vue-router": "VueRouter",
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)), 
    },
  },
  server: { hmr: false },
});