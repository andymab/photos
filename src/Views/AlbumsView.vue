<template>
  <v-container fluid class="albums">
    <!-- СЕТКА АЛЬБОМОВ -->
    <v-row v-if="albums.length" dense>
      <v-col v-for="a in albums" :key="a.id" cols="12" sm="12" md="6" lg="2">
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
            <div class="meta-row">
              <router-link class="btn link-btn" :to="{ name: 'album', params: { id: a.id } }">Открыть</router-link>
              <button class="btn ghost" @click="openEditAlbum(a)">Править</button>
            </div>
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
      // можно оставить для дефолтного имени при создании
      title: 'Мой альбом',
      albums: [],
      editor: {
        open: false,
        mode: 'create',     // 'create' | 'edit'
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
    // снимаем обработчик при уходе со страницы
    this.clearAlbumsAddHandler && this.clearAlbumsAddHandler();
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

    // === генерация variants и запись фото (как было) ===
    async createCoverPhoto(file, db) {
      const { blob320, blob1600 } = await this.makeVariants(file);
      const blobId320 = crypto.randomUUID();
      const blobId1600 = crypto.randomUUID();
      await db.put('blobs', blob320, blobId320);
      await db.put('blobs', blob1600, blobId1600);

      const photoId = crypto.randomUUID();
      const photo = {
        id: photoId,
        title: '', description: '',
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
      canvas.width = cw; canvas.height = ch;
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
.page-title {
  margin: 0;
  line-height: 1.2;
}

/* карточка фиксированной высоты + аккуратная компоновка */
.album-card {
  height: 280px;
  /* фиксируем одинаковую высоту для всех */
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.album-cover {
  display: block;
}

.cover {
  width: 100%;
  aspect-ratio: 16/10;
  background: #000;
  background-position: center;
  background-size: cover;
  /* обложке на общей сетке логичнее cover */
  border-bottom: 1px solid rgba(255, 255, 255, .08);
  display: grid;
  place-items: center;
}

.cover-empty {
  font-size: 42px;
  opacity: .6;
}

/* зона мета-инфо заполняет оставшееся место */
.album-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 auto;
}

.album-meta .title {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.album-meta .desc {
  opacity: .85;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  /* 2 строки описания */
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.6em;
  /* стабилизируем высоту блока описания */
}

.album-meta .meta-row {
  display: flex;
  gap: 8px;
  margin-top: auto;
  /* уводим кнопки вниз карточки */
}

/* вторичный текст */
.muted {
  opacity: .75;
  margin-top: 8px;
}

/* позиционирование и плавное появление кнопки редактирования */
.album-card {
  position: relative;
}

.card-edit {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity .18s ease, transform .18s ease;
  pointer-events: none;
  /* чтобы не ловить ховеры, пока скрыта */
}

/* показываем на hover и на focus-within (доступно с клавиатуры) */
.album-card:hover .card-edit,
.album-card:focus-within .card-edit {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}

/* (опционально) сделаем иконку читабельной на светлой обложке */
.card-edit .v-icon {
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, .35));
}
</style>
