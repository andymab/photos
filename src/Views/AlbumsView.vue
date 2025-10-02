<template>
  <section class="card albums">
    <h2>Альбомы</h2>

    <div class="toolbar">
      <input class="input" v-model="title" placeholder="Название нового альбома" />
      <button class="btn" @click="createAlbum">Создать</button>
    </div>

    <nav v-if="albums.length">
      <ul class="album-list">
        <li v-for="a in albums" :key="a.id">
          <router-link class="btn link-btn" :to="{ name: 'album', params: { id: a.id } }">
            📁 {{ a.title }}
          </router-link>
        </li>
      </ul>
    </nav>

    <p v-else class="muted">Пока нет альбомов — создайте первый.</p>
  </section>
</template>

<script >
import { defineComponent } from 'vue';
import { dbp } from '@/lib/db';

export default defineComponent({
  name: 'AlbumsView',
  data() {
    return {
      title: 'Мой альбом',
      albums: [],
    };
  },
  async mounted() {
    await this.load();
  },
  methods: {
    async load() {
      const db = await dbp;
      this.albums = await db.getAll('albums');
    },
    async createAlbum() {
      const db = await dbp;
      const id = crypto.randomUUID();
      await db.put('albums', {
        id,
        title: this.title || 'Без названия',
        createdAt: new Date().toISOString(),
        photoIds: [],
      });
      await this.load();
    },
  },
});
</script>

<style scoped>
.albums .toolbar {
  display: flex;
  gap: 8px;
  margin: 12px 0;
  align-items: center;
}

/* убираем маркеры и отступы у UL */
.album-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.album-list > li {
  margin: 8px 0;
}

/* делаем router-link визуально как кнопку */
.link-btn {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
}

/* лёгкий вторичный текст */
.muted {
  opacity: 0.75;
  margin-top: 8px;
}

/* убираем вертикальный скролл у контейнера полноэкранного диалога */
:deep(.viewer-dialog .v-overlay__content) {
  overflow: hidden !important;
  /* на некоторых платформах помогает стабилизировать полосу */
  scrollbar-gutter: stable both-edges;
}
</style>
