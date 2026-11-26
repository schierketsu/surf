import { useRef } from 'react'
import { BOARD_WIDTH } from '../../gridHierarchy'
import { MAX_FONT_SIZE, MIN_FONT_SIZE, MIN_TEXT_HEIGHT, MIN_TEXT_WIDTH } from '../TextBox/TextBox'
import './GroupSelection.css'

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
type Edge = 'top' | 'right' | 'bottom' | 'left'
type Bounds = { left: number; top: number; right: number; bottom: number }
export type GroupSelectionItem = {
  id: string
  kind: 'text' | 'sticker' | 'drawing' | 'arrow' | 'table' | 'image'
  x: number
  y: number
  width: number
  height: number
  fontSize?: number
  minScale?: number
}
type Gesture = {
  pointerId: number
  corner?: Corner
  edge?: Edge
  clientX: number
  clientY: number
  bounds: Bounds
  items: GroupSelectionItem[]
}
type MoveGesture = { pointerId: number; clientX: number; clientY: number; items: GroupSelectionItem[] }

type GroupSelectionProps = {
  items: GroupSelectionItem[]
  view: { x: number; y: number; scale: number }
  minY: number
  maxY: number
  onToggle: (id: string) => void
  onTransformStart: () => void
  onMove: (items: GroupSelectionItem[], dx: number, dy: number) => void
  onScale: (items: GroupSelectionItem[], anchorX: number, anchorY: number, factor: number) => void
}

const CORNERS = [
  { corner: 'top-left', label: 'верхний левый' },
  { corner: 'top-right', label: 'верхний правый' },
  { corner: 'bottom-left', label: 'нижний левый' },
  { corner: 'bottom-right', label: 'нижний правый' },
] as const

const EDGES = [
  { edge: 'top', label: 'верхняя' },
  { edge: 'right', label: 'правая' },
  { edge: 'bottom', label: 'нижняя' },
  { edge: 'left', label: 'левая' },
] as const

function getBounds(items: GroupSelectionItem[]): Bounds {
  return {
    left: Math.min(...items.map((item) => item.x)),
    top: Math.min(...items.map((item) => item.y)),
    right: Math.max(...items.map((item) => item.x + item.width)),
    bottom: Math.max(...items.map((item) => item.y + item.height)),
  }
}

export default function GroupSelection({ items, view, minY, maxY, onToggle, onTransformStart, onMove, onScale }: GroupSelectionProps) {
  const gesture = useRef<Gesture | null>(null)
  const moveGesture = useRef<MoveGesture | null>(null)
  const bounds = getBounds(items)
  const screenBounds = {
    left: view.x + bounds.left * view.scale,
    top: view.y + bounds.top * view.scale,
    width: (bounds.right - bounds.left) * view.scale,
    height: (bounds.bottom - bounds.top) * view.scale,
  }
  const handleScale = view.scale * items.reduce((sum, item) => sum
    + (item.kind === 'text' && item.fontSize ? item.fontSize / MIN_FONT_SIZE : 1), 0) / items.length

  const startMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (event.ctrlKey || event.metaKey) {
      const object = document.elementsFromPoint(event.clientX, event.clientY)
        .map((element) => element.closest<HTMLElement>('[data-board-object-id]'))
        .find((element): element is HTMLElement => Boolean(element?.dataset.boardObjectId))
      if (object?.dataset.boardObjectId) onToggle(object.dataset.boardObjectId)
      return
    }
    onTransformStart()
    moveGesture.current = {
      pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
      items: items.map((item) => ({ ...item })),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const continueMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = moveGesture.current
    if (!start || start.pointerId !== event.pointerId) return
    onMove(start.items, (event.clientX - start.clientX) / view.scale, (event.clientY - start.clientY) / view.scale)
  }

  const endMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (moveGesture.current?.pointerId !== event.pointerId) return
    moveGesture.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const startScale = (event: React.PointerEvent<HTMLButtonElement>, corner?: Corner, edge?: Edge) => {
    event.preventDefault()
    event.stopPropagation()
    onTransformStart()
    gesture.current = {
      pointerId: event.pointerId, corner, edge, clientX: event.clientX, clientY: event.clientY,
      bounds, items: items.map((item) => ({ ...item })),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const continueScale = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = gesture.current
    if (!start || start.pointerId !== event.pointerId) return

    const width = start.bounds.right - start.bounds.left
    const height = start.bounds.bottom - start.bounds.top
    const dx = (event.clientX - start.clientX) / view.scale
    const dy = (event.clientY - start.clientY) / view.scale
    let anchorX: number
    let anchorY: number
    let requestedFactor: number
    if (start.edge) {
      const edge = start.edge
      anchorX = edge === 'left' ? start.bounds.right : edge === 'right' ? start.bounds.left : (start.bounds.left + start.bounds.right) / 2
      anchorY = edge === 'top' ? start.bounds.bottom : edge === 'bottom' ? start.bounds.top : (start.bounds.top + start.bounds.bottom) / 2
      requestedFactor = 1 + (edge === 'left' ? -dx / width : edge === 'right' ? dx / width
        : edge === 'top' ? -dy / height : dy / height)
    } else {
      const corner = start.corner!
      const fromLeft = corner.endsWith('left')
      const fromTop = corner.startsWith('top')
      anchorX = fromLeft ? start.bounds.right : start.bounds.left
      anchorY = fromTop ? start.bounds.bottom : start.bounds.top
      requestedFactor = 1 + (dx * (fromLeft ? -1 : 1) * width + dy * (fromTop ? -1 : 1) * height)
        / (width ** 2 + height ** 2)
    }
    const minFactor = Math.max(...start.items.map((item) => item.kind === 'text' && item.fontSize
      ? Math.max(MIN_FONT_SIZE / item.fontSize, MIN_TEXT_WIDTH / item.width, MIN_TEXT_HEIGHT / item.height)
      : item.kind === 'sticker' ? Math.max(56 / item.width, 56 / item.height)
        : item.kind === 'table' ? item.minScale ?? .05
        : item.kind === 'drawing' ? Math.max(2 / item.width, 2 / item.height)
          : item.kind === 'image' ? Math.max(24 / item.width, 24 / item.height)
          : .05))
    const maxFactor = Math.min(
      ...start.items.map((item) => item.kind === 'text' && item.fontSize ? MAX_FONT_SIZE / item.fontSize : Infinity),
      anchorX > start.bounds.left ? anchorX / (anchorX - start.bounds.left) : Infinity,
      anchorX < start.bounds.right ? (BOARD_WIDTH - anchorX) / (start.bounds.right - anchorX) : Infinity,
      anchorY > start.bounds.top ? (anchorY - minY) / (anchorY - start.bounds.top) : Infinity,
      anchorY < start.bounds.bottom ? (maxY - anchorY) / (start.bounds.bottom - anchorY) : Infinity,
    )
    if (maxFactor < minFactor) return
    onScale(start.items, anchorX, anchorY, Math.max(minFactor, Math.min(maxFactor, requestedFactor)))
  }

  const endScale = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (gesture.current?.pointerId !== event.pointerId) return
    gesture.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <>
    <button type="button" className="group-selection__move-area" style={screenBounds}
      aria-label="Переместить выделенные объекты" title="Перетащить выделенную группу"
      onPointerDown={startMove} onPointerMove={continueMove} onPointerUp={endMove} onPointerCancel={endMove} />
    <div className="group-selection" style={{ ...screenBounds, '--selection-handle-scale': handleScale,
      '--connector-scale': view.scale * Math.sqrt(handleScale / view.scale) } as React.CSSProperties}>
      {EDGES.map(({ edge, label }) => <button key={edge} type="button"
        className={`group-selection__drag-area group-selection__drag-area--${edge}`}
        aria-label={`Масштабировать выделенные объекты: ${label} граница`}
        title="Масштабировать выделенные объекты"
        onPointerDown={(event) => startScale(event, undefined, edge)}
        onPointerMove={continueScale}
        onPointerUp={endScale}
        onPointerCancel={endScale} />)}
      {CORNERS.map(({ corner, label }) => <button key={corner} type="button"
        className={`group-selection__handle group-selection__handle--${corner}`}
        aria-label={`Масштабировать выделенные объекты: ${label} угол`}
        title="Масштабировать выделенные объекты"
        onPointerDown={(event) => startScale(event, corner)}
        onPointerMove={continueScale}
        onPointerUp={endScale}
        onPointerCancel={endScale} />)}
    </div>
    </>
  )
}
