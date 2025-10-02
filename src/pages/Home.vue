<template>
  <v-container class="py-8" max-width="1100">
    <v-row>
      <v-col cols="12">
        <div class="d-flex align-center gap-3 mb-4">
          <v-avatar size="40" class="bg-primary">
            <v-icon>mdi-alpha-s-circle</v-icon>
          </v-avatar>
          <h1 class="text-h5 text-md-h4 m-0">SunLite — генератор строки для вставок</h1>
        </div>
        <p class="text-body-1 text-medium-emphasis">
          Инструмент формирует строку вида <span class="mono">"ГО=...;камень,кол-во,огранка,...,размер"</span>.
          Результат удобно копировать и вставлять в нужные системы.
        </p>
      </v-col>
    </v-row>

    <v-row class="mt-4" align="stretch">
      <v-col cols="12" md="6">
        <v-card rounded="xl" elevation="6" class="h-100">
          <v-card-item>
            <div class="d-flex align-center gap-3">
              <v-avatar size="36" class="bg-primary">
                <v-icon>mdi-flash</v-icon>
              </v-avatar>
              <div>
                <div class="text-subtitle-1">Перейти к генератору</div>
                <div class="text-body-2 text-medium-emphasis">
                  Заполните поля камней, получите готовую строку и скопируйте её одним кликом.
                </div>
              </div>
            </div>
          </v-card-item>

          <v-card-actions class="px-4 pb-4">
            <v-spacer />
            <v-btn color="primary" :to="{ name: 'sunlite' }" prepend-icon="mdi-arrow-right">
              Открыть генератор
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card rounded="xl" variant="tonal" class="h-100">
          <v-card-item>
            <div class="d-flex align-center gap-3">
              <v-avatar size="36" class="bg-surface-variant">
                <v-icon>mdi-information-outline</v-icon>
              </v-avatar>
              <div>
                <div class="text-subtitle-1">Как это работает</div>
                <div class="text-body-2 text-medium-emphasis">
                  Формат строго фиксирован: префикс <span class="mono">ГО=...</span> и список камней,
                  разделённых <span class="mono">;</span>. У каждого камня — 11 полей через <span class="mono">,</span>.
                </div>
              </div>
            </div>
          </v-card-item>

          <v-list density="compact">
            <v-list-item title="Поддержка ввода размера в мм (×1000)"></v-list-item>
            <v-list-item title="Trunc числовых полей (1.9 → 1)"></v-list-item>
            <v-list-item title="Быстрое копирование результата в буфер"></v-list-item>
          </v-list>

          <v-card-actions class="px-4 pb-4">
            <v-btn variant="text" :to="{ name: 'about' }" prepend-icon="mdi-book-open-outline">
              Подробнее
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
export default {
  name: 'HomePage',
};
</script>

<style scoped>
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
</style>
