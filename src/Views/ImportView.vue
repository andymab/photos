<template>
  <section class="card import">
    <h2>Импорт фотографий</h2>

    <input
      type="file"
      multiple
      accept="image/*"
      @change="onPick"
      class="input"
      style="padding:8px;"
    />

    <!-- превью выбранных файлов до обработки -->
    <div v-if="previews.length" class="grid" style="margin-top:12px;">
      <figure v-for="(src, i) in previews" :key="i" class="card" style="padding:6px;">
        <img :src="src" style="width:100%;height:auto;border-radius:8px;" />
      </figure>
    </div>

    <div v-if="queue.length" style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
      <button class="btn" :disabled="busy" @click="process(320)">Сделать 320</button>
      <button class="btn" :disabled="busy" @click="process(1600)">Сделать 1600</button>
      <button class="btn" :disabled="busy" @click="processBoth">Сделать 320 + 1600</button>
      <span v-if="busy" class="muted">Обработка…</span>
    </div>

    <p class="muted" style="margin-top:8px;">
      Оригиналы сохраняются отдельно, производные размеры — в базе.
    </p>

    <p v-if="error" class="error">Ошибка: {{ error }}</p>
  </section>
</template>

<script>
import { defineComponent } from 'vue';
import { dbp, putBlob } from '@/lib/db';

export default defineComponent({
  name: 'ImportView',
  data() {
    return {
      queue: /** @type {File[]} */ ([]),
      previews: /** @type {string[]} */ ([]),
      busy: false,
      error: null
    };
  },
  computed: {
    albumId() {
      return this.$route?.params?.id || '';
    }
  },
  methods: {
    onPick(e) {
      const files = Array.from(e.target.files || []);
      this.queue = files;
      // очистим старые превью
      this.previews.forEach((u) => URL.revokeObjectURL(u));
      this.previews = files.map((f) => URL.createObjectURL(f));
      this.error = null;
    },
    runWorker(file, sizes, crop) {
      return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('../workers/resizer.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (ev) => { resolve(ev.data); worker.terminate(); };
        worker.onerror = (err) => { reject(err); worker.terminate(); };
        worker.postMessage({ file, sizes, crop });
      });
    },
    async processBoth() {
      await this.process(); // 320 + 1600
    },
    async process(single) {
      this.busy = true;
      this.error = null;
      try {
        const sizes = single ? [single] : [320, 1600];
        const db = await dbp;
        const album = await db.get('albums', this.albumId);
        if (!album) throw new Error('Альбом не найден');

        for (const file of this.queue) {
          const id = crypto.randomUUID();
          // сохраняем оригинал
          await putBlob(`orig:${id}`, file);

          // генерируем варианты в воркере
          const variants = await this.runWorker(file, sizes);
          const varRecs = [];
          for (const v of variants) {
            const key = `v:${id}:${v.size}`;
            await putBlob(key, v.blob);
            varRecs.push({ size: v.size, blobId: key, width: v.width, height: v.height });
          }

          // запись фото и привязка к альбому
          await db.put('photos', {
            id,
            filename: file.name,
            originalBlobId: `orig:${id}`,
            variants: varRecs
          });
          album.photoIds.push(id);
        }
        await db.put('albums', album);

        // очистка очереди и превью
        this.queue = [];
        this.previews.forEach((u) => URL.revokeObjectURL(u));
        this.previews = [];

        // возврат к альбому
        this.$router.push({ name: 'album', params: { id: this.albumId } });
      } catch (e) {
        this.error = e && e.message ? e.message : String(e);
      } finally {
        this.busy = false;
      }
    }
  },
  beforeUnmount() {
    // чистим превью-URLы
    this.previews.forEach((u) => URL.revokeObjectURL(u));
  }
});
</script>

<style scoped>
.muted { opacity: .75; }
.error {
  color: #ffd9d9;
  background: #3a1f1f;
  border: 1px solid #a55;
  padding: 8px 10px;
  border-radius: 10px;
  margin-top: 8px;
}
</style>
