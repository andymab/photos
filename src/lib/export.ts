import JSZip from 'jszip'
import { dbp, getBlob } from './db'

type RawBlob = Blob | { type?: string, buffer?: ArrayBuffer | Uint8Array, data?: ArrayBuffer | Uint8Array }

function sanitize(name: string = '') {
  return name.trim().replace(/[^a-z0-9_\-]+/gi, '_') || 'photo'
}
function ext(name: string) {
  const i = name.lastIndexOf('.')
  return i > -1 ? name.slice(i) : '.jpg'
}
function toBlob(raw: RawBlob, fallbackType = 'image/jpeg'): Blob {
  if (raw instanceof Blob) return raw
  const type = (raw && 'type' in (raw as any) && (raw as any).type) || fallbackType
  const buf = (raw && ('buffer' in (raw as any) ? (raw as any).buffer :
    'data' in (raw as any) ? (raw as any).data : null)) || new Uint8Array()
  return new Blob([buf as ArrayBuffer | Uint8Array], { type })
}
async function writeFile(dir: any, name: string, blob: Blob) {
  const fh = await dir.getFileHandle(name, { create: true })
  const ws = await fh.createWritable()
  await ws.write(blob)
  await ws.close()
}
async function writeText(dir: any, name: string, text: string) {
  await writeFile(dir, name, new Blob([text], { type: 'text/html; charset=utf-8' }))
}

function makeIndexHtml(title: string, items: { name: string, desc?: string, s320?: string, s1600?: string }[]) {
  // простой статический индекс: если есть 1600 — подключаем srcset
  const cards = items.map(it => {
    const img = it.s1600
      ? `<img src="${it.s320 || it.s1600}" srcset="${[it.s320 && `${it.s320} 320w`, it.s1600 && `${it.s1600} 1600w`].filter(Boolean).join(', ')}" sizes="(max-width:640px) 320px, 100vw" alt="${it.name}" />`
      : `<img src="${it.s320}" alt="${it.name}" />`
    const caption = it.desc && it.desc.trim()
      ? `<figcaption><strong>${it.name}</strong><br/>${it.desc}</figcaption>`
      : `<figcaption>${it.name}</figcaption>`
    return `<figure class="card">${caption}${img}</figure>`
  }).join('\n')

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#111;color:#eee}
    .wrap{max-width:1100px;margin:0 auto;padding:16px}
    h1{font-size:20px;margin:0 0 12px}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
    .card{background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:8px}
    img{width:100%;height:auto;display:block;border-radius:8px}
    figcaption{font-size:12px;opacity:.7;margin:4px 0 6px}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${title}</h1>
    <div class="grid">
      ${cards}
    </div>
  </div>
</body>
</html>`
}

export async function exportAlbumToDirectory(albumId: string) {
  const db = await dbp
  const album = await db.get('albums', albumId)
  if (!album) throw new Error('Альбом не найден')

  const photos = (await Promise.all((album.photoIds || []).map((id: string) => db.get('photos', id)))).filter(Boolean)

  // соберём файлы для экспорта
  const files: { path: string, blob: Blob }[] = []
  const itemsForIndex: { name: string, desc?: string, s320?: string, s1600?: string }[] = []

  for (const p of photos) {
    const base = sanitize(p.title || `photo_${p.id}`)
    // найдём 320/1600
    const v320 = (p.variants || []).find((v: any) => v.size === 320)
    const v1600 = (p.variants || []).find((v: any) => v.size === 1600) || v320

    // загрузим сырьё из БД и нормализуем в Blob
    let b320: Blob | undefined
    let b1600: Blob | undefined
    if (v320) { const raw = await getBlob(v320.blobId); b320 = toBlob(raw) }
    if (v1600) { const raw = await getBlob(v1600.blobId); b1600 = toBlob(raw) }

    // имена файлов
    const name320 = `${base}_320${ext('.jpg')}`
    const name1600 = `${base}_1600${ext('.jpg')}`

    if (b320) files.push({ path: `images/${name320}`, blob: b320 })
    if (b1600) files.push({ path: `images/${name1600}`, blob: b1600 })

    itemsForIndex.push({
      name: base,
      desc: (p.description || '') as string,
      s320: b320 ? `images/${name320}` : undefined,
      s1600: b1600 ? `images/${name1600}` : undefined
    })
  }

  const albumTitle = album.title || `album_${albumId}`
  const folderName = sanitize(albumTitle)

  // есть ли поддержка папочного пикера?
  const hasPicker = typeof (window as any).showDirectoryPicker === 'function'

  if (hasPicker) {
    // @ts-ignore
    const root = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
    const dir = (root.getDirectoryHandle && await root.getDirectoryHandle(folderName, { create: true })) || root

    // подпапка images
    const imagesDir = (dir.getDirectoryHandle && await dir.getDirectoryHandle('images', { create: true })) || dir

    // запись файлов
    for (const f of files) {
      if (f.path.startsWith('images/')) {
        await writeFile(imagesDir, f.path.slice('images/'.length), f.blob)
      } else {
        await writeFile(dir, f.path, f.blob)
      }
    }
    // index.html
    const html = makeIndexHtml(albumTitle, itemsForIndex)
    await writeText(dir, 'index.html', html)
    return
  }

  // Фоллбэк: собираем ZIP
  const zip = new JSZip()
  const imagesZip = zip.folder('images')!
  for (const f of files) {
    if (f.path.startsWith('images/')) {
      imagesZip.file(f.path.slice('images/'.length), f.blob)
    } else {
      zip.file(f.path, f.blob)
    }
  }
  const html = makeIndexHtml(albumTitle, itemsForIndex)
  zip.file('index.html', html)

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${folderName}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
