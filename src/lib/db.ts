import { openDB } from 'idb';
export const dbp = openDB('myphotos', 2, {
  upgrade(db, oldV, _newV, tx) {
    if (oldV < 1) {
      db.createObjectStore('photos', { keyPath: 'id' });
      db.createObjectStore('albums', { keyPath: 'id' });
      db.createObjectStore('blobs'); // key -> Blob
    }

    if (oldV < 3) {
      const store = tx.objectStore('albums');
      return store.openCursor().then(function iter(cursor) {
        if (!cursor) return;
        const a = cursor.value || {};
        if (a.description === undefined) a.description = '';
        if (a.coverPhotoId === undefined) a.coverPhotoId = null;
        cursor.update(a);
        return cursor.continue().then(iter);
      });
    }
    
  }
});

export async function putBlob(key: string, blob: Blob) {
return (await dbp).put('blobs', blob, key);
}
export async function getBlob(key: string) {
return (await dbp).get('blobs', key);
}
