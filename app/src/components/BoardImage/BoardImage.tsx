import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { BOARD_HEIGHT, BOARD_WIDTH } from '../../gridHierarchy'
import HandleDot from '../HandleDot'
import dotsIcon from '../../../../assets/dots.png'
import './BoardImage.css'

export type PdfFramePage = { id: string; x: number; y: number; width: number; height: number; src: string }
export type BoardImageItem = { id: string; x: number; y: number; width: number; height: number; src: string; name?: string;
  frame?: boolean; framePages?: PdfFramePage[] }
type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
type Gesture = { pointerId: number; clientX: number; clientY: number; start: BoardImageItem;
  corner?: Corner; pageIndex?: number; frameMove?: boolean }
const CORNERS: Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

type Props = {
  item: BoardImageItem
  selected: boolean
  selectedPageId: string | null
  groupSelected: boolean
  interactive: boolean
  scale: number
  layer: number
  onSelect: (id: string, additive?: boolean) => void
  onPageSelect: (frameId: string, pageId: string) => void
  onChange: (id: string, changes: Partial<BoardImageItem>) => void
}

export default function BoardImage({ item, selected, selectedPageId, groupSelected, interactive, scale, layer,
  onSelect, onPageSelect, onChange }: Props) {
  const gesture = useRef<Gesture | null>(null)
  const startGesture = (event: ReactPointerEvent<HTMLButtonElement>, options: Pick<Gesture, 'corner' | 'pageIndex' | 'frameMove'> = {}) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const additive = event.ctrlKey || event.metaKey
    const page = options.pageIndex === undefined ? null : item.framePages?.[options.pageIndex]
    if (page) onPageSelect(item.id, page.id)
    else onSelect(item.id, additive)
    if (additive || (item.frame && options.pageIndex === undefined && !options.frameMove && !options.corner)) return
    gesture.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
      start: item, ...options }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    const dx = (event.clientX - current.clientX) / scale
    const dy = (event.clientY - current.clientY) / scale
    const start = current.start
    if (current.pageIndex !== undefined && start.framePages) {
      const page = start.framePages[current.pageIndex]
      if (!page) return
      onChange(item.id, { framePages: start.framePages.map((candidate, index) => index === current.pageIndex
        ? { ...candidate, x: Math.max(0, Math.min(start.width - page.width, page.x + dx)),
          y: Math.max(0, Math.min(start.height - page.height, page.y + dy)) } : candidate) })
      return
    }
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
      width: start.width * factor, height: start.height * factor,
      framePages: start.framePages?.map((page) => ({ ...page, x: page.x * factor, y: page.y * factor,
        width: page.width * factor, height: page.height * factor })) })
  }
  const endGesture = () => { gesture.current = null }

  return <div className={`board-image${item.frame ? ' board-image--frame' : ''}${selected ? ' board-image--selected' : ''}`}
    data-board-object-kind="image" data-board-object-id={item.id}
    style={{ left: item.x, top: item.y, width: item.width, height: item.height, zIndex: layer,
      '--handle-inverse-scale': 1 / scale,
      '--handle-screen-size': `${Math.max(6, Math.min(18, 6 * scale))}px` } as CSSProperties}>
    {!item.framePages && <img className="board-image__content" src={item.src}
      alt={item.name ?? 'Изображение на доске'} draggable={false} />}
    {interactive && <button type="button" className="board-image__body"
      aria-label={item.frame ? `Выделить фрейм ${item.name ?? ''}` : `Переместить ${item.name ?? 'изображение'}`}
      onPointerDown={(event) => startGesture(event)} onPointerMove={moveGesture}
      onPointerUp={endGesture} onPointerCancel={endGesture} />}
    {item.framePages?.map((page, index) => <button key={page.id} type="button"
      className={`board-image__page${selectedPageId === page.id ? ' board-image__page--selected' : ''}`}
      data-board-page-id={page.id} aria-pressed={selectedPageId === page.id}
      aria-label={`Страница ${index + 1} документа ${item.name ?? ''}`}
      style={{ left: page.x, top: page.y, width: page.width, height: page.height }}
      disabled={!interactive || groupSelected}
      onPointerDown={(event) => startGesture(event, { pageIndex: index })}
      onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={endGesture}>
      <img src={page.src} alt="" draggable={false} />
    </button>)}
    {item.frame && selected && !groupSelected && interactive && <button type="button" className="board-image__move"
      aria-label={`Переместить фрейм ${item.name ?? ''}`} title="Переместить фрейм"
      style={{ '--table-control-scale': 1 / scale } as CSSProperties}
      onPointerDown={(event) => startGesture(event, { frameMove: true })} onPointerMove={moveGesture}
      onPointerUp={endGesture} onPointerCancel={endGesture}>
      <img src={dotsIcon} alt="" aria-hidden="true" />
    </button>}
    {selected && !groupSelected && interactive && CORNERS.map((corner) => <button key={corner} type="button"
      className={`text-box__handle text-box__handle--${corner}`} aria-label={`Масштабировать изображение: ${corner}`}
      onPointerDown={(event) => startGesture(event, { corner })} onPointerMove={moveGesture}
      onPointerUp={endGesture} onPointerCancel={endGesture}><HandleDot kind="resize" /></button>)}
  </div>
}
