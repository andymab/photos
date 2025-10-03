<template>
  <v-container class="import" fluid>
    <v-row class="mb-3" align="center" justify="space-between">
      <v-col cols="12" md="8">
        <h2 class="text-h5 font-weight-bold">Импорт фотографий</h2>
        <div class="text-body-2 opacity-80">
          Предпросмотр: <b>4:3</b> при ширине <b>320</b>. Показ: <b>16:9</b> (гориз.) или <b>9:16</b> (верт.) при
          длинной стороне <b>1600</b>. JPEG ~88%.
        </div>
      </v-col>
      <v-col cols="12" md="4" class="d-flex justify-end">
        <v-btn color="primary" :disabled="busy || !items.length" :loading="busy" prepend-icon="mdi-tray-arrow-down"
          @click="importAll">
          Импортировать в альбом
        </v-btn>
      </v-col>
    </v-row>

    <v-card rounded="xl" elevation="2">
      <v-card-text>
        <v-file-input variant="outlined" density="comfortable" multiple accept="image/*" show-size :disabled="busy"
          label="Выберите фото" prepend-icon="mdi-image-multiple" @change="onPick" />

        <v-alert v-if="error" type="error" variant="tonal" class="mt-3" :text="error" density="comfortable" />



        <v-row v-if="items.length" class="mt-2" dense>
          <v-col v-for="(it, idx) in items" :key="it.id" cols="12" sm="6" md="4" lg="3" xl="2">
            <v-card class="h-100 d-flex flex-column" rounded="lg" elevation="1">
              <div class="thumbs">
                <!-- PREVIEW 4:3 • 320w -->
                <div class="thumb">
                  <div class="thumb-title">4:3 • 320w</div>
                  <div class="thumb-img thumb-hover"
                    :style="{ backgroundImage: `url('${it.preview320 || it.previewUrl}')` }">
                    <v-btn class="thumb-edit" icon size="small" color="deep-purple-darken-1" variant="elevated"
                      :title="'Кадрировать 4:3 (320w)'" @click.stop="openCrop(it, 'preview')">
                      <v-icon icon="mdi-pencil" />
                    </v-btn>
                  </div>
                </div>

                <!-- DISPLAY 16:9 / 9:16 • 1600 long -->
                <div class="thumb">
                  <div class="thumb-title">
                    {{ it.meta?.orientation === 'Горизонтальное' ? '16:9' : '9:16' }} • 1600 long
                  </div>
                  <div class="thumb-img thumb-hover"
                    :style="{ backgroundImage: `url('${it.preview1600 || it.previewUrl}')` }">
                    <v-btn class="thumb-edit" icon size="small" color="deep-purple-darken-1" variant="elevated"
                      :title="'Кадрировать 1600 long'" @click.stop="openCrop(it, 'display')">
                      <v-icon icon="mdi-pencil" />
                    </v-btn>
                  </div>
                </div>
              </div>

              <v-card-text class="text-caption opacity-80">
                <div class="text-truncate" :title="it.file?.name">{{ it.file?.name }}</div>
                <div class="mt-1">
                  {{ it.meta?.orientation }} • src: {{ it.meta?.w }}×{{ it.meta?.h }}
                </div>
              </v-card-text>

              <v-card-actions class="mt-auto">
                <v-spacer />
                <v-btn icon="mdi-close" variant="text" :disabled="busy" @click="removeAt(idx)" :title="'Убрать'" />
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>

        <!-- Диалог кропа -->
        <CropDialog v-model="cropDlg.open" :file="cropDlg.file" :mode="cropDlg.mode" :aspect="cropDlg.aspect"
          :target="cropDlg.target" :quality="0.88" @apply="onCropApply" />


        <v-progress-linear v-if="busy" class="mt-4" indeterminate color="primary" rounded height="6" />
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script>
import { defineComponent } from 'vue';
import { dbp } from '@/lib/db';
import CropDialog from '@/components/CropDialog.vue';

export default defineComponent({
  name: 'ImportView',
  components: { CropDialog },
  data() {
    return {
      items: [],          // [{ id, file, previewUrl, meta, crops, preview320, preview1600, tmp: {blob320?, blob1600?} }]
      busy: false,
      error: '',
      cropDlg: {
        open: false,
        file: null,
        mode: 'preview',      // 'preview' | 'display'
        aspect: 4 / 3,          // число
        target: 320,          // 320 (preview) | 1600 (display)
        itemId: null,         // какой элемент правим
      },
    };
  },
  computed: {
    albumId() {
      return this.$route?.params?.id || '';
    },
  },
  beforeUnmount() {
    for (const it of this.items) {
      if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
      if (it.preview320) URL.revokeObjectURL(it.preview320);
      if (it.preview1600) URL.revokeObjectURL(it.preview1600);
    }
  },
  methods: {
    onPick(e) {
      this.error = '';
      const files = Array.from(e?.target?.files || e || []);
      const next = [];
      for (const f of files) {
        if (!f || !f.type?.startsWith?.('image/')) continue;
        next.push({
          id: crypto.randomUUID(),
          file: f,
          previewUrl: URL.createObjectURL(f), // fallback пока не посчитали превью
          meta: null,
          crops: null,
          preview320: '',
          preview1600: '',
        });
      }
      // очистим старые превью
      this.items.forEach(it => {
        it.previewUrl && URL.revokeObjectURL(it.previewUrl);
        it.preview320 && URL.revokeObjectURL(it.preview320);
        it.preview1600 && URL.revokeObjectURL(it.preview1600);
      });
      this.items = next;

      // посчитаем кропы и превью для каждого
      this.items.forEach(async (it) => {
        try {
          const img = await this.readImage(it.file);

          const orientation = img.width >= img.height ? 'Горизонтальное' : 'Вертикальное';
          const cropPreview = this.centerCrop(img.width, img.height, 4 / 3);                 // 4:3 для 320w
          const cropDisplay = this.centerCrop(img.width, img.height, orientation === 'Горизонтальное' ? 16 / 9 : 9 / 16); // 16:9 / 9:16

          // Сгенерим dataURL превью: 320 по ширине, 1600 по длинной стороне
          const blob320 = await this.renderVariant(img, cropPreview, 320, true, 0.88);
          const blob1600 = await this.renderVariant(img, cropDisplay, 1600, false, 0.88);

          // objectURL для показа в карточке
          it.preview320 = URL.createObjectURL(blob320);
          it.preview1600 = URL.createObjectURL(blob1600);

          it.meta = { w: img.width, h: img.height, orientation };
          it.crops = {
            preview: cropPreview,
            display: cropDisplay,
            orientation
          };
        } catch (err) {
          console.warn('Preview build failed:', err);
        }
      });
    },

    removeAt(index) {
      const [it] = this.items.splice(index, 1);
      if (!it) return;
      it.previewUrl && URL.revokeObjectURL(it.previewUrl);
      it.preview320 && URL.revokeObjectURL(it.preview320);
      it.preview1600 && URL.revokeObjectURL(it.preview1600);
    },

 async importAll() {
      if (!this.albumId) {
        this.error = 'Не указан альбом.';
        return;
      }
      if (!this.items.length) return;

      this.busy = true;
      this.error = '';
      try {
        const db = await dbp;
        const album = await db.get('albums', this.albumId);
        if (!album) throw new Error('Альбом не найден');

        for (const it of this.items) {
          const file = it.file;
          if (!file) continue;

          // Если пользователь вручную кропнул — используем готовые блобы.
          // Иначе — автогенерация как раньше.
          let blob320, blob1600;

          if (it?.tmp?.blob320 && it?.tmp?.blob1600) {
            blob320 = it.tmp.blob320;
            blob1600 = it.tmp.blob1600;
          } else {
            const img = await this.readImage(file);
            const orientation = img.width >= img.height ? 'Горизонтальное' : 'Вертикальное';
            const cropPreview = this.centerCrop(img.width, img.height, 4/3);
            const cropDisplay = this.centerCrop(img.width, img.height, orientation === 'Горизонтальное' ? 16/9 : 9/16);

            blob320  = await this.renderVariant(img, cropPreview, 320,  true,  0.88);
            blob1600 = await this.renderVariant(img, cropDisplay, 1600, false, 0.88);
          }

          // сохраняем в blobs
          const blobId320  = crypto.randomUUID();
          const blobId1600 = crypto.randomUUID();
          await db.put('blobs', blob320,  blobId320);
          await db.put('blobs', blob1600, blobId1600);

          // запись фото
          const photoId = crypto.randomUUID();
          const photo = {
            id: photoId,
            title: '',
            description: '',
            createdAt: new Date().toISOString(),
            crop: {
              preview: { aspect: '4:3' },
              display: { aspect: (it.meta?.orientation === 'Горизонтальное') ? '16:9' : '9:16' }
            },
            variants: [
              { size: 320,  blobId: blobId320  },
              { size: 1600, blobId: blobId1600 },
            ],
          };
          await db.put('photos', photo);

          // привязка к альбому
          album.photoIds = album.photoIds || [];
          album.photoIds.push(photoId);

          if (!album.coverPhotoId) album.coverPhotoId = photoId;
        }

        await db.put('albums', album);

        // очистка превью и переход в альбом
        this.items.forEach(it => {
          it.previewUrl  && URL.revokeObjectURL(it.previewUrl);
          it.preview320  && URL.revokeObjectURL(it.preview320);
          it.preview1600 && URL.revokeObjectURL(it.preview1600);
        });
        this.items = [];

        this.$router.push({ name: 'album', params: { id: this.albumId } });
      } catch (e) {
        this.error = e && e.message ? e.message : String(e);
      } finally {
        this.busy = false;
      }
    },

    openCrop(it, mode) {
      const landscape = (it.meta?.orientation || '') === 'Горизонтальное';
      this.cropDlg.open = true;
      this.cropDlg.file = it.file;
      this.cropDlg.mode = mode;
      if (mode === 'preview') {
        this.cropDlg.aspect = 4 / 3;
        this.cropDlg.target = 320;
      } else {
        this.cropDlg.aspect = landscape ? (16 / 9) : (9 / 16);
        this.cropDlg.target = 1600;
      }
      this.cropDlg.itemId = it.id;
    },

    onCropApply({ blob, data, width, height, mode }) {
      const i = this.items.findIndex(x => x.id === this.cropDlg.itemId);
      if (i < 0) return;
      const it = this.items[i];

      // освобождаем старые превью, если были
      if (mode === 'preview') {
        if (it.preview320) URL.revokeObjectURL(it.preview320);
        it.preview320 = URL.createObjectURL(blob);
        it.tmp = it.tmp || {};
        it.tmp.blob320 = blob;
        it.crops = it.crops || {};
        it.crops.preview = { aspect: '4:3', canvasW: width, canvasH: height, data };
      } else {
        if (it.preview1600) URL.revokeObjectURL(it.preview1600);
        it.preview1600 = URL.createObjectURL(blob);
        it.tmp = it.tmp || {};
        it.tmp.blob1600 = blob;
        const landscape = (it.meta?.orientation || '') === 'Горизонтальное';
        it.crops = it.crops || {};
        it.crops.display = { aspect: landscape ? '16:9' : '9:16', canvasW: width, canvasH: height, data };
      }
    },

    /* ===== helpers ===== */

    readImage(fileOrBlob) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Не удалось прочитать изображение'));
        img.src = URL.createObjectURL(fileOrBlob);
      });
    },

    /**
     * Центровой кроп под нужную пропорцию.
     * Возвращает { sx, sy, sw, sh } — область исходника.
     */
    centerCrop(srcW, srcH, targetAspect) {
      const srcAspect = srcW / srcH;
      let sw, sh, sx, sy;
      if (srcAspect > targetAspect) {
        sh = srcH;
        sw = Math.round(sh * targetAspect);
      } else {
        sw = srcW;
        sh = Math.round(sw / targetAspect);
      }
      sx = Math.round((srcW - sw) / 2);
      sy = Math.round((srcH - sh) / 2);
      return { sx, sy, sw, sh };
    },

    /**
     * Рендерит кроп в Canvas.
     * @param {HTMLImageElement} img
     * @param {{sx,sy,sw,sh}} crop
     * @param {number} target - 320 (для preview) ИЛИ 1600 (для display)
     * @param {boolean} byWidth - если true: масштаб по ширине (для 320w), иначе по длинной стороне (для 1600 long)
     * @param {number} quality - JPEG качество (0..1)
     * @return {Promise<Blob>}
     */
    renderVariant(img, crop, target, byWidth, quality = 0.88) {
      const { sx, sy, sw, sh } = crop;
      let dw, dh;
      if (byWidth) {
        const scale = target / sw;
        dw = Math.round(sw * scale);
        dh = Math.round(sh * scale);
      } else {
        const long = Math.max(sw, sh);
        const scale = target / long;
        dw = Math.round(sw * scale);
        dh = Math.round(sh * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = dw;
      canvas.height = dh;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
      return new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
      });
    },
  },
});
</script>

<style scoped>
.opacity-80 {
  opacity: .8;
}

.thumbs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 8px 8px 0;
}

.thumb {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.thumb-title {
  font-size: 11px;
  opacity: .8;
}

.thumb-img {
  width: 100%;
  aspect-ratio: 4/3;
  /* просто «окошко» для превью */
  background: #000 center/cover no-repeat;
  border: 1px solid rgba(255, 255, 255, .08);
  border-radius: 8px;
}
</style>
