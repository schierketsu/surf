import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&url'
import type { BoardImageItem } from './components/BoardImage/BoardImage'
import { BOARD_HEIGHT, BOARD_WIDTH } from './gridHierarchy'

GlobalWorkerOptions.workerSrc = workerUrl

type Size = { width: number; height: number }
type Point = { x: number; y: number }
const MARGIN = 80
const GAP = 24
const MAX_PAGE_WIDTH = 900
const MAX_PAGE_HEIGHT = 1100
const RENDER_SCALE = 1.5

function pageLayout(sizes: Size[], center: Point) {
  const maxWidth = Math.max(...sizes.map((page) => page.width))
  const maxHeight = Math.max(...sizes.map((page) => page.height))
  let best = { columns: 1, rows: sizes.length, scale: 0 }
  for (let columns = 1; columns <= sizes.length; columns += 1) {
    const rows = Math.ceil(sizes.length / columns)
    const cellWidth = (BOARD_WIDTH - 2 * MARGIN - (columns - 1) * GAP) / columns
    const cellHeight = (BOARD_HEIGHT - 2 * MARGIN - (rows - 1) * GAP) / rows
    const scale = Math.min(MAX_PAGE_WIDTH / maxWidth, MAX_PAGE_HEIGHT / maxHeight,
      cellWidth / maxWidth, cellHeight / maxHeight)
    if (scale > best.scale) best = { columns, rows, scale }
  }
  const cellWidth = maxWidth * best.scale
  const cellHeight = maxHeight * best.scale
  const groupWidth = best.columns * cellWidth + (best.columns - 1) * GAP
  const groupHeight = best.rows * cellHeight + (best.rows - 1) * GAP
  const left = Math.max(MARGIN, Math.min(BOARD_WIDTH - MARGIN - groupWidth, center.x - groupWidth / 2))
  const top = Math.max(MARGIN, Math.min(BOARD_HEIGHT - MARGIN - groupHeight, center.y - groupHeight / 2))
  return sizes.map((size, index) => {
    const column = index % best.columns
    const row = Math.floor(index / best.columns)
    const width = size.width * best.scale
    const height = size.height * best.scale
    return { x: left + column * (cellWidth + GAP) + (cellWidth - width) / 2,
      y: top + row * (cellHeight + GAP) + (cellHeight - height) / 2, width, height,
      renderScale: best.scale * RENDER_SCALE }
  })
}

export async function importPdfPages(file: File, center: Point): Promise<BoardImageItem[]> {
  const data = new Uint8Array(await file.arrayBuffer())
  const task = getDocument({ data })
  try {
    const document = await task.promise
    const pages = []
    const sizes: Size[] = []
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number)
      const viewport = page.getViewport({ scale: 1 })
      pages.push(page)
      sizes.push({ width: viewport.width, height: viewport.height })
    }
    const positions = pageLayout(sizes, center)
    const images: BoardImageItem[] = []
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index]
      const position = positions[index]
      const viewport = page.getViewport({ scale: position.renderScale })
      const canvas = window.document.createElement('canvas')
      canvas.width = Math.max(1, Math.ceil(viewport.width))
      canvas.height = Math.max(1, Math.ceil(viewport.height))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Браузер не смог создать холст для PDF')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: context, viewport }).promise
      images.push({ id: crypto.randomUUID(), x: position.x, y: position.y,
        width: position.width, height: position.height,
        name: `${file.name} — страница ${index + 1}`,
        src: canvas.toDataURL('image/webp', .9) })
      page.cleanup()
      canvas.width = 0
      canvas.height = 0
    }
    return images
  } finally {
    await task.destroy()
  }
}
