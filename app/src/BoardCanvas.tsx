import { useEffect, useRef, useState } from 'react'
import ToolPanel, { type NavigationMode } from './components/ToolPanel/ToolPanel'
import ZoomControls from './components/ZoomControls/ZoomControls'
import TextBox, { MAX_FONT_SIZE, MIN_FONT_SIZE, MIN_TEXT_HEIGHT, MIN_TEXT_WIDTH, type TextItem } from './components/TextBox/TextBox'
import GroupSelection from './components/GroupSelection/GroupSelection'
import TextToolbar from './components/TextToolbar/TextToolbar'
import { BOARD_HEIGHT, BOARD_WIDTH, MINI_CELLS_PER_SIDE, gridLevelForScale, visitVisibleCells, type WorldRect } from './gridHierarchy'

type View = { scale: number; x: number; y: number }
type SelectionRect = { left: number; top: number; width: number; height: number }
type FormatCommand = 'bold' | 'italic' | 'underline' | 'strikeThrough'

const MAX_SCALE = 4
const WHEEL_ZOOM_SENSITIVITY = 0.002
const INITIAL_TEXT_WIDTH = 180
const INITIAL_TEXT_HEIGHT = 40

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

function applyTextChanges(item: TextItem, changes: Partial<TextItem>): TextItem {
  const next = { ...item, ...changes }
  if (changes.fontSize !== undefined && changes.width === undefined && changes.height === undefined) {
    const factor = changes.fontSize / item.fontSize
    next.width = item.width * factor
    next.height = item.height * factor
    next.baseHeight = (item.baseHeight ?? item.height) * factor
  }
  next.fontSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, next.fontSize))
  next.baseHeight = Math.max(MIN_TEXT_HEIGHT, next.baseHeight ?? item.height)
  next.width = Math.max(MIN_TEXT_WIDTH, Math.min(next.width, BOARD_WIDTH - next.x))
  next.height = Math.max(MIN_TEXT_HEIGHT, Math.min(next.height, BOARD_HEIGHT - next.y))
  next.x = Math.max(0, Math.min(BOARD_WIDTH - next.width, next.x))
  next.y = Math.max(0, Math.min(BOARD_HEIGHT - next.height, next.y))
  return next
}

export default function BoardCanvas() {
  const boardRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<View | null>(null)
  const zoomRef = useRef<(factor: number) => void>(() => {})
  const textModeRef = useRef(false)
  const navigationModeRef = useRef<NavigationMode>('cursor')
  const textsRef = useRef<TextItem[]>([])
  const editorRefs = useRef(new Map<string, HTMLDivElement>())
  const selectionRef = useRef<Range | null>(null)
  const [zoomLimits, setZoomLimits] = useState({ atMin: false, atMax: false })
  const [viewState, setViewState] = useState<View | null>(null)
  const [texts, setTexts] = useState<TextItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([])
  const [focusId, setFocusId] = useState<string | null>(null)
  const [navigationMode, setNavigationMode] = useState<NavigationMode>('cursor')
  const [resetToCursorToken, setResetToCursorToken] = useState(0)
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null)

  textsRef.current = texts

  const changeText = (id: string, changes: Partial<TextItem>) => {
    setTexts((current) => current.map((item) => item.id === id ? applyTextChanges(item, changes) : item))
  }

  const changeSelectedTexts = (changes: Partial<TextItem>) => {
    const ids = new Set(multiSelectedIds)
    setTexts((current) => current.map((item) => ids.has(item.id) ? applyTextChanges(item, changes) : item))
  }

  const scaleSelectedTexts = (startItems: TextItem[], anchorX: number, anchorY: number, factor: number) => {
    const originals = new Map(startItems.map((item) => [item.id, item]))
    setTexts((current) => current.map((item) => {
      const start = originals.get(item.id)
      if (!start) return item
      return {
        ...item,
        x: anchorX + (start.x - anchorX) * factor,
        y: anchorY + (start.y - anchorY) * factor,
        width: start.width * factor,
        height: start.height * factor,
        baseHeight: (start.baseHeight ?? start.height) * factor,
        fontSize: Math.round(start.fontSize * factor * 10) / 10,
      }
    }))
  }

  const changeTextFromBox = (id: string, changes: Partial<TextItem>) => {
    if (!multiSelectedIds.includes(id) || changes.x === undefined || changes.y === undefined || Object.keys(changes).length !== 2) {
      changeText(id, changes)
      return
    }
    const ids = new Set(multiSelectedIds)
    setTexts((current) => {
      const source = current.find((item) => item.id === id)
      const group = current.filter((item) => ids.has(item.id))
      if (!source || !group.length) return current
      const dx = Math.max(Math.max(...group.map((item) => -item.x)), Math.min(Math.min(...group.map((item) => BOARD_WIDTH - item.x - item.width)), changes.x! - source.x))
      const dy = Math.max(Math.max(...group.map((item) => -item.y)), Math.min(Math.min(...group.map((item) => BOARD_HEIGHT - item.y - item.height)), changes.y! - source.y))
      return current.map((item) => ids.has(item.id) ? { ...item, x: item.x + dx, y: item.y + dy } : item)
    })
  }

  const selectText = (id: string) => {
    setSelectedId(id)
    setMultiSelectedIds([])
  }

  const commitText = (id: string, html: string, isEmpty: boolean) => {
    if (isEmpty) {
      setTexts((current) => current.filter((item) => item.id !== id))
      setSelectedId((current) => current === id ? null : current)
      setMultiSelectedIds((current) => current.filter((selected) => selected !== id))
      setFocusId((current) => current === id ? null : current)
      editorRefs.current.delete(id)
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
        const view = viewRef.current
        if (!view) return
        const bounds = board.getBoundingClientRect()
        const x = Math.max(0, Math.min(BOARD_WIDTH - INITIAL_TEXT_WIDTH, (event.clientX - bounds.left - view.x) / view.scale))
        const y = Math.max(0, Math.min(BOARD_HEIGHT - INITIAL_TEXT_HEIGHT, (event.clientY - bounds.top - view.y) / view.scale))
        const id = crypto.randomUUID()
        setTexts((current) => [...current, {
          id, x, y, width: INITIAL_TEXT_WIDTH, height: INITIAL_TEXT_HEIGHT, baseHeight: INITIAL_TEXT_HEIGHT,
          html: '', fontSize: MIN_FONT_SIZE,
          fontFamily: "'Doska', Arial, sans-serif", color: '#272727', highlight: 'transparent',
          align: 'left', opacity: 1, comment: '',
        }])
        setSelectedId(id)
        setMultiSelectedIds([])
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
        setSelectedId(null)
        setMultiSelectedIds([])
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
  const selectedBounds = selectedTexts.length ? {
    left: Math.min(...selectedTexts.map((item) => item.x)),
    top: Math.min(...selectedTexts.map((item) => item.y)),
    right: Math.max(...selectedTexts.map((item) => item.x + item.width)),
  } : null
  const toolbarCenterX = selectedBounds && viewState
    ? viewState.x + ((selectedBounds.left + selectedBounds.right) / 2) * viewState.scale
    : 0
  const toolbarTop = selectedBounds && viewState
    ? Math.max(12, viewState.y + selectedBounds.top * viewState.scale - 59)
    : 12
  const groupFormats = selectedTexts.length > 1 ? {
    bold: selectedTexts.every((item) => Boolean(item.bold)),
    italic: selectedTexts.every((item) => Boolean(item.italic)),
    underline: selectedTexts.every((item) => Boolean(item.underline)),
    strikeThrough: selectedTexts.every((item) => Boolean(item.strikeThrough)),
  } : undefined

  return (
    <main ref={boardRef} className={`board${navigationMode === 'hand' ? ' board--hand' : ''}`} aria-label="Поле доски 3840 на 2160 пикселей">
      <canvas ref={canvasRef} className="board-canvas">
        Поле доски требует поддержки Canvas.
      </canvas>
      {viewState && <div className="board-objects" style={{ width: BOARD_WIDTH, height: BOARD_HEIGHT, transform: `translate(${viewState.x}px, ${viewState.y}px) scale(${viewState.scale})` }}>
        {texts.map((item) => <TextBox key={item.id} item={item} selected={selectedId === item.id || multiSelectedIds.includes(item.id)}
          groupSelected={multiSelectedIds.length > 1 && multiSelectedIds.includes(item.id)} interactive={navigationMode === 'cursor'} focusOnMount={focusId === item.id}
          scale={viewState.scale} onSelect={selectText} onChange={changeTextFromBox} onCommit={commitText}
          onDismiss={() => { setSelectedId(null); setMultiSelectedIds([]) }} onSaveSelection={saveSelection}
          onEditorRef={(id, node) => { if (node) editorRefs.current.set(id, node); else editorRefs.current.delete(id) }} />)}
      </div>}
      {viewState && navigationMode === 'cursor' && selectedTexts.length > 1 && <GroupSelection items={selectedTexts} view={viewState} onScale={scaleSelectedTexts} />}
      {selectionRect && <div className="board-selection" style={selectionRect} aria-hidden="true" />}
      {selectedText && viewState && navigationMode === 'cursor' && <TextToolbar key={multiSelectedIds.length ? multiSelectedIds.join(':') : selectedText.id}
        item={selectedText} centerX={toolbarCenterX} top={toolbarTop} activeFormatsOverride={groupFormats}
        onChange={(changes) => multiSelectedIds.length ? changeSelectedTexts(changes) : changeText(selectedText.id, changes)} onFormat={formatText} />}
      <ToolPanel resetToCursorToken={resetToCursorToken} onNavigationModeChange={(mode) => {
        navigationModeRef.current = mode
        setNavigationMode(mode)
        if (mode === 'hand') {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
          setSelectedId(null)
          setMultiSelectedIds([])
          setSelectionRect(null)
        }
      }} onTextToolChange={(active) => {
        textModeRef.current = active
        canvasRef.current?.classList.toggle('is-text-mode', active)
        if (!active) setFocusId(null)
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
