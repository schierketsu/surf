import { arrowGeometry } from './ArrowLayer'
import type { SavedBoard } from './boardStorage'
import { drawingPath } from './components/Drawing/Drawing'
import { tableColumnWidths } from './components/BoardTable/BoardTable'
import { BOARD_HEIGHT, BOARD_WIDTH } from './gridHierarchy'

const PREVIEW_WIDTH = 640
const PREVIEW_HEIGHT = 360
type BoardContent = Omit<SavedBoard, 'preview'>

function plainText(html: string) {
  const source = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p)>/gi, '\n')
  return new DOMParser().parseFromString(source, 'text/html').body.textContent?.trim() ?? ''
}

function drawText(context: CanvasRenderingContext2D, value: string, x: number, y: number,
  width: number, height: number, size: number, color: string, align: CanvasTextAlign,
  bold = false, italic = false) {
  if (!value || width <= 0 || height <= 0) return
  context.save()
  context.beginPath()
  context.rect(x, y, width, height)
  context.clip()
  context.font = `${italic ? 'italic ' : ''}${bold ? '700 ' : ''}${size}px Doska, Arial, sans-serif`
  context.fillStyle = color
  context.textBaseline = 'top'
  context.textAlign = align
  const lineHeight = size * 1.25
  const drawX = align === 'center' ? x + width / 2 : align === 'right' ? x + width : x
  let lineY = y
  for (const paragraph of value.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word
      if (line && context.measureText(next).width > width) {
        context.fillText(line, drawX, lineY)
        lineY += lineHeight
        line = word
      } else line = next
      if (lineY >= y + height) break
    }
    if (lineY >= y + height) break
    if (line) context.fillText(line, drawX, lineY)
    lineY += lineHeight
  }
  context.restore()
}

export function renderBoardPreview(board: BoardContent) {
  if (!board.texts.length && !board.stickers.length && !board.tables.length
    && !board.drawings.length && !board.arrows.length) return ''
  const canvas = document.createElement('canvas')
  canvas.width = PREVIEW_WIDTH
  canvas.height = PREVIEW_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) return ''
  context.fillStyle = '#fff'
  context.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT)
  context.scale(PREVIEW_WIDTH / BOARD_WIDTH, PREVIEW_HEIGHT / BOARD_HEIGHT)

  const objects = new Map<string, () => void>()
  for (const item of board.texts) objects.set(item.id, () => {
    context.save()
    context.globalAlpha = item.opacity
    if (item.highlight && item.highlight !== 'transparent') {
      context.fillStyle = item.highlight
      context.fillRect(item.x, item.y, item.width, item.height)
    }
    drawText(context, plainText(item.html), item.x + 4, item.y + 4, item.width - 8, item.height - 8,
      item.fontSize, item.color, item.align, item.bold, item.italic)
    context.restore()
  })
  for (const item of board.stickers) objects.set(item.id, () => {
    context.fillStyle = item.fill
    context.fillRect(item.x, item.y, item.width, item.height)
    if (item.border && item.border !== 'transparent') {
      context.strokeStyle = item.border
      context.lineWidth = 1
      context.strokeRect(item.x, item.y, item.width, item.height)
    }
    const text = plainText(item.html)
    drawText(context, text, item.x + 16, item.y + 16, item.width - 32, item.height - 32,
      item.fontSize, '#272727', item.align, item.bold, item.italic)
  })
  for (const item of board.tables) objects.set(item.id, () => {
    const widths = tableColumnWidths(item)
    let y = item.y
    item.cells.forEach((row, rowIndex) => {
      let x = item.x
      row.forEach((cell, columnIndex) => {
        if (!cell.mergedInto) {
          const width = widths.slice(columnIndex, columnIndex + (cell.colSpan ?? 1)).reduce((sum, value) => sum + value, 0)
          const height = item.rowHeights.slice(rowIndex, rowIndex + (cell.rowSpan ?? 1)).reduce((sum, value) => sum + value, 0)
          context.fillStyle = cell.fill
          context.fillRect(x, y, width, height)
          context.strokeStyle = '#a9b3bf'
          context.lineWidth = 1
          context.strokeRect(x, y, width, height)
          drawText(context, cell.text, x + 8, y + 8, width - 16, height - 16,
            item.fontSize, '#272727', cell.align, cell.bold, cell.italic)
        }
        x += widths[columnIndex]
      })
      y += item.rowHeights[rowIndex]
    })
  })
  for (const item of board.drawings) objects.set(item.id, () => {
    context.save()
    context.translate(item.x, item.y)
    context.strokeStyle = item.color
    context.lineWidth = item.strokeWidth
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.stroke(new Path2D(drawingPath(item.points)))
    context.restore()
  })
  for (const item of board.arrows) objects.set(item.id, () => {
    const geometry = arrowGeometry(item.tail, item.head, item.bend, [...board.texts, ...board.stickers],
      item.bendEdited, item.bendOffset, true, item.shape ?? 'curved', item.curveBends,
      item.pendingStraightBend, item.tailEnd ?? 'none')
    context.save()
    context.strokeStyle = item.color
    context.fillStyle = item.color
    context.lineWidth = 3
    context.lineCap = 'round'
    context.setLineDash(item.dash === 'long' ? [14, 9] : item.dash === 'short' ? [3, 6] : [])
    context.stroke(new Path2D(geometry.path))
    context.setLineDash([])
    if (item.headEnd !== 'none') {
      const angle = Math.atan2(geometry.tip.y - geometry.end.y, geometry.tip.x - geometry.end.x)
      const size = 16
      context.beginPath()
      context.moveTo(geometry.tip.x, geometry.tip.y)
      context.lineTo(geometry.tip.x - size * Math.cos(angle - .45), geometry.tip.y - size * Math.sin(angle - .45))
      context.lineTo(geometry.tip.x - size * Math.cos(angle + .45), geometry.tip.y - size * Math.sin(angle + .45))
      context.closePath(); context.fill()
    } else {
      context.beginPath(); context.moveTo(geometry.end.x, geometry.end.y)
      context.lineTo(geometry.tip.x, geometry.tip.y); context.stroke()
    }
    context.restore()
  })
  for (const id of board.layerOrder) { objects.get(id)?.(); objects.delete(id) }
  for (const draw of objects.values()) draw()
  return canvas.toDataURL('image/webp', .8)
}
