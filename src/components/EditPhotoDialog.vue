<template>
    <teleport to="body">
        <div v-if="modelValue" class="av-edit-backdrop" @click.self="close">
            <div class="av-edit-modal" role="dialog" aria-modal="true" @keydown="onKeydown">
                <header class="av-edit-head">
                    <strong>Редактирование</strong>
                    <button class="btn btn--text" @click="close">✕</button>
                </header>

                <div class="av-edit-controls">
                    <label class="muted">Название</label>
                    <input ref="titleInput" class="input" v-model="localTitle" :disabled="busy"
                        placeholder="Короткое имя" />

                    <label class="muted">Описание</label>
                    <input class="input" v-model="localDesc" :disabled="busy" placeholder="Описание" />
                </div>

                <footer class="av-edit-foot">
                    <div style="flex:1"></div>
                    <button class="btn btn--ghost" @click="close" :disabled="busy">Отмена</button>
                    <button class="btn" @click="save" :disabled="busy">Сохранить</button>
                </footer>
            </div>
        </div>
    </teleport>
</template>

<script lang="ts">
import { defineComponent, nextTick } from 'vue'

export default defineComponent({
    name: 'EditPhotoDialog',
    props: {
        modelValue: { type: Boolean, required: true },
        title: { type: String, default: '' },
        description: { type: String, default: '' },
        busy: { type: Boolean, default: false },
    },
    emits: ['update:modelValue', 'save'],
    data() {
        return {
            localTitle: this.title || '',
            localDesc: this.description || '',
        }
    },
    watch: {
        // когда открываем — подтягиваем актуальные значения и фокусируем инпут
        modelValue(newVal: boolean) {
            if (newVal) {
                this.localTitle = this.title || ''
                this.localDesc = this.description || ''
                nextTick(() => {
                    const el = this.$refs.titleInput as HTMLInputElement | undefined
                    el?.focus()
                    el?.select?.()
                })
            }
        },
        // если родитель меняет пропсы, а диалог закрыт — синхронизируем локальное состояние
        title(val: string) {
            if (!this.modelValue) this.localTitle = val || ''
        },
        description(val: string) {
            if (!this.modelValue) this.localDesc = val || ''
        },
    },
    methods: {
        close() {
            this.$emit('update:modelValue', false)
        },
        save() {
            this.$emit('save', {
                title: (this.localTitle || '').trim(),
                description: (this.localDesc || '').trim(),
            })
        },
        onKeydown(e: KeyboardEvent) {
            if (e.key === 'Escape') {
                e.preventDefault()
                this.close()
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault()
                this.save()
            }
        },
    },
})
</script>

<style scoped>
.av-edit-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, .5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483647;
}

.av-edit-modal {
    position: relative;
    width: min(92vw, 980px);
    max-height: 90vh;
    overflow: auto;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 14px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, .4);
}

.av-edit-head,
.av-edit-foot {
    padding: 10px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.av-edit-head {
    border-bottom: 1px solid #2a2a2a;
}

.av-edit-foot {
    border-top: 1px solid #2a2a2a;
}

.av-edit-controls {
    padding: 10px 12px;
    display: grid;
    grid-template-columns: 120px 1fr;
    grid-auto-rows: minmax(36px, auto);
    gap: 10px 12px;
}

@media (max-width: 640px) {
    .av-edit-controls {
        grid-template-columns: 1fr;
    }
}
</style>
