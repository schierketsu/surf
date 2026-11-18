import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { BOARD_HEIGHT, BOARD_WIDTH } from '../../gridHierarchy'
import type { Point } from '../../ArrowLayer'
import HandleDot from '../HandleDot'
import './Drawing.css'

export type DrawingItem = {
  id: string
  x: number
  y: number
  width: number
  height: number
  color: string
  strokeWidth: number
  points: Point[]
}

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
type Gesture = { mode: 'move' | 'resize'; pointerId: number; clientX: number; clientY: number;
  corner?: Corner; start: DrawingItem }

const CORNERS: Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const MIN_DRAWING_SIZE = 2

export function drawingPath(points: Point[]) {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y} l .01 0`
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
  let path = `M ${points[0].x} ${points[0].y}`
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]
    const next = points[index + 1]
    path += ` Q ${point.x} ${point.y} ${(point.x + next.x) / 2} ${(point.y + next.y) / 2}`
  }
  const last = points[points.length - 1]
  return `${path} L ${last.x} ${last.y}`
}

type Props = {
  item: DrawingItem
  selected: boolean
  interactive: boolean
  scale: number
  onSelect: (id: string) => void
  onChange: (id: string, changes: Partial<DrawingItem>) => void
}

export default function Drawing({ item, selected, interactive, scale, onSelect, onChange }: Props) {
  const gesture = useRef<Gesture | null>(null)

  const startGesture = (event: ReactPointerEvent<HTMLButtonElement>, mode: Gesture['mode'], corner?: Corner) => {
    event.preventDefault()
    event.stopPropagation()
    onSelect(item.id)
    gesture.current = { mode, corner, pointerId: event.pointerId, clientX: event.clientX,
      clientY: event.clientY, start: { ...item, points: item.points.map((point) => ({ ...point })) } }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const continueGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    const dx = (event.clientX - current.clientX) / scale
    const dy = (event.clientY - current.clientY) / scale
    const start = current.start
    if (current.mode === 'move') {
      onChange(item.id, {
        x: Math.max(0, Math.min(BOARD_WIDTH - start.width, start.x + dx)),
        y: Math.max(0, Math.min(BOARD_HEIGHT - start.height, start.y + dy)),
      })
      return
    }

    const corner = current.corner!
    const fromLeft = corner.endsWith('left')
    const fromTop = corner.startsWith('top')
    const anchorX = fromLeft ? start.x + start.width : start.x
    const anchorY = fromTop ? start.y + start.height : start.y
    const horizontal = dx * (fromLeft ? -1 : 1)
    const vertical = dy * (fromTop ? -1 : 1)
    const factor = 1 + (horizontal * start.width + vertical * start.height)
      / (start.width ** 2 + start.height ** 2)
    const minFactor = Math.max(MIN_DRAWING_SIZE / start.width, MIN_DRAWING_SIZE / start.height)
    const maxFactor = Math.min(
      fromLeft ? anchorX / start.width : (BOARD_WIDTH - anchorX) / start.width,
      fromTop ? anchorY / start.height : (BOARD_HEIGHT - anchorY) / start.height,
    )
    const bounded = Math.max(minFactor, Math.min(maxFactor, factor))
    onChange(item.id, {
      x: fromLeft ? anchorX - start.width * bounded : anchorX,
      y: fromTop ? anchorY - start.height * bounded : anchorY,
      width: start.width * bounded,
      height: start.height * bounded,
      strokeWidth: start.strokeWidth * bounded,
      points: start.points.map((point) => ({ x: point.x * bounded, y: point.y * bounded })),
    })
  }

  const finishGesture = () => { gesture.current = null }

  return <div className={`board-drawing${selected ? ' board-drawing--selected' : ''}`}
    style={{ left: item.x, top: item.y, width: item.width, height: item.height,
      '--handle-inverse-scale': 1 / scale,
      '--handle-screen-size': `${Math.max(6, Math.min(18, 6 * scale))}px` } as CSSProperties}
    onPointerDown={(event) => { event.stopPropagation(); if (interactive) onSelect(item.id) }}>
    <svg className="board-drawing__stroke" width="100%" height="100%"
      viewBox={`0 0 ${item.width} ${item.height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={drawingPath(item.points)} fill="none" stroke={item.color} strokeWidth={item.strokeWidth}
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    {interactive && <button type="button" className="board-drawing__body" aria-label="Переместить рисунок"
      onPointerDown={(event) => startGesture(event, 'move')} onPointerMove={continueGesture}
      onPointerUp={finishGesture} onPointerCancel={finishGesture} />}
    {selected && interactive && CORNERS.map((corner) => <button key={corner} type="button"
      className={`text-box__handle text-box__handle--${corner}`} aria-label={`Масштабировать рисунок: ${corner}`}
      onPointerDown={(event) => startGesture(event, 'resize', corner)} onPointerMove={continueGesture}
      onPointerUp={finishGesture} onPointerCancel={finishGesture}><HandleDot kind="resize" /></button>)}
  </div>
}
