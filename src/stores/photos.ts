// stores/photos.ts (упрощённо, без Pinia-обвязки)
import { dbp, putBlob } from '@/lib/db';

export async function addPhotoToAlbum(albumId: string, file: File, crop?: any) {
  const id = crypto.randomUUID();
  // сохраняем оригинал
  const originalKey = `orig:${id}`;
  await putBlob(originalKey, file);

  // ресайз (320/1600)
  const worker = new Worker(new URL('../workers/resizer.ts', import.meta.url), { type: 'module' });
  const sizes = [320, 1600];
  const variants: any[] = await new Promise((resolve) => {
    worker.onmessage = (e) => resolve(e.data);
    worker.postMessage({ fileOrBlob: file, sizes, crop });
  });
  worker.terminate();

  // складываем варианты в blobs + регистрируем фото
  const photoVariants = [];
  for (const v of variants) {
    const key = `v:${id}:${v.size}`;
    await putBlob(key, v.blob);
    photoVariants.push({ size: v.size, blobId: key, width: v.width, height: v.height });
  }

  const photo = {
    id, filename: file.name, originalBlobId: originalKey,
    variants: photoVariants, crop
  };
  const db = await dbp;
  await db.put('photos', photo);

  // привязываем к альбому
  const album = await db.get('albums', albumId);
  album.photoIds.push(id);
  await db.put('albums', album);
  return photo;
}
