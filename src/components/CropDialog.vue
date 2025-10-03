<template>
  <v-dialog v-model="open" max-width="900" persistent>
    <v-card rounded="xl">
      <v-card-title class="d-flex align-center justify-space-between">
        <span class="text-h6">Кадрирование — {{ modeLabel }}</span>
        <v-chip size="small" variant="tonal">{{ aspectLabel }}</v-chip>
      </v-card-title>

      <v-card-text class="pt-0">
        <div class="cropper-wrap">
          <img ref="imgEl" class="cropper-img" :alt="file?.name || 'image'">
        </div>
        <div class="mt-2 text-caption opacity-80">
          Колёсико мыши — зум, перетаскивание — сдвиг. Рамка зафиксирована по пропорции {{ aspectLabel }}.
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Отмена</v-btn>
        <v-btn color="primary" :loading="busy" @click="apply">Применить</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import { defineComponent } from 'vue';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';

export default defineComponent({
  name: 'CropDialog',
  props: {
    modelValue: { type: Boolean, default: false },
    file: { type: [File, Blob], default: null },
    // 'preview' | 'display'
    mode: { type: String, default: 'preview' },
    // числовая пропорция (например 4/3, 16/9, 9/16)
    aspect: { type: Number, default: 4 / 3 },
    // целевой размер: для preview — ширина, для display — длинная сторона
    target: { type: Number, default: 320 },
    // JPEG качество
    quality: { type: Number, default: 0.88 },
  },
  emits: ['update:modelValue', 'apply'],
  data() {
    return {
      open: this.modelValue,
      cropper: null,
      busy: false,
      objectUrl: '',
    };
  },
  computed: {
    aspectLabel() {
      const a = this.aspect;
      // попытка красиво показать «4:3 / 16:9 / 9:16»
      if (Math.abs(a - 4 / 3) < 1e-3) return '4:3';
      if (Math.abs(a - 16 / 9) < 1e-3) return '16:9';
      if (Math.abs(a - 9 / 16) < 1e-3) return '9:16';
      return a.toFixed(3);
    },
    modeLabel() {
      return this.mode === 'preview' ? 'предпросмотр 320w (4:3)' : 'показ 1600 long (16:9/9:16)';
    },
  },
  watch: {
    modelValue(v) {
      this.open = v;
      if (v) this.$nextTick(() => this.initCropper());
      else this.destroyCropper();
    },
    file() {
      if (this.open) this.$nextTick(() => this.initCropper());
    },
    aspect() {
      if (this.cropper) this.cropper.setAspectRatio(this.aspect || NaN);
    },
  },
  mounted() {
    if (this.open) this.initCropper();
  },
  beforeUnmount() {
    this.destroyCropper();
  },
  methods: {
    initCropper() {
      const imgEl = this.$refs.imgEl;
      if (!imgEl || !this.file) return;

      // очистка старого url/cropper
      this.destroyCropper();

      this.objectUrl = URL.createObjectURL(this.file);
      imgEl.src = this.objectUrl;

      imgEl.onload = () => {
        this.cropper = new Cropper(imgEl, {
          viewMode: 1,
          dragMode: 'move',
          autoCrop: true,
          autoCropArea: 1,
          background: false,
          responsive: true,
          checkOrientation: false,
          aspectRatio: this.aspect || NaN, // фикс. пропорция
          movable: true,
          zoomable: true,
          scalable: false,
          rotatable: false,
        });
      };
    },
    destroyCropper() {
      if (this.cropper) {
        try { this.cropper.destroy(); } catch {}
        this.cropper = null;
      }
      if (this.objectUrl) {
        URL.revokeObjectURL(this.objectUrl);
        this.objectUrl = '';
      }
    },
    close() {
      this.$emit('update:modelValue', false);
    },
    apply() {
      if (!this.cropper) return;
      this.busy = true;

      // целевые размеры для canvas
      let outW = 0, outH = 0;
      if (this.mode === 'preview') {
        // фиксируем ширину = target (320), высота из пропорции
        outW = this.target;
        outH = Math.round(outW / this.aspect);
      } else {
        // display: фиксируем длинную сторону = target (1600)
        // при известном аспекте это легко:
        // если аспект >=1 — горизонтальное окно: ширина = 1600, высота = 1600/aspect
        // если <1 — вертикальное: высота = 1600, ширина = 1600*aspect
        if (this.aspect >= 1) {
          outW = this.target;
          outH = Math.round(this.target / this.aspect);
        } else {
          outH = this.target;
          outW = Math.round(this.target * this.aspect);
        }
      }

      const canvas = this.cropper.getCroppedCanvas({
        width: outW,
        height: outH,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
        fillColor: '#000',
      });

      canvas.toBlob((blob) => {
        this.busy = false;
        if (!blob) return this.close();

        // Также отдадим «data» кроппера (координаты в исходном)
        const data = this.cropper.getData(true); // {x,y,width,height,rotate,scaleX,scaleY}
        this.$emit('apply', {
          blob,
          data,
          width: outW,
          height: outH,
          mode: this.mode, // 'preview' | 'display'
        });
        this.close();
      }, 'image/jpeg', this.quality);
    },
  },
});
</script>

<style scoped>
.cropper-wrap{
  width: 100%;
  min-height: 420px;
  max-height: 70vh;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: #0b0b0b;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.08);
}
.cropper-img{
  max-width: 100%;
  display: block;
}
.opacity-80{ opacity:.8; }
</style>
