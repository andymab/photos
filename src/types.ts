export type VariantSize = 320 | 1600; // добавим позже 2048/2560 по надобности

export interface PhotoVariant {
  size: VariantSize;
  blobId: string;        // ключ в IndexedDB (или OPFS)
  width: number;
  height: number;
  url?: string;          // blob: URL при выводе
}

export interface PhotoMeta {
  id: string;
  filename: string;
  originalBlobId: string; // оригинал (не меняем)
  exif?: { takenAt?: string; orientation?: number };
  title?: string;
  description?: string;
  variants: PhotoVariant[];
  crop?: { x:number; y:number; w:number; h:number; angle?:number }; // настройки редактора
}

export interface Album {
  id: string;
  title: string;
  createdAt: string;
  description?: string;
  photoIds: string[];
  // настройки вывода/слайдшоу
  slideshow?: { intervalSec: number; shuffle: boolean };
}
