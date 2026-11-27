import type { BoardImageItem, PdfFramePage } from './components/BoardImage/BoardImage'
import { BOARD_HEIGHT, BOARD_WIDTH } from './gridHierarchy'

export type DocumentImportMode = 'split' | 'frame'
export type PageSize = { width: number; height: number }
export type Point = { x: number; y: number }
export type PagePosition = { x: number; y: number; width: number; height: number; renderScale: number }

export const MAX_DOCUMENT_PAGES = 10
const MARGIN = 80
const GAP = 24
const FRAME_PADDING = 32
const MAX_PAGE_WIDTH = 900
const MAX_PAGE_HEIGHT = 1100
const RENDER_SCALE = 1.5
const COMPACT_PAGE_THRESHOLD = 6
const COMPACT_PAGE_SCALE = 0.67

export class DocumentPageLimitError extends Error {
  constructor() {
    super(`В PDF больше ${MAX_DOCUMENT_PAGES} страниц. Выберите файл не более ${MAX_DOCUMENT_PAGES} страниц.`)
    this.name = 'DocumentPageLimitError'
  }
}

export function pageLayout(sizes: PageSize[], center: Point): PagePosition[] {
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
      // Keep the original render resolution when displaying six or more pages smaller.
      renderScale: best.scale * RENDER_SCALE }
  })
}

export function boardItemsFromPages(name: string, positions: PagePosition[], sources: string[], mode: DocumentImportMode): BoardImageItem[] {
  if (!positions.length || positions.length !== sources.length) return []
  if (mode === 'split') return positions.map((position, index) => ({
    id: crypto.randomUUID(), x: position.x, y: position.y, width: position.width, height: position.height,
    name: `${name} — страница ${index + 1}`, src: sources[index],
  }))

  const framePadding = positions.length >= COMPACT_PAGE_THRESHOLD ? FRAME_PADDING * COMPACT_PAGE_SCALE : FRAME_PADDING
  const frameLeft = Math.min(...positions.map((position) => position.x)) - framePadding
  const frameTop = Math.min(...positions.map((position) => position.y)) - framePadding
  const frameRight = Math.max(...positions.map((position) => position.x + position.width)) + framePadding
  const frameBottom = Math.max(...positions.map((position) => position.y + position.height)) + framePadding
  const framePages: PdfFramePage[] = positions.map((position, index) => ({
    id: crypto.randomUUID(), x: position.x - frameLeft, y: position.y - frameTop,
    width: position.width, height: position.height, src: sources[index],
  }))
  return [{ id: crypto.randomUUID(), x: frameLeft, y: frameTop,
    width: frameRight - frameLeft, height: frameBottom - frameTop,
    name, frame: true, framePages, src: '' }]
}
