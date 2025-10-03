<template>
  <v-dialog v-model="isOpen" max-width="640">
    <v-card rounded="xl">
      <v-card-title>{{ mode === 'create' ? 'Новый альбом' : 'Редактировать альбом' }}</v-card-title>

      <v-card-text>
        <div class="form">
          <v-text-field
            v-model="localTitle"
            label="Название"
            density="comfortable"
          />
          <v-textarea
            v-model="localDescription"
            label="Описание"
            rows="3"
            auto-grow
          />

          <div class="file-row">
            <input type="file" accept="image/*" @change="onFilePick" />
          </div>

          <div class="preview" v-if="previewUrl">
            <div class="preview-box" :style="{ backgroundImage: `url('${previewUrl}')` }"></div>
            <small class="muted">Это обложка альбома.</small>
          </div>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Отмена</v-btn>
        <v-btn :loading="busy" color="primary" @click="emitSave">
          {{ mode === 'create' ? 'Создать' : 'Сохранить' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'AlbumEditorDialog',
  props: {
    modelValue: { type: Boolean, default: false }, // v-model open
    mode: { type: String, default: 'create' },     // 'create' | 'edit'
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    initialPreview: { type: String, default: '' }, // url обложки при редактировании
    busy: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'save', 'close'],
  data() {
    return {
      isOpen: this.modelValue,
      localTitle: this.title,
      localDescription: this.description,
      file: null,
      previewUrl: this.initialPreview || '',
    };
  },
  watch: {
    modelValue(v) {
      this.isOpen = v;
      if (v) {
        // при каждом открытии — синхронизируем поля
        this.localTitle = this.title;
        this.localDescription = this.description;
        this.file = null;
        this.revokePreview();
        this.previewUrl = this.initialPreview || '';
      }
    },
    isOpen(v) {
      this.$emit('update:modelValue', v);
    },
    title(v) { this.localTitle = v; },
    description(v) { this.localDescription = v; },
    initialPreview(v) {
      this.revokePreview();
      this.previewUrl = v || '';
    },
  },
  beforeUnmount() {
    this.revokePreview();
  },
  methods: {
    close() {
      this.isOpen = false;
      this.$emit('close');
    },
    onFilePick(e) {
      const f = e.target.files?.[0];
      if (!f) return;
      this.file = f;
      this.revokePreview();
      this.previewUrl = URL.createObjectURL(f);
    },
    revokePreview() {
      if (this.previewUrl && this.previewUrl === this.initialPreview) return; // не трогаем внешний url
      if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = '';
    },
    emitSave() {
      this.$emit('save', {
        title: (this.localTitle || '').trim(),
        description: (this.localDescription || '').trim(),
        file: this.file || null,
      });
    },
  },
});
</script>

<style scoped>
.form{ display: grid; gap: 12px; }
.muted{ opacity:.75; }

.preview{ margin-top: 8px; }
.preview-box{
  width: 100%;
  aspect-ratio: 16/10;
  background: #000 center/contain no-repeat;
  border: 1px dashed rgba(255,255,255,.2);
  border-radius: 12px;
}
</style>
