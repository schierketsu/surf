import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&url'
import type { BoardImageItem } from './components/BoardImage/BoardImage'
import { DocumentPageLimitError, MAX_DOCUMENT_PAGES, boardItemsFromPages, pageLayout,
  type DocumentImportMode, type PageSize, type Point } from './documentImport'

GlobalWorkerOptions.workerSrc = workerUrl

export type PdfImportMode = DocumentImportMode

export async function importPdfPages(file: File, center: Point, mode: PdfImportMode = 'split'): Promise<BoardImageItem[]> {
  const data = new Uint8Array(await file.arrayBuffer())
  const task = getDocument({ data })
  try {
    const document = await task.promise
    if (document.numPages > MAX_DOCUMENT_PAGES) throw new DocumentPageLimitError()
    const pages = []
    const sizes: PageSize[] = []
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number)
      const viewport = page.getViewport({ scale: 1 })
      pages.push(page)
      sizes.push({ width: viewport.width, height: viewport.height })
    }
    const positions = pageLayout(sizes, center)
    const sources: string[] = []
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index]
      const viewport = page.getViewport({ scale: positions[index].renderScale })
      const canvas = window.document.createElement('canvas')
      canvas.width = Math.max(1, Math.ceil(viewport.width))
      canvas.height = Math.max(1, Math.ceil(viewport.height))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Браузер не смог создать холст для PDF')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: context, viewport }).promise
      sources.push(canvas.toDataURL('image/webp', .9))
      page.cleanup()
      canvas.width = 0
      canvas.height = 0
    }
    return boardItemsFromPages(file.name, positions, sources, mode)
  } finally {
    await task.destroy()
  }
}
