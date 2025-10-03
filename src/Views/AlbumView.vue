<template>
    <v-container class="album" fluid>
        <v-row dense>
            <v-col cols="12">
                <p v-if="loading" class="muted">Загрузка…</p>
                <p v-if="error" class="error">Ошибка: {{ error }}</p>
                <p v-if="!loading && !error && !photos.length" class="muted">
                    В альбоме пока нет фото. Нажмите «Добавить фото».
                </p>
            </v-col>
        </v-row>

        <v-row dense class="photos-grid">
            <!-- Правильная сетка: 1 колонка на xs, 2 на sm, 3 на md, 4 на lg -->
            <v-col 
                v-for="(p, index) in photos" 
                :key="p.id" 
                cols="12" 
                sm="6" 
                md="3" 
                lg="3" 
                class="photo-col"
            >
                <v-card 
                    class="photo-card" 
                    elevation="2" 
                    rounded="xl" 
                    @click="openViewer(index)" 
                    style="cursor: pointer"
                >
                    <div class="photo-frame">
                        <v-img 
                            :src="p.src320" 
                            :srcset="`${p.src320} 320w, ${p.src1600} 1600w`"
                            sizes="(max-width:600px) 320px, (max-width:960px) 50vw, (max-width:1264px) 33vw, 25vw" 
                            :alt="p.title || 'Фото'" 
                            loading="lazy"
                            decoding="async" 
                            class="photo-img"
                            cover
                        />
                    </div>

                    <v-card-text v-if="p.title" class="photo-caption">
                        {{ p.title }}
                    </v-card-text>
                </v-card>
            </v-col>
        </v-row>

        <!-- ПОЛНОЭКРАННЫЙ ПРОСМОТРЩИК -->
        <v-dialog v-model="viewerOpen" fullscreen :scrim="true" transition="fade-transition" :retain-focus="false">
            <div class="viewer" ref="viewer" @click.self="closeViewer">
                <div class="viewer__topbar">
                    <div class="viewer__header">
                        <div class="viewer__title">
                            {{ currentPhoto?.title || (photos.length ? 'Фото' : 'Нет фотографий') }}
                            <span v-if="photos.length" class="viewer__index">{{ currentIndex + 1 }} / {{ photos.length }}</span>
                        </div>
                        <div v-if="currentPhoto?.description" class="viewer__description">
                            {{ currentPhoto.description }}
                        </div>
                    </div>
                    <div class="viewer__actions">
                        <button class="btn" @click.stop.prevent="enterFullscreen">⛶</button>
                        <button class="btn" :disabled="!photos.length" @click.stop="toggleSlideshow">
                            {{ slideshowRunning ? 'Стоп' : 'Слайды' }}
                        </button>
                        <button class="btn" @click="openEdit">Редактировать</button>
                        <button class="btn" @click.stop="closeViewer">✕</button>
                    </div>
                </div>

                <!-- stage -->
                <div class="viewer__stage" @click.stop>
                    <transition name="fx-fade" mode="out-in">
                        <div v-if="currentSrc" class="viewer__box" :key="currentSrc">
                            <img 
                                class="viewer__img" 
                                :src="currentSrc" 
                                :alt="currentPhoto?.title || 'Фото'"
                                draggable="false" 
                            />
                        </div>
                        <div v-else class="viewer__empty">
                            <div class="viewer__empty-icon">📷</div>
                            <div class="viewer__empty-text">Нет фотографий для просмотра</div>
                            <router-link class="btn" :to="{ name: 'import', params: { id: albumId } }">
                                Добавить фото
                            </router-link>
                        </div>
                    </transition>
                </div>

                <!-- Стрелки только если есть что листать -->
                <v-btn 
                    v-if="photos.length > 1" 
                    class="viewer__nav viewer__nav--left" 
                    variant="flat" 
                    size="large" 
                    icon
                    @click.stop="prev" 
                    aria-label="Назад"
                >
                    <v-icon icon="mdi-chevron-left" color="white" />
                </v-btn>

                <v-btn 
                    v-if="photos.length > 1" 
                    class="viewer__nav viewer__nav--right" 
                    variant="flat" 
                    size="large" 
                    icon
                    @click.stop="next" 
                    aria-label="Вперёд"
                >
                    <v-icon icon="mdi-chevron-right" color="white" />
                </v-btn>
            </div>
        </v-dialog>

        <!-- Диалог редактирования названия и описания -->
        <EditPhotoDialog 
            v-model="editOpen" 
            :title="editTitle" 
            :description="editDesc" 
            :busy="savingEdit"
            @save="onEditSave" 
        />
    </v-container>
</template>

<script>
import { defineComponent } from 'vue';
import { dbp, getBlob } from '@/lib/db';
import { exportAlbumToDirectory } from '@/lib/export';
import EditPhotoDialog from '@/components/EditPhotoDialog.vue'

export default defineComponent({
    name: 'AlbumView',
    components: { EditPhotoDialog },
    inject: {
        setAlbumActions: { default: null },
        clearAlbumActions: { default: null },
    },
    data() {
        return {
            photos: [],
            loading: true,
            error: null,

            viewerOpen: false,
            currentIndex: 0,

            editOpen: false,
            editTitle: '',
            editDesc: '',
            savingEdit: false,

            slideshowRunning: false,
            slideshowDelay: 5000, // 5 сек
            slideshowTimer: null,
        };
    },
    computed: {
        albumId() { return this.$route?.params?.id || ''; },
        currentPhoto() {
            const i = this.currentIndex | 0;
            return this.photos && i >= 0 && i < this.photos.length ? this.photos[i] : null;
        },
        currentSrc() {
            return this.currentPhoto ? (this.currentPhoto.src1600 || this.currentPhoto.src320) : '';
        },
    },
    async mounted() {
        await this.load();
        window.addEventListener('keydown', this.onKey);

        this.setAlbumActions && this.setAlbumActions({
            export: () => this.exportAlbum(),
            refresh: () => this.load(),
        });

        document.addEventListener('fullscreenchange', this.onFsChange);
        document.addEventListener('webkitfullscreenchange', this.onFsChange);
        document.addEventListener('mozfullscreenchange', this.onFsChange);
        document.addEventListener('MSFullscreenChange', this.onFsChange);
    },
    beforeUnmount() {
        this.clearAlbumActions && this.clearAlbumActions();
        this.cleanupPhotos();
        window.removeEventListener('keydown', this.onKey);
        this.stopSlideshow();
        
        document.removeEventListener('fullscreenchange', this.onFsChange);
        document.removeEventListener('webkitfullscreenchange', this.onFsChange);
        document.removeEventListener('mozfullscreenchange', this.onFsChange);
        document.removeEventListener('MSFullscreenChange', this.onFsChange);
    },
    watch: {
        viewerOpen(val) {
            if (!val) this.stopSlideshow();
        }
    },
    methods: {
        cleanupPhotos() {
            this.photos.forEach((p) => {
                if (p.src320) URL.revokeObjectURL(p.src320);
                if (p.src1600) URL.revokeObjectURL(p.src1600);
            });
        },

        openEdit() {
            this.stopSlideshow();
            const cp = this.currentPhoto
            if (!cp) return
            this.editTitle = cp.title || ''
            this.editDesc = cp.description || ''
            this.editOpen = true
        },

        async toggleSlideshow() {
            if (this.slideshowRunning) {
                this.stopSlideshow();
            } else {
                await this.startSlideshow();
            }
        },

        async startSlideshow() {
            if (!this.photos.length) return;

            try {
                await this.enterFullscreen?.();
            } catch (e) {
                // если не получилось — все равно запускаем в режиме диалога
            }

            this.slideshowRunning = true;
            this.queueNextTick();
        },

        stopSlideshow() {
            this.slideshowRunning = false;
            if (this.slideshowTimer) {
                clearTimeout(this.slideshowTimer);
                this.slideshowTimer = null;
            }
        },

        queueNextTick() {
            if (this.slideshowTimer) clearTimeout(this.slideshowTimer);

            this.slideshowTimer = setTimeout(() => {
                if (!this.slideshowRunning) return;
                this.next?.();
                this.queueNextTick();
            }, this.slideshowDelay);
        },

        onFsChange() {
            const fsElement =
                document.fullscreenElement ||
                document.webkitFullscreenElement ||
                document.mozFullScreenElement ||
                document.msFullscreenElement;

            if (!fsElement && this.slideshowRunning) {
                this.stopSlideshow();
            }
        },

        async onEditSave({ title, description }) {
            const cp = this.currentPhoto
            if (!cp) return
            try {
                this.savingEdit = true
                const db = await dbp
                const full = await db.get('photos', cp.id)
                if (!full) throw new Error('Фото не найдено в БД')

                const updated = { ...full, title, description }
                try { await db.put('photos', updated, full.id) } catch { await db.put('photos', updated) }

                const i = this.currentIndex | 0
                if (this.photos[i]) {
                    this.photos[i] = { ...this.photos[i], title, description }
                }
                this.editOpen = false
            } catch (e) {
                alert('Не удалось сохранить: ' + (e && e.message ? e.message : e))
            } finally {
                this.savingEdit = false
            }
        },

        async load() {
            this.loading = true;
            this.error = null;
            this.cleanupPhotos();
            this.photos = [];
            
            try {
                const db = await dbp;
                const album = await db.get('albums', this.albumId);
                if (!album) {
                    this.photos = [];
                    return;
                }
                const list = await Promise.all(album.photoIds.map((pid) => db.get('photos', pid)));

                const pairs = await Promise.all(
                    list.map(async (p) => {
                        if (!p || !p.variants || !p.variants.length) return null;
                        const v320 = p.variants.find((v) => v.size === 320) || p.variants[0];
                        const v1600 = p.variants.find((v) => v.size === 1600) || v320;

                        const raw320 = await getBlob(v320.blobId);
                        const blob320 = raw320 instanceof Blob
                            ? raw320
                            : new Blob([raw320?.buffer ?? raw320?.data ?? new Uint8Array()], { type: raw320?.type || 'image/jpeg' });

                        const raw1600 = await getBlob(v1600.blobId);
                        const blob1600 = raw1600 instanceof Blob
                            ? raw1600
                            : new Blob([raw1600?.buffer ?? raw1600?.data ?? new Uint8Array()], { type: raw1600?.type || 'image/jpeg' });

                        const src320 = URL.createObjectURL(blob320);
                        const src1600 = URL.createObjectURL(blob1600);

                        return { id: p.id, title: p.title, description: p.description || '', src320, src1600 }
                    })
                );

                this.photos = pairs.filter(Boolean);
            } catch (e) {
                this.error = e && e.message ? e.message : String(e);
            } finally {
                this.loading = false;
            }
        },

        async exportAlbum() {
            try {
                await exportAlbumToDirectory(this.albumId);
            } catch (e) {
                alert('Экспорт не удался: ' + (e && e.message ? e.message : e));
            }
        },

        openViewer(index = 0) {
            if (!this.photos?.length) return;
            const max = this.photos.length - 1;
            this.currentIndex = Math.min(Math.max(0, index), max);
            this.viewerOpen = true;
        },

        closeViewer() {
            this.viewerOpen = false;
        },

        next() {
            if (!this.viewerOpen || !this.photos?.length) return;
            this.currentIndex = (this.currentIndex + 1) % this.photos.length;
        },

        prev() {
            if (!this.viewerOpen || !this.photos?.length) return;
            this.currentIndex = (this.currentIndex - 1 + this.photos.length) % this.photos.length;
        },

        onKey(e) {
            if (!this.viewerOpen) return;
            if (e.key === 'Escape') this.closeViewer();
            if (e.key === 'ArrowRight') this.next();
            if (e.key === 'ArrowLeft') this.prev();
            if (e.key.toLowerCase() === 'f') this.enterFullscreen();
        },

        isFullscreen() {
            return document.fullscreenElement
                || document.webkitFullscreenElement
                || document.mozFullScreenElement
                || document.msFullscreenElement
                || null;
        },

        requestFS(el) {
            if (el.requestFullscreen) return el.requestFullscreen();
            if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
            if (el.mozRequestFullScreen) return el.mozRequestFullScreen();
            if (el.msRequestFullscreen) return el.msRequestFullscreen();
        },

        exitFS() {
            if (document.exitFullscreen) return document.exitFullscreen();
            if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
            if (document.mozCancelFullScreen) return document.mozCancelFullScreen();
            if (document.msExitFullscreen) return document.msExitFullscreen();
        },

        async enterFullscreen() {
            if (!this.viewerOpen) return;
            const el = this.$refs.viewer;
            if (!el) return;

            try {
                if (this.isFullscreen()) {
                    await this.exitFS();
                } else {
                    await this.requestFS(el);
                }
            } catch (e) {
                console.warn('Fullscreen error:', e);
            }
        },
    }
});
</script>

<style scoped>
/* ====== Основные стили контейнера ====== */
.album {
    max-width: 1400px;
    margin: 0 auto;
    padding: 16px;
}

/* ====== Исправленная сетка фотографий ====== */
.photos-grid {
    margin: -8px; /* Компенсируем padding колонок */
}

.photo-col {
    padding: 8px !important;
    display: flex;
}

.photo-card {
    width: 100%;
    display: flex;
    flex-direction: column;
    background: rgba(8, 12, 32, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.08);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.photo-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
}

/* ====== Контейнер для изображения ====== */
.photo-frame {
    position: relative;
    width: 100%;
    aspect-ratio: 1; /* Квадратное соотношение */
    overflow: hidden;
    border-radius: 12px 12px 0 0;
    background: #000;
}

/* ====== Исправленное изображение ====== */
.photo-img {
    width: 100%;
    height: 100%;
    display: block;
}

/* Принудительно применяем cover ко всем внутренним элементам */
.photo-img :deep(.v-img__img),
.photo-img :deep(.v-img__img--cover),
.photo-img :deep(img) {
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
    object-position: center !important;
}

/* ====== Подпись фотографии ====== */
.photo-caption {
    padding: 12px !important;
    flex: none;
    opacity: 0.9;
    color: white;
    font-size: 0.9em;
    line-height: 1.3;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
}

/* ====== Текстовые состояния ====== */
.muted {
    opacity: 0.75;
    margin-top: 8px;
    text-align: center;
    padding: 40px 20px;
}

.error {
    color: #ffd9d9;
    background: #3a1f1f;
    border: 1px solid #a55;
    padding: 12px 16px;
    border-radius: 10px;
    margin-top: 8px;
    text-align: center;
}

/* ====== Полноэкранный просмотр (без изменений) ====== */
.viewer {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    background:
        radial-gradient(1200px 800px at 10% 0%, rgba(255, 255, 255, 0.06), transparent 60%),
        linear-gradient(135deg, #0a0f25, #08122b 50%, #061521);
    color: #eef3ff;
    user-select: none;
    overflow: hidden;
}

.viewer__topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0));
    z-index: 3;
    position: absolute;
    width: 100%;
}

.viewer__header {
    margin-bottom: 16px;
}

.viewer__title {
    font-weight: 600;
}

.viewer__description {
    opacity: .8;
    font-size: .95em;
    line-height: 1.4;
}

.viewer__index {
    opacity: .8;
    font-weight: 400;
    margin-left: 8px;
    font-size: .9em;
}

.viewer__actions {
    display: flex;
    gap: 8px;
}

.viewer__stage {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: #000;
}

.viewer__box {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
    width: 100vw;
    height: 100vh;
}

.viewer__img {
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    object-position: center;
    display: block;
    user-select: none;
    -webkit-user-drag: none;
    border-radius: 12px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, .35);
    background: #000;
}

.viewer__nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 4;
}

.viewer__nav.v-btn {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, .25);
    background: rgba(0, 0, 0, .35);
}

.viewer__nav.v-btn:hover {
    background: rgba(0, 0, 0, .5);
}

.viewer__nav--left {
    left: 12px;
}

.viewer__nav--right {
    right: 12px;
}

.viewer__empty {
    display: grid;
    place-items: center;
    gap: 12px;
    text-align: center;
    color: #eaf2ff;
    opacity: 0.9;
}

.viewer__empty-icon {
    font-size: 64px;
    line-height: 1;
}

.viewer__empty-text {
    font-size: 18px;
    margin-bottom: 6px;
}

/* Fade transition */
.fx-fade-enter-active,
.fx-fade-leave-active {
    transition: opacity 500ms ease;
}

.fx-fade-enter {
    opacity: 0;
}

.fx-fade-leave-to {
    opacity: 0;
}

/* ====== Адаптивность ====== */
@media (max-width: 599px) {
    .album {
        padding: 8px;
    }
    
    .photo-col {
        padding: 4px !important;
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

<style>
/* Глобальные стили для полноэкранного режима */
:fullscreen .viewer,
:-webkit-full-screen .viewer {
    width: 100%;
    height: 100%;
}
</style>