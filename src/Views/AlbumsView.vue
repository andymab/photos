<template>
  <v-container fluid class="albums">
    <!-- СЕТКА АЛЬБОМОВ -->
    <v-row v-if="albums.length" dense class="albums-grid">
      <v-col v-for="a in albums" :key="a.id" cols="12" sm="6" md="3" class="album-col">
        <v-card class="album-card" rounded="xl" elevation="2">
          <!-- кнопка-иконка редактирования -->
          <v-btn class="card-edit" icon variant="elevated" size="small" color="deep-purple-darken-1"
            :title="'Редактировать альбом'" @click.stop="openEditAlbum(a)" aria-label="Редактировать альбом">
            <v-icon icon="mdi-pencil" />
          </v-btn>

          <router-link class="album-cover" :to="{ name: 'album', params: { id: a.id } }">
            <div class="cover" :style="a.coverSrc320 ? { backgroundImage: `url('${a.coverSrc320}')` } : {}"
              aria-label="Обложка альбома">
              <span v-if="!a.coverSrc320" class="cover-empty">📁</span>
            </div>
          </router-link>

          <v-card-text class="album-meta">
            <div class="title" :title="a.title">{{ a.title }}</div>
            <div v-if="a.description" class="desc" :title="a.description">{{ a.description }}</div>

          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <p v-else class="muted">Пока нет альбомов — создайте первый.</p>

    <!-- ДИАЛОГ РЕДАКТОРА АЛЬБОМА -->
    <AlbumEditorDialog v-model="editor.open" :mode="editor.mode" :title="editor.form.title"
      :description="editor.form.description" :initialPreview="editor.initialPreview" :busy="editor.busy"
      @save="onEditorSave" />
  </v-container>
</template>

<script>
import { defineComponent } from 'vue';
import { dbp } from '@/lib/db';
import AlbumEditorDialog from '@/components/AlbumEditorDialog.vue';

export default defineComponent({
  name: 'AlbumsView',
  components: { AlbumEditorDialog },
  inject: {
    setAlbumsAddHandler: { default: null },
    clearAlbumsAddHandler: { default: null },
  },
  data() {
    return {
      title: 'Мой альбом',
      albums: [],
      editor: {
        open: false,
        mode: 'create',
        albumId: null,
        busy: false,
        form: { title: '', description: '' },
        initialPreview: '',
      },
    };
  },
  async mounted() {
    await this.load();
    this.setAlbumsAddHandler && this.setAlbumsAddHandler(() => this.openCreateDialog());
  },
  beforeUnmount() {
    this.clearAlbumsAddHandler && this.clearAlbumsAddHandler();
    // Очищаем ObjectURL для предотвращения утечек памяти
    this.albums.forEach(album => {
      if (album.coverSrc320) {
        URL.revokeObjectURL(album.coverSrc320);
      }
    });
  },
  methods: {
    async load() {
      const db = await dbp;
      const rows = await db.getAll('albums');
      const result = [];
      for (const a of rows) {
        let coverSrc320 = '';
        if (a.coverPhotoId) {
          const photo = await db.get('photos', a.coverPhotoId);
          const v320 = photo?.variants?.find?.(v => v.size === 320);
          if (v320?.blobId) {
            const blob = await db.get('blobs', v320.blobId);
            if (blob) coverSrc320 = URL.createObjectURL(blob);
          }
        }
        result.push({ ...a, coverSrc320 });
      }
      this.albums = result;
    },

    openCreateDialog() {
      this.editor.mode = 'create';
      this.editor.albumId = null;
      this.editor.form.title = this.title || 'Без названия';
      this.editor.form.description = '';
      this.editor.initialPreview = '';
      this.editor.open = true;
    },

    openEditAlbum(a) {
      this.editor.mode = 'edit';
      this.editor.albumId = a.id;
      this.editor.form.title = a.title || '';
      this.editor.form.description = a.description || '';
      this.editor.initialPreview = a.coverSrc320 || '';
      this.editor.open = true;
    },

    async onEditorSave({ title, description, file }) {
      this.editor.busy = true;
      try {
        const db = await dbp;

        if (this.editor.mode === 'create') {
          let coverPhotoId = null;
          if (file) {
            coverPhotoId = await this.createCoverPhoto(file, db);
          }
          const id = crypto.randomUUID();
          const album = {
            id,
            title: title || 'Без названия',
            description: description || '',
            createdAt: new Date().toISOString(),
            photoIds: coverPhotoId ? [coverPhotoId] : [],
            coverPhotoId
          };
          await db.put('albums', album);
        } else {
          const a = await db.get('albums', this.editor.albumId);
          if (!a) throw new Error('Альбом не найден');

          let coverPhotoId = a.coverPhotoId || null;
          if (file) {
            coverPhotoId = await this.createCoverPhoto(file, db);
            if (a.photoIds?.length) {
              a.photoIds = [coverPhotoId, ...a.photoIds.filter(id => id !== coverPhotoId)];
            } else {
              a.photoIds = coverPhotoId ? [coverPhotoId] : [];
            }
          }
          a.title = title || a.title;
          a.description = description || '';
          a.coverPhotoId = coverPhotoId;
          await db.put('albums', a);
        }

        this.editor.open = false;
        await this.load();
      } catch (e) {
        alert('Не удалось сохранить альбом: ' + (e && e.message ? e.message : e));
      } finally {
        this.editor.busy = false;
      }
    },

    async createCoverPhoto(file, db) {
      const { blob320, blob1600 } = await this.makeVariants(file);
      const blobId320 = crypto.randomUUID();
      const blobId1600 = crypto.randomUUID();
      await db.put('blobs', blob320, blobId320);
      await db.put('blobs', blob1600, blobId1600);

      const photoId = crypto.randomUUID();
      const photo = {
        id: photoId,
        title: '',
        description: '',
        createdAt: new Date().toISOString(),
        variants: [
          { size: 320, blobId: blobId320 },
          { size: 1600, blobId: blobId1600 }
        ]
      };
      await db.put('photos', photo);
      return photoId;
    },

    async makeVariants(file) {
      const img = await this.readImage(file);
      const blob320 = await this.resizeToBlob(img, 320);
      const blob1600 = await this.resizeToBlob(img, 1600);
      return { blob320, blob1600 };
    },

    readImage(file) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
    },

    resizeToBlob(img, maxSize) {
      const { width: w, height: h } = img;
      const scale = Math.min(1, maxSize / Math.max(w, h));
      const cw = Math.round(w * scale);
      const ch = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, cw, ch);
      return new Promise(resolve => {
        canvas.toBlob(b => resolve(b), 'image/jpeg', 0.9);
      });
    },
  },
});
</script>

<style scoped>
/* ====== Контейнер альбомов ====== */
.albums {
  max-width: 1400px;
  margin: 0 auto;
  padding: 16px;
}

/* ====== Исправленная сетка ====== */
.albums-grid {
  margin: -8px;
  /* Компенсируем padding колонок */
}

.album-col {
  padding: 8px !important;
  display: flex;
}

.album-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.album-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
}

/* ====== Обложка альбома ====== */
.album-cover {
  display: block;
  flex: none;
  /* Запрещаем растягивание */
}

.cover {
  width: 100%;
  aspect-ratio: 4/3; /* Оптимальное соотношение для фотоальбомов */
  background: #000;
  background-position: center;
  background-size: cover; /* Заполняет контейнер без повторений */
  background-repeat: no-repeat; /* Убираем повторения */
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
}

.cover-empty {
  font-size: 42px;
  opacity: 0.6;
}

/* ====== Мета-информация ====== */
.album-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 auto;
  /* Занимает оставшееся пространство */
  padding: 12px !important;
}

.album-meta .title {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

.album-meta .desc {
  opacity: 0.85;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.3;
  min-height: 2.6em;
}

.album-meta .meta-row {
  display: flex;
  gap: 8px;
  margin-top: auto;
  /* Прижимаем кнопки к низу */
  padding-top: 8px;
}

/* ====== Кнопки ====== */
.btn {
  padding: 6px 12px;
  border-radius: 6px;
  text-decoration: none;
  font-size: 0.875em;
  transition: all 0.2s ease;
  border: none;
  cursor: pointer;
  flex: 1;
  text-align: center;
}

.link-btn {
  background: rgba(103, 58, 183, 0.1);
  color: #673ab7;
  border: 1px solid rgba(103, 58, 183, 0.3);
}

.link-btn:hover {
  background: rgba(103, 58, 183, 0.2);
}

.ghost {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.ghost:hover {
  background: rgba(255, 255, 255, 0.1);
}

/* ====== Кнопка редактирования ====== */
.card-edit {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity 0.18s ease, transform 0.18s ease;
  pointer-events: none;
}

.album-card:hover .card-edit,
.album-card:focus-within .card-edit {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}

.card-edit .v-icon {
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35));
}

/* ====== Текстовые состояния ====== */
.muted {
  opacity: 0.75;
  text-align: center;
  padding: 40px 20px;
  margin: 0;
}

/* ====== Адаптивность ====== */
@media (max-width: 599px) {
  .albums {
    padding: 8px;
  }

  .album-col {
    padding: 4px !important;
  }

  .album-meta {
    padding: 8px !important;
  }

  .meta-row {
    flex-direction: column;
  }
}

@media (min-width: 600px) and (max-width: 959px) {
  /* На sm экранах - 2 колонки */
}

@media (min-width: 960px) and (max-width: 1263px) {
  /* На md экранах - 3 колонки */
}

@media (min-width: 1264px) {
  /* На lg экранах - 4 колонки */
}
</style>