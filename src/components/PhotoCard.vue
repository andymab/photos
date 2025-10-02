<!-- components/PhotoCard.vue -->
<script setup lang="ts">
import { getBlob } from '@/lib/db';
const props = defineProps<{ photo: any }>();
const url320 = ref(''), url1600 = ref('');
onMounted(async () => {
  const v320 = props.photo.variants.find((v:any)=>v.size===320);
  const v1600 = props.photo.variants.find((v:any)=>v.size===1600);
  url320.value = URL.createObjectURL(await getBlob(v320.blobId));
  url1600.value = URL.createObjectURL(await getBlob(v1600.blobId));
});
</script>

<template>
  <img
    :alt="photo.title || photo.filename"
    :src="url320"
    :srcset="`${url320} 320w, ${url1600} 1600w`"
    sizes="(max-width: 640px) 320px, 100vw"
    loading="lazy"
    decoding="async"
  />
  <figcaption v-if="photo.description">{{ photo.description }}</figcaption>
</template>
