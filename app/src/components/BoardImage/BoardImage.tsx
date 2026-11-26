import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { BOARD_HEIGHT, BOARD_WIDTH } from '../../gridHierarchy'
import HandleDot from '../HandleDot'
import './BoardImage.css'

export type BoardImageItem = { id: string; x: number; y: number; width: number; height: number; src: string; name?: string }
type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
type Gesture = { pointerId: number; clientX: number; clientY: number; start: BoardImageItem; corner?: Corner }
const CORNERS: Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

type Props = {
  item: BoardImageItem
  selected: boolean
  groupSelected: boolean
  interactive: boolean
  scale: number
  layer: number
  onSelect: (id: string, additive?: boolean) => void
  onChange: (id: string, changes: Partial<BoardImageItem>) => void
}

export default function BoardImage({ item, selected, groupSelected, interactive, scale, layer, onSelect, onChange }: Props) {
  const gesture = useRef<Gesture | null>(null)
  const startGesture = (event: ReactPointerEvent<HTMLButtonElement>, corner?: Corner) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const additive = event.ctrlKey || event.metaKey
    onSelect(item.id, additive)
    if (additive) return
    gesture.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, start: item, corner }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    const dx = (event.clientX - current.clientX) / scale
    const dy = (event.clientY - current.clientY) / scale
    const start = current.start
    if (!current.corner) {
      onChange(item.id, { x: Math.max(0, Math.min(BOARD_WIDTH - start.width, start.x + dx)),
        y: Math.max(0, Math.min(BOARD_HEIGHT - start.height, start.y + dy)) })
      return
    }
    const fromLeft = current.corner.endsWith('left')
    const fromTop = current.corner.startsWith('top')
    const anchorX = fromLeft ? start.x + start.width : start.x
    const anchorY = fromTop ? start.y + start.height : start.y
    const horizontal = dx * (fromLeft ? -1 : 1)
    const vertical = dy * (fromTop ? -1 : 1)
    const requested = 1 + (horizontal * start.width + vertical * start.height)
      / (start.width ** 2 + start.height ** 2)
    const minFactor = Math.max(24 / start.width, 24 / start.height)
    const maxFactor = Math.min(fromLeft ? anchorX / start.width : (BOARD_WIDTH - anchorX) / start.width,
      fromTop ? anchorY / start.height : (BOARD_HEIGHT - anchorY) / start.height)
    const factor = Math.max(minFactor, Math.min(maxFactor, requested))
    onChange(item.id, { x: fromLeft ? anchorX - start.width * factor : anchorX,
      y: fromTop ? anchorY - start.height * factor : anchorY,
      width: start.width * factor, height: start.height * factor })
  }
  const endGesture = () => { gesture.current = null }

  return <div className={`board-image${selected ? ' board-image--selected' : ''}`}
    data-board-object-kind="image" data-board-object-id={item.id}
    style={{ left: item.x, top: item.y, width: item.width, height: item.height, zIndex: layer,
      '--handle-inverse-scale': 1 / scale,
      '--handle-screen-size': `${Math.max(6, Math.min(18, 6 * scale))}px` } as CSSProperties}>
    <img src={item.src} alt={item.name ?? 'Изображение на доске'} draggable={false} />
    {interactive && <button type="button" className="board-image__body" aria-label={`Переместить ${item.name ?? 'изображение'}`}
      onPointerDown={(event) => startGesture(event)} onPointerMove={moveGesture}
      onPointerUp={endGesture} onPointerCancel={endGesture} />}
    {selected && !groupSelected && interactive && CORNERS.map((corner) => <button key={corner} type="button"
      className={`text-box__handle text-box__handle--${corner}`} aria-label={`Масштабировать изображение: ${corner}`}
      onPointerDown={(event) => startGesture(event, corner)} onPointerMove={moveGesture}
      onPointerUp={endGesture} onPointerCancel={endGesture}><HandleDot kind="resize" /></button>)}
  </div>
}
