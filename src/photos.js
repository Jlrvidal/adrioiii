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
// Foto del administrador en un día concreto (AAAA-MM-DD, entre 2020 y hoy).
export async function addPhotoOn(db, blob, uploadId, takenOn) {
  const { data, error } = await db.rpc('adrio_add_photo_on', {
    upload_id: uploadId,
    image_base64: await base64(blob),
    taken_on: takenOn,
  })
  if (error)
    throw Error(
      /tres fotos/.test(error.message)
        ? 'Ese día ya tiene sus 3 fotos.'
        : /fecha/.test(error.message)
          ? 'La fecha debe estar entre el 1 de enero de 2020 y hoy.'
          : 'No se ha podido publicar. Comprueba la conexión y vuelve a intentarlo.',
    )
  if (!dailyPath.test(data)) throw Error('No se ha confirmado la subida.')
  return data
}
const madridDay = (time) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(time)
// Fecha en que se hizo la foto: la que guarda la cámara (EXIF), o si no la
// de modificación del archivo. Hay que leerla antes de optimize(), que borra
// esos datos. Devuelve null si no hay ninguna fecha válida.
export async function photoDate(file, today = madridDay(Date.now())) {
  const valid = (d) => d && d >= '2020-01-01' && d <= today
  try {
    const head = await file.slice(0, 256 * 1024).arrayBuffer()
    const date = exifDate(new DataView(head))
    if (valid(date)) return { date, source: 'camera' }
  } catch {
    // Sin EXIF legible: se usa la fecha del archivo.
  }
  const date = file.lastModified ? madridDay(file.lastModified) : ''
  return valid(date) ? { date, source: 'file' } : null
}
// Lee DateTimeOriginal (o DateTimeDigitized, o DateTime) de un JPEG.
export function exifDate(view) {
  if (view.getUint16(0) !== 0xffd8) return ''
  let p = 2
  while (p + 4 <= view.byteLength && view.getUint8(p) === 0xff) {
    const marker = view.getUint8(p + 1),
      size = view.getUint16(p + 2)
    if (marker === 0xda || marker === 0xd9) return ''
    if (marker === 0xe1 && view.getUint32(p + 4) === 0x45786966)
      return tiffDate(view, p + 10)
    p += 2 + size
  }
  return ''
}
function tiffDate(view, start) {
  const little = view.getUint16(start) === 0x4949,
    u16 = (o) => view.getUint16(start + o, little),
    u32 = (o) => view.getUint32(start + o, little)
  function tags(ifd, wanted) {
    const found = {}
    for (let i = 0, n = u16(ifd); i < n; i++) {
      const at = ifd + 2 + i * 12,
        tag = u16(at)
      if (wanted.includes(tag))
        found[tag] = { type: u16(at + 2), count: u32(at + 4), at: at + 8 }
    }
    return found
  }
  function text(entry) {
    if (!entry || entry.type !== 2 || entry.count < 10) return ''
    const offset = entry.count > 4 ? u32(entry.at) : entry.at
    let out = ''
    for (let i = 0; i < 10; i++)
      out += String.fromCharCode(view.getUint8(start + offset + i))
    const m = /^(\d{4}):(\d{2}):(\d{2})$/.exec(out)
    return m ? m[1] + '-' + m[2] + '-' + m[3] : ''
  }
  const main = tags(u32(4), [0x8769, 0x0132]),
    exif = main[0x8769] ? tags(u32(main[0x8769].at), [0x9003, 0x9004]) : {}
  return text(exif[0x9003]) || text(exif[0x9004]) || text(main[0x0132])
}
async function base64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
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
