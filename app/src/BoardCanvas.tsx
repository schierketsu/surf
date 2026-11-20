import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ToolPanel, { STICKER_DRAG_TYPE, type DrawingStyle, type NavigationMode, type StickerStyle, type TableSize } from './components/ToolPanel/ToolPanel'
import BoardTable, { MIN_TABLE_CELL_HEIGHT, MIN_TABLE_CELL_WIDTH, TABLE_CELL_HEIGHT, TABLE_CELL_WIDTH,
  createTableCell, tableColumnWidths, tableHeight, tableWidth, type TableCellData, type TableItem } from './components/BoardTable/BoardTable'
import TableToolbar from './components/TableToolbar/TableToolbar'
import ZoomControls from './components/ZoomControls/ZoomControls'
import TextBox, { MAX_FONT_SIZE, MIN_FONT_SIZE, MIN_TEXT_HEIGHT, MIN_TEXT_WIDTH, type TextItem } from './components/TextBox/TextBox'
import GroupSelection, { type GroupSelectionItem } from './components/GroupSelection/GroupSelection'
import TextToolbar from './components/TextToolbar/TextToolbar'
import { BOARD_HEIGHT, BOARD_WIDTH, MINI_CELLS_PER_SIDE, gridLevelForScale, visitVisibleCells, type WorldRect } from './gridHierarchy'
import ArrowLayer, { anchorPoint, arrowGeometry, arrowTarget, bendOffsetFor, initialBend, resolveArrowHead, resolveArrowShaftEnd, type Anchor, type Arrow, type ArrowDrag, type ConnectableItem, type Point } from './ArrowLayer'
import ArrowToolbar from './components/ArrowToolbar/ArrowToolbar'
import type { ConnectorSide } from './components/TextBox/TextBox'
import Sticker, { type StickerItem } from './components/Sticker/Sticker'
import StickerToolbar from './components/StickerToolbar/StickerToolbar'
import Drawing, { drawingPath, type DrawingItem } from './components/Drawing/Drawing'
import DrawingToolbar from './components/DrawingToolbar/DrawingToolbar'
import type { LayerAction } from './components/LayerMenuItems'

type View = { scale: number; x: number; y: number }
type SelectionRect = { left: number; top: number; width: number; height: number }
type BoardObjectKind = 'text' | 'sticker' | 'drawing' | 'arrow' | 'table'
type BoardContextMenu = { x: number; y: number; objectKind?: BoardObjectKind; objectId?: string }
type FormatCommand = 'bold' | 'italic' | 'underline' | 'strikeThrough'
type DrawingDraft = DrawingStyle & { points: Point[] }
type GroupTransformSnapshot = { texts: TextItem[]; stickers: StickerItem[]; tables: TableItem[]; drawings: DrawingItem[]; arrows: Arrow[] }

const MAX_SCALE = 4
const WHEEL_ZOOM_SENSITIVITY = 0.002
const KEYBOARD_PAN_STEP = 80
const INITIAL_TEXT_WIDTH = 180
const INITIAL_TEXT_HEIGHT = 24
const INITIAL_STICKER_SIZE = 160
const VISIBLE_EDGE_GAP = 8
const ARROW_DRAG_THRESHOLD = 6
const OBJECT_CLIPBOARD_TYPE = 'application/x-doska-objects+json'
const OBJECT_CLIPBOARD_PREFIX = 'DOSKA_OBJECTS_V1:'

type ObjectClipboard = { version: 1; texts: TextItem[]; stickers: StickerItem[]; tables: TableItem[]; arrows: Arrow[]; drawings: DrawingItem[] }
function occupiedConnectorKeys(items: Arrow[], exceptArrowId?: string) {
  const occupied = new Set<string>()
  for (const arrow of items) {
    if (arrow.id === exceptArrowId) continue
    if (arrow.tail.textId && arrow.tail.side) occupied.add(`${arrow.tail.textId}:${arrow.tail.side}`)
    if (arrow.head.textId && arrow.head.side) occupied.add(`${arrow.head.textId}:${arrow.head.side}`)
  }
  return occupied
}

function parseObjectClipboard(value: string): ObjectClipboard | null {
  try {
    const data = JSON.parse(value.startsWith(OBJECT_CLIPBOARD_PREFIX) ? value.slice(OBJECT_CLIPBOARD_PREFIX.length) : value)
    return data?.version === 1 && Array.isArray(data.texts) && Array.isArray(data.arrows)
      ? { ...data, stickers: Array.isArray(data.stickers) ? data.stickers : [],
        tables: Array.isArray(data.tables) ? data.tables : [],
        drawings: Array.isArray(data.drawings) ? data.drawings : [] } as ObjectClipboard
      : null
  } catch { return null }
}

function htmlToPlainText(html: string) {
  const container = document.createElement('div')
  container.innerHTML = html
  return container.innerText || container.textContent || ''
}

function objectClipboardPlainText(payload: ObjectClipboard) {
  return [...[...payload.texts, ...payload.stickers].map((item) => htmlToPlainText(item.html)),
    ...payload.tables.map((table) => tableClipboardText(table, []))].join('\n')
}

function tableClipboardText(table: TableItem, selectedCells: string[]) {
  if (!selectedCells.length) return table.cells.map((row) => row.map((cell) => cell.text).join('\t')).join('\n')
  return selectedCells.map((key) => {
    const [row, column] = key.split(':').map(Number)
    return table.cells[row]?.[column]?.text ?? ''
  }).join('\n')
}

function mergeTableCells(table: TableItem, selectedCells: string[]) {
  if (selectedCells.length < 2) return null
  const coordinates = selectedCells.map((key) => key.split(':').map(Number))
  let top = Math.min(...coordinates.map(([row]) => row))
  let bottom = Math.max(...coordinates.map(([row]) => row))
  let left = Math.min(...coordinates.map(([, column]) => column))
  let right = Math.max(...coordinates.map(([, column]) => column))
  let expanded = true
  while (expanded) {
    expanded = false
    for (let row = top; row <= bottom; row += 1) {
      for (let column = left; column <= right; column += 1) {
        const key = table.cells[row]?.[column]?.mergedInto ?? `${row}:${column}`
        const [anchorRow, anchorColumn] = key.split(':').map(Number)
        const anchor = table.cells[anchorRow]?.[anchorColumn]
        if (!anchor) continue
        const nextTop = Math.min(top, anchorRow)
        const nextBottom = Math.max(bottom, anchorRow + (anchor.rowSpan ?? 1) - 1)
        const nextLeft = Math.min(left, anchorColumn)
        const nextRight = Math.max(right, anchorColumn + (anchor.colSpan ?? 1) - 1)
        if (nextTop !== top || nextBottom !== bottom || nextLeft !== left || nextRight !== right) {
          top = nextTop; bottom = nextBottom; left = nextLeft; right = nextRight
          expanded = true
        }
      }
    }
  }
  const cells = table.cells.map((row) => row.map((cell) => ({ ...cell })))
  const text: string[] = []
  for (let row = top; row <= bottom; row += 1) {
    for (let column = left; column <= right; column += 1) {
      const cell = cells[row][column]
      if (!cell.mergedInto && cell.text) text.push(cell.text)
      if (row !== top || column !== left) cells[row][column] = {
        ...cell, text: '', rowSpan: undefined, colSpan: undefined, mergedInto: `${top}:${left}`,
      }
    }
  }
  cells[top][left] = { ...cells[top][left], text: text.join('\n'), rowSpan: bottom - top + 1,
    colSpan: right - left + 1, mergedInto: undefined }
  return { cells, rowHeights: table.rowHeights.map((height, row) => row >= top && row <= bottom
    ? table.rowMinHeights?.[row] ?? table.cellHeight : height),
    anchor: `${top}:${left}` }
}

function splitTableCells(table: TableItem, selectedCells: string[]) {
  const cells = table.cells.map((row) => row.map((cell) => ({ ...cell })))
  const selection = new Set(selectedCells)
  let changed = false
  for (const key of selectedCells) {
    const [row, column] = key.split(':').map(Number)
    const cell = cells[row]?.[column]
    if (!cell || (cell.rowSpan ?? 1) === 1 && (cell.colSpan ?? 1) === 1) continue
    for (let y = row; y < row + (cell.rowSpan ?? 1); y += 1) {
      for (let x = column; x < column + (cell.colSpan ?? 1); x += 1) {
        selection.add(`${y}:${x}`)
        cells[y][x] = { ...cells[y][x], rowSpan: undefined, colSpan: undefined, mergedInto: undefined }
      }
    }
    changed = true
  }
  return changed ? { cells, selection: [...selection] } : null
}

type TableLineSelection = { axis: 'row' | 'column'; index: number }

function removeTableLine(table: TableItem, { axis, index }: TableLineSelection): TableItem | null {
  const rows = table.cells.length
  const columns = table.cells[0]?.length ?? 0
  if (axis === 'row' ? rows <= 1 : columns <= 1) return null
  const rowIndex = (row: number) => axis === 'row' && row > index ? row - 1 : row
  const columnIndex = (column: number) => axis === 'column' && column > index ? column - 1 : column
  const cells: TableCellData[][] = table.cells.filter((_, row) => axis !== 'row' || row !== index)
    .map((line) => line.filter((_, column) => axis !== 'column' || column !== index)
      .map((cell) => ({ ...cell, rowSpan: undefined, colSpan: undefined, mergedInto: undefined })))

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cell = table.cells[row][column]
      if (cell.mergedInto) continue
      const keptRows = Array.from({ length: cell.rowSpan ?? 1 }, (_, offset) => row + offset)
        .filter((value) => axis !== 'row' || value !== index)
      const keptColumns = Array.from({ length: cell.colSpan ?? 1 }, (_, offset) => column + offset)
        .filter((value) => axis !== 'column' || value !== index)
      if (!keptRows.length || !keptColumns.length) continue
      const firstRow = rowIndex(keptRows[0])
      const firstColumn = columnIndex(keptColumns[0])
      const anchor = `${firstRow}:${firstColumn}`
      cells[firstRow][firstColumn] = { ...cell,
        rowSpan: keptRows.length > 1 ? keptRows.length : undefined,
        colSpan: keptColumns.length > 1 ? keptColumns.length : undefined,
        mergedInto: undefined }
      for (const keptRow of keptRows) {
        for (const keptColumn of keptColumns) {
          const nextRow = rowIndex(keptRow)
          const nextColumn = columnIndex(keptColumn)
          if (nextRow === firstRow && nextColumn === firstColumn) continue
          cells[nextRow][nextColumn] = { ...cells[nextRow][nextColumn], text: '',
            rowSpan: undefined, colSpan: undefined, mergedInto: anchor }
        }
      }
    }
  }

  return { ...table, cells,
    rowHeights: axis === 'row' ? table.rowHeights.filter((_, row) => row !== index) : [...table.rowHeights],
    rowMinHeights: axis === 'row' ? table.rowMinHeights?.filter((_, row) => row !== index)
      : table.rowMinHeights ? [...table.rowMinHeights] : undefined,
    columnWidths: axis === 'column' ? tableColumnWidths(table).filter((_, column) => column !== index)
      : [...tableColumnWidths(table)] }
}

function normalizeLayerOrder(order: string[], objectIds: string[]) {
  const existing = new Set(objectIds)
  const normalized = order.filter((id) => existing.has(id))
  const known = new Set(normalized)
  objectIds.forEach((id) => { if (!known.has(id)) normalized.push(id) })
  return normalized
}

function reorderLayers(order: string[], selectedIds: string[], action: LayerAction) {
  const selected = new Set(selectedIds)
  if (!selected.size) return order
  const selectedInOrder = order.filter((id) => selected.has(id))
  const rest = order.filter((id) => !selected.has(id))
  if (action === 'front') return [...rest, ...selectedInOrder]
  if (action === 'back') return [...selectedInOrder, ...rest]

  const next = [...order]
  if (action === 'forward') {
    for (let index = next.length - 2; index >= 0; index -= 1) {
      if (selected.has(next[index]) && !selected.has(next[index + 1])) {
        const following = next[index + 1]
        next[index + 1] = next[index]
        next[index] = following
      }
    }
  } else {
    for (let index = 1; index < next.length; index += 1) {
      if (selected.has(next[index]) && !selected.has(next[index - 1])) {
        const preceding = next[index - 1]
        next[index - 1] = next[index]
        next[index] = preceding
      }
    }
  }
  return next
}

function arrowSelectionBounds(geometry: ReturnType<typeof arrowGeometry>, padding: number) {
  const points = [geometry.start, geometry.end, geometry.tip, geometry.handle,
    ...('bendHandles' in geometry && geometry.bendHandles ? geometry.bendHandles : [])]
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  return { x: minX - padding, y: minY - padding, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 }
}

function visibleVerticalBounds(view: View | null, viewportHeight: number) {
  if (!view || !viewportHeight) return { top: 0, bottom: BOARD_HEIGHT }
  const top = Math.max(0, Math.min(BOARD_HEIGHT - MIN_TEXT_HEIGHT, (VISIBLE_EDGE_GAP - view.y) / view.scale))
  const bottom = Math.min(BOARD_HEIGHT, (viewportHeight - VISIBLE_EDGE_GAP - view.y) / view.scale)
  return { top, bottom: Math.max(top + MIN_TEXT_HEIGHT, bottom) }
}

function coverScale(width: number, height: number) {
  return Math.max(width / BOARD_WIDTH, height / BOARD_HEIGHT)
}

function smoothstep(start: number, end: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)))
  return t * t * (3 - 2 * t)
}

function keepBoardInView(view: View, width: number, height: number): View {
  const boardWidth = BOARD_WIDTH * view.scale
  const boardHeight = BOARD_HEIGHT * view.scale

  return {
    ...view,
    x: boardWidth <= width
      ? (width - boardWidth) / 2
      : Math.max(width - boardWidth, Math.min(0, view.x)),
    y: boardHeight <= height
      ? (height - boardHeight) / 2
      : Math.max(height - boardHeight, Math.min(0, view.y)),
  }
}

function constrainText(item: TextItem, view?: View | null, viewportHeight = 0): TextItem {
  const { top, bottom } = visibleVerticalBounds(view ?? null, viewportHeight)
  const width = Math.max(MIN_TEXT_WIDTH, Math.min(BOARD_WIDTH, item.width))
  const baseHeight = Math.max(MIN_TEXT_HEIGHT, Math.min(BOARD_HEIGHT, item.baseHeight ?? item.height))
  const height = Math.max(baseHeight, Math.min(BOARD_HEIGHT, item.height))
  const maxY = BOARD_HEIGHT - height
  const fitsViewport = height <= bottom - top
  return {
    ...item,
    width,
    height,
    baseHeight,
    fontSize: Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, item.fontSize)),
    x: Math.max(0, Math.min(BOARD_WIDTH - width, item.x)),
    y: fitsViewport
      ? Math.max(top, Math.min(bottom - height, item.y))
      : Math.max(0, Math.min(maxY, item.y)),
  }
}

function applyTextChanges(item: TextItem, changes: Partial<TextItem>, view?: View | null, viewportHeight = 0): TextItem {
  const next = { ...item, ...changes }
  if (!['x', 'y', 'width', 'height', 'baseHeight', 'fontSize'].some((key) => key in changes)) return next
  if (changes.fontSize !== undefined && changes.width === undefined && changes.height === undefined) {
    const factor = changes.fontSize / item.fontSize
    next.width = item.width * factor
    next.height = item.height * factor
    next.baseHeight = (item.baseHeight ?? item.height) * factor
  }
  return constrainText(next, view, viewportHeight)
}

function clearInlineTextColors(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('*').forEach((element) => {
    element.removeAttribute('color')
    element.style.removeProperty('color')
    if (!element.getAttribute('style')?.trim()) element.removeAttribute('style')
  })
}

function withoutInlineTextColors(html: string) {
  const container = document.createElement('div')
  container.innerHTML = html
  clearInlineTextColors(container)
  return container.innerHTML
}

function drawingFromDraft(draft: DrawingDraft): DrawingItem | null {
  if (!draft.points.length) return null
  const halfWidth = draft.width / 2
  const minX = Math.min(...draft.points.map((point) => point.x))
  const maxX = Math.max(...draft.points.map((point) => point.x))
  const minY = Math.min(...draft.points.map((point) => point.y))
  const maxY = Math.max(...draft.points.map((point) => point.y))
  const x = Math.max(0, minX - halfWidth)
  const y = Math.max(0, minY - halfWidth)
  const right = Math.min(BOARD_WIDTH, maxX + halfWidth)
  const bottom = Math.min(BOARD_HEIGHT, maxY + halfWidth)
  const width = Math.max(1, right - x)
  const height = Math.max(1, bottom - y)
  return {
    id: crypto.randomUUID(), x, y, width, height, color: draft.color, strokeWidth: draft.width,
    points: draft.points.map((point) => ({ x: point.x - x, y: point.y - y })),
  }
}

function moveArrowBend(arrow: Arrow, point: Point, index = 1, texts: ConnectableItem[], finish = false): Arrow {
  if (arrow.shape === 'straight') {
    if (!arrow.curveBends && !finish) return { ...arrow, pendingStraightBend: point }
    const start = resolveArrowHead(arrow.tail, texts)
    const end = arrowGeometry(arrow.tail, arrow.head, arrow.bend, texts, false, undefined, false,
      'straight', undefined, arrow.pendingStraightBend).end
    const center = arrow.pendingStraightBend ?? arrowGeometry(arrow.tail, arrow.head, arrow.bend, texts, false, undefined, false, 'straight').handle
    const bends: [Point, Point, Point] = arrow.curveBends
      ? [...arrow.curveBends]
      : [{ x: (start.x + center.x) / 2, y: (start.y + center.y) / 2 }, center,
        { x: (center.x + end.x) / 2, y: (center.y + end.y) / 2 }]
    bends[index] = point
    return { ...arrow, curveBends: bends, pendingStraightBend: undefined }
  }
  return { ...arrow, curveBends: undefined, bend: point,
    bendOffset: bendOffsetFor(arrow.tail, arrow.head, point, texts), bendEdited: true }
}

export default function BoardCanvas() {
  const boardRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingCaptureRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<View | null>(null)
  const applyViewRef = useRef<(view: View) => void>(() => {})
  const ensureTextVisibleIdsRef = useRef(new Set<string>())
  const pendingTextChangeBaseRef = useRef<TextItem[] | null>(null)
  const zoomRef = useRef<(factor: number) => void>(() => {})
  const textModeRef = useRef(false)
  const stickerModeRef = useRef<StickerStyle | null>(null)
  const tableModeRef = useRef<TableSize | null>(null)
  const drawingModeRef = useRef<DrawingStyle | null>(null)
  const navigationModeRef = useRef<NavigationMode>('cursor')
  const textsRef = useRef<TextItem[]>([])
  const stickersRef = useRef<StickerItem[]>([])
  const tablesRef = useRef<TableItem[]>([])
  const tableCellAnchorRef = useRef<{ tableId: string; row: number; column: number } | null>(null)
  const drawingsRef = useRef<DrawingItem[]>([])
  const connectableItemsRef = useRef<ConnectableItem[]>([])
  const arrowsRef = useRef<Arrow[]>([])
  const arrowGeometriesRef = useRef(new Map<string, ReturnType<typeof arrowGeometry>>())
  const arrowDragRef = useRef<ArrowDrag | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const editorRefs = useRef(new Map<string, HTMLDivElement>())
  const stickerEditorRefs = useRef(new Map<string, HTMLDivElement>())
  const selectionRef = useRef<Range | null>(null)
  const stickerSelectionRef = useRef<Range | null>(null)
  const pasteCountRef = useRef(0)
  const objectClipboardRef = useRef<ObjectClipboard | null>(null)
  const groupTransformStartRef = useRef<GroupTransformSnapshot | null>(null)
  const arrowGeometryCacheRef = useRef(new Map<string, {
    arrow: Arrow
    textKey: string
    avoidObstacles: boolean
    geometry: ReturnType<typeof arrowGeometry>
  }>())
  const [zoomLimits, setZoomLimits] = useState({ atMin: false, atMax: false })
  const [viewState, setViewState] = useState<View | null>(null)
  const [texts, setTexts] = useState<TextItem[]>([])
  const [stickers, setStickers] = useState<StickerItem[]>([])
  const [tables, setTables] = useState<TableItem[]>([])
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [selectedTableCells, setSelectedTableCells] = useState<string[]>([])
  const [selectedTableLine, setSelectedTableLine] = useState<TableLineSelection | null>(null)
  const [drawings, setDrawings] = useState<DrawingItem[]>([])
  const [drawingStyle, setDrawingStyle] = useState<DrawingStyle | null>(null)
  const [drawingDraft, setDrawingDraft] = useState<DrawingDraft | null>(null)
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null)
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null)
  const [editingStickerId, setEditingStickerId] = useState<string | null>(null)
  const [focusStickerId, setFocusStickerId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [navigationMode, setNavigationMode] = useState<NavigationMode>('cursor')
  const [resetToCursorToken, setResetToCursorToken] = useState(0)
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null)
  const [boardContextMenu, setBoardContextMenu] = useState<BoardContextMenu | null>(null)
  const [arrows, setArrows] = useState<Arrow[]>([])
  const [layerOrder, setLayerOrder] = useState<string[]>([])
  const [selectedArrowId, setSelectedArrowId] = useState<string | null>(null)
  const [arrowDrag, setArrowDrag] = useState<ArrowDrag | null>(null)
  const [arrowPointer, setArrowPointer] = useState<Point | null>(null)
  const [snapAnchor, setSnapAnchor] = useState<Anchor | null>(null)

  const allObjectIds = useMemo(() => [
    ...drawings.map((item) => item.id),
    ...stickers.map((item) => item.id),
    ...tables.map((item) => item.id),
    ...texts.map((item) => item.id),
    ...arrows.map((item) => item.id),
  ], [drawings, stickers, tables, texts, arrows])
  const orderedObjectIds = useMemo(() => normalizeLayerOrder(layerOrder, allObjectIds), [layerOrder, allObjectIds])
  const objectLayers = useMemo(() => new Map(orderedObjectIds.map((id, index) => [id, index + 1])), [orderedObjectIds])
  const selectedLayerIds = useMemo(() => selectedTableId ? [selectedTableId]
    : selectedArrowId ? [selectedArrowId]
    : selectedDrawingId ? [selectedDrawingId]
      : selectedStickerId ? [selectedStickerId]
        : multiSelectedIds.length ? multiSelectedIds
          : selectedId ? [selectedId] : [],
  [selectedTableId, selectedArrowId, selectedDrawingId, selectedStickerId, multiSelectedIds, selectedId])
  const changeObjectLayer = (ids: string[], action: LayerAction) => {
    setLayerOrder((current) => reorderLayers(normalizeLayerOrder(current, allObjectIds), ids, action))
  }

  const addStickerAtClient = (sticker: StickerStyle, clientX: number, clientY: number) => {
    const board = boardRef.current
    const view = viewRef.current
    if (!board || !view) return
    const bounds = board.getBoundingClientRect()
    const centerX = (clientX - bounds.left - view.x) / view.scale
    const centerY = (clientY - bounds.top - view.y) / view.scale
    const id = crypto.randomUUID()
    setStickers((current) => [...current, {
      ...sticker,
      id,
      x: Math.max(0, Math.min(BOARD_WIDTH - INITIAL_STICKER_SIZE, centerX - INITIAL_STICKER_SIZE / 2)),
      y: Math.max(0, Math.min(BOARD_HEIGHT - INITIAL_STICKER_SIZE, centerY - INITIAL_STICKER_SIZE / 2)),
      width: INITIAL_STICKER_SIZE,
      height: INITIAL_STICKER_SIZE,
      html: '',
      fontSize: 16,
      align: 'center',
    }])
    setSelectedStickerId(id)
    setSelectedDrawingId(null)
    setSelectedId(null)
    setMultiSelectedIds([])
    setSelectedArrowId(null)
  }

  const connectableItems = [...texts, ...stickers]
  textsRef.current = texts
  stickersRef.current = stickers
  tablesRef.current = tables
  drawingsRef.current = drawings
  connectableItemsRef.current = connectableItems
  arrowsRef.current = arrows
  arrowDragRef.current = arrowDrag
  selectedIdRef.current = selectedId

  const geometryTextKey = JSON.stringify(connectableItems.map(({ id, x, y, width, height }) =>
    [id, x, y, width, height]))
  const draggingArrowId = arrowDrag?.active ? arrowDrag.arrowId : null
  const arrowGeometries = useMemo(() => {
    const previous = arrowGeometryCacheRef.current
    const next = new Map<string, { arrow: Arrow; textKey: string; avoidObstacles: boolean;
      geometry: ReturnType<typeof arrowGeometry> }>()
    const geometries = new Map<string, ReturnType<typeof arrowGeometry>>()
    for (const arrow of arrows) {
      const cached = previous.get(arrow.id)
      const avoidObstacles = draggingArrowId !== arrow.id
      const sameShape = cached?.arrow.tail === arrow.tail && cached.arrow.head === arrow.head
        && cached.arrow.bend === arrow.bend && cached.arrow.bendOffset === arrow.bendOffset
        && cached.arrow.bendEdited === arrow.bendEdited && cached.arrow.shape === arrow.shape
        && cached.arrow.curveBends === arrow.curveBends && cached.arrow.pendingStraightBend === arrow.pendingStraightBend
        && cached.arrow.tailEnd === arrow.tailEnd
      const geometry = sameShape && cached?.textKey === geometryTextKey && cached.avoidObstacles === avoidObstacles
        ? cached.geometry
        : arrowGeometry(arrow.tail, arrow.head, arrow.bend, connectableItems, arrow.bendEdited, arrow.bendOffset,
          avoidObstacles, arrow.shape, arrow.curveBends, arrow.pendingStraightBend, arrow.tailEnd)
      next.set(arrow.id, { arrow, textKey: geometryTextKey, avoidObstacles, geometry })
      geometries.set(arrow.id, geometry)
    }
    arrowGeometryCacheRef.current = next
    return geometries
  }, [arrows, geometryTextKey, draggingArrowId])
  arrowGeometriesRef.current = arrowGeometries

  useEffect(() => {
    const activeIds = new Set([...multiSelectedIds, selectedId, editingId])
    for (const arrow of arrows) {
      if (arrow.tail.textId) activeIds.add(arrow.tail.textId)
      if (arrow.head.textId) activeIds.add(arrow.head.textId)
    }
    if (arrowDrag || selectedId) texts.forEach((item) => activeIds.add(item.id))
    setTexts((current) => {
      const remaining = current.filter((item) => {
        if (activeIds.has(item.id)) return true
        const editorText = editorRefs.current.get(item.id)?.textContent
        if (editorText !== undefined) return Boolean(editorText.trim())
        const savedText = document.createElement('div')
        savedText.innerHTML = item.html
        return Boolean(savedText.textContent?.trim())
      })
      return remaining.length === current.length ? current : remaining
    })
  }, [selectedId, editingId, multiSelectedIds, arrows, arrowDrag])

  useEffect(() => {
    if (!arrowDrag) return
    let moveFrame: number | null = null
    let latestMove: { x: number; y: number } | null = null
    let dragActivated = Boolean(arrowDrag.active)
    const occupiedForDrag = () => {
      const occupied = occupiedConnectorKeys(arrowsRef.current, arrowDrag.arrowId)
      if (arrowDrag.kind === 'new' && arrowDrag.tail?.textId && arrowDrag.tail.side) {
        occupied.add(`${arrowDrag.tail.textId}:${arrowDrag.tail.side}`)
      }
      return occupied
    }
    const applyMove = (clientX: number, clientY: number) => {
      const board = boardRef.current
      const view = viewRef.current
      if (!board || !view) return
      const bounds = board.getBoundingClientRect()
      const point = { x: (clientX - bounds.left - view.x) / view.scale, y: (clientY - bounds.top - view.y) / view.scale }
      const target: Anchor = arrowDrag.kind === 'bend' ? point
        : arrowTarget(point, connectableItemsRef.current, view.scale, undefined, occupiedForDrag())
      const snap = target.textId ? target : null
      if (arrowDrag.kind === 'new') setArrowPointer(target)
      if (arrowDrag.kind !== 'bend') setSnapAnchor(snap)
      if (arrowDrag.kind === 'bend' && arrowDrag.arrowId) {
        setArrows((current) => current.map((arrow) => arrow.id === arrowDrag.arrowId
          ? moveArrowBend(arrow, point, arrowDrag.bendIndex, connectableItemsRef.current)
          : arrow))
      } else if (arrowDrag.kind !== 'new' && arrowDrag.arrowId) {
        const endpoint = target
        setArrows((current) => current.map((arrow) => {
          if (arrow.id !== arrowDrag.arrowId) return arrow
          const next = { ...arrow, [arrowDrag.kind]: endpoint }
          return next.bendEdited ? next : { ...next, bend: initialBend(
            resolveArrowHead(next.tail, connectableItemsRef.current), resolveArrowShaftEnd(next.tail, next.head, connectableItemsRef.current), next.tail.side, next.head.side) }
        }))
      }
    }
    const resetEndpointBend = () => {
      if ((arrowDrag.kind !== 'tail' && arrowDrag.kind !== 'head') || !arrowDrag.arrowId) return
      setArrows((current) => current.map((arrow) => {
        if (arrow.id !== arrowDrag.arrowId) return arrow
        const start = resolveArrowHead(arrow.tail, connectableItemsRef.current)
        const end = resolveArrowShaftEnd(arrow.tail, arrow.head, connectableItemsRef.current)
        return { ...arrow, bend: initialBend(start, end, arrow.tail.side, arrow.head.side),
          bendEdited: false, bendOffset: undefined }
      }))
    }
    const onMove = (event: PointerEvent) => {
      if (arrowDrag.pointerId !== undefined && event.pointerId !== arrowDrag.pointerId) return
      if (!dragActivated) {
        const start = arrowDrag.startClient
        if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) < ARROW_DRAG_THRESHOLD) return
        dragActivated = true
        resetEndpointBend()
        setArrowDrag({ ...arrowDrag, active: true })
        applyMove(event.clientX, event.clientY)
        return
      }
      latestMove = { x: event.clientX, y: event.clientY }
      if (moveFrame !== null) return
      moveFrame = window.requestAnimationFrame(() => {
        moveFrame = null
        if (latestMove) applyMove(latestMove.x, latestMove.y)
        latestMove = null
      })
    }
    const finish = (clientX: number, clientY: number) => {
      if (moveFrame !== null) window.cancelAnimationFrame(moveFrame)
      moveFrame = null
      latestMove = null
      const board = boardRef.current
      const view = viewRef.current
      if (!board || !view) { setArrowDrag(null); return }
      const bounds = board.getBoundingClientRect()
      const point = { x: (clientX - bounds.left - view.x) / view.scale, y: (clientY - bounds.top - view.y) / view.scale }
      const target: Anchor = arrowDrag.kind === 'bend' ? point
        : arrowTarget(point, connectableItemsRef.current, view.scale, undefined, occupiedForDrag())
      if (arrowDrag.kind === 'new' && arrowDrag.tail) {
        const tail = arrowDrag.tail
        const head: Anchor = target
        const start = resolveArrowHead(tail, connectableItemsRef.current)
        if (Math.hypot(start.x - head.x, start.y - head.y) > 6) {
          const id = crypto.randomUUID()
          const target = resolveArrowShaftEnd(tail, head, connectableItemsRef.current)
          setArrows((current) => [...current, { id, tail, head,
            bend: initialBend(start, target, tail.side, head.side), color: '#272727',
            tailEnd: 'none', headEnd: 'arrow' }])
          setSelectedArrowId(id)
          setSelectedId(null)
          setSelectedStickerId(null)
          setSelectedDrawingId(null)
          setMultiSelectedIds([])
          setEditingId(null)
        }
      } else if (arrowDrag.kind === 'bend' && arrowDrag.arrowId) {
        setArrows((current) => current.map((arrow) => arrow.id === arrowDrag.arrowId
          ? moveArrowBend(arrow, point, arrowDrag.bendIndex, connectableItemsRef.current, true)
          : arrow))
      } else if (arrowDrag.arrowId) {
        const endpoint = target
        setArrows((current) => current.map((arrow) => {
          if (arrow.id !== arrowDrag.arrowId) return arrow
          const next = { ...arrow, [arrowDrag.kind]: endpoint }
          return next.bendEdited ? next : { ...next, bend: initialBend(
            resolveArrowHead(next.tail, connectableItemsRef.current), resolveArrowShaftEnd(next.tail, next.head, connectableItemsRef.current), next.tail.side, next.head.side) }
        }))
      }
      setArrowDrag(null)
      setArrowPointer(null)
      setSnapAnchor(null)
    }
    const onUp = (event: PointerEvent) => {
      if (arrowDrag.pointerId !== undefined && event.pointerId !== arrowDrag.pointerId) return
      const start = arrowDrag.startClient
      if (!dragActivated && (!start
        || Math.hypot(event.clientX - start.x, event.clientY - start.y) < ARROW_DRAG_THRESHOLD)) {
        if (moveFrame !== null) window.cancelAnimationFrame(moveFrame)
        moveFrame = null
        latestMove = null
        setArrowDrag(null)
        return
      }
      if (!dragActivated) resetEndpointBend()
      finish(event.clientX, event.clientY)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      if (moveFrame !== null) window.cancelAnimationFrame(moveFrame)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [arrowDrag])

  const startArrow = (id: string, side: ConnectorSide, startClient: Point, pointerId: number) => {
    if (arrowDrag) return
    if (occupiedConnectorKeys(arrows).has(`${id}:${side}`)) return
    const item = connectableItemsRef.current.find((object) => object.id === id)
    if (!item) return
    const point = anchorPoint(item, side)
    const tail: Anchor = { ...point, textId: id, side }
    setArrowDrag({ kind: 'new', tail, startClient, pointerId })
  }
  const viewportHeight = () => boardRef.current?.clientHeight ?? 0

  const changeText = (id: string, changes: Partial<TextItem>) => {
    ensureTextVisibleIdsRef.current.add(id)
    pendingTextChangeBaseRef.current = textsRef.current
    setTexts((current) => current.map((item) => item.id === id ? applyTextChanges(item, changes, viewRef.current, viewportHeight()) : item))
  }

  const changeSelectedTexts = (changes: Partial<TextItem>) => {
    multiSelectedIds.forEach((id) => ensureTextVisibleIdsRef.current.add(id))
    pendingTextChangeBaseRef.current = textsRef.current
    const ids = new Set(multiSelectedIds)
    setTexts((current) => current.map((item) => ids.has(item.id) ? applyTextChanges(item, changes, viewRef.current, viewportHeight()) : item))
  }

  const captureGroupTransform = () => {
    const selected = new Set(multiSelectedIds)
    groupTransformStartRef.current = {
      texts: texts.filter((item) => selected.has(item.id)).map((item) => ({ ...item })),
      stickers: stickers.filter((item) => selected.has(item.id)).map((item) => ({ ...item })),
      tables: tables.filter((item) => selected.has(item.id)).map((item) => ({ ...item })),
      drawings: drawings.filter((item) => selected.has(item.id)).map((item) => ({ ...item,
        points: item.points.map((point) => ({ ...point })) })),
      arrows: arrows.filter((item) => selected.has(item.id)).map((item) => ({ ...item,
        tail: { ...item.tail }, head: { ...item.head }, bend: { ...item.bend },
        curveBends: item.curveBends?.map((point) => ({ ...point })) as [Point, Point, Point] | undefined,
        pendingStraightBend: item.pendingStraightBend ? { ...item.pendingStraightBend } : undefined })),
    }
  }

  const moveSelectedObjects = (startItems: GroupSelectionItem[], requestedDx: number, requestedDy: number) => {
    const snapshot = groupTransformStartRef.current
    if (!snapshot?.texts.length && !snapshot?.stickers.length && !snapshot?.tables.length
      && !snapshot?.drawings.length && !snapshot?.arrows.length) return
    const left = Math.min(...startItems.map((item) => item.x))
    const top = Math.min(...startItems.map((item) => item.y))
    const right = Math.max(...startItems.map((item) => item.x + item.width))
    const bottom = Math.max(...startItems.map((item) => item.y + item.height))
    const dx = Math.max(-left, Math.min(BOARD_WIDTH - right, requestedDx))
    const dy = Math.max(-top, Math.min(BOARD_HEIGHT - bottom, requestedDy))
    const textStarts = new Map(snapshot.texts.map((item) => [item.id, item]))
    const stickerStarts = new Map(snapshot.stickers.map((item) => [item.id, item]))
    const tableStarts = new Map(snapshot.tables.map((item) => [item.id, item]))
    const drawingStarts = new Map(snapshot.drawings.map((item) => [item.id, item]))
    const arrowStarts = new Map(snapshot.arrows.map((item) => [item.id, item]))
    setTexts((current) => current.map((item) => {
      const start = textStarts.get(item.id)
      return start ? { ...item, x: start.x + dx, y: start.y + dy } : item
    }))
    setStickers((current) => current.map((item) => {
      const start = stickerStarts.get(item.id)
      return start ? { ...item, x: start.x + dx, y: start.y + dy } : item
    }))
    setTables((current) => current.map((item) => {
      const start = tableStarts.get(item.id)
      return start ? { ...item, x: start.x + dx, y: start.y + dy } : item
    }))
    setDrawings((current) => current.map((item) => {
      const start = drawingStarts.get(item.id)
      return start ? { ...item, x: start.x + dx, y: start.y + dy } : item
    }))
    const movePoint = (point: Point) => ({ x: point.x + dx, y: point.y + dy })
    setArrows((current) => current.map((item) => {
      const start = arrowStarts.get(item.id)
      if (!start) return item
      return { ...start,
        tail: start.tail.textId ? start.tail : { ...start.tail, ...movePoint(start.tail) },
        head: start.head.textId ? start.head : { ...start.head, ...movePoint(start.head) },
        bend: movePoint(start.bend), bendOffset: undefined, bendEdited: true,
        curveBends: start.curveBends?.map(movePoint) as [Point, Point, Point] | undefined,
        pendingStraightBend: start.pendingStraightBend ? movePoint(start.pendingStraightBend) : undefined }
    }))
  }

  const scaleSelectedObjects = (_startItems: GroupSelectionItem[], anchorX: number, anchorY: number, factor: number) => {
    const snapshot = groupTransformStartRef.current
    if (!snapshot) return
    const scalePoint = (point: Point) => ({ x: anchorX + (point.x - anchorX) * factor,
      y: anchorY + (point.y - anchorY) * factor })
    const textStarts = new Map(snapshot.texts.map((item) => [item.id, item]))
    const stickerStarts = new Map(snapshot.stickers.map((item) => [item.id, item]))
    const tableStarts = new Map(snapshot.tables.map((item) => [item.id, item]))
    const drawingStarts = new Map(snapshot.drawings.map((item) => [item.id, item]))
    const arrowStarts = new Map(snapshot.arrows.map((item) => [item.id, item]))
    const selectedConnectables = new Set([...snapshot.texts, ...snapshot.stickers].map((item) => item.id))
    setTexts((current) => current.map((item) => {
      const start = textStarts.get(item.id)
      if (!start) return item
      const position = scalePoint(start)
      return { ...item, ...position, width: start.width * factor, height: start.height * factor,
        baseHeight: (start.baseHeight ?? start.height) * factor,
        fontSize: Math.round(start.fontSize * factor * 10) / 10 }
    }))
    setStickers((current) => current.map((item) => {
      const start = stickerStarts.get(item.id)
      if (!start) return item
      return { ...item, ...scalePoint(start), width: start.width * factor, height: start.height * factor }
    }))
    setTables((current) => current.map((item) => {
      const start = tableStarts.get(item.id)
      return start ? { ...item, ...scalePoint(start), cellWidth: start.cellWidth * factor,
        columnWidths: tableColumnWidths(start).map((width) => width * factor),
        cellHeight: start.cellHeight * factor, rowHeights: start.rowHeights.map((height) => height * factor),
        rowMinHeights: start.rowMinHeights?.map((height) => height * factor) } : item
    }))
    setDrawings((current) => current.map((item) => {
      const start = drawingStarts.get(item.id)
      if (!start) return item
      return { ...item, ...scalePoint(start), width: start.width * factor, height: start.height * factor,
        strokeWidth: start.strokeWidth * factor,
        points: start.points.map((point) => ({ x: point.x * factor, y: point.y * factor })) }
    }))
    setArrows((current) => current.map((item) => {
      const start = arrowStarts.get(item.id)
      if (!start) return item
      const scaleAnchor = (anchor: Anchor) => anchor.textId && !selectedConnectables.has(anchor.textId)
        ? anchor : { ...anchor, ...scalePoint(anchor) }
      return { ...start, tail: scaleAnchor(start.tail), head: scaleAnchor(start.head),
        bend: scalePoint(start.bend), bendOffset: undefined, bendEdited: true,
        curveBends: start.curveBends?.map(scalePoint) as [Point, Point, Point] | undefined,
        pendingStraightBend: start.pendingStraightBend ? scalePoint(start.pendingStraightBend) : undefined }
    }))
  }

  const changeTextFromBox = (id: string, changes: Partial<TextItem>) => {
    if (!multiSelectedIds.includes(id) || changes.x === undefined || changes.y === undefined || Object.keys(changes).length !== 2) {
      changeText(id, changes)
      return
    }
    multiSelectedIds.forEach((selected) => ensureTextVisibleIdsRef.current.add(selected))
    pendingTextChangeBaseRef.current = textsRef.current
    const ids = new Set(multiSelectedIds)
    setTexts((current) => {
      const source = current.find((item) => item.id === id)
      const group = current.filter((item) => ids.has(item.id))
      if (!source || !group.length) return current
      const dx = Math.max(Math.max(...group.map((item) => -item.x)), Math.min(Math.min(...group.map((item) => BOARD_WIDTH - item.x - item.width)), changes.x! - source.x))
      const { top, bottom } = visibleVerticalBounds(viewRef.current, viewportHeight())
      const minDy = Math.max(...group.map((item) => top - item.y))
      const maxDy = Math.min(...group.map((item) => bottom - item.y - item.height))
      const dy = minDy <= maxDy ? Math.max(minDy, Math.min(maxDy, changes.y! - source.y)) : maxDy
      return current.map((item) => ids.has(item.id) ? constrainText({ ...item, x: item.x + dx, y: item.y + dy }, viewRef.current, viewportHeight()) : item)
    })
  }

  const clearTextSelection = () => {
    selectionRef.current = null
    window.getSelection()?.removeAllRanges()
  }

  const applyObjectSelection = (ids: string[]) => {
    setSelectedTableCells([])
    const existing = new Set(allObjectIds)
    const unique = [...new Set(ids)].filter((id) => existing.has(id))
    const single = unique.length === 1 ? unique[0] : null
    setMultiSelectedIds(unique.length > 1 ? unique : [])
    setSelectedId(single && texts.some((item) => item.id === single) ? single : null)
    setSelectedStickerId(single && stickers.some((item) => item.id === single) ? single : null)
    setSelectedTableId(single && tables.some((item) => item.id === single) ? single : null)
    setSelectedDrawingId(single && drawings.some((item) => item.id === single) ? single : null)
    setSelectedArrowId(single && arrows.some((item) => item.id === single) ? single : null)
    setEditingId(null)
    setFocusId(null)
    setEditingStickerId(null)
    setFocusStickerId(null)
  }

  const toggleObjectSelection = (id: string) => {
    clearTextSelection()
    const current = multiSelectedIds.length ? multiSelectedIds
      : selectedId ? [selectedId]
        : selectedTableId ? [selectedTableId]
        : selectedStickerId ? [selectedStickerId]
          : selectedDrawingId ? [selectedDrawingId]
            : selectedArrowId ? [selectedArrowId] : []
    applyObjectSelection(current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  const selectText = (id: string, additive = false) => {
    if (additive) { toggleObjectSelection(id); return }
    setSelectedTableId(null)
    setSelectedTableCells([])
    setSelectedArrowId(null)
    setSelectedStickerId(null)
    setSelectedDrawingId(null)
    if (selectedId !== id) {
      const previousEditor = selectedId ? editorRefs.current.get(selectedId) : null
      if (previousEditor && document.activeElement === previousEditor) previousEditor.blur()
      selectionRef.current = null
      setEditingId(null)
      setFocusId(null)
      const selection = window.getSelection()
      if (previousEditor && selection?.anchorNode && previousEditor.contains(selection.anchorNode)) {
        selection.removeAllRanges()
      }
    }
    setSelectedId(id)
    setMultiSelectedIds([])
  }

  const selectSticker = (id: string, additive = false) => {
    if (additive) { toggleObjectSelection(id); return }
    setSelectedTableId(null)
    setSelectedTableCells([])
    const editor = editingId ? editorRefs.current.get(editingId) : null
    if (editor && document.activeElement === editor) editor.blur()
    clearTextSelection()
    setSelectedArrowId(null)
    setSelectedDrawingId(null)
    setSelectedId(null)
    setMultiSelectedIds([])
    setEditingId(null)
    setFocusId(null)
    setSelectedStickerId(id)
  }

  const selectDrawing = (id: string, additive = false) => {
    if (additive) { toggleObjectSelection(id); return }
    setSelectedTableId(null)
    setSelectedTableCells([])
    clearTextSelection()
    setSelectedArrowId(null)
    setSelectedStickerId(null)
    setSelectedId(null)
    setMultiSelectedIds([])
    setEditingId(null)
    setFocusId(null)
    setSelectedDrawingId(id)
  }

  const selectArrow = (id: string, additive = false) => {
    if (additive) { toggleObjectSelection(id); return }
    setSelectedTableId(null)
    setSelectedTableCells([])
    clearTextSelection()
    setSelectedArrowId(id)
    setSelectedStickerId(null)
    setSelectedDrawingId(null)
    setSelectedId(null)
    setMultiSelectedIds([])
    setEditingId(null)
    setFocusId(null)
  }

  const changeDrawing = (id: string, changes: Partial<DrawingItem>) => {
    setDrawings((current) => current.map((drawing) => drawing.id === id ? { ...drawing, ...changes } : drawing))
  }

  const changeDrawingStrokeWidth = (id: string, width: number) => {
    setDrawings((current) => current.map((drawing) => {
      if (drawing.id !== id || drawing.strokeWidth === width) return drawing
      const resized = drawingFromDraft({ color: drawing.color, width, preset: 0,
        points: drawing.points.map((point) => ({ x: drawing.x + point.x, y: drawing.y + point.y })) })
      return resized ? { ...resized, id: drawing.id } : drawing
    }))
  }

  const editSticker = (id: string) => {
    selectSticker(id)
    setEditingStickerId(id)
    setFocusStickerId(id)
  }

  const changeSticker = (id: string, changes: Partial<StickerItem>) => {
    setStickers((current) => current.map((sticker) => sticker.id === id ? { ...sticker, ...changes } : sticker))
  }

  const selectTable = (id: string, clearCells = true) => {
    if (clearCells && document.activeElement instanceof HTMLTextAreaElement
      && document.activeElement.classList.contains('board-table__cell')) document.activeElement.blur()
    clearTextSelection()
    setSelectedTableId(id)
    if (clearCells) {
      setSelectedTableCells([])
      setSelectedTableLine(null)
    }
    setSelectedId(null)
    setSelectedStickerId(null)
    setSelectedDrawingId(null)
    setSelectedArrowId(null)
    setMultiSelectedIds([])
    setEditingId(null)
    setEditingStickerId(null)
  }

  const selectTableCell = (id: string, row: number, column: number, additive: boolean, range: boolean) => {
    const previousTable = selectedTableId
    selectTable(id, false)
    setSelectedTableLine(null)
    const table = tables.find((item) => item.id === id)
    const anchorKey = (y: number, x: number) => table?.cells[y]?.[x]?.mergedInto ?? `${y}:${x}`
    const key = anchorKey(row, column)
    const anchor = tableCellAnchorRef.current
    if (range && anchor?.tableId === id) {
      const next = new Set<string>()
      for (let y = Math.min(anchor.row, row); y <= Math.max(anchor.row, row); y += 1) {
        for (let x = Math.min(anchor.column, column); x <= Math.max(anchor.column, column); x += 1) next.add(anchorKey(y, x))
      }
      setSelectedTableCells([...next])
    } else if (additive && previousTable === id) {
      setSelectedTableCells((current) => current.includes(key) ? current.filter((cell) => cell !== key) : [...current, key])
      tableCellAnchorRef.current = { tableId: id, row, column }
    } else {
      setSelectedTableCells([key])
      tableCellAnchorRef.current = { tableId: id, row, column }
    }
  }

  const selectTableLine = (id: string, axis: 'row' | 'column', index: number) => {
    const table = tables.find((item) => item.id === id)
    if (!table) return
    if (document.activeElement instanceof HTMLTextAreaElement
      && document.activeElement.classList.contains('board-table__cell')) document.activeElement.blur()
    selectTable(id, false)
    const keys = axis === 'row'
      ? table.cells[index].map((_, column) => `${index}:${column}`)
      : table.cells.map((_, row) => `${row}:${index}`)
    const anchors = [...new Set(keys.map((key) => {
      const [row, column] = key.split(':').map(Number)
      return table.cells[row][column].mergedInto ?? key
    }))]
    setSelectedTableCells(anchors)
    setSelectedTableLine({ axis, index })
    const [row, column] = anchors[0].split(':').map(Number)
    tableCellAnchorRef.current = { tableId: id, row, column }
  }

  const changeTable = (id: string, changes: Partial<TableItem>) => {
    setTables((current) => current.map((table) => table.id === id ? { ...table, ...changes } : table))
  }

  const changeTableRowHeight = (id: string, row: number, height: number) => {
    setTables((current) => current.map((table) => {
      if (table.id !== id || Math.abs(table.rowHeights[row] - height) < 1) return table
      const rowHeights = [...table.rowHeights]
      rowHeights[row] = height
      const totalHeight = rowHeights.reduce((total, currentHeight) => total + currentHeight, 0)
      return { ...table, rowHeights, y: Math.max(0, Math.min(table.y, BOARD_HEIGHT - totalHeight)) }
    }))
  }

  const changeTableFontSize = (id: string, fontSize: number) => {
    setTables((current) => current.map((table) => table.id === id
      ? { ...table, fontSize: Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, fontSize)) } : table))
  }

  const changeSelectedTableCells = (changes: Partial<TableCellData>) => {
    if (!selectedTableId || !selectedTableCells.length) return
    const selected = new Set(selectedTableCells)
    setTables((current) => current.map((table) => table.id === selectedTableId
      ? { ...table, cells: table.cells.map((row, rowIndex) => row.map((cell, columnIndex) =>
        selected.has(`${rowIndex}:${columnIndex}`) ? { ...cell, ...changes } : cell)) }
      : table))
  }

  const mergeSelectedTableCells = () => {
    if (!selectedTableId) return
    const table = tables.find((item) => item.id === selectedTableId)
    if (!table) return
    const merged = mergeTableCells(table, selectedTableCells)
    if (!merged) return
    changeTable(table.id, { cells: merged.cells, rowHeights: merged.rowHeights })
    setSelectedTableCells([merged.anchor])
    setSelectedTableLine(null)
    tableCellAnchorRef.current = { tableId: table.id, row: Number(merged.anchor.split(':')[0]),
      column: Number(merged.anchor.split(':')[1]) }
  }

  const splitSelectedTableCells = () => {
    if (!selectedTableId) return
    const table = tables.find((item) => item.id === selectedTableId)
    if (!table) return
    const split = splitTableCells(table, selectedTableCells)
    if (!split) return
    changeTable(table.id, { cells: split.cells })
    setSelectedTableCells(split.selection)
    setSelectedTableLine(null)
  }

  const deleteTable = (id: string) => {
    setTables((current) => current.filter((table) => table.id !== id))
    setSelectedTableId(null)
    setSelectedTableCells([])
    setSelectedTableLine(null)
  }

  const deleteSelectedTableLine = () => {
    if (!selectedTableId || !selectedTableLine) return
    const table = tables.find((item) => item.id === selectedTableId)
    if (!table) return
    const next = removeTableLine(table, selectedTableLine)
    if (next) {
      setTables((current) => current.map((item) => item.id === table.id ? next : item))
      setSelectedTableCells([])
      setSelectedTableLine(null)
      tableCellAnchorRef.current = null
    } else deleteTable(table.id)
  }

  const saveStickerSelection = () => {
    const selection = window.getSelection()
    if (selection?.rangeCount) stickerSelectionRef.current = selection.getRangeAt(0).cloneRange()
  }

  const formatSticker = (command: FormatCommand) => {
    if (!selectedStickerId) return
    const editor = stickerEditorRefs.current.get(selectedStickerId)
    const selection = window.getSelection()
    const currentRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null
    const range = currentRange && !currentRange.collapsed && editor?.contains(currentRange.commonAncestorContainer)
      ? currentRange
      : stickerSelectionRef.current && !stickerSelectionRef.current.collapsed
        && editor?.contains(stickerSelectionRef.current.commonAncestorContainer)
        ? stickerSelectionRef.current.cloneRange()
        : null
    if (editor?.isContentEditable && selection && range) {
      editor.focus()
      selection.removeAllRanges()
      selection.addRange(range)
      document.execCommand(command)
      changeSticker(selectedStickerId, { html: editor.innerHTML })
      saveStickerSelection()
      return
    }
    const item = stickers.find((sticker) => sticker.id === selectedStickerId)
    if (item) changeSticker(selectedStickerId, { [command]: !item[command] })
  }

  const deleteSticker = (id: string) => {
    setStickers((current) => current.filter((sticker) => sticker.id !== id))
    setArrows((current) => current.filter((arrow) => arrow.tail.textId !== id && arrow.head.textId !== id))
    setSelectedStickerId((current) => current === id ? null : current)
    setEditingStickerId((current) => current === id ? null : current)
    setFocusStickerId((current) => current === id ? null : current)
  }

  const editText = (id: string) => {
    selectText(id)
    setEditingId(id)
    setFocusId(id)
  }

  const commitText = (id: string, html: string, isEmpty: boolean) => {
    if (isEmpty) {
      setEditingId((current) => current === id ? null : current)
      setFocusId((current) => current === id ? null : current)
      requestAnimationFrame(() => {
        if (arrowDragRef.current || (selectedIdRef.current && selectedIdRef.current !== id)
          || arrowsRef.current.some((arrow) => arrow.tail.textId === id || arrow.head.textId === id)
          || editorRefs.current.get(id)?.textContent?.trim()) return
        clearTextSelection()
        setTexts((current) => current.filter((item) => item.id !== id))
        setSelectedId((current) => current === id ? null : current)
        setMultiSelectedIds((current) => current.filter((selected) => selected !== id))
        editorRefs.current.delete(id)
      })
    } else {
      changeText(id, { html })
    }
  }

  const saveSelection = () => {
    const selection = window.getSelection()
    if (selection?.rangeCount) selectionRef.current = selection.getRangeAt(0).cloneRange()
  }

  const toggleTextFormat = (ids: string[], key: FormatCommand) => {
    const selectedIds = new Set(ids)
    setTexts((current) => {
      const selected = current.filter((item) => selectedIds.has(item.id))
      const nextValue = !selected.every((item) => Boolean(item[key]))
      return current.map((item) => selectedIds.has(item.id) ? { ...item, [key]: nextValue } : item)
    })
  }

  const formatText = (command: string, value?: string) => {
    const key = command as FormatCommand
    if (!['bold', 'italic', 'underline', 'strikeThrough'].includes(key)) return
    if (multiSelectedIds.length) {
      toggleTextFormat(multiSelectedIds, key)
      return
    }
    if (!selectedId) return
    const editor = editorRefs.current.get(selectedId)
    if (!editor) return
    const selection = window.getSelection()
    const currentRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null
    const range = currentRange && !currentRange.collapsed && editor.contains(currentRange.commonAncestorContainer)
      ? currentRange
      : selectionRef.current && !selectionRef.current.collapsed
        && editor.contains(selectionRef.current.commonAncestorContainer)
        ? selectionRef.current.cloneRange()
        : null

    // Outside edit mode there is no editable selection for execCommand. Apply the
    // format to the block model instead; the same path also handles an editor with
    // only a caret and keeps whole-block formatting predictable.
    if (!editor.isContentEditable || !selection || !range) {
      toggleTextFormat([selectedId], key)
      selectionRef.current = null
      return
    }

    editor.focus()
    selection.removeAllRanges()
    selection.addRange(range)
    document.execCommand(command, false, value)
    changeText(selectedId, { html: editor.innerHTML })
    saveSelection()
  }

  const setTextColor = (color: string) => {
    if (multiSelectedIds.length) {
      multiSelectedIds.forEach((id) => ensureTextVisibleIdsRef.current.add(id))
      pendingTextChangeBaseRef.current = textsRef.current
      const ids = new Set(multiSelectedIds)
      setTexts((current) => current.map((item) => ids.has(item.id)
        ? { ...item, color, html: withoutInlineTextColors(item.html) }
        : item))
      selectionRef.current = null
      return
    }
    if (!selectedId) return
    const editor = editorRefs.current.get(selectedId)
    const selection = window.getSelection()
    const currentRange = selection?.rangeCount ? selection.getRangeAt(0) : null
    const range = currentRange && editor?.contains(currentRange.commonAncestorContainer)
      ? currentRange.collapsed ? null : currentRange.cloneRange()
      : selectionRef.current && !selectionRef.current.collapsed ? selectionRef.current : null
    if (editor?.isContentEditable && selection && range && !range.collapsed && editor.contains(range.commonAncestorContainer)) {
      editor.focus()
      selection.removeAllRanges()
      selection.addRange(range)
      if (document.execCommand('foreColor', false, color)) {
        changeText(selectedId, { html: editor.innerHTML })
        saveSelection()
        return
      }
    }
    if (editor?.isContentEditable) {
      clearInlineTextColors(editor)
      changeText(selectedId, { color, html: editor.innerHTML })
    } else {
      const item = textsRef.current.find((text) => text.id === selectedId)
      if (item) changeText(selectedId, { color, html: withoutInlineTextColors(item.html) })
    }
    selectionRef.current = null
  }

  const deleteSelectedTexts = () => {
    const ids = multiSelectedIds.length ? multiSelectedIds : selectedId ? [selectedId] : []
    if (!ids.length) return
    const deletedIds = new Set(ids)
    setTexts((current) => current.filter((item) => !deletedIds.has(item.id)))
    setArrows((current) => current.filter((arrow) =>
      !deletedIds.has(arrow.tail.textId ?? '') && !deletedIds.has(arrow.head.textId ?? '')))
    setSelectedId(null)
    setMultiSelectedIds([])
    setEditingId(null)
    setFocusId(null)
    selectionRef.current = null
    window.getSelection()?.removeAllRanges()
  }

  const deleteSelectedObjects = (ids: string[]) => {
    const deleted = new Set(ids)
    setTexts((current) => current.filter((item) => !deleted.has(item.id)))
    setStickers((current) => current.filter((item) => !deleted.has(item.id)))
    setTables((current) => current.filter((item) => !deleted.has(item.id)))
    setDrawings((current) => current.filter((item) => !deleted.has(item.id)))
    setArrows((current) => current.filter((arrow) => !deleted.has(arrow.id)
      && !deleted.has(arrow.tail.textId ?? '') && !deleted.has(arrow.head.textId ?? '')))
    setSelectedId(null)
    setSelectedStickerId(null)
    setSelectedTableId(null)
    setSelectedDrawingId(null)
    setSelectedArrowId(null)
    setMultiSelectedIds([])
    setEditingId(null)
    setFocusId(null)
    setEditingStickerId(null)
    setFocusStickerId(null)
    clearTextSelection()
  }

  const selectedObjectClipboard = (): ObjectClipboard | null => {
    if (selectedArrowId) return null
    if (selectedTableId) {
      const table = tables.find((item) => item.id === selectedTableId)
      return table ? { version: 1, texts: [], stickers: [], tables: [table], arrows: [], drawings: [] } : null
    }
    if (selectedStickerId) {
      const sticker = stickers.find((item) => item.id === selectedStickerId)
      return sticker ? {
        version: 1,
        texts: [],
        stickers: [{ ...sticker, html: stickerEditorRefs.current.get(sticker.id)?.innerHTML ?? sticker.html }],
        tables: [],
        arrows: [],
        drawings: [],
      } : null
    }
    if (selectedDrawingId) {
      const drawing = drawings.find((item) => item.id === selectedDrawingId)
      return drawing ? {
        version: 1,
        texts: [],
        stickers: [],
        tables: [],
        arrows: [],
        drawings: [{ ...drawing, points: drawing.points.map((point) => ({ ...point })) }],
      } : null
    }
    const ids = new Set(multiSelectedIds.length ? multiSelectedIds : selectedId ? [selectedId] : [])
    if (!ids.size) return null
    return {
      version: 1,
      texts: texts.filter((item) => ids.has(item.id)).map((item) => ({ ...item, html: editorRefs.current.get(item.id)?.innerHTML ?? item.html })),
      stickers: stickers.filter((item) => ids.has(item.id)).map((item) => ({ ...item,
        html: stickerEditorRefs.current.get(item.id)?.innerHTML ?? item.html })),
      tables: tables.filter((item) => ids.has(item.id)),
      arrows: [],
      drawings: drawings.filter((item) => ids.has(item.id)).map((item) => ({ ...item,
        points: item.points.map((point) => ({ ...point })) })),
    }
  }

  const writeObjectClipboard = (payload: ObjectClipboard) => {
    objectClipboardRef.current = payload
    pasteCountRef.current = 0
    const json = JSON.stringify(payload)
    const plainText = objectClipboardPlainText(payload)
    const copy = (event: ClipboardEvent) => {
      event.preventDefault()
      event.clipboardData?.setData(OBJECT_CLIPBOARD_TYPE, json)
      event.clipboardData?.setData('text/plain', plainText)
    }
    document.addEventListener('copy', copy, { capture: true, once: true })
    const copied = document.execCommand('copy')
    document.removeEventListener('copy', copy, true)
    if (!copied) void navigator.clipboard?.writeText(OBJECT_CLIPBOARD_PREFIX + json).catch(() => {})
  }

  const pasteObjects = (payload: ObjectClipboard) => {
    if (!payload.texts.length && !payload.stickers.length && !payload.tables.length && !payload.drawings.length) return
    const view = viewRef.current
    const offset = 24 * ++pasteCountRef.current / (view?.scale ?? 1)
    const sourceTexts = payload.texts
    const sourceStickers = payload.stickers
    const sourceTables = payload.tables
    const sourceDrawings = payload.drawings
    const bounds: Point[] = sourceTexts.flatMap((item) => [
      { x: item.x, y: item.y }, { x: item.x + item.width, y: item.y + item.height },
    ]).concat(sourceDrawings.flatMap((item) => [
      { x: item.x, y: item.y }, { x: item.x + item.width, y: item.y + item.height },
    ])).concat(sourceStickers.flatMap((item) => [
      { x: item.x, y: item.y }, { x: item.x + item.width, y: item.y + item.height },
    ])).concat(sourceTables.flatMap((item) => [
      { x: item.x, y: item.y },
      { x: item.x + tableWidth(item), y: item.y + tableHeight(item) },
    ]))
    const minX = Math.min(...bounds.map((point) => point.x))
    const maxX = Math.max(...bounds.map((point) => point.x))
    const minY = Math.min(...bounds.map((point) => point.y))
    const maxY = Math.max(...bounds.map((point) => point.y))
    const dx = Math.max(-minX, Math.min(BOARD_WIDTH - maxX, offset))
    const dy = Math.max(-minY, Math.min(BOARD_HEIGHT - maxY, offset))
    const idMap = new Map(sourceTexts.map((item) => [item.id, crypto.randomUUID()]))
    const newTexts = sourceTexts.map((item) => constrainText({ ...item, id: idMap.get(item.id)!, x: item.x + dx, y: item.y + dy }, view, viewportHeight()))
    const newStickers = sourceStickers.map((item) => ({ ...item, id: crypto.randomUUID(), x: item.x + dx, y: item.y + dy }))
    const newTables = sourceTables.map((item) => ({ ...item, id: crypto.randomUUID(), x: item.x + dx, y: item.y + dy,
      columnWidths: [...tableColumnWidths(item)], rowHeights: [...item.rowHeights],
      rowMinHeights: item.rowMinHeights ? [...item.rowMinHeights] : undefined,
      cells: item.cells.map((row) => row.map((cell) => ({ ...cell }))) }))
    const newDrawings = sourceDrawings.map((item) => ({ ...item, id: crypto.randomUUID(),
      x: item.x + dx, y: item.y + dy, points: item.points.map((point) => ({ ...point })) }))
    setTexts((current) => [...current, ...newTexts])
    setStickers((current) => [...current, ...newStickers])
    setTables((current) => [...current, ...newTables])
    setDrawings((current) => [...current, ...newDrawings])
    setEditingId(null)
    setFocusId(null)
    const newIds = [...newDrawings.map((item) => item.id), ...newStickers.map((item) => item.id),
      ...newTables.map((item) => item.id), ...newTexts.map((item) => item.id)]
    setMultiSelectedIds(newIds.length > 1 ? newIds : [])
    setSelectedId(newIds.length === 1 && newTexts.length === 1 ? newTexts[0].id : null)
    setSelectedDrawingId(newIds.length === 1 && newDrawings.length === 1 ? newDrawings[0].id : null)
    setSelectedStickerId(newIds.length === 1 && newStickers.length === 1 ? newStickers[0].id : null)
    setSelectedTableId(newIds.length === 1 && newTables.length === 1 ? newTables[0].id : null)
    setSelectedTableCells([])
    setSelectedTableLine(null)
    setEditingStickerId(null)
    setFocusStickerId(null)
    setSelectedArrowId(null)
  }

  useEffect(() => {
    const editableTarget = (target: EventTarget | null) => target instanceof HTMLElement
      && (target.isContentEditable || Boolean(target.closest('input, textarea, select')))
    const onCopy = (event: ClipboardEvent) => {
      const readOnlyTableCell = event.target instanceof HTMLTextAreaElement
        && event.target.classList.contains('board-table__cell') && event.target.readOnly
      if (event.defaultPrevented || (editableTarget(event.target) && !readOnlyTableCell) || navigationMode !== 'cursor') return
      if (selectedTableId) {
        const table = tables.find((item) => item.id === selectedTableId)
        if (!table) return
        event.preventDefault()
        if (selectedTableCells.length) {
          event.clipboardData?.setData('text/plain', tableClipboardText(table, selectedTableCells))
        } else {
          const payload = selectedObjectClipboard()
          if (!payload) return
          objectClipboardRef.current = payload
          pasteCountRef.current = 0
          event.clipboardData?.setData(OBJECT_CLIPBOARD_TYPE, JSON.stringify(payload))
          event.clipboardData?.setData('text/plain', objectClipboardPlainText(payload))
        }
        return
      }
      if (selectedArrowId) { event.preventDefault(); return }
      const payload = selectedObjectClipboard()
      if (!payload) return
      objectClipboardRef.current = payload
      const json = JSON.stringify(payload)
      event.preventDefault()
      event.clipboardData?.setData(OBJECT_CLIPBOARD_TYPE, json)
      event.clipboardData?.setData('text/plain', objectClipboardPlainText(payload))
      pasteCountRef.current = 0
    }
    const onPaste = (event: ClipboardEvent) => {
      const readOnlyTableCell = event.target instanceof HTMLTextAreaElement
        && event.target.classList.contains('board-table__cell') && event.target.readOnly
      if (event.defaultPrevented || (editableTarget(event.target) && !readOnlyTableCell) || navigationMode !== 'cursor') return
      const custom = event.clipboardData?.getData(OBJECT_CLIPBOARD_TYPE)
      const plain = event.clipboardData?.getData('text/plain')
      const payload = custom ? parseObjectClipboard(custom)
        : plain?.startsWith(OBJECT_CLIPBOARD_PREFIX) ? parseObjectClipboard(plain) : null
      if (!payload) return
      event.preventDefault()
      objectClipboardRef.current = payload
      pasteObjects(payload)
    }
    window.addEventListener('copy', onCopy)
    window.addEventListener('paste', onPaste)
    return () => { window.removeEventListener('copy', onCopy); window.removeEventListener('paste', onPaste) }
  }, [texts, stickers, tables, arrows, drawings, selectedId, multiSelectedIds, selectedStickerId,
    selectedTableId, selectedTableCells, selectedArrowId, selectedDrawingId, navigationMode])

  useEffect(() => {
    if (!boardContextMenu) return
    const close = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.board-context-menu')) setBoardContextMenu(null)
    }
    const closeOnKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setBoardContextMenu(null) }
    const closeOnResize = () => setBoardContextMenu(null)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', closeOnKey)
    window.addEventListener('resize', closeOnResize)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', closeOnKey)
      window.removeEventListener('resize', closeOnResize)
    }
  }, [boardContextMenu])

  useEffect(() => {
    const ids = multiSelectedIds.length ? multiSelectedIds : selectedId ? [selectedId] : []
    if (!ids.length || navigationMode !== 'cursor') return

    const onDelete = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && multiSelectedIds.length) {
        event.preventDefault()
        applyObjectSelection([])
        return
      }
      if (event.key !== 'Delete' || event.defaultPrevented) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return

      event.preventDefault()
      if (multiSelectedIds.length) deleteSelectedObjects(multiSelectedIds)
      else deleteSelectedTexts()
    }

    window.addEventListener('keydown', onDelete)
    return () => window.removeEventListener('keydown', onDelete)
  }, [selectedId, multiSelectedIds, navigationMode])

  useEffect(() => {
    if (!selectedArrowId) return
    const onArrowKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSelectedArrowId(null); return }
      if (event.key !== 'Delete') return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return
      event.preventDefault()
      setArrows((current) => current.filter((arrow) => arrow.id !== selectedArrowId))
      setSelectedArrowId(null)
    }
    window.addEventListener('keydown', onArrowKey)
    return () => window.removeEventListener('keydown', onArrowKey)
  }, [selectedArrowId])

  useEffect(() => {
    if (!selectedStickerId || navigationMode !== 'cursor') return
    const onStickerKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSelectedStickerId(null); return }
      if (event.key !== 'Delete' || event.defaultPrevented) return
      event.preventDefault()
      deleteSticker(selectedStickerId)
    }
    window.addEventListener('keydown', onStickerKey)
    return () => window.removeEventListener('keydown', onStickerKey)
  }, [selectedStickerId, navigationMode])

  useEffect(() => {
    if (!selectedDrawingId || navigationMode !== 'cursor') return
    const onDrawingKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSelectedDrawingId(null); return }
      if (event.key !== 'Delete' || event.defaultPrevented) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return
      event.preventDefault()
      setDrawings((current) => current.filter((drawing) => drawing.id !== selectedDrawingId))
      setSelectedDrawingId(null)
    }
    window.addEventListener('keydown', onDrawingKey)
    return () => window.removeEventListener('keydown', onDrawingKey)
  }, [selectedDrawingId, navigationMode])

  useEffect(() => {
    if (!selectedTableId || navigationMode !== 'cursor') return
    const onTableKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSelectedTableId(null); return }
      if (event.key !== 'Delete' || event.defaultPrevented) return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, select, [contenteditable="true"]')) return
      if (target instanceof HTMLTextAreaElement && (!target.classList.contains('board-table__cell') || !target.readOnly)) return
      if (event.ctrlKey) {
        if (!selectedTableLine) return
        event.preventDefault()
        deleteSelectedTableLine()
        return
      }
      event.preventDefault()
      if (selectedTableCells.length) changeSelectedTableCells({ text: '' })
      else deleteTable(selectedTableId)
    }
    window.addEventListener('keydown', onTableKey)
    return () => window.removeEventListener('keydown', onTableKey)
  }, [selectedTableId, selectedTableCells, selectedTableLine, tables, navigationMode])

  useEffect(() => { if (!selectedTableId) setSelectedTableLine(null) }, [selectedTableId])

  useEffect(() => {
    if (!selectedTableId || selectedTableCells.length) return
    const active = document.activeElement
    if (active instanceof HTMLTextAreaElement && active.classList.contains('board-table__cell')) active.blur()
  }, [selectedTableId, selectedTableCells.length])

  useEffect(() => {
    if (!selectedLayerIds.length || navigationMode !== 'cursor') return
    const onLayerKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.shiftKey) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return
      const right = event.code === 'BracketRight'
      const left = event.code === 'BracketLeft'
      if (!right && !left) return
      event.preventDefault()
      const oneStep = event.ctrlKey || event.metaKey
      changeObjectLayer(selectedLayerIds, right ? oneStep ? 'forward' : 'front' : oneStep ? 'backward' : 'back')
    }
    window.addEventListener('keydown', onLayerKey)
    return () => window.removeEventListener('keydown', onLayerKey)
  }, [selectedLayerIds, navigationMode, allObjectIds])

  useEffect(() => {
    if (editingStickerId && editingStickerId !== selectedStickerId) {
      setEditingStickerId(null)
      setFocusStickerId(null)
      stickerSelectionRef.current = null
    }
  }, [selectedStickerId, editingStickerId])

  useLayoutEffect(() => {
    const ids = ensureTextVisibleIdsRef.current
    if (!ids.size || texts === pendingTextChangeBaseRef.current) return
    ensureTextVisibleIdsRef.current = new Set()
    pendingTextChangeBaseRef.current = null
    const view = viewRef.current
    if (!view) return
    const activeTexts = texts.filter((item) => ids.has(item.id))
    if (!activeTexts.length) return
    const top = Math.min(...activeTexts.map((item) => item.y))
    const screenTop = view.y + top * view.scale
    if (screenTop >= VISIBLE_EDGE_GAP) return
    const board = boardRef.current
    if (!board) return
    const { width, height } = board.getBoundingClientRect()
    const nextView = keepBoardInView({ ...view, y: view.y + VISIBLE_EDGE_GAP - screenTop }, width, height)
    if (nextView.y !== view.y) applyViewRef.current(nextView)
  }, [texts])

  useEffect(() => {
    const board = boardRef.current
    const canvas = canvasRef.current
    const drawingCapture = drawingCaptureRef.current
    if (!board || !canvas || !drawingCapture) return

    let previousSize = { width: 0, height: 0 }
    let drag: { kind: 'pan' | 'select'; pointerId: number; x: number; y: number; startX: number; startY: number } | null = null
    let drawingGesture: DrawingDraft & { pointerId: number } | null = null
    let drawingPointerSurface: Element | null = null
    let frame: number | null = null

    const draw = () => {
      const { width, height } = board.getBoundingClientRect()
      if (!width || !height) return

      const ratio = Math.max(1, window.devicePixelRatio || 1)
      const pixelWidth = Math.round(width * ratio)
      const pixelHeight = Math.round(height * ratio)
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight

      const context = canvas.getContext('2d')
      const view = viewRef.current
      if (!context || !view) return

      const colors = getComputedStyle(canvas)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.fillStyle = colors.getPropertyValue('--canvas-background').trim()
      context.fillRect(0, 0, width, height)

      const visible: WorldRect = {
        left: Math.max(0, -view.x / view.scale),
        top: Math.max(0, -view.y / view.scale),
        right: Math.min(BOARD_WIDTH, (width - view.x) / view.scale),
        bottom: Math.min(BOARD_HEIGHT, (height - view.y) / view.scale),
      }
      if (visible.right <= visible.left || visible.bottom <= visible.top) return

      context.save()
      context.translate(view.x, view.y)
      context.scale(view.scale, view.scale)
      context.beginPath()
      context.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT)
      context.clip()

      const { level, majorSize, progress } = gridLevelForScale(view.scale, coverScale(width, height))
      const miniSize = majorSize / MINI_CELLS_PER_SIDE
      const columns = new Set<number>()
      const rows = new Set<number>()
      visitVisibleCells(visible, level, (x, y) => {
        columns.add(x)
        rows.add(y)
      })

      const majorColumns = [...columns]
      const majorRows = [...rows]
      const miniColumns: number[] = []
      const miniRows: number[] = []
      const nextMiniColumns: number[] = []
      const nextMiniRows: number[] = []
      for (const x of columns) {
        for (let i = 1; i < MINI_CELLS_PER_SIDE; i++) {
          miniColumns.push(x + i * miniSize)
        }
        if (progress > 0) {
          for (let i = 1; i < MINI_CELLS_PER_SIDE ** 2; i++) {
            if (i % MINI_CELLS_PER_SIDE !== 0) nextMiniColumns.push(x + i * miniSize / MINI_CELLS_PER_SIDE)
          }
        }
      }
      for (const y of rows) {
        for (let i = 1; i < MINI_CELLS_PER_SIDE; i++) {
          miniRows.push(y + i * miniSize)
        }
        if (progress > 0) {
          for (let i = 1; i < MINI_CELLS_PER_SIDE ** 2; i++) {
            if (i % MINI_CELLS_PER_SIDE !== 0) nextMiniRows.push(y + i * miniSize / MINI_CELLS_PER_SIDE)
          }
        }
      }

      const strokeLines = (vertical: number[], horizontal: number[], color: string, widthInPixels: number, opacity = 1) => {
        if (opacity <= 0) return
        context.beginPath()
        for (const x of vertical) {
          context.moveTo(x, visible.top)
          context.lineTo(x, visible.bottom)
        }
        for (const y of horizontal) {
          context.moveTo(visible.left, y)
          context.lineTo(visible.right, y)
        }
        context.strokeStyle = color
        context.lineWidth = widthInPixels / view.scale
        context.globalAlpha = opacity
        context.stroke()
        context.globalAlpha = 1
      }

      const line = colors.getPropertyValue('--canvas-line').trim()
      const strongLine = colors.getPropertyValue('--canvas-line-strong').trim()
      const majorEmphasis = 1 - smoothstep(1, MAX_SCALE, view.scale)
      const promotedMinis = smoothstep(0.1, 0.4, progress)
      const nextMinis = smoothstep(0.25, 0.75, progress)
      strokeLines([...miniColumns, ...majorColumns], [...miniRows, ...majorRows], line, 0.7)
      strokeLines(nextMiniColumns, nextMiniRows, line, 0.7, nextMinis)
      strokeLines(majorColumns, majorRows, strongLine, 1.2, majorEmphasis * (1 - promotedMinis))
      strokeLines(miniColumns, miniRows, strongLine, 1.2, majorEmphasis * promotedMinis)
      context.restore()
    }

    const scheduleDraw = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        draw()
      })
    }
    const applyView = (view: View) => {
      viewRef.current = view
      setViewState(view)
      scheduleDraw()
    }
    applyViewRef.current = applyView

    const updateZoomLimits = (scale: number, width: number, height: number) => {
      const minScale = coverScale(width, height)
      const maxScale = Math.max(MAX_SCALE, minScale)
      setZoomLimits({
        atMin: scale <= minScale + 0.000001,
        atMax: scale >= maxScale - 0.000001,
      })
    }

    const resize = () => {
      const { width, height } = board.getBoundingClientRect()
      if (!width || !height) return

      const view = viewRef.current
      if (!view) {
        const scale = Math.max(1, coverScale(width, height))
        applyView(keepBoardInView({
          scale,
          x: (width - BOARD_WIDTH * scale) / 2,
          y: (height - BOARD_HEIGHT * scale) / 2,
        }, width, height))
      } else {
        const centerX = previousSize.width ? (previousSize.width / 2 - view.x) / view.scale : BOARD_WIDTH / 2
        const centerY = previousSize.height ? (previousSize.height / 2 - view.y) / view.scale : BOARD_HEIGHT / 2
        const scale = Math.max(view.scale, coverScale(width, height))
        applyView(keepBoardInView({
          scale,
          x: width / 2 - centerX * scale,
          y: height / 2 - centerY * scale,
        }, width, height))
      }
      updateZoomLimits(viewRef.current!.scale, width, height)
      previousSize = { width, height }
    }

    const zoomAt = (factor: number, anchorX: number, anchorY: number) => {
      const view = viewRef.current
      if (!view) return
      const { width, height } = board.getBoundingClientRect()
      const scale = Math.max(coverScale(width, height), Math.min(MAX_SCALE, view.scale * factor))
      if (scale === view.scale) return

      const worldX = (anchorX - view.x) / view.scale
      const worldY = (anchorY - view.y) / view.scale
      applyView(keepBoardInView({
        scale,
        x: anchorX - worldX * scale,
        y: anchorY - worldY * scale,
      }, width, height))
      updateZoomLimits(scale, width, height)
    }

    zoomRef.current = (factor) => {
      const { width, height } = board.getBoundingClientRect()
      zoomAt(factor, width / 2, height / 2)
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const bounds = board.getBoundingClientRect()
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1)
      zoomAt(Math.exp(-pixels * WHEEL_ZOOM_SENSITIVITY), event.clientX - bounds.left, event.clientY - bounds.top)
    }

    const onPanKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return
      const target = event.target
      if (target instanceof HTMLElement
        && (target.isContentEditable || Boolean(target.closest('input, textarea, select, button')))) return
      const direction = event.key === 'ArrowLeft' ? { x: 1, y: 0 }
        : event.key === 'ArrowRight' ? { x: -1, y: 0 }
        : event.key === 'ArrowUp' ? { x: 0, y: 1 }
        : event.key === 'ArrowDown' ? { x: 0, y: -1 }
        : null
      const view = viewRef.current
      if (!direction || !view) return
      event.preventDefault()
      const { width, height } = board.getBoundingClientRect()
      const distance = KEYBOARD_PAN_STEP * (event.shiftKey ? 3 : 1)
      applyView(keepBoardInView({ ...view,
        x: view.x + direction.x * distance,
        y: view.y + direction.y * distance,
      }, width, height))
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (navigationModeRef.current === 'cursor' && drawingModeRef.current) {
        event.preventDefault()
        const view = viewRef.current
        if (!view) return
        const bounds = board.getBoundingClientRect()
        const point = {
          x: Math.max(0, Math.min(BOARD_WIDTH, (event.clientX - bounds.left - view.x) / view.scale)),
          y: Math.max(0, Math.min(BOARD_HEIGHT, (event.clientY - bounds.top - view.y) / view.scale)),
        }
        drawingGesture = { ...drawingModeRef.current, pointerId: event.pointerId, points: [point] }
        drawingPointerSurface = event.currentTarget as Element
        setDrawingDraft({ ...drawingModeRef.current, points: [point] })
        setSelectedArrowId(null)
        setSelectedStickerId(null)
        setSelectedDrawingId(null)
        setSelectedId(null)
        setMultiSelectedIds([])
        setEditingId(null)
        setFocusId(null)
        drawingPointerSurface.setPointerCapture(event.pointerId)
        return
      }
      if (navigationModeRef.current === 'cursor' && stickerModeRef.current) {
        event.preventDefault()
        addStickerAtClient(stickerModeRef.current, event.clientX, event.clientY)
        stickerModeRef.current = null
        canvas.classList.remove('is-sticker-mode')
        setResetToCursorToken((current) => current + 1)
        return
      }
      if (navigationModeRef.current === 'cursor' && tableModeRef.current) {
        event.preventDefault()
        const view = viewRef.current
        if (!view) return
        const { rows, columns } = tableModeRef.current
        const bounds = board.getBoundingClientRect()
        const width = columns * TABLE_CELL_WIDTH
        const height = rows * TABLE_CELL_HEIGHT
        const x = Math.max(0, Math.min(BOARD_WIDTH - width, (event.clientX - bounds.left - view.x) / view.scale))
        const y = Math.max(0, Math.min(BOARD_HEIGHT - height, (event.clientY - bounds.top - view.y) / view.scale))
        const id = crypto.randomUUID()
        setTables((current) => [...current, { id, x, y, cellWidth: TABLE_CELL_WIDTH,
          columnWidths: Array(columns).fill(TABLE_CELL_WIDTH), cellHeight: TABLE_CELL_HEIGHT,
          rowHeights: Array(rows).fill(TABLE_CELL_HEIGHT), rowMinHeights: Array(rows).fill(TABLE_CELL_HEIGHT), fontSize: 16,
          cells: Array.from({ length: rows }, () => Array.from({ length: columns }, createTableCell)) }])
        selectTable(id)
        tableModeRef.current = null
        setResetToCursorToken((current) => current + 1)
        return
      }
      if (navigationModeRef.current === 'cursor' && textModeRef.current) {
        event.preventDefault()
        clearTextSelection()
        const view = viewRef.current
        if (!view) return
        const bounds = board.getBoundingClientRect()
        const visible = visibleVerticalBounds(view, bounds.height)
        const x = Math.max(0, Math.min(BOARD_WIDTH - INITIAL_TEXT_WIDTH, (event.clientX - bounds.left - view.x) / view.scale))
        const y = Math.max(visible.top, Math.min(visible.bottom - INITIAL_TEXT_HEIGHT, (event.clientY - bounds.top - view.y) / view.scale))
        const id = crypto.randomUUID()
        setTexts((current) => [...current, {
          id, x, y, width: INITIAL_TEXT_WIDTH, height: INITIAL_TEXT_HEIGHT, baseHeight: INITIAL_TEXT_HEIGHT,
          html: '', fontSize: MIN_FONT_SIZE,
          fontFamily: "'Doska', Arial, sans-serif", color: '#272727', highlight: 'transparent',
          align: 'left', opacity: 1, comment: '',
        }])
        setSelectedId(id)
        setSelectedTableId(null)
        setMultiSelectedIds([])
        setEditingId(id)
        setFocusId(id)
        selectionRef.current = null
        textModeRef.current = false
        canvas.classList.remove('is-text-mode')
        setResetToCursorToken((current) => current + 1)
        return
      }
      event.preventDefault()
      const bounds = board.getBoundingClientRect()
      const x = event.clientX - bounds.left
      const y = event.clientY - bounds.top
      if (navigationModeRef.current === 'hand') {
        drag = { kind: 'pan', pointerId: event.pointerId, x: event.clientX, y: event.clientY, startX: x, startY: y }
        canvas.classList.add('is-dragging')
      } else {
        document.activeElement instanceof HTMLElement && document.activeElement.blur()
        clearTextSelection()
        setSelectedArrowId(null)
        setSelectedTableId(null)
        setSelectedTableCells([])
        setSelectedStickerId(null)
        setSelectedDrawingId(null)
        setSelectedId(null)
        setMultiSelectedIds([])
        setEditingId(null)
        setFocusId(null)
        drag = { kind: 'select', pointerId: event.pointerId, x, y, startX: x, startY: y }
      }
      canvas.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (drawingGesture && drawingGesture.pointerId === event.pointerId) {
        const view = viewRef.current
        if (!view) return
        const bounds = board.getBoundingClientRect()
        const point = {
          x: Math.max(0, Math.min(BOARD_WIDTH, (event.clientX - bounds.left - view.x) / view.scale)),
          y: Math.max(0, Math.min(BOARD_HEIGHT, (event.clientY - bounds.top - view.y) / view.scale)),
        }
        const last = drawingGesture.points[drawingGesture.points.length - 1]
        if (Math.hypot(point.x - last.x, point.y - last.y) < .5 / view.scale) return
        drawingGesture.points.push(point)
        setDrawingDraft({ color: drawingGesture.color, width: drawingGesture.width,
          preset: drawingGesture.preset, points: [...drawingGesture.points] })
        return
      }
      if (!drag || drag.pointerId !== event.pointerId) return
      if (drag.kind === 'select') {
        const bounds = board.getBoundingClientRect()
        const x = event.clientX - bounds.left
        const y = event.clientY - bounds.top
        if (Math.hypot(x - drag.startX, y - drag.startY) >= 4) {
          setSelectionRect({
            left: Math.min(drag.startX, x), top: Math.min(drag.startY, y),
            width: Math.abs(x - drag.startX), height: Math.abs(y - drag.startY),
          })
        }
        return
      }
      if (!viewRef.current) return
      const { width, height } = board.getBoundingClientRect()
      applyView(keepBoardInView({
        ...viewRef.current,
        x: viewRef.current.x + event.clientX - drag.x,
        y: viewRef.current.y + event.clientY - drag.y,
      }, width, height))
      drag.x = event.clientX
      drag.y = event.clientY
    }

    const onPointerUp = (event: PointerEvent) => {
      if (drawingGesture && drawingGesture.pointerId === event.pointerId) {
        if (event.type !== 'pointercancel') {
          const view = viewRef.current
          if (view) {
            const bounds = board.getBoundingClientRect()
            const point = {
              x: Math.max(0, Math.min(BOARD_WIDTH, (event.clientX - bounds.left - view.x) / view.scale)),
              y: Math.max(0, Math.min(BOARD_HEIGHT, (event.clientY - bounds.top - view.y) / view.scale)),
            }
            const last = drawingGesture.points[drawingGesture.points.length - 1]
            if (Math.hypot(point.x - last.x, point.y - last.y) > .01) drawingGesture.points.push(point)
          }
          const drawing = drawingFromDraft(drawingGesture)
          if (drawing) {
            setDrawings((current) => [...current, drawing])
            setSelectedDrawingId(drawing.id)
          }
        }
        drawingGesture = null
        setDrawingDraft(null)
        if (drawingPointerSurface?.hasPointerCapture(event.pointerId)) drawingPointerSurface.releasePointerCapture(event.pointerId)
        drawingPointerSurface = null
        return
      }
      if (!drag || drag.pointerId !== event.pointerId) return
      if (drag.kind === 'select' && event.type !== 'pointercancel') {
        const bounds = board.getBoundingClientRect()
        const x = event.clientX - bounds.left
        const y = event.clientY - bounds.top
        const view = viewRef.current
        if (view && Math.hypot(x - drag.startX, y - drag.startY) >= 4) {
          const left = (Math.min(drag.startX, x) - view.x) / view.scale
          const top = (Math.min(drag.startY, y) - view.y) / view.scale
          const right = (Math.max(drag.startX, x) - view.x) / view.scale
          const bottom = (Math.max(drag.startY, y) - view.y) / view.scale
          const overlaps = (item: { x: number; y: number; width: number; height: number }) =>
            item.x < right && item.x + item.width > left && item.y < bottom && item.y + item.height > top
          const textIds = textsRef.current.filter(overlaps).map((item) => item.id)
          const stickerIds = stickersRef.current.filter(overlaps).map((item) => item.id)
          const tableIds = tablesRef.current.filter((item) => overlaps({ x: item.x, y: item.y,
            width: tableWidth(item), height: tableHeight(item) })).map((item) => item.id)
          const drawingIds = drawingsRef.current.filter(overlaps).map((item) => item.id)
          const arrowIds = arrowsRef.current.filter((arrow) => {
            const geometry = arrowGeometriesRef.current.get(arrow.id)
            if (!geometry) return false
            return overlaps(arrowSelectionBounds(geometry, 8 / view.scale))
          }).map((arrow) => arrow.id)
          const ids = [...drawingIds, ...stickerIds, ...tableIds, ...textIds, ...arrowIds]
          const single = ids.length === 1 ? ids[0] : null
          setSelectedId(single && textIds.includes(single) ? single : null)
          setSelectedStickerId(single && stickerIds.includes(single) ? single : null)
          setSelectedTableId(single && tableIds.includes(single) ? single : null)
          setSelectedTableCells([])
          setSelectedDrawingId(single && drawingIds.includes(single) ? single : null)
          setSelectedArrowId(single && arrowIds.includes(single) ? single : null)
          setMultiSelectedIds(ids.length > 1 ? ids : [])
        }
      }
      drag = null
      canvas.classList.remove('is-dragging')
      setSelectionRect(null)
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(board)
    window.addEventListener('resize', resize)
    window.addEventListener('keydown', onPanKeyDown)
    board.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    drawingCapture.addEventListener('pointerdown', onPointerDown)
    drawingCapture.addEventListener('pointermove', onPointerMove)
    drawingCapture.addEventListener('pointerup', onPointerUp)
    drawingCapture.addEventListener('pointercancel', onPointerUp)
    resize()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', onPanKeyDown)
      if (frame !== null) window.cancelAnimationFrame(frame)
      board.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      drawingCapture.removeEventListener('pointerdown', onPointerDown)
      drawingCapture.removeEventListener('pointermove', onPointerMove)
      drawingCapture.removeEventListener('pointerup', onPointerUp)
      drawingCapture.removeEventListener('pointercancel', onPointerUp)
    }
  }, [])

  const multiSelectedTexts = texts.filter((item) => multiSelectedIds.includes(item.id))
  const textOnlyMultiSelection = multiSelectedIds.length > 1 && multiSelectedTexts.length === multiSelectedIds.length
  const selectedTexts = textOnlyMultiSelection ? multiSelectedTexts : texts.filter((item) => item.id === selectedId)
  const selectedText = selectedTexts[0]
  const selectedSticker = stickers.find((sticker) => sticker.id === selectedStickerId)
  const selectedTable = tables.find((table) => table.id === selectedTableId)
  const selectedTableCellCoordinates = selectedTableCells.map((key) => key.split(':').map(Number))
  const activeTableCells = selectedTableCellCoordinates.map(([row, column]) => selectedTable?.cells[row]?.[column])
    .filter((cell): cell is TableCellData => Boolean(cell))
  const tableToolbarCenterX = selectedTable && viewState
    ? viewState.x + (selectedTable.x + tableWidth(selectedTable) / 2) * viewState.scale : 0
  const tableToolbarTop = selectedTable && viewState
    ? Math.max(12, viewState.y + selectedTable.y * viewState.scale - (80 + 8 * viewState.scale)) : 12
  const selectedDrawing = drawings.find((drawing) => drawing.id === selectedDrawingId)
  const selectedArrow = arrows.find((arrow) => arrow.id === selectedArrowId)
  const selectedGroupItems: GroupSelectionItem[] = []
  multiSelectedIds.forEach((id) => {
    const text = texts.find((item) => item.id === id)
    if (text) {
      selectedGroupItems.push({ id, kind: 'text', x: text.x, y: text.y, width: text.width, height: text.height,
        fontSize: text.fontSize })
      return
    }
    const sticker = stickers.find((item) => item.id === id)
    if (sticker) {
      selectedGroupItems.push({ id, kind: 'sticker', x: sticker.x, y: sticker.y,
        width: sticker.width, height: sticker.height })
      return
    }
    const table = tables.find((item) => item.id === id)
    if (table) {
      selectedGroupItems.push({ id, kind: 'table', x: table.x, y: table.y,
        width: tableWidth(table), height: tableHeight(table),
        minScale: Math.max(...tableColumnWidths(table).map((width) => MIN_TABLE_CELL_WIDTH / width),
          ...table.rowHeights.map((height) => MIN_TABLE_CELL_HEIGHT / height)) })
      return
    }
    const drawing = drawings.find((item) => item.id === id)
    if (drawing) {
      selectedGroupItems.push({ id, kind: 'drawing', x: drawing.x, y: drawing.y,
        width: drawing.width, height: drawing.height })
      return
    }
    const geometry = arrowGeometries.get(id)
    if (geometry) selectedGroupItems.push({ id, kind: 'arrow', ...arrowSelectionBounds(geometry, 8 / (viewState?.scale ?? 1)) })
  })
  const occupiedConnectors = occupiedConnectorKeys(arrows)
  const selectedArrowHandle = selectedArrow ? arrowGeometries.get(selectedArrow.id)?.handle : null
  const selectedBounds = selectedTexts.length ? {
    left: Math.min(...selectedTexts.map((item) => item.x)),
    top: Math.min(...selectedTexts.map((item) => item.y)),
    right: Math.max(...selectedTexts.map((item) => item.x + item.width)),
  } : null
  const toolbarCenterX = selectedBounds && viewState
    ? viewState.x + ((selectedBounds.left + selectedBounds.right) / 2) * viewState.scale
    : 0
  const handleScale = selectedTexts.length
    ? selectedTexts.reduce((sum, item) => sum + item.fontSize / MIN_FONT_SIZE, 0) / selectedTexts.length
    : 1
  const toolbarOffset = viewState
    ? selectedTexts.length > 1
      ? 40 + 24 * Math.sqrt(handleScale) * viewState.scale
      : 46 + (24 * Math.sqrt(handleScale) - 6) * viewState.scale
    : 64
  const toolbarTop = selectedBounds && viewState
    ? Math.max(12, viewState.y + selectedBounds.top * viewState.scale - toolbarOffset)
    : 12
  const stickerToolbarCenterX = selectedSticker && viewState
    ? viewState.x + (selectedSticker.x + selectedSticker.width / 2) * viewState.scale
    : 0
  const stickerToolbarTop = selectedSticker && viewState
    ? Math.max(12, viewState.y + selectedSticker.y * viewState.scale
      - (46 + (24 - 6) * viewState.scale))
    : 12
  const drawingToolbarCenterX = selectedDrawing && viewState
    ? viewState.x + (selectedDrawing.x + selectedDrawing.width / 2) * viewState.scale
    : 0
  const drawingToolbarTop = selectedDrawing && viewState
    ? Math.max(12, viewState.y + selectedDrawing.y * viewState.scale - (46 + 18 * viewState.scale))
    : 12
  const groupFormats = selectedTexts.length > 1 ? {
    bold: selectedTexts.every((item) => Boolean(item.bold)),
    italic: selectedTexts.every((item) => Boolean(item.italic)),
    underline: selectedTexts.every((item) => Boolean(item.underline)),
    strikeThrough: selectedTexts.every((item) => Boolean(item.strikeThrough)),
  } : undefined
  const visible = visibleVerticalBounds(viewState, boardRef.current?.clientHeight ?? 0)

  return (
    <main ref={boardRef} className={`board${navigationMode === 'hand' ? ' board--hand' : ' board--cursor'}${drawingStyle ? ' board--drawing' : ''}`} aria-label="Поле доски 3840 на 2160 пикселей"
      onContextMenu={(event) => {
        const target = event.target
        if (!(target instanceof Element)) return
        let object = target.closest<HTMLElement>('[data-board-object-kind][data-board-object-id]')
        if (!object && target.closest('.group-selection__move-area')) {
          object = document.elementsFromPoint(event.clientX, event.clientY)
            .map((element) => element.closest<HTMLElement>('[data-board-object-kind][data-board-object-id]'))
            .find((element): element is HTMLElement => Boolean(element?.dataset.boardObjectId)) ?? null
        }
        if (object) {
          const objectKind = object.dataset.boardObjectKind as BoardObjectKind
          const objectId = object.dataset.boardObjectId
          if (!objectId) return
          event.preventDefault()
          if (objectKind === 'text') selectText(objectId)
          else if (objectKind === 'sticker') selectSticker(objectId)
          else if (objectKind === 'drawing') selectDrawing(objectId)
          else if (objectKind === 'table') selectTable(objectId)
          else selectArrow(objectId)
          setBoardContextMenu({ x: event.clientX, y: event.clientY, objectKind, objectId })
          return
        }
        if (target.closest('button, input, textarea, select, [contenteditable="true"], .board-arrow-handles')) return
        event.preventDefault()
        setBoardContextMenu({ x: event.clientX, y: event.clientY })
      }}
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types).includes(STICKER_DRAG_TYPE)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(event) => {
        const value = event.dataTransfer.getData(STICKER_DRAG_TYPE)
        if (!value) return
        event.preventDefault()
        try {
          const sticker = JSON.parse(value) as Partial<StickerStyle>
          if (typeof sticker.name === 'string' && typeof sticker.fill === 'string' && typeof sticker.border === 'string') {
            addStickerAtClient(sticker as StickerStyle, event.clientX, event.clientY)
          }
        } catch { /* Ignore malformed external drag data. */ }
      }}>
      <canvas ref={canvasRef} className="board-canvas">
        Поле доски требует поддержки Canvas.
      </canvas>
      <div ref={drawingCaptureRef} className={`board-drawing-capture${drawingStyle ? ' board-drawing-capture--active' : ''}`}
        aria-hidden="true" />
      {viewState && <div className="board-objects" style={{ width: BOARD_WIDTH, height: BOARD_HEIGHT, transform: `translate(${viewState.x}px, ${viewState.y}px) scale(${viewState.scale})` }}>
        {tables.map((table) => <BoardTable key={table.id} item={table}
          selected={selectedTableId === table.id || multiSelectedIds.includes(table.id)}
          groupSelected={multiSelectedIds.includes(table.id)}
          selectedCells={selectedTableId === table.id ? selectedTableCells : []}
          interactive={navigationMode === 'cursor' && !multiSelectedIds.includes(table.id)}
          scale={viewState.scale} layer={objectLayers.get(table.id) ?? 1}
          onSelect={selectTable} onCellSelect={selectTableCell}
          onRowSelect={(id, row) => selectTableLine(id, 'row', row)}
          onColumnSelect={(id, column) => selectTableLine(id, 'column', column)} onChange={changeTable}
          onRowHeight={changeTableRowHeight} />)}
        {drawings.map((drawing) => <Drawing key={drawing.id} item={drawing}
          selected={!drawingStyle && (selectedDrawingId === drawing.id || multiSelectedIds.includes(drawing.id))}
          groupSelected={multiSelectedIds.includes(drawing.id)}
          interactive={navigationMode === 'cursor' && !drawingStyle} scale={viewState.scale} layer={objectLayers.get(drawing.id) ?? 1}
          onSelect={selectDrawing} onChange={changeDrawing} />)}
        {drawingDraft && <svg className="board-drawing-preview" style={{ zIndex: orderedObjectIds.length + 2 }} width={BOARD_WIDTH} height={BOARD_HEIGHT}
          viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} aria-hidden="true">
          <path d={drawingPath(drawingDraft.points)} fill="none" stroke={drawingDraft.color}
            strokeWidth={drawingDraft.width} strokeLinecap="round" strokeLinejoin="round" />
        </svg>}
        {stickers.map((sticker) => <Sticker key={sticker.id} item={sticker}
          selected={selectedStickerId === sticker.id || multiSelectedIds.includes(sticker.id)}
          groupSelected={multiSelectedIds.includes(sticker.id)}
          interactive={navigationMode === 'cursor'} editing={editingStickerId === sticker.id}
          focusOnMount={focusStickerId === sticker.id && editingStickerId === sticker.id}
          scale={viewState.scale} layer={objectLayers.get(sticker.id) ?? 1} onSelect={selectSticker} onEdit={editSticker} onChange={changeSticker}
          onEditorRef={(id, node) => { if (node) stickerEditorRefs.current.set(id, node); else stickerEditorRefs.current.delete(id) }}
          onSaveSelection={saveStickerSelection}
          showConnectors={arrowDrag !== null && (arrowDrag.kind !== 'bend' && arrowDrag.kind !== 'new' || Boolean(arrowDrag.active))}
          occupiedSides={(['top', 'right', 'bottom', 'left'] as ConnectorSide[])
            .filter((side) => occupiedConnectors.has(`${sticker.id}:${side}`))}
          snapSide={snapAnchor?.textId === sticker.id ? snapAnchor.side ?? null : null}
          onConnectorStart={startArrow} />)}
        {texts.map((item) => <TextBox key={item.id} item={item} selected={selectedId === item.id || multiSelectedIds.includes(item.id)}
          groupSelected={multiSelectedIds.includes(item.id)} interactive={navigationMode === 'cursor'}
          editing={editingId === item.id} focusOnMount={focusId === item.id && editingId === item.id}
          scale={viewState.scale} layer={objectLayers.get(item.id) ?? 1} minY={visible.top} maxY={visible.bottom}
          onSelect={selectText} onEdit={editText} onChange={changeTextFromBox} onCommit={commitText}
          onDismiss={() => { clearTextSelection(); setSelectedId(null); setMultiSelectedIds([]); setEditingId(null); setFocusId(null) }} onSaveSelection={saveSelection}
          showConnectors={arrowDrag !== null && (arrowDrag.kind !== 'bend' && arrowDrag.kind !== 'new' || Boolean(arrowDrag.active))}
          occupiedSides={(['top', 'right', 'bottom', 'left'] as ConnectorSide[])
            .filter((side) => occupiedConnectors.has(`${item.id}:${side}`))}
          snapSide={snapAnchor?.textId === item.id ? snapAnchor.side ?? null : null}
          onConnectorStart={startArrow}
          onEditorRef={(id, node) => { if (node) editorRefs.current.set(id, node); else editorRefs.current.delete(id) }} />)}
        <ArrowLayer arrows={arrows} texts={connectableItems} geometries={arrowGeometries} view={viewState} selectedId={selectedArrowId}
          multiSelectedIds={multiSelectedIds} layers={objectLayers}
          preview={arrowDrag?.kind === 'new' && arrowDrag.active && arrowDrag.tail && arrowPointer
            ? { tail: arrowDrag.tail, head: snapAnchor ?? arrowPointer } : null}
          onSelect={selectArrow}
          onDrag={setArrowDrag} />
      </div>}
      {viewState && selectedArrow && navigationMode === 'cursor' && <ArrowToolbar color={selectedArrow.color}
        shape={selectedArrow.shape ?? 'curved'} dash={selectedArrow.dash ?? 'solid'}
        tailEnd={selectedArrow.tailEnd ?? 'none'} headEnd={selectedArrow.headEnd ?? 'arrow'}
        left={viewState.x + (selectedArrowHandle?.x ?? selectedArrow.bend.x) * viewState.scale}
        top={Math.max(12, viewState.y + (selectedArrowHandle?.y ?? selectedArrow.bend.y) * viewState.scale - 72)}
        onTailEnd={(tailEnd) => setArrows((current) => current.map((arrow) =>
          arrow.id === selectedArrow.id ? { ...arrow, tailEnd } : arrow))}
        onHeadEnd={(headEnd) => setArrows((current) => current.map((arrow) =>
          arrow.id === selectedArrow.id ? { ...arrow, headEnd } : arrow))}
        onSwapEnds={() => setArrows((current) => current.map((arrow) => arrow.id === selectedArrow.id
          ? { ...arrow, tailEnd: arrow.headEnd ?? 'arrow', headEnd: arrow.tailEnd ?? 'none' }
          : arrow))}
        onColor={(color) => setArrows((current) => current.map((arrow) => arrow.id === selectedArrow.id ? { ...arrow, color } : arrow))}
        onShape={(shape) => setArrows((current) => current.map((arrow) => {
          if (arrow.id !== selectedArrow.id || arrow.shape === shape) return arrow
          const start = resolveArrowHead(arrow.tail, connectableItemsRef.current)
          const end = resolveArrowShaftEnd(arrow.tail, arrow.head, connectableItemsRef.current)
          return { ...arrow, shape, bend: initialBend(start, end, arrow.tail.side, arrow.head.side),
            bendEdited: false, bendOffset: undefined, curveBends: undefined, pendingStraightBend: undefined }
        }))}
        onDash={(dash) => setArrows((current) => current.map((arrow) => arrow.id === selectedArrow.id ? { ...arrow, dash } : arrow))}
        onLayer={(action) => changeObjectLayer([selectedArrow.id], action)}
        onDelete={() => { setArrows((current) => current.filter((arrow) => arrow.id !== selectedArrow.id)); setSelectedArrowId(null) }} />}
      {viewState && navigationMode === 'cursor' && selectedGroupItems.length > 1 && <GroupSelection items={selectedGroupItems} view={viewState}
        minY={textOnlyMultiSelection ? visible.top : 0} maxY={textOnlyMultiSelection ? visible.bottom : BOARD_HEIGHT}
        onToggle={toggleObjectSelection} onTransformStart={captureGroupTransform}
        onMove={moveSelectedObjects} onScale={scaleSelectedObjects} />}
      {selectionRect && <div className="board-selection" style={selectionRect} aria-hidden="true" />}
      {selectedTable && viewState && navigationMode === 'cursor' && <TableToolbar
        key={`${selectedTable.id}:${activeTableCells.length ? 'cells' : 'table'}`}
        cells={activeTableCells} selectedLine={selectedTableLine} fontSize={selectedTable.fontSize}
        centerX={tableToolbarCenterX} top={tableToolbarTop}
        onFontSize={(size) => changeTableFontSize(selectedTable.id, size)}
        onChangeCells={changeSelectedTableCells}
        onFormat={(format) => changeSelectedTableCells({ [format]: !activeTableCells.every((cell) => Boolean(cell[format])) })}
        onMerge={mergeSelectedTableCells}
        onSplit={splitSelectedTableCells}
        onDeleteLine={deleteSelectedTableLine}
        onCopy={() => {
          if (selectedTableCells.length) {
            const value = tableClipboardText(selectedTable, selectedTableCells)
            if (navigator.clipboard) void navigator.clipboard.writeText(value).catch(() => {})
          } else {
            const payload = selectedObjectClipboard()
            if (payload) writeObjectClipboard(payload)
          }
        }}
        onLayer={(action) => changeObjectLayer([selectedTable.id], action)}
        onDelete={() => deleteTable(selectedTable.id)} />}
      {selectedText && viewState && navigationMode === 'cursor' && <TextToolbar key={multiSelectedIds.length ? multiSelectedIds.join(':') : selectedText.id}
        item={selectedText} items={selectedTexts} centerX={toolbarCenterX} top={toolbarTop} activeFormatsOverride={groupFormats}
        onChange={(changes) => multiSelectedIds.length ? changeSelectedTexts(changes) : changeText(selectedText.id, changes)}
        onFormat={formatText} onColor={setTextColor}
        onCopy={() => { const payload = selectedObjectClipboard(); if (payload) writeObjectClipboard(payload) }}
        onLayer={(action) => changeObjectLayer(selectedTexts.map((item) => item.id), action)}
        onDelete={deleteSelectedTexts} />}
      {selectedSticker && viewState && navigationMode === 'cursor' && <StickerToolbar item={selectedSticker}
        centerX={stickerToolbarCenterX} top={stickerToolbarTop}
        onChange={(changes) => changeSticker(selectedSticker.id, changes)}
        onFormat={formatSticker} onCopy={() => { const payload = selectedObjectClipboard(); if (payload) writeObjectClipboard(payload) }}
        onLayer={(action) => changeObjectLayer([selectedSticker.id], action)} onDelete={() => deleteSticker(selectedSticker.id)} />}
      {selectedDrawing && viewState && navigationMode === 'cursor' && !drawingStyle && <DrawingToolbar
        color={selectedDrawing.color} width={selectedDrawing.strokeWidth}
        centerX={drawingToolbarCenterX} top={drawingToolbarTop}
        onColor={(color) => changeDrawing(selectedDrawing.id, { color })}
        onWidth={(strokeWidth) => changeDrawingStrokeWidth(selectedDrawing.id, strokeWidth)}
        onCopy={() => { const payload = selectedObjectClipboard(); if (payload) writeObjectClipboard(payload) }}
        onLayer={(action) => changeObjectLayer([selectedDrawing.id], action)}
        onDelete={() => {
          setDrawings((current) => current.filter((drawing) => drawing.id !== selectedDrawing.id))
          setSelectedDrawingId(null)
        }} />}
      {boardContextMenu && <div className="board-context-menu" role="menu" aria-label="Меню холста"
        style={{ left: Math.max(8, Math.min(window.innerWidth - 226, boardContextMenu.x)),
          top: Math.max(8, Math.min(window.innerHeight
            - (boardContextMenu.objectKind === 'arrow' ? 138 : boardContextMenu.objectKind ? 174 : 102), boardContextMenu.y)) }}
        onPointerDown={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>
        {boardContextMenu.objectKind && boardContextMenu.objectId ? <>
          {boardContextMenu.objectKind !== 'arrow' && boardContextMenu.objectKind !== 'table' && <button type="button" role="menuitem" onClick={() => {
            const payload = selectedObjectClipboard()
            setBoardContextMenu(null)
            if (payload) writeObjectClipboard(payload)
          }}><span>Копировать</span><span className="board-context-menu__shortcut">Ctrl+C</span></button>}
          <button type="button" role="menuitem" onClick={() => {
            changeObjectLayer([boardContextMenu.objectId!], 'front')
            setBoardContextMenu(null)
          }}><span>На передний план</span><span className="board-context-menu__shortcut">]</span></button>
          <button type="button" role="menuitem" onClick={() => {
            changeObjectLayer([boardContextMenu.objectId!], 'back')
            setBoardContextMenu(null)
          }}><span>На задний план</span><span className="board-context-menu__shortcut">[</span></button>
          <button type="button" role="menuitem" onClick={() => {
            const { objectKind, objectId } = boardContextMenu
            setBoardContextMenu(null)
            if (objectKind === 'text') deleteSelectedTexts()
            else if (objectKind === 'sticker') deleteSticker(objectId!)
            else if (objectKind === 'table') deleteTable(objectId!)
            else if (objectKind === 'drawing') {
              setDrawings((current) => current.filter((drawing) => drawing.id !== objectId))
              setSelectedDrawingId(null)
            } else {
              setArrows((current) => current.filter((arrow) => arrow.id !== objectId))
              setSelectedArrowId(null)
            }
          }}><span>Удалить</span><span className="board-context-menu__shortcut">Delete</span></button>
        </> : <>
          <button type="button" role="menuitem" onClick={() => {
            const payload = objectClipboardRef.current
            setBoardContextMenu(null)
            if (payload) pasteObjects(payload)
          }}><span>Вставить</span><span className="board-context-menu__shortcut">Ctrl+V</span></button>
          <span className="board-context-menu__divider" aria-hidden="true" />
          <button type="button" role="menuitem" disabled><span>Комментарий</span></button>
        </>}
      </div>}
      <ToolPanel resetToCursorToken={resetToCursorToken} boardScale={viewState?.scale ?? 1} onNavigationModeChange={(mode) => {
        navigationModeRef.current = mode
        setNavigationMode(mode)
        if (mode === 'hand') {
          setSelectedTableId(null)
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
          clearTextSelection()
          setSelectedId(null)
          setSelectedStickerId(null)
          setSelectedDrawingId(null)
          setMultiSelectedIds([])
          setEditingId(null)
          setFocusId(null)
          setSelectionRect(null)
        }
      }} onStickerToolChange={(sticker) => {
        stickerModeRef.current = sticker
        canvasRef.current?.classList.toggle('is-sticker-mode', Boolean(sticker))
        if (sticker) {
          tableModeRef.current = null
          setSelectedTableId(null)
          textModeRef.current = false
          canvasRef.current?.classList.remove('is-text-mode')
          clearTextSelection()
          setSelectedId(null)
          setSelectedStickerId(null)
          setSelectedDrawingId(null)
          setMultiSelectedIds([])
          setEditingId(null)
          setFocusId(null)
        }
      }} onTextToolChange={(active) => {
        const editor = editingId ? editorRefs.current.get(editingId) : null
        if (editor && document.activeElement === editor) editor.blur()
        textModeRef.current = active
        if (active) tableModeRef.current = null
        if (active) setSelectedTableId(null)
        canvasRef.current?.classList.toggle('is-text-mode', active)
        clearTextSelection()
        setSelectedId(null)
        setSelectedStickerId(null)
        setSelectedDrawingId(null)
        setMultiSelectedIds([])
        setEditingId(null)
        setFocusId(null)
      }} onDrawingToolChange={(style) => {
        drawingModeRef.current = style
        setDrawingStyle(style)
        canvasRef.current?.classList.toggle('is-drawing-mode', Boolean(style))
        if (style) {
          tableModeRef.current = null
          setSelectedTableId(null)
          textModeRef.current = false
          stickerModeRef.current = null
          canvasRef.current?.classList.remove('is-text-mode', 'is-sticker-mode')
          clearTextSelection()
          setSelectedId(null)
          setSelectedStickerId(null)
          setSelectedDrawingId(null)
          setSelectedArrowId(null)
          setMultiSelectedIds([])
          setEditingId(null)
          setFocusId(null)
        }
      }} onTableToolChange={(size) => {
        tableModeRef.current = size
        if (size) {
          textModeRef.current = false
          stickerModeRef.current = null
          drawingModeRef.current = null
          setDrawingStyle(null)
          canvasRef.current?.classList.remove('is-text-mode', 'is-sticker-mode', 'is-drawing-mode')
          setSelectedId(null)
          setSelectedStickerId(null)
          setSelectedDrawingId(null)
          setSelectedArrowId(null)
          setSelectedTableId(null)
          setMultiSelectedIds([])
          setEditingId(null)
          setEditingStickerId(null)
        }
      }} />
      <ZoomControls
        onZoomOut={() => zoomRef.current(0.8)}
        onZoomIn={() => zoomRef.current(1.25)}
        atMinZoom={zoomLimits.atMin}
        atMaxZoom={zoomLimits.atMax}
      />
    </main>
  )
}
