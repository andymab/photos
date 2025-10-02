import { openDB } from 'idb';
export const dbp = openDB('myphotos', 2, {
  upgrade(db, oldV) {
    if (oldV < 1) {
      db.createObjectStore('photos', { keyPath: 'id' });
      db.createObjectStore('albums', { keyPath: 'id' });
      db.createObjectStore('blobs'); // key -> Blob
    }
  }
});

export async function putBlob(key: string, blob: Blob) {
return (await dbp).put('blobs', blob, key);
}
export async function getBlob(key: string) {
return (await dbp).get('blobs', key);
}
