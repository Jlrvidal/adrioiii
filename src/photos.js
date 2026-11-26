export async function optimize(file) {
  if (
    !file ||
    !['image/webp', 'image/jpeg', 'image/png'].includes(file.type) ||
    file.size > 12 * 1024 * 1024
  )
    throw Error('Elige una foto JPEG, PNG o WebP de hasta 12 MB.')
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer()),
    ascii = (i, n) => String.fromCharCode(...bytes.slice(i, i + n))
  if (
    !(
      (file.type === 'image/jpeg' &&
        bytes[0] === 255 &&
        bytes[1] === 216 &&
        bytes[2] === 255) ||
      (file.type === 'image/png' &&
        bytes[0] === 137 &&
        ascii(1, 3) === 'PNG') ||
      (file.type === 'image/webp' &&
        ascii(0, 4) === 'RIFF' &&
        ascii(8, 4) === 'WEBP')
    )
  )
    throw Error('El formato de la fotografía no coincide con el archivo.')
  const bitmap = await createImageBitmap(file)
  try {
    for (const width of [1440, 1200, 1024, 800, 640]) {
      const scale = Math.min(1, width / Math.max(bitmap.width, bitmap.height)),
        canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const ctx = canvas.getContext('2d', { alpha: false })
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.76),
      )
      if (blob?.type === 'image/jpeg' && blob.size <= 163840)
        return stripMetadata(blob)
    }
    throw Error('No se ha podido comprimir la fotografía.')
  } finally {
    bitmap.close()
  }
}
export const dailyPath = /^\d{4}-\d{2}-\d{2}\/[1-3]\.jpg$/
async function stripMetadata(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const parts = [bytes.slice(0, 2)]
  let i = 2
  while (i + 4 < bytes.length && bytes[i] === 255) {
    const marker = bytes[i + 1]
    if (marker === 218) {
      parts.push(bytes.subarray(i))
      return new Blob(parts, { type: 'image/jpeg' })
    }
    const size = bytes[i + 2] * 256 + bytes[i + 3]
    if (size < 2 || i + size + 2 > bytes.length) break
    if (!(marker >= 224 && marker <= 239) && marker !== 254)
      parts.push(bytes.subarray(i, i + size + 2))
    i += size + 2
  }
  throw Error('No se pudo preparar el JPEG.')
}
export async function addPhoto(db, blob, uploadId) {
  const image = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
  const { data, error } = await db.rpc('adrio_add_photo', {
    upload_id: uploadId,
    image_base64: image,
  })
  if (error)
    throw Error(
      /tres fotos/.test(error.message)
        ? 'El álbum de hoy ya tiene sus 3 fotos. Podrás enviar otra mañana.'
        : /cola de fotos pendientes/.test(error.message)
          ? 'Ahora mismo hay varias fotos esperando revisión. Vuelve a intentarlo más tarde.'
          : 'No se ha podido enviar la foto. Comprueba la conexión y vuelve a intentarlo.',
    )
  if (data !== 'pendiente' && !dailyPath.test(data))
    throw Error('No se ha confirmado la subida.')
  return data
}
export async function photoSource(db, path) {
  if (!dailyPath.test(path)) throw Error('Foto desconocida.')
  const [date, name] = path.split('/')
  const { data, error } = await db.rpc('adrio_photo', {
    taken_on: date,
    position_in_day: Number(name[0]),
  })
  if (error || !data) throw Error('Foto no disponible.')
  return jpegSource(data)
}

export function jpegSource(base64) {
  return 'data:image/jpeg;base64,' + base64.replace(/\s/g, '')
}
