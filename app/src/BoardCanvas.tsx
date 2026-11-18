import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ToolPanel, { type NavigationMode } from './components/ToolPanel/ToolPanel'
import ZoomControls from './components/ZoomControls/ZoomControls'
import TextBox, { MAX_FONT_SIZE, MIN_FONT_SIZE, MIN_TEXT_HEIGHT, MIN_TEXT_WIDTH, type TextItem } from './components/TextBox/TextBox'
import GroupSelection from './components/GroupSelection/GroupSelection'
import TextToolbar from './components/TextToolbar/TextToolbar'
import { BOARD_HEIGHT, BOARD_WIDTH, MINI_CELLS_PER_SIDE, gridLevelForScale, visitVisibleCells, type WorldRect } from './gridHierarchy'
import ArrowLayer, { anchorPoint, arrowGeometry, arrowTarget, bendOffsetFor, initialBend, resolveArrowHead, resolveArrowShaftEnd, type Anchor, type Arrow, type ArrowDrag, type Point } from './ArrowLayer'
import ArrowToolbar from './components/ArrowToolbar/ArrowToolbar'
import type { ConnectorSide } from './components/TextBox/TextBox'

type View = { scale: number; x: number; y: number }
type SelectionRect = { left: number; top: number; width: number; height: number }
type FormatCommand = 'bold' | 'italic' | 'underline' | 'strikeThrough'

const MAX_SCALE = 4
const WHEEL_ZOOM_SENSITIVITY = 0.002
const INITIAL_TEXT_WIDTH = 180
const INITIAL_TEXT_HEIGHT = 24
const VISIBLE_EDGE_GAP = 8
const ARROW_DRAG_THRESHOLD = 6
const OBJECT_CLIPBOARD_TYPE = 'application/x-doska-objects+json'
const OBJECT_CLIPBOARD_PREFIX = 'DOSKA_OBJECTS_V1:'

type ObjectClipboard = { version: 1; texts: TextItem[]; arrows: Arrow[] }

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
    return data?.version === 1 && Array.isArray(data.texts) && Array.isArray(data.arrows) ? data as ObjectClipboard : null
  } catch { return null }
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

function moveArrowBend(arrow: Arrow, point: Point, index = 1, texts: TextItem[], finish = false): Arrow {
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
  const viewRef = useRef<View | null>(null)
  const applyViewRef = useRef<(view: View) => void>(() => {})
  const ensureTextVisibleIdsRef = useRef(new Set<string>())
  const pendingTextChangeBaseRef = useRef<TextItem[] | null>(null)
  const zoomRef = useRef<(factor: number) => void>(() => {})
  const textModeRef = useRef(false)
  const navigationModeRef = useRef<NavigationMode>('cursor')
  const textsRef = useRef<TextItem[]>([])
  const arrowsRef = useRef<Arrow[]>([])
  const arrowDragRef = useRef<ArrowDrag | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const editorRefs = useRef(new Map<string, HTMLDivElement>())
  const selectionRef = useRef<Range | null>(null)
  const pasteCountRef = useRef(0)
  const arrowGeometryCacheRef = useRef(new Map<string, {
    arrow: Arrow
    textKey: string
    avoidObstacles: boolean
    geometry: ReturnType<typeof arrowGeometry>
  }>())
  const [zoomLimits, setZoomLimits] = useState({ atMin: false, atMax: false })
  const [viewState, setViewState] = useState<View | null>(null)
  const [texts, setTexts] = useState<TextItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [navigationMode, setNavigationMode] = useState<NavigationMode>('cursor')
  const [resetToCursorToken, setResetToCursorToken] = useState(0)
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null)
  const [arrows, setArrows] = useState<Arrow[]>([])
  const [selectedArrowId, setSelectedArrowId] = useState<string | null>(null)
  const [arrowDrag, setArrowDrag] = useState<ArrowDrag | null>(null)
  const [arrowPointer, setArrowPointer] = useState<Point | null>(null)
  const [snapAnchor, setSnapAnchor] = useState<Anchor | null>(null)

  textsRef.current = texts
  arrowsRef.current = arrows
  arrowDragRef.current = arrowDrag
  selectedIdRef.current = selectedId

  const geometryTextKey = JSON.stringify(texts.map(({ id, x, y, width, height, fontSize }) =>
    [id, x, y, width, height, fontSize]))
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
      const geometry = sameShape && cached?.textKey === geometryTextKey && cached.avoidObstacles === avoidObstacles
        ? cached.geometry
        : arrowGeometry(arrow.tail, arrow.head, arrow.bend, texts, arrow.bendEdited, arrow.bendOffset, avoidObstacles, arrow.shape, arrow.curveBends, arrow.pendingStraightBend)
      next.set(arrow.id, { arrow, textKey: geometryTextKey, avoidObstacles, geometry })
      geometries.set(arrow.id, geometry)
    }
    arrowGeometryCacheRef.current = next
    return geometries
  }, [arrows, geometryTextKey, draggingArrowId])

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
    const applyMove = (clientX: number, clientY: number) => {
      const board = boardRef.current
      const view = viewRef.current
      if (!board || !view) return
      const bounds = board.getBoundingClientRect()
      const point = { x: (clientX - bounds.left - view.x) / view.scale, y: (clientY - bounds.top - view.y) / view.scale }
      const excluded = arrowDrag.kind === 'new' ? arrowDrag.tail?.textId : undefined
      const occupied = occupiedConnectorKeys(arrowsRef.current, arrowDrag.arrowId)
      const target: Anchor = arrowDrag.kind === 'bend' ? point : arrowTarget(point, textsRef.current, view.scale, excluded, occupied)
      const snap = target.textId ? target : null
      if (arrowDrag.kind === 'new') setArrowPointer(target)
      if (arrowDrag.kind !== 'bend') setSnapAnchor(snap)
      if (arrowDrag.kind === 'bend' && arrowDrag.arrowId) {
        setArrows((current) => current.map((arrow) => arrow.id === arrowDrag.arrowId
          ? moveArrowBend(arrow, point, arrowDrag.bendIndex, textsRef.current)
          : arrow))
      } else if (arrowDrag.kind !== 'new' && arrowDrag.arrowId) {
        const endpoint = target
        setArrows((current) => current.map((arrow) => {
          if (arrow.id !== arrowDrag.arrowId) return arrow
          const next = { ...arrow, [arrowDrag.kind]: endpoint }
          return next.bendEdited ? next : { ...next, bend: initialBend(
            resolveArrowHead(next.tail, textsRef.current), resolveArrowShaftEnd(next.tail, next.head, textsRef.current), next.tail.side, next.head.side) }
        }))
      }
    }
    const resetEndpointBend = () => {
      if ((arrowDrag.kind !== 'tail' && arrowDrag.kind !== 'head') || !arrowDrag.arrowId) return
      setArrows((current) => current.map((arrow) => {
        if (arrow.id !== arrowDrag.arrowId) return arrow
        const start = resolveArrowHead(arrow.tail, textsRef.current)
        const end = resolveArrowShaftEnd(arrow.tail, arrow.head, textsRef.current)
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
      const occupied = occupiedConnectorKeys(arrowsRef.current, arrowDrag.arrowId)
      const target: Anchor = arrowDrag.kind === 'bend' ? point : arrowTarget(point, textsRef.current, view.scale,
        arrowDrag.kind === 'new' ? arrowDrag.tail?.textId : undefined, occupied)
      if (arrowDrag.kind === 'new' && arrowDrag.tail) {
        const tail = arrowDrag.tail
        const head: Anchor = target
        const start = resolveArrowHead(tail, textsRef.current)
        if (Math.hypot(start.x - head.x, start.y - head.y) > 6) {
          const id = crypto.randomUUID()
          const target = resolveArrowShaftEnd(tail, head, textsRef.current)
          setArrows((current) => [...current, { id, tail, head,
            bend: initialBend(start, target, tail.side, head.side), color: '#272727' }])
          setSelectedArrowId(id)
          setSelectedId(null)
          setMultiSelectedIds([])
          setEditingId(null)
        }
      } else if (arrowDrag.kind === 'bend' && arrowDrag.arrowId) {
        setArrows((current) => current.map((arrow) => arrow.id === arrowDrag.arrowId
          ? moveArrowBend(arrow, point, arrowDrag.bendIndex, textsRef.current, true)
          : arrow))
      } else if (arrowDrag.arrowId) {
        const endpoint = target
        setArrows((current) => current.map((arrow) => {
          if (arrow.id !== arrowDrag.arrowId) return arrow
          const next = { ...arrow, [arrowDrag.kind]: endpoint }
          return next.bendEdited ? next : { ...next, bend: initialBend(
            resolveArrowHead(next.tail, textsRef.current), resolveArrowShaftEnd(next.tail, next.head, textsRef.current), next.tail.side, next.head.side) }
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
    const item = textsRef.current.find((text) => text.id === id)
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

  const scaleSelectedTexts = (startItems: TextItem[], anchorX: number, anchorY: number, factor: number) => {
    startItems.forEach((item) => ensureTextVisibleIdsRef.current.add(item.id))
    pendingTextChangeBaseRef.current = textsRef.current
    const originals = new Map(startItems.map((item) => [item.id, item]))
    setTexts((current) => current.map((item) => {
      const start = originals.get(item.id)
      if (!start) return item
      return constrainText({
        ...item,
        x: anchorX + (start.x - anchorX) * factor,
        y: anchorY + (start.y - anchorY) * factor,
        width: start.width * factor,
        height: start.height * factor,
        baseHeight: (start.baseHeight ?? start.height) * factor,
        fontSize: Math.round(start.fontSize * factor * 10) / 10,
      }, viewRef.current, viewportHeight())
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

  const selectText = (id: string) => {
    setSelectedArrowId(null)
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

  const formatText = (command: string, value?: string) => {
    if (multiSelectedIds.length) {
      const key = command as FormatCommand
      if (!['bold', 'italic', 'underline', 'strikeThrough'].includes(key)) return
      const ids = new Set(multiSelectedIds)
      setTexts((current) => {
        const group = current.filter((item) => ids.has(item.id))
        const nextValue = !group.every((item) => Boolean(item[key]))
        return current.map((item) => ids.has(item.id) ? { ...item, [key]: nextValue } : item)
      })
      return
    }
    if (!selectedId) return
    const editor = editorRefs.current.get(selectedId)
    if (!editor) return
    const selection = window.getSelection()
    const currentRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null
    editor.focus()
    const range = currentRange && !currentRange.collapsed && editor.contains(currentRange.commonAncestorContainer)
      ? currentRange
      : selectionRef.current
    if (selection && range && editor.contains(range.commonAncestorContainer)) {
      selection.removeAllRanges()
      selection.addRange(range)
    } else if (selection) {
      selection.selectAllChildren(editor)
    }
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

  const selectedObjectClipboard = (): ObjectClipboard | null => {
    if (selectedArrowId) return null
    const ids = new Set(multiSelectedIds.length ? multiSelectedIds : selectedId ? [selectedId] : [])
    if (!ids.size) return null
    return {
      version: 1,
      texts: texts.filter((item) => ids.has(item.id)).map((item) => ({ ...item, html: editorRefs.current.get(item.id)?.innerHTML ?? item.html })),
      arrows: [],
    }
  }

  const writeObjectClipboard = (payload: ObjectClipboard) => {
    pasteCountRef.current = 0
    const json = JSON.stringify(payload)
    const copy = (event: ClipboardEvent) => {
      event.preventDefault()
      event.clipboardData?.setData(OBJECT_CLIPBOARD_TYPE, json)
      event.clipboardData?.setData('text/plain', OBJECT_CLIPBOARD_PREFIX + json)
    }
    document.addEventListener('copy', copy, { capture: true, once: true })
    const copied = document.execCommand('copy')
    document.removeEventListener('copy', copy, true)
    if (!copied) void navigator.clipboard?.writeText(OBJECT_CLIPBOARD_PREFIX + json)
  }

  const pasteObjects = (payload: ObjectClipboard) => {
    if (!payload.texts.length) return
    const view = viewRef.current
    const offset = 24 * ++pasteCountRef.current / (view?.scale ?? 1)
    const sourceTexts = payload.texts
    const points: Point[] = sourceTexts.flatMap((item) => [
      { x: item.x, y: item.y }, { x: item.x + item.width, y: item.y + item.height },
    ])
    const minX = Math.min(...points.map((point) => point.x))
    const maxX = Math.max(...points.map((point) => point.x))
    const minY = Math.min(...points.map((point) => point.y))
    const maxY = Math.max(...points.map((point) => point.y))
    const dx = Math.max(-minX, Math.min(BOARD_WIDTH - maxX, offset))
    const dy = Math.max(-minY, Math.min(BOARD_HEIGHT - maxY, offset))
    const idMap = new Map(sourceTexts.map((item) => [item.id, crypto.randomUUID()]))
    const newTexts = sourceTexts.map((item) => constrainText({ ...item, id: idMap.get(item.id)!, x: item.x + dx, y: item.y + dy }, view, viewportHeight()))
    setTexts((current) => [...current, ...newTexts])
    setEditingId(null)
    setFocusId(null)
    setSelectedId(newTexts.length === 1 ? newTexts[0].id : null)
    setMultiSelectedIds(newTexts.length > 1 ? newTexts.map((item) => item.id) : [])
    setSelectedArrowId(null)
  }

  useEffect(() => {
    const editableTarget = (target: EventTarget | null) => target instanceof HTMLElement
      && (target.isContentEditable || Boolean(target.closest('input, textarea, select')))
    const onCopy = (event: ClipboardEvent) => {
      if (event.defaultPrevented || editableTarget(event.target) || navigationMode !== 'cursor') return
      if (selectedArrowId) { event.preventDefault(); return }
      const payload = selectedObjectClipboard()
      if (!payload) return
      const json = JSON.stringify(payload)
      event.preventDefault()
      event.clipboardData?.setData(OBJECT_CLIPBOARD_TYPE, json)
      event.clipboardData?.setData('text/plain', OBJECT_CLIPBOARD_PREFIX + json)
      pasteCountRef.current = 0
    }
    const onPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || editableTarget(event.target) || navigationMode !== 'cursor') return
      const custom = event.clipboardData?.getData(OBJECT_CLIPBOARD_TYPE)
      const plain = event.clipboardData?.getData('text/plain')
      const payload = custom ? parseObjectClipboard(custom)
        : plain?.startsWith(OBJECT_CLIPBOARD_PREFIX) ? parseObjectClipboard(plain) : null
      if (!payload) return
      event.preventDefault()
      pasteObjects(payload)
    }
    window.addEventListener('copy', onCopy)
    window.addEventListener('paste', onPaste)
    return () => { window.removeEventListener('copy', onCopy); window.removeEventListener('paste', onPaste) }
  }, [texts, arrows, selectedId, multiSelectedIds, selectedArrowId, navigationMode])

  useEffect(() => {
    const ids = multiSelectedIds.length ? multiSelectedIds : selectedId ? [selectedId] : []
    if (!ids.length || navigationMode !== 'cursor') return

    const onDelete = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' || event.defaultPrevented) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return

      event.preventDefault()
      deleteSelectedTexts()
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
    if (!board || !canvas) return

    let previousSize = { width: 0, height: 0 }
    let drag: { kind: 'pan' | 'select'; pointerId: number; x: number; y: number; startX: number; startY: number } | null = null
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

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
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
        setSelectedId(null)
        setMultiSelectedIds([])
        setEditingId(null)
        setFocusId(null)
        drag = { kind: 'select', pointerId: event.pointerId, x, y, startX: x, startY: y }
      }
      canvas.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
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
          const ids = textsRef.current.filter((item) => item.x < right && item.x + item.width > left && item.y < bottom && item.y + item.height > top).map((item) => item.id)
          setSelectedId(ids.length === 1 ? ids[0] : null)
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
    board.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    resize()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resize)
      if (frame !== null) window.cancelAnimationFrame(frame)
      board.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
    }
  }, [])

  const selectedTexts = multiSelectedIds.length
    ? texts.filter((item) => multiSelectedIds.includes(item.id))
    : texts.filter((item) => item.id === selectedId)
  const selectedText = selectedTexts[0]
  const selectedArrow = arrows.find((arrow) => arrow.id === selectedArrowId)
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
  const groupFormats = selectedTexts.length > 1 ? {
    bold: selectedTexts.every((item) => Boolean(item.bold)),
    italic: selectedTexts.every((item) => Boolean(item.italic)),
    underline: selectedTexts.every((item) => Boolean(item.underline)),
    strikeThrough: selectedTexts.every((item) => Boolean(item.strikeThrough)),
  } : undefined
  const visible = visibleVerticalBounds(viewState, boardRef.current?.clientHeight ?? 0)

  return (
    <main ref={boardRef} className={`board${navigationMode === 'hand' ? ' board--hand' : ' board--cursor'}`} aria-label="Поле доски 3840 на 2160 пикселей">
      <canvas ref={canvasRef} className="board-canvas">
        Поле доски требует поддержки Canvas.
      </canvas>
      {viewState && <div className="board-objects" style={{ width: BOARD_WIDTH, height: BOARD_HEIGHT, transform: `translate(${viewState.x}px, ${viewState.y}px) scale(${viewState.scale})` }}>
        {texts.map((item) => <TextBox key={item.id} item={item} selected={selectedId === item.id || multiSelectedIds.includes(item.id)}
          groupSelected={multiSelectedIds.length > 1 && multiSelectedIds.includes(item.id)} interactive={navigationMode === 'cursor'}
          editing={editingId === item.id} focusOnMount={focusId === item.id && editingId === item.id}
          scale={viewState.scale} minY={visible.top} maxY={visible.bottom}
          onSelect={selectText} onEdit={editText} onChange={changeTextFromBox} onCommit={commitText}
          onDismiss={() => { clearTextSelection(); setSelectedId(null); setMultiSelectedIds([]); setEditingId(null); setFocusId(null) }} onSaveSelection={saveSelection}
          showConnectors={arrowDrag !== null && (arrowDrag.kind !== 'bend' && arrowDrag.kind !== 'new' || Boolean(arrowDrag.active))}
          occupiedSides={(['top', 'right', 'bottom', 'left'] as ConnectorSide[])
            .filter((side) => occupiedConnectors.has(`${item.id}:${side}`))}
          snapSide={snapAnchor?.textId === item.id ? snapAnchor.side ?? null : null}
          onConnectorStart={startArrow}
          onEditorRef={(id, node) => { if (node) editorRefs.current.set(id, node); else editorRefs.current.delete(id) }} />)}
      </div>}
      {viewState && <ArrowLayer arrows={arrows} texts={texts} geometries={arrowGeometries} view={viewState} selectedId={selectedArrowId}
        preview={arrowDrag?.kind === 'new' && arrowDrag.active && arrowDrag.tail && arrowPointer
          ? { tail: arrowDrag.tail, head: snapAnchor ?? arrowPointer } : null}
        onSelect={(id) => { setSelectedArrowId(id); setSelectedId(null); setMultiSelectedIds([]); setEditingId(null) }}
        onDrag={setArrowDrag} />}
      {viewState && selectedArrow && navigationMode === 'cursor' && <ArrowToolbar color={selectedArrow.color}
        shape={selectedArrow.shape ?? 'curved'} dash={selectedArrow.dash ?? 'solid'}
        left={viewState.x + (selectedArrowHandle?.x ?? selectedArrow.bend.x) * viewState.scale}
        top={Math.max(12, viewState.y + (selectedArrowHandle?.y ?? selectedArrow.bend.y) * viewState.scale - 72)}
        onColor={(color) => setArrows((current) => current.map((arrow) => arrow.id === selectedArrow.id ? { ...arrow, color } : arrow))}
        onShape={(shape) => setArrows((current) => current.map((arrow) => {
          if (arrow.id !== selectedArrow.id || arrow.shape === shape) return arrow
          const start = resolveArrowHead(arrow.tail, textsRef.current)
          const end = resolveArrowShaftEnd(arrow.tail, arrow.head, textsRef.current)
          return { ...arrow, shape, bend: initialBend(start, end, arrow.tail.side, arrow.head.side),
            bendEdited: false, bendOffset: undefined, curveBends: undefined, pendingStraightBend: undefined }
        }))}
        onDash={(dash) => setArrows((current) => current.map((arrow) => arrow.id === selectedArrow.id ? { ...arrow, dash } : arrow))}
        onDelete={() => { setArrows((current) => current.filter((arrow) => arrow.id !== selectedArrow.id)); setSelectedArrowId(null) }} />}
      {viewState && navigationMode === 'cursor' && selectedTexts.length > 1 && <GroupSelection items={selectedTexts} view={viewState}
        minY={visible.top} maxY={visible.bottom}
        onMove={(items, dx, dy) => {
          const source = items[0]
          if (source) changeTextFromBox(source.id, { x: source.x + dx, y: source.y + dy })
        }}
        onScale={scaleSelectedTexts} />}
      {selectionRect && <div className="board-selection" style={selectionRect} aria-hidden="true" />}
      {selectedText && viewState && navigationMode === 'cursor' && <TextToolbar key={multiSelectedIds.length ? multiSelectedIds.join(':') : selectedText.id}
        item={selectedText} items={selectedTexts} centerX={toolbarCenterX} top={toolbarTop} activeFormatsOverride={groupFormats}
        onChange={(changes) => multiSelectedIds.length ? changeSelectedTexts(changes) : changeText(selectedText.id, changes)}
        onFormat={formatText} onColor={setTextColor}
        onCopy={() => { const payload = selectedObjectClipboard(); if (payload) writeObjectClipboard(payload) }}
        onDelete={deleteSelectedTexts} />}
      <ToolPanel resetToCursorToken={resetToCursorToken} onNavigationModeChange={(mode) => {
        navigationModeRef.current = mode
        setNavigationMode(mode)
        if (mode === 'hand') {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
          clearTextSelection()
          setSelectedId(null)
          setMultiSelectedIds([])
          setEditingId(null)
          setFocusId(null)
          setSelectionRect(null)
        }
      }} onTextToolChange={(active) => {
        const editor = editingId ? editorRefs.current.get(editingId) : null
        if (editor && document.activeElement === editor) editor.blur()
        textModeRef.current = active
        canvasRef.current?.classList.toggle('is-text-mode', active)
        clearTextSelection()
        setSelectedId(null)
        setMultiSelectedIds([])
        setEditingId(null)
        setFocusId(null)
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
