<template>
  <section class="card import">
    <h2>Импорт фотографий</h2>

    <input type="file" multiple accept="image/*" @change="onPick" class="input" style="padding:8px;" />

    <!-- КНОПКИ -->
    <div style="display:flex; gap:8px; margin-top:12px;">
      <button class="btn" :disabled="busy || !previews.length" @click="openCropDialog([320])">Сделать 320</button>
      <button class="btn" :disabled="busy || !previews.length" @click="openCropDialog([1600])">Сделать 1600</button>
      <button class="btn" :disabled="busy || !previews.length" @click="openCropDialog([320, 1600])">Сделать 320 +
        1600</button>
    </div>

    <!-- превью выбранных файлов -->
    <div v-if="previews.length" class="grid" style="margin-top:12px;">
      <figure v-for="(src, i) in previews" :key="i" class="card" :class="{ 'is-active': i === activeIndex }"
        style="padding:6px; cursor:pointer; border:2px solid transparent;" @click="activeIndex = i">
        <img :src="src" :alt="'preview-' + i" style="display:block; max-width:100%;" />
        <figcaption class="muted" style="margin-top:6px;">Фото {{ i + 1 }}</figcaption>
      </figure>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <!-- ДИАЛОГ КАДРИРОВАНИЯ -->
    <div v-if="cropperOpen" class="modal-backdrop">
      <div class="modal">
        <header class="modal__head">
          <strong>Кадрирование</strong>
          <button class="btn btn--text" @click="closeCropDialog" :disabled="busy">✕</button>
        </header>

        <div class="modal__controls">
          <label class="muted">Соотношение</label>
          <select v-model="aspectPreset" @change="applyAspect" :disabled="busy" class="input">
            <option value="free">Свободно</option>
            <option value="1:1">1:1 (квадрат)</option>
            <option value="3:2">3:2</option>
            <option value="4:3">4:3</option>
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
          </select>
        </div>
        <div class="modal__controls" style="flex-wrap:wrap;">
          <label class="muted" style="min-width:120px;">Название</label>
          <input class="input" v-model="inputTitle" :disabled="busy" placeholder="Короткое имя файла"
            style="flex:1; min-width:260px;" />

          <label class="muted" style="min-width:120px;">Описание</label>
          <input class="input" v-model="inputDesc" :disabled="busy" placeholder="Описание (необязательно)"
            style="flex:1; min-width:260px;" />
        </div>

        <div class="modal__body">
          <div class="cropper-wrap">
            <img ref="cropImg" :src="previews[activeIndex]" alt="to-crop" />
          </div>
        </div>

        <footer class="modal__foot">
          <button class="btn" @click="resetCrop" :disabled="busy">Сбросить</button>
          <div style="flex:1"></div>
          <button class="btn btn--ghost" @click="closeCropDialog" :disabled="busy">Отмена</button>
          <button class="btn" @click="confirmCropAndProcess" :disabled="busy">
            Обрезать и сохранить
            <span v-if="sizesToMake.length">({{ sizesToMake.join(' / ') }})</span>
          </button>
        </footer>
      </div>
    </div>
  </section>
</template>

<script>
import { dbp } from '@/lib/db'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'

export default {
  name: 'ImportView',
  data: () => ({
    queue: [],
    previews: [],
    busy: false,
    error: null,

    activeIndex: 0,
    cropperOpen: false,
    cropper: null,
    aspectPreset: '3:2',
    sizesToMake: [],

    inputTitle: '',       // короткое имя файла (без расширения)
    inputDesc: '',       // произвольное описание

  }),
  computed: {
    albumId() {
      return this.$route?.params?.id || ''
    },
  },
  beforeDestroy() {
    // очистим объектные URL и cropper
    this.previews.forEach((u) => URL.revokeObjectURL(u))
    this.destroyCropper()
  },
  methods: {
    onPick(e) {
      const files = Array.from(e.target.files || [])
      this.queue = files
      this.previews.forEach((u) => URL.revokeObjectURL(u))
      this.previews = files.map((f) => URL.createObjectURL(f))
      this.error = null
      this.activeIndex = 0
    },

    /* ===== Диалог ===== */
    openCropDialog(sizes) {
      if (!this.previews.length) return
      this.sizesToMake = sizes
      // дефолты из текущего файла
      const file = this.queue[this.activeIndex]
      const base = (file?.name || '').replace(/\.[^.]+$/, '')
      this.inputTitle = base
      this.inputDesc = ''
      this.cropperOpen = true
      this.$nextTick(this.initCropper)
    },
    closeCropDialog() {
      this.destroyCropper()
      this.cropperOpen = false
    },
    initCropper() {
      const img = this.$refs.cropImg
      if (!img) return
      this.destroyCropper()
      const aspect = this.aspectPresetToNumber(this.aspectPreset)
      this.cropper = new Cropper(img, {
        viewMode: 2,
        dragMode: 'move',
        autoCrop: true,
        autoCropArea: 0.9,
        responsive: true,
        background: false,
        movable: true,
        zoomable: true,
        scalable: false,
        rotatable: false,
        checkOrientation: false,
        aspectRatio: aspect,
      })
    },
    destroyCropper() {
      if (this.cropper) {
        this.cropper.destroy()
        this.cropper = null
      }
    },
    resetCrop() {
      if (this.cropper) this.cropper.reset()
    },
    applyAspect() {
      if (!this.cropper) return
      const aspect = this.aspectPresetToNumber(this.aspectPreset)
      this.cropper.setAspectRatio(aspect || NaN)
    },
    aspectPresetToNumber(preset) {
      if (preset === 'free') return null
      const [w, h] = preset.split(':').map((n) => +n)
      return w && h ? w / h : null
    },

    /* ===== Подтверждение и запуск воркера ===== */
    async confirmCropAndProcess() {
      if (!this.cropper || this.busy) return
      try {
        this.busy = true
        this.error = null

        const crop = { ...this.cropper.getData(true) } // plain object
        const file = this.queue[this.activeIndex]
        const sizes = Array.from(this.sizesToMake)     // plain array

        if (!file) throw new Error('Не найден выбранный файл')

        const results = await this.runWorker(file, sizes, crop)

        // 1) сохраняем результаты в IndexedDB
        const db = await dbp

        // results: [{ size, blob, width, height }, ...]
        const variantIds = []
        for (const r of results) {
          const blobId = await this.saveBlob(db, r.blob)
          variantIds.push({ size: r.size, blobId })
        }

        // В качестве title возьмём имя файла без расширения
        const baseTitle = (file.name || '').replace(/\.[^.]+$/, '')

        // 2) запись фото + обновление альбома
        await this.savePhotoRecord(db, this.albumId, this.inputTitle, this.inputDesc, variantIds)
        this.closeCropDialog()
        // 3) (опц.) показать уведомление/очистить превью/перейти на альбом
        this.$router.push({ name: 'album', params: { id: this.albumId } })

        // здесь можно загрузить результаты на сервер/IndexedDB и т.д.
        //console.info('Processed results:', results)


      } catch (err) {
        console.error(err)
        this.error = err?.message || 'Ошибка обработки'
      } finally {
        this.busy = false
      }
    },

    /* ===== Воркёр ресайза/обрезки ===== */
    runWorker(file, sizes, crop) {
      return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('../workers/resizer.worker.js', import.meta.url))

        const safeSizes = Array.from(sizes)
        const safeCrop = { ...crop } // плоский объект

        worker.onmessage = (ev) => {
          const data = ev.data
          if (data && data.error) {
            reject(new Error(data.error))
          } else {
            resolve(data)
          }
          worker.terminate()
        }
        worker.onerror = (e) => {
          reject(e)
          worker.terminate()
        }

        // ВАЖНО: без массива transferables
        worker.postMessage({ file, sizes: safeSizes, crop: safeCrop })
      })
    },
    // Сохраняем blob как { type, buffer } с ВНЕШНИМ ключом (третий аргумент)
    async saveBlob(db, blob) {
      const id = (crypto?.randomUUID?.() || (Date.now() + '-' + Math.random().toString(16).slice(2)))
      const buffer = await blob.arrayBuffer()
      // ВАЖНО: ключ как 3-й аргумент; значение — без поля id
      await db.put('blobs', { type: blob.type || 'image/jpeg', buffer }, id)
      return id
    },

    // Сохраняем запись фото и добавляем его в альбом
    async savePhotoRecord(db, albumId, title, description, variants) {
      const id = (crypto?.randomUUID?.() || (Date.now() + '-' + Math.random().toString(16).slice(2)))
      const photo = {
        id,
        albumId,
        title: title || '',
        description: description || '',
        createdAt: Date.now(),
        variants: variants.map(v => ({ size: v.size, blobId: v.blobId })),
      }

      // Пытаемся положить с ВНЕШНИМ ключом; если стор с keyPath — fallback без ключа
      try { await db.put('photos', photo, id) } catch { await db.put('photos', photo) }

      // Обновим/создадим альбом
      let album = await db.get('albums', albumId)
      if (!album) album = { id: albumId, title: '', photoIds: [] }
      const next = Array.isArray(album.photoIds) ? album.photoIds.slice() : []
      next.push(id)
      try { await db.put('albums', { ...album, photoIds: next }, albumId) } catch { await db.put('albums', { ...album, photoIds: next }) }

      return id
    },

  },
}
</script>

<style scoped>
.muted {
  opacity: .75;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
}

.card.is-active {
  border-color: #5ea3ff;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}

.modal {
  width: min(92vw, 980px);
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 14px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .4);
  display: flex;
  flex-direction: column;
  max-height: 92vh;
}

.modal__head,
.modal__foot {
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal__head {
  border-bottom: 1px solid #2a2a2a;
}

.modal__foot {
  border-top: 1px solid #2a2a2a;
}

.modal__controls {
  padding: 10px 12px;
  display: flex;
  gap: 12px;
  align-items: center;
}

.modal__body {
  padding: 10px 12px;
  overflow: auto;
}

.cropper-wrap {
  width: 100%;
  height: 64vh;
  min-height: 300px;
}

.cropper-wrap>img {
  max-width: 100%;
  display: block;
}

.btn {
  padding: 8px 12px;
  border: 1px solid #444;
  border-radius: 8px;
  background: #2a2a2a;
  color: #fff;
}

.btn[disabled] {
  opacity: .6;
  cursor: not-allowed;
}

.btn--text {
  background: transparent;
  border: 0;
  padding: 4px 8px;
}

.btn--ghost {
  background: transparent;
}

.input {
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid #444;
  background: #1b1b1b;
  color: #fff;
}

.error {
  color: #ffd9d9;
  background: #3a1f1f;
  border: 1px solid #a55;
  padding: 8px 10px;
  border-radius: 10px;
  margin-top: 8px;
}
</style>
