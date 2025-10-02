import { dbp } from "./db";

function ext(name: string) {
  const i = name.lastIndexOf(".");
  return i > -1 ? name.slice(i) : ".jpg";
}
async function writeText(dir: any, name: string, text: string) {
  const fh = await dir.getFileHandle(name, { create: true });
  const ws = await fh.createWritable();
  await ws.write(text);
  await ws.close();
}

export async function exportAlbumToDirectory(albumId: string) {
  // @ts-ignore
  const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
  const mediaDir = await dirHandle.getDirectoryHandle("media", {
    create: true,
  });
  const db = await dbp;
  const album = await db.get("albums", albumId);
  const photos = await Promise.all(
    album.photoIds.map((id: string) => db.get("photos", id))
  );

  const manifest: any = {
    title: album.title,
    createdAt: album.createdAt,
    photos: [],
  };

  for (const p of photos) {
    const entry: any = {
      id: p.id,
      title: p.title,
      description: p.description,
      sizes: {},
    };
    for (const v of p.variants) {
      const blob = await db.get("blobs", v.blobId);
      const name = `${p.id}_${v.size}.webp`;
      const fh = await mediaDir.getFileHandle(name, { create: true });
      const ws = await fh.createWritable();
      await ws.write(blob);
      await ws.close();
      entry.sizes[v.size] = `media/${name}`;
    }
    // original copy
    const orig = await db.get("blobs", p.originalBlobId);
    const ofh = await mediaDir.getFileHandle(
      `${p.id}_original${ext(p.filename)}`,
      { create: true }
    );
    const ows = await ofh.createWritable();
    await ows.write(orig);
    await ows.close();

    manifest.photos.push(entry);
  }

  await writeText(dirHandle, "album.json", JSON.stringify(manifest, null, 2));
  await writeText(dirHandle, "index.html", PORTABLE_HTML);
}

// src/lib/export.ts
export const PORTABLE_HTML = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sunlite Album</title>
<style>
body{margin:0;font:16px/1.5 system-ui;color:#eef3ff;}
.bg{position:fixed;inset:0;z-index:-1;background:
  radial-gradient(1200px 800px at 10% 0%, rgba(255,255,255,.06), transparent 60%),
  linear-gradient(135deg,#6a4bd8,#258ad1 50%,#11c3bd);}
.wrap{padding:14px}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.card{background:rgba(8,12,32,.5);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:10px}
img{width:100%;height:auto;border-radius:10px;display:block}
.err{margin-top:12px;padding:12px;border-radius:10px;background:#3a1f1f;border:1px solid #a55;color:#ffd9d9}
</style>
<div class="bg"></div>
<div class="wrap">
  <div class="grid" id="grid"></div>
  <div class="err" id="err" style="display:none"></div>
</div>
<script>
(async () => {
  const grid = document.getElementById('grid');
  const err  = document.getElementById('err');
  try {
    const res = await fetch('album.json');
    if (!res.ok) throw new Error('album.json fetch failed: ' + res.status);
    const data = await res.json();
    if (!data || !Array.isArray(data.photos)) throw new Error('album.json has no photos array');

    for (const p of data.photos) {
      const s320  = p.sizes && (p.sizes['320']  || p.sizes[320]);
      const s1600 = p.sizes && (p.sizes['1600'] || p.sizes[1600]) || s320;
      const card  = document.createElement('div'); card.className = 'card';
      const img   = new Image(); img.loading = 'lazy'; img.decoding = 'async';
      if (s320) {
        img.src = s320;
        if (s1600) {
          img.srcset = s320 + ' 320w, ' + s1600 + ' 1600w';
          img.sizes  = '(max-width:640px) 320px, 100vw';
        }
      }
      card.appendChild(img);
      grid.appendChild(card);
    }
  } catch (e) {
    err.style.display = 'block';
    err.textContent = 'Ошибка загрузки альбома: ' + (e && e.message ? e.message : e);
    console.error(e);
  }
})();
</script>`;
