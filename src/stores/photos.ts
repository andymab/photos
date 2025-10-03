// stores/photos.ts (упрощённо, без Pinia-обвязки)
import { dbp, putBlob } from '@/lib/db';

async function makeVariantsWithWorker(file: File, sizes = [320, 1600], crop?: any) {
  const worker = new Worker(new URL('../workers/resizer.ts', import.meta.url), { type: 'module' });
  const variants: any[] = await new Promise((resolve) => {
    worker.onmessage = (e) => resolve(e.data);
    worker.postMessage({ fileOrBlob: file, sizes, crop });
  });
  worker.terminate();
  return variants;
}

/** Создаёт фото в сторах blobs/photos и возвращает его id */
export async function createPhotoFromFile(file: File, crop?: any): Promise<string> {
  const id = crypto.randomUUID();

  // оригинал
  const originalKey = `orig:${id}`;
  await putBlob(originalKey, file);

  // варианты
  const variants = await makeVariantsWithWorker(file, [320, 1600], crop);
  const photoVariants: any[] = [];
  for (const v of variants) {
    const key = `v:${id}:${v.size}`;
    await putBlob(key, v.blob);
    photoVariants.push({ size: v.size, blobId: key, width: v.width, height: v.height });
  }

  const photo = {
    id,
    filename: file.name,
    originalBlobId: originalKey,
    variants: photoVariants,
    crop
  };
  const db = await dbp;
  await db.put('photos', photo);
  return id;
}

/** Создаёт альбом c одной обложкой (файл необязателен) */
export async function createAlbumWithCover(title: string, description: string, file?: File) {
  const db = await dbp;
  const id = crypto.randomUUID();

  let coverPhotoId: string | null = null;
  if (file) {
    coverPhotoId = await createPhotoFromFile(file);
  }

  const album = {
    id,
    title: title || 'Без названия',
    description: description || '',
    createdAt: new Date().toISOString(),
    photoIds: coverPhotoId ? [coverPhotoId] : [],
    coverPhotoId
  };

  await db.put('albums', album);
  return album;
}

/** Обновляет метаданные альбома; если передан файл — меняет обложку */
export async function updateAlbumMeta(
  albumId: string,
  { title, description, coverFile }: { title?: string; description?: string; coverFile?: File }
) {
  const db = await dbp;
  const album = await db.get('albums', albumId);
  if (!album) throw new Error('Альбом не найден');

  if (title !== undefined) album.title = title;
  if (description !== undefined) album.description = description;

  if (coverFile) {
    const photoId = await createPhotoFromFile(coverFile);
    album.coverPhotoId = photoId;
    // по желанию: гарантируем, что обложка в photoIds
    if (!album.photoIds) album.photoIds = [];
    if (!album.photoIds.includes(photoId)) album.photoIds.unshift(photoId);
  }

  await db.put('albums', album);
  return album;
}



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
