<template>

    <section class="card album">
        <div class="album__header">
            <h2 class="album__title">Альбом</h2>
            <div class="album__actions">
                <router-link class="btn" :to="{ name: 'import', params: { id: albumId } }">
                    + Добавить фото
                </router-link>
                <button class="btn" @click="exportAlbum">Экспорт</button>
                <button class="btn" @click="load" title="Обновить">↻</button>
            </div>
        </div>

        <p v-if="loading" class="muted">Загрузка…</p>
        <p v-if="error" class="error">Ошибка: {{ error }}</p>
        <p v-if="!loading && !error && !photos.length" class="muted">
            В альбоме пока нет фото. Нажмите «Добавить фото».
        </p>

        <v-container v-if="photos.length" fluid class="pa-0">
            <v-row dense>
                <!-- 6 на lg (12/2), 4 на md (12/3), 2 на sm (12/6) -->
                <v-col v-for="(p, index) in photos" :key="p.id" cols="12" sm="6" md="4" lg="2" class="pa-2">
                    <v-card class="photo-card" elevation="2" rounded="xl" @click="openViewer(index)"
                        style="cursor:pointer">
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
        <v-dialog v-model="viewerOpen" fullscreen transition="fade-transition" :scrim="true">
            <div class="viewer" @dblclick="toggleFit" @click.self="closeViewer">
                <div class="viewer__topbar">
                    <div class="viewer__title">
                        {{ currentPhoto?.title || (photos.length ? 'Фото' : 'Нет фотографий') }}
                        <span v-if="photos.length" class="viewer__index">{{ currentIndex + 1 }} / {{ photos.length
                            }}</span>
                    </div>
                    <div class="viewer__actions">
                        <button class="btn" @click.stop="toggleFit" :disabled="!currentPhoto">
                            {{ fitMode === 'cover' ? 'Contain' : 'Cover' }}
                        </button>
                        <button class="btn" @click.stop="enterFullscreen">⛶</button>
                        <button class="btn" @click.stop="closeViewer">✕</button>
                    </div>
                </div>

                <!-- Стрелки только если есть что листать -->
                <button v-if="photos.length > 1" class="viewer__nav viewer__nav--left" @click.stop="prev">‹</button>
                <button v-if="photos.length > 1" class="viewer__nav viewer__nav--right" @click.stop="next">›</button>

                <div class="viewer__stage" :style="{
                    backgroundImage: currentSrc ? `url('${currentSrc}')` : 'none',
                    backgroundSize: fitMode,        // 'cover' | 'contain'
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat'
                }" @click.stop>
                    <!-- Пустая заглушка, если фото нет -->
                    <div v-if="!currentSrc" class="viewer__empty">
                        <div class="viewer__empty-icon">📷</div>
                        <div class="viewer__empty-text">Нет фотографий для просмотра</div>
                        <router-link class="btn" :to="{ name: 'import', params: { id: albumId } }">Добавить
                            фото</router-link>
                    </div>
                </div>
            </div>
        </v-dialog>
    </section>

</template>


<script>
import { defineComponent } from 'vue';
import { dbp, getBlob } from '@/lib/db';
import { exportAlbumToDirectory } from '@/lib/export';

export default defineComponent({
    name: 'AlbumView',
    data() {
        return {
            photos: [],
            loading: true,
            error: null,

            viewerOpen: false,
            currentIndex: 0,
            fitMode: 'contain', // 'cover' | 'contain'
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
        }
    },
    async mounted() {
        await this.load();
        window.addEventListener('keydown', this.onKey);
    },
    methods: {
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
                        const src320 = URL.createObjectURL(await getBlob(v320.blobId));
                        const src1600 = URL.createObjectURL(await getBlob(v1600.blobId));
                        return { id: p.id, title: p.title, src320, src1600 };
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
            if (e.key.toLowerCase() === 'c') this.toggleFit();
        },
        toggleFit() {
            this.fitMode = this.fitMode === 'cover' ? 'contain' : 'cover';
        },
        async enterFullscreen() {
            const el = this.$el?.querySelector('.viewer');
            if (!el) return;
            try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else await el.requestFullscreen();
            } catch (_) { }
        },

    },
    beforeUnmount() {
        // чистим ObjectURL, чтобы не текла память
        this.photos.forEach((p) => {
            if (p.src320) URL.revokeObjectURL(p.src320);
            if (p.src1600) URL.revokeObjectURL(p.src1600);
        });
        window.removeEventListener('keydown', this.onKey);
    }
});
</script>

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
    position: relative;
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
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0));
    z-index: 3;
}

.viewer__title {
    font-weight: 600;
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
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 48px 72px;
    /* отступы от топбара и стрелок */
}

.viewer__img {
    max-width: 100%;
    max-height: 100%;
    display: block;
    border-radius: 12px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, .35);
    background: #000;
}

.fit-cover {
    object-fit: cover;
    width: 100%;
    height: 100%;
}

.fit-contain {
    object-fit: contain;
    width: 100%;
    height: 100%;
}

.viewer__nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 4;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, .25);
    background: rgba(0, 0, 0, .35);
    color: #fff;
    font-size: 28px;
    line-height: 56px;
    text-align: center;
    cursor: pointer;
    user-select: none;
}

.viewer__nav:hover {
    background: rgba(0, 0, 0, .5);
}

.viewer__nav--left {
    left: 12px;
}

.viewer__nav--right {
    right: 12px;
}

/* кнопка .btn уже есть у тебя — просто чуть уплотним в оверлее */
.viewer .btn {
    padding: 8px 12px;
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
</style>
