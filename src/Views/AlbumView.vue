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



        <v-row dense>
            <!-- 6 на lg (12/2), 4 на md (12/3), 2 на sm (12/6) -->
            <v-col v-for="(p, index) in photos" :key="p.id" cols="12" sm="6" md="4" lg="2" class="pa-2">
                <v-card class="photo-card" elevation="2" rounded="xl" @click="openViewer(index)" style="cursor:pointer">
                    <!-- фикс. высота кадра, внутри v-img на всю высоту, объект cover -->
                    <div class="photo-frame">
                        <v-img :src="p.src320" :srcset="`${p.src320} 320w, ${p.src1600} 1600w`"
                            sizes="(max-width:640px) 320px, 100vw" :alt="p.title || 'Фото'" loading="lazy"
                            decoding="async" class="photo-img" height="100%" cover />
                    </div>

                    <v-card-text v-if="p.title" class="photo-caption">
                        {{ p.title }}
                    </v-card-text>
                </v-card>
            </v-col>
        </v-row>
    </v-container>


    <!-- ПОЛНОЭКРАННЫЙ ПРОСМОТРЩИК -->
    <v-dialog v-model="viewerOpen" fullscreen :scrim="true" transition="fade-transition" :retain-focus="false">
        <div class="viewer" ref="viewer" @click.self="closeViewer">
            <div class="viewer__topbar">
                <div class="viewer__header">
                    <div class="viewer__title">
                        {{ currentPhoto?.title || (photos.length ? 'Фото' : 'Нет фотографий') }}
                        <span v-if="photos.length" class="viewer__index">{{ currentIndex + 1 }} / {{ photos.length
                        }}</span>
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
                        <img class="viewer__img" :src="currentSrc" :alt="currentPhoto?.title || 'Фото'"
                            draggable="false" />
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
            <v-btn v-if="photos.length > 1" class="viewer__nav viewer__nav--left" variant="flat" size="large" icon
                @click.stop="prev" aria-label="Назад">
                <v-icon icon="mdi-chevron-left" color="white" />
            </v-btn>

            <v-btn v-if="photos.length > 1" class="viewer__nav viewer__nav--right" variant="flat" size="large" icon
                @click.stop="next" aria-label="Вперёд">
                <v-icon icon="mdi-chevron-right" color="white" />
            </v-btn>


        </div>
    </v-dialog>

    <!-- Диалог редактирования названия и описания -->
    <EditPhotoDialog v-model="editOpen" :title="editTitle" :description="editDesc" :busy="savingEdit"
        @save="onEditSave" />

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
            // В полноэкранном всегда берём более крупную версию
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
        // снимаем обработчики и экшены
        this.clearAlbumActions && this.clearAlbumActions();

        this.photos.forEach((p) => {
            if (p.src320) URL.revokeObjectURL(p.src320);
            if (p.src1600) URL.revokeObjectURL(p.src1600);
        });
        window.removeEventListener('keydown', this.onKey);
    },
    watch: {
        viewerOpen(val) {
            if (!val) this.stopSlideshow();
        }
    },
    methods: {

        openEdit() {
            this.stopSlideshow();
            const cp = this.currentPhoto
            if (!cp) return
            this.editTitle = cp.title || ''
            this.editDesc = cp.description || ''
            this.editOpen = true
        },


        // Кнопка "Слайды" переключает режим
        async toggleSlideshow() {
            if (this.slideshowRunning) {
                this.stopSlideshow();
            } else {
                await this.startSlideshow();
            }
        },

        async startSlideshow() {
            if (!this.photos.length) return;

            // Входим в полноэкранный режим (используем уже существующий метод)
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

        // Планируем следующий переход
        queueNextTick() {
            // на всякий случай — очищаем прошлые таймеры
            if (this.slideshowTimer) clearTimeout(this.slideshowTimer);

            this.slideshowTimer = setTimeout(() => {
                if (!this.slideshowRunning) return;
                // листаем вперед (по кругу твой метод next() уже делает)
                this.next?.();
                // ставим следующий тик
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

                // локально обновим текущий элемент, чтобы UI сразу обновился
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

        closeEdit() { this.editOpen = false },

        async load() {
            this.loading = true;
            this.error = null;
            // очистим старые ObjectURL, если перезагружаем
            this.photos.forEach((p) => {
                if (p.src320) URL.revokeObjectURL(p.src320);
                if (p.src1600) URL.revokeObjectURL(p.src1600);
            });
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
            // возвращаем промис, где это возможно
            if (el.requestFullscreen) return el.requestFullscreen();
            if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen(); // Safari
            if (el.mozRequestFullScreen) return el.mozRequestFullScreen();
            if (el.msRequestFullscreen) return el.msRequestFullscreen();
        },
        exitFS() {
            if (document.exitFullscreen) return document.exitFullscreen();
            if (document.webkitExitFullscreen) return document.webkitExitFullscreen(); // Safari
            if (document.mozCancelFullScreen) return document.mozCancelFullScreen();
            if (document.msExitFullscreen) return document.msExitFullscreen();
        },
        async enterFullscreen() {
            // только при открытом просмотрщике
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
                // В Safari бывает только синхронный путь без промиса — ошибки можно игнорить
                console.warn('Fullscreen error:', e);
            }
        },
    },
    beforeUnmount() {
        // чистим ObjectURL, чтобы не текла память
        this.photos.forEach((p) => {
            if (p.src320) URL.revokeObjectURL(p.src320);
            if (p.src1600) URL.revokeObjectURL(p.src1600);
        });
        window.removeEventListener('keydown', this.onKey);
    },
    beforeDestroy() {
        this.stopSlideshow();
        document.removeEventListener('fullscreenchange', this.onFsChange);
        document.removeEventListener('webkitfullscreenchange', this.onFsChange);
        document.removeEventListener('mozfullscreenchange', this.onFsChange);
        document.removeEventListener('MSFullscreenChange', this.onFsChange);
    }
});
</script>

<style>
:fullscreen .viewer,
:-webkit-full-screen .viewer {
    width: 100%;
    height: 100%;
}
</style>
<style scoped>
/* ====== Контейнер экрана альбома ====== */
.album {
    /* одинаковая высота рамки (можешь поменять одно число) */
    --rowH: 220px;

    display: block;
}

/* адаптив: уменьшаем высоту карточки на меньших экранах */
@media (max-width: 959.98px) {
    .album {
        --rowH: 200px;
    }
}

@media (max-width: 599.98px) {
    .album {
        --rowH: 180px;
    }
}

/* ====== Шапка ====== */
.album__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
}

.album__title {
    margin: 0;
    /* чтобы «верх» не скакал от дефолтных margin h2 */
    line-height: 1.2;
}

.album__actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

/* ====== Текстовые состояния ====== */
.muted {
    opacity: 0.75;
    margin-top: 8px;
}

.error {
    color: #ffd9d9;
    background: #3a1f1f;
    border: 1px solid #a55;
    padding: 8px 10px;
    border-radius: 10px;
    margin-top: 8px;
}

/* ====== Карточки изображений (Vuetify grid) ====== */
.photo-card {
    background: rgba(8, 12, 32, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    overflow: hidden;
    /* на всякий: чтобы углы были ровные */
}

/* Фиксированная высота кадра для cover */
.photo-frame {
    height: var(--rowH);
    border-radius: 14px 14px 0 0;
    overflow: hidden;
    background: transparent;
}

/* v-img растягиваем по высоте контейнера */
.photo-img {
    height: 100%;
}

/* Страховка: принудительно cover у вложенного <img> в разных версиях Vuetify */
.photo-img :deep(img),
.photo-img img {
    width: 100%;
    height: 100%;
    object-fit: cover !important;
    background: transparent !important;
    display: block;
}

/* Подпись под фото */
.photo-caption {
    padding-top: 8px;
    opacity: 0.9;
    color: white;
}

/* ====== Небольшие правки Vuetify-отступов ====== */
:deep(.v-container.pa-0) {
    padding: 0 !important;
}

/* чтобы сетка примыкала к краям секции */
:deep(.v-col.pa-2) {
    padding: 8px !important;
}

/* ====== Полноэкранный просмотр ====== */
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

.fit-cover {
    object-fit: cover;
    width: 100%;
    height: 100%;
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

/* Fade */
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
</style>
