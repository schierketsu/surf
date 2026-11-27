import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&url'
import type { BoardImageItem, PdfFramePage } from './components/BoardImage/BoardImage'
import { BOARD_HEIGHT, BOARD_WIDTH } from './gridHierarchy'

GlobalWorkerOptions.workerSrc = workerUrl

type Size = { width: number; height: number }
type Point = { x: number; y: number }
export type PdfImportMode = 'split' | 'frame'
const MARGIN = 80
const GAP = 24
const FRAME_PADDING = 32
const MAX_PAGE_WIDTH = 900
const MAX_PAGE_HEIGHT = 1100
const RENDER_SCALE = 1.5
const MAX_PDF_PAGES = 10
const COMPACT_PAGE_THRESHOLD = 6
const COMPACT_PAGE_SCALE = 0.67

class PdfPageLimitError extends Error {
  constructor() {
    super(`В PDF больше ${MAX_PDF_PAGES} страниц. Выберите файл не более ${MAX_PDF_PAGES} страниц.`)
    this.name = 'PdfPageLimitError'
  }
}

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
  const displayScale = best.scale * (sizes.length >= COMPACT_PAGE_THRESHOLD ? COMPACT_PAGE_SCALE : 1)
  const displayGap = GAP * (sizes.length >= COMPACT_PAGE_THRESHOLD ? COMPACT_PAGE_SCALE : 1)
  const cellWidth = maxWidth * displayScale
  const cellHeight = maxHeight * displayScale
  const groupWidth = best.columns * cellWidth + (best.columns - 1) * displayGap
  const groupHeight = best.rows * cellHeight + (best.rows - 1) * displayGap
  const left = Math.max(MARGIN, Math.min(BOARD_WIDTH - MARGIN - groupWidth, center.x - groupWidth / 2))
  const top = Math.max(MARGIN, Math.min(BOARD_HEIGHT - MARGIN - groupHeight, center.y - groupHeight / 2))
  return sizes.map((size, index) => {
    const column = index % best.columns
    const row = Math.floor(index / best.columns)
    const width = size.width * displayScale
    const height = size.height * displayScale
    return { x: left + column * (cellWidth + displayGap) + (cellWidth - width) / 2,
      y: top + row * (cellHeight + displayGap) + (cellHeight - height) / 2, width, height,
      // Keep the raster resolution from the original layout when displaying pages smaller.
      renderScale: best.scale * RENDER_SCALE }
  })
}

export async function importPdfPages(file: File, center: Point, mode: PdfImportMode = 'split'): Promise<BoardImageItem[]> {
  const data = new Uint8Array(await file.arrayBuffer())
  const task = getDocument({ data })
  try {
    const document = await task.promise
    if (document.numPages > MAX_PDF_PAGES) throw new PdfPageLimitError()
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
    const framePadding = document.numPages >= COMPACT_PAGE_THRESHOLD ? FRAME_PADDING * COMPACT_PAGE_SCALE : FRAME_PADDING
    const frameLeft = Math.min(...positions.map((position) => position.x)) - framePadding
    const frameTop = Math.min(...positions.map((position) => position.y)) - framePadding
    const frameRight = Math.max(...positions.map((position) => position.x + position.width)) + framePadding
    const frameBottom = Math.max(...positions.map((position) => position.y + position.height)) + framePadding
    const framePages: PdfFramePage[] = []
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
      const src = canvas.toDataURL('image/webp', .9)
      if (mode === 'frame') {
        framePages.push({ id: crypto.randomUUID(), x: position.x - frameLeft, y: position.y - frameTop,
          width: position.width, height: position.height, src })
      } else {
        images.push({ id: crypto.randomUUID(), x: position.x, y: position.y,
          width: position.width, height: position.height,
          name: `${file.name} — страница ${index + 1}`,
          src })
      }
      page.cleanup()
      canvas.width = 0
      canvas.height = 0
    }
    if (mode === 'frame') {
      const frame: BoardImageItem = { id: crypto.randomUUID(), x: frameLeft, y: frameTop,
        width: frameRight - frameLeft, height: frameBottom - frameTop,
        name: file.name, frame: true, framePages, src: '' }
      return [frame]
    }
    return images
  } finally {
    await task.destroy()
  }
}
