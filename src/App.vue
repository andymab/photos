<template>
    <v-app>
        <v-app-bar class="app-header" color="deep-purple-darken-1" density="comfortable">
            <template #prepend>
                <v-avatar size="40" color="white">
                    <v-icon icon="mdi-camera" color="deep-purple-darken-1"></v-icon>
                </v-avatar>
            </template>

            <!-- Заголовок: на списке альбомов — "Фотоальбомы", на просмотре — "Альбом" -->
            <v-app-bar-title>
                <router-link :to="{ name: 'albums' }" class="text-h5 font-weight-bold text-white text-decoration-none">
                    Фотоальбомы
                </router-link>

                <template v-if="isAlbum">
                    <span class="text-h5 font-weight-bold text-white">- Альбом</span>
                </template>

            </v-app-bar-title>

            <template #append>
                <!-- Кнопка создания альбома — только на списке -->
                <v-btn v-if="isAlbums && albumsAddHandler" color="white" variant="text" icon :title="'Создать альбом'"
                    @click="albumsAddHandler()">
                    <v-icon icon="mdi-plus" />
                </v-btn>

                <!-- Действия альбома — только на странице альбома -->
                <template v-if="isAlbum">
                    <v-btn color="white" variant="text" icon :title="'Добавить фото'"
                        :to="{ name: 'import', params: { id: albumId } }" 
                        >
                        <v-icon icon="mdi-plus" />
                    </v-btn>
                    <v-btn color="white" variant="text" icon :title="'Экспорт'"
                        @click="albumActions?.export && albumActions.export()">
                        <v-icon icon="mdi-tray-arrow-up" />
                    </v-btn>
                    <v-btn color="white" variant="text" icon :title="'Обновить'"
                        @click="albumActions?.refresh && albumActions.refresh()">
                        <v-icon icon="mdi-refresh" />
                    </v-btn>
                </template>
            </template>
        </v-app-bar>


        <main class="app-main">
            <router-view />
        </main>
    </v-app>
</template>

<script>
import { defineComponent } from 'vue';

export default defineComponent({
    name: 'App',
    data() {
        return {
            // сюда дети будут регистрировать обработчик «создать альбом»
            albumsAddHandler: null, // () => void | null
            albumActions: null,            // { export:()=>void, refresh:()=>void } | null
        };
    },
    computed: {
        // без useRoute — в Options API доступен this.$route
        isAlbums() {
            return this.$route?.name === 'albums';
        },
        isAlbum() { return this.$route?.name === 'album'; },
        albumId() { return this.$route?.params?.id || ''; },
    },
    // provide в Options API — это функция, которая возвращает объект
    provide() {
        return {
            // для AlbumsView (плюс на списке)
            setAlbumsAddHandler: (cb) => { this.albumsAddHandler = cb; },
            clearAlbumsAddHandler: () => { this.albumsAddHandler = null; },
            // для AlbumView (экспорт/обновить на странице альбома)
            setAlbumActions: (actions) => { this.albumActions = actions; },
            clearAlbumActions: () => { this.albumActions = null; },
        };
    },
});
</script>

<style scoped>
.app-main {
    flex: 1;
    margin-top: 50px;
    padding: 20px;
    font: 16px/1.5 system-ui, -apple-system, Segoe UI, Roboto, Arial;
    background:
        radial-gradient(1200px 800px at 10% 0%, rgba(255, 255, 255, 0.06), transparent 60%),
        linear-gradient(135deg, #6a4bd8, #258ad1 50%, #11c3bd) !important;
    color: #eef3ff;
}
</style>
