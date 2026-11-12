import { useRef } from 'react'
import { BOARD_HEIGHT, BOARD_WIDTH } from '../../gridHierarchy'
import { MAX_FONT_SIZE, MIN_FONT_SIZE, MIN_TEXT_HEIGHT, MIN_TEXT_WIDTH, type TextItem } from '../TextBox/TextBox'
import './GroupSelection.css'

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
type Bounds = { left: number; top: number; right: number; bottom: number }
type Gesture = {
  pointerId: number
  corner: Corner
  clientX: number
  clientY: number
  bounds: Bounds
  items: TextItem[]
}

type GroupSelectionProps = {
  items: TextItem[]
  view: { x: number; y: number; scale: number }
  onScale: (items: TextItem[], anchorX: number, anchorY: number, factor: number) => void
}

const CORNERS = [
  { corner: 'top-left', label: 'верхний левый' },
  { corner: 'top-right', label: 'верхний правый' },
  { corner: 'bottom-left', label: 'нижний левый' },
  { corner: 'bottom-right', label: 'нижний правый' },
] as const

function getBounds(items: TextItem[]): Bounds {
  return {
    left: Math.min(...items.map((item) => item.x)),
    top: Math.min(...items.map((item) => item.y)),
    right: Math.max(...items.map((item) => item.x + item.width)),
    bottom: Math.max(...items.map((item) => item.y + item.height)),
  }
}

export default function GroupSelection({ items, view, onScale }: GroupSelectionProps) {
  const gesture = useRef<Gesture | null>(null)
  const bounds = getBounds(items)

  const startScale = (event: React.PointerEvent<HTMLButtonElement>, corner: Corner) => {
    event.preventDefault()
    event.stopPropagation()
    gesture.current = {
      pointerId: event.pointerId, corner, clientX: event.clientX, clientY: event.clientY,
      bounds, items: items.map((item) => ({ ...item })),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const continueScale = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = gesture.current
    if (!start || start.pointerId !== event.pointerId) return

    const fromLeft = start.corner.endsWith('left')
    const fromTop = start.corner.startsWith('top')
    const anchorX = fromLeft ? start.bounds.right : start.bounds.left
    const anchorY = fromTop ? start.bounds.bottom : start.bounds.top
    const width = start.bounds.right - start.bounds.left
    const height = start.bounds.bottom - start.bounds.top
    const dx = (event.clientX - start.clientX) / view.scale * (fromLeft ? -1 : 1)
    const dy = (event.clientY - start.clientY) / view.scale * (fromTop ? -1 : 1)
    const requestedFactor = 1 + (dx * width + dy * height) / (width ** 2 + height ** 2)
    const minFactor = Math.max(...start.items.map((item) => Math.max(
      MIN_FONT_SIZE / item.fontSize, MIN_TEXT_WIDTH / item.width, MIN_TEXT_HEIGHT / item.height,
    )))
    const maxFactor = Math.min(
      ...start.items.map((item) => MAX_FONT_SIZE / item.fontSize),
      (fromLeft ? anchorX : BOARD_WIDTH - anchorX) / width,
      (fromTop ? anchorY : BOARD_HEIGHT - anchorY) / height,
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
    <div className="group-selection" style={{
      left: view.x + bounds.left * view.scale,
      top: view.y + bounds.top * view.scale,
      width: (bounds.right - bounds.left) * view.scale,
      height: (bounds.bottom - bounds.top) * view.scale,
    }}>
      {CORNERS.map(({ corner, label }) => <button key={corner} type="button"
        className={`group-selection__handle group-selection__handle--${corner}`}
        aria-label={`Масштабировать выделенные тексты: ${label} угол`}
        title="Масштабировать выделенные тексты"
        onPointerDown={(event) => startScale(event, corner)}
        onPointerMove={continueScale}
        onPointerUp={endScale}
        onPointerCancel={endScale} />)}
    </div>
  )
}
