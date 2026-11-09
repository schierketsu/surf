import { useEffect, useRef, useState } from 'react'
import ToolPanel from './components/ToolPanel/ToolPanel'
import ZoomControls from './components/ZoomControls/ZoomControls'
import { BOARD_HEIGHT, BOARD_WIDTH, MINI_CELLS_PER_SIDE, gridLevelForScale, visitVisibleCells, type WorldRect } from './gridHierarchy'
import type { Theme } from './theme'

type BoardCanvasProps = { theme: Theme }
type View = { scale: number; x: number; y: number }

const MAX_SCALE = 4
const WHEEL_ZOOM_SENSITIVITY = 0.002

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

export default function BoardCanvas({ theme }: BoardCanvasProps) {
  const boardRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<View | null>(null)
  const drawRef = useRef<() => void>(() => {})
  const zoomRef = useRef<(factor: number) => void>(() => {})
  const [zoomLimits, setZoomLimits] = useState({ atMin: false, atMax: false })

  useEffect(() => {
    drawRef.current()
  }, [theme])

  useEffect(() => {
    const board = boardRef.current
    const canvas = canvasRef.current
    if (!board || !canvas) return

    let previousSize = { width: 0, height: 0 }
    let drag: { pointerId: number; x: number; y: number } | null = null
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
    drawRef.current = scheduleDraw

    const applyView = (view: View) => {
      viewRef.current = view
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
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
      canvas.setPointerCapture(event.pointerId)
      canvas.classList.add('is-dragging')
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId || !viewRef.current) return
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
      drag = null
      canvas.classList.remove('is-dragging')
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
      drawRef.current = () => {}
      board.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
    }
  }, [])

  return (
    <main ref={boardRef} className="board" aria-label="Поле доски 3840 на 2160 пикселей">
      <canvas ref={canvasRef} className="board-canvas">
        Поле доски требует поддержки Canvas.
      </canvas>
      <ToolPanel />
      <ZoomControls
        onZoomOut={() => zoomRef.current(0.8)}
        onZoomIn={() => zoomRef.current(1.25)}
        atMinZoom={zoomLimits.atMin}
        atMaxZoom={zoomLimits.atMax}
      />
    </main>
  )
}
