/* eslint-disable no-restricted-globals */

// Vite создаст отдельный чанк для этого воркера.
// Вход: { file: File, sizes: number[], crop: {x,y,width,height,rotate?,scaleX?,scaleY?} }
// Выход: [{ size:number, blob:Blob, width:number, height:number }]

self.onmessage = async (e) => {
    try {
        const { file, sizes = [], crop } = e.data || {}
        if (!file || !sizes.length || !crop) {
            throw new Error('Некорректные параметры воркеру')
        }

        const bitmap = await createImageBitmap(file)

        // 1) Подготавливаем кроп на OffscreenCanvas
        const cw = Math.max(1, Math.round(crop.width))
        const ch = Math.max(1, Math.round(crop.height))
        const off = new OffscreenCanvas(cw, ch)
        const ctx = off.getContext('2d', { alpha: false })

        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'

        // Учитываем возможные rotate/scaleX/scaleY от cropperjs
        const angle = (crop.rotate || 0) * Math.PI / 180
        const sX = crop.scaleX || 1
        const sY = crop.scaleY || 1

        // Рисуем исходник так, чтобы область [x,y,width,height] попала в (0,0,cw,ch)
        ctx.save()
        // Базовый сдвиг – "вырезаем" нужный участок из исходника
        ctx.translate(-crop.x, -crop.y)

        // Применяем трансформации, если были
        if (angle || sX !== 1 || sY !== 1) {
            // Перенос центра в ту же систему координат исходника
            // Cropper обычно отдаёт rotate/scale относительно центра исходника.
            // Упростим: применим к исходному изображению относительно его центра.
            ctx.translate(bitmap.width / 2, bitmap.height / 2)
            ctx.rotate(angle)
            ctx.scale(sX, sY)
            ctx.translate(-bitmap.width / 2, -bitmap.height / 2)
        }

        ctx.drawImage(bitmap, 0, 0)
        ctx.restore()

        // 2) Генерируем размеры
        const outputs = []
        for (const targetW of sizes) {
            const ratio = targetW / cw
            const targetH = Math.max(1, Math.round(ch * ratio))

            const c = new OffscreenCanvas(targetW, targetH)
            const cx = c.getContext('2d', { alpha: false })
            cx.imageSmoothingEnabled = true
            cx.imageSmoothingQuality = 'high'
            cx.drawImage(off, 0, 0, targetW, targetH)

            const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
            outputs.push({ size: targetW, blob, width: targetW, height: targetH })
        }

        self.postMessage(outputs)
    } catch (err) {
        self.postMessage({ error: err?.message || String(err) })
    }
}
