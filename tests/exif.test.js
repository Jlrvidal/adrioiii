import test from 'node:test'
import assert from 'node:assert/strict'
import { exifDate, photoDate } from '../src/photos.js'

// JPEG mínimo con un bloque EXIF: IFD0 -> ExifIFD -> etiqueta de fecha.
function jpeg({
  little = false,
  tag = 0x9003,
  date = '2025:03:04 10:20:30',
} = {}) {
  const tiff = new DataView(new ArrayBuffer(64))
  const u16 = (o, v) => tiff.setUint16(o, v, little)
  const u32 = (o, v) => tiff.setUint32(o, v, little)
  tiff.setUint16(0, little ? 0x4949 : 0x4d4d)
  u16(2, 42)
  u32(4, 8)
  const inIfd0 = tag === 0x0132
  // IFD0 en 8: una entrada, puntero a ExifIFD o la propia fecha.
  u16(8, 1)
  u16(10, inIfd0 ? 0x0132 : 0x8769)
  u16(12, inIfd0 ? 2 : 4)
  u32(14, inIfd0 ? 20 : 1)
  u32(18, inIfd0 ? 44 : 26)
  u32(22, 0)
  // ExifIFD en 26: una entrada con la fecha en 44.
  u16(26, 1)
  u16(28, tag)
  u16(30, 2)
  u32(32, 20)
  u32(36, 44)
  u32(40, 0)
  for (let i = 0; i < date.length; i++)
    tiff.setUint8(44 + i, date.charCodeAt(i))
  const app1 = new Uint8Array(2 + 2 + 6 + 64)
  const view = new DataView(app1.buffer)
  view.setUint16(0, 0xffe1)
  view.setUint16(2, 2 + 6 + 64)
  app1.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4)
  app1.set(new Uint8Array(tiff.buffer), 10)
  return new Uint8Array([0xff, 0xd8, ...app1, 0xff, 0xd9])
}
const view = (bytes) => new DataView(bytes.buffer)

test('lee la fecha de la cámara en EXIF big-endian y little-endian', () => {
  assert.equal(exifDate(view(jpeg())), '2025-03-04')
  assert.equal(exifDate(view(jpeg({ little: true }))), '2025-03-04')
  assert.equal(exifDate(view(jpeg({ tag: 0x9004 }))), '2025-03-04')
  assert.equal(exifDate(view(jpeg({ tag: 0x0132 }))), '2025-03-04')
})

test('sin EXIF o con fecha vacía no inventa una fecha', () => {
  assert.equal(exifDate(view(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))), '')
  assert.equal(exifDate(view(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))), '')
  assert.equal(exifDate(view(jpeg({ date: '    :  :     :  :  ' }))), '')
})

test('photoDate usa EXIF, después la fecha del archivo y descarta fechas imposibles', async () => {
  const today = '2026-11-26'
  const file = (bytes, lastModified) =>
    new File([bytes], 'obra.jpg', { type: 'image/jpeg', lastModified })
  assert.deepEqual(await photoDate(file(jpeg(), Date.UTC(2026, 0, 2)), today), {
    date: '2025-03-04',
    source: 'camera',
  })
  const plain = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
  assert.deepEqual(
    await photoDate(file(plain, Date.UTC(2024, 5, 9, 12)), today),
    {
      date: '2024-06-09',
      source: 'file',
    },
  )
  // Fecha EXIF futura: se ignora y se usa la del archivo.
  const future = jpeg({ date: '2031:01:01 00:00:00' })
  assert.equal(
    (await photoDate(file(future, Date.UTC(2023, 1, 1, 12)), today)).source,
    'file',
  )
  assert.equal(await photoDate(file(plain, Date.UTC(2015, 0, 1)), today), null)
})
