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
  corner?: Corner; pageIndex?: number; pageCorner?: Corner; pageIds?: string[];
  groupCorner?: Corner; frameMove?: boolean }
const CORNERS: Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

type Props = {
  item: BoardImageItem
  selected: boolean
  selectedPageIds: string[]
  groupSelected: boolean
  interactive: boolean
  scale: number
  layer: number
  onSelect: (id: string, additive?: boolean) => void
  onPageSelect: (frameId: string, pageId: string, additive: boolean, range: boolean) => void
  onChange: (id: string, changes: Partial<BoardImageItem>) => void
}

export default function BoardImage({ item, selected, selectedPageIds, groupSelected, interactive, scale, layer,
  onSelect, onPageSelect, onChange }: Props) {
  const gesture = useRef<Gesture | null>(null)
  const selectedPages = item.framePages?.filter((page) => selectedPageIds.includes(page.id)) ?? []
  const pageGroupBounds = selectedPages.length > 1 ? {
    left: Math.min(...selectedPages.map((page) => page.x)),
    top: Math.min(...selectedPages.map((page) => page.y)),
    right: Math.max(...selectedPages.map((page) => page.x + page.width)),
    bottom: Math.max(...selectedPages.map((page) => page.y + page.height)),
  } : null
  const moveSize = 32 / scale
  const moveClearance = moveSize + 8
  const moveSide = item.y >= moveClearance && BOARD_WIDTH - item.x >= moveSize ? 'top'
    : BOARD_WIDTH - item.x - item.width >= moveClearance && BOARD_HEIGHT - item.y >= moveSize ? 'right'
      : item.x >= moveClearance && BOARD_HEIGHT - item.y >= moveSize ? 'left'
        : BOARD_HEIGHT - item.y - item.height >= moveClearance && BOARD_WIDTH - item.x >= moveSize
          ? 'bottom' : 'inside'
  const startGesture = (event: ReactPointerEvent<HTMLButtonElement>, options: Pick<Gesture, 'corner' | 'pageIndex' | 'pageCorner' | 'frameMove'> = {}) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const additive = event.ctrlKey || event.metaKey
    const range = event.shiftKey
    const page = options.pageIndex === undefined ? null : item.framePages?.[options.pageIndex]
    const keepPageGroup = Boolean(page && !options.pageCorner && !additive && !range
      && selectedPageIds.length > 1 && selectedPageIds.includes(page.id))
    if (page) {
      if (!keepPageGroup) onPageSelect(item.id, page.id, additive, range)
    } else onSelect(item.id, additive)
    if (additive || range) return
    gesture.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
      start: item, ...options, pageIds: keepPageGroup ? selectedPageIds : undefined }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const startPageGroupGesture = (event: ReactPointerEvent<HTMLButtonElement>, groupCorner?: Corner) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    gesture.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
      start: item, pageIds: selectedPageIds, groupCorner }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    const dx = (event.clientX - current.clientX) / scale
    const dy = (event.clientY - current.clientY) / scale
    const start = current.start
    if (current.pageIds?.length && start.framePages) {
      const ids = new Set(current.pageIds)
      const pages = start.framePages.filter((page) => ids.has(page.id))
      if (!pages.length) return
      const left = Math.min(...pages.map((page) => page.x))
      const top = Math.min(...pages.map((page) => page.y))
      const right = Math.max(...pages.map((page) => page.x + page.width))
      const bottom = Math.max(...pages.map((page) => page.y + page.height))
      if (current.groupCorner) {
        const fromLeft = current.groupCorner.endsWith('left')
        const fromTop = current.groupCorner.startsWith('top')
        const anchorX = fromLeft ? right : left
        const anchorY = fromTop ? bottom : top
        const width = right - left
        const height = bottom - top
        const requested = 1 + (dx * (fromLeft ? -1 : 1) * width
          + dy * (fromTop ? -1 : 1) * height) / (width ** 2 + height ** 2)
        const minFactor = Math.max(...pages.map((page) => Math.max(24 / page.width, 24 / page.height)))
        const maxFactor = Math.min(fromLeft ? anchorX / width : (start.width - anchorX) / width,
          fromTop ? anchorY / height : (start.height - anchorY) / height)
        if (maxFactor < minFactor) return
        const factor = Math.max(minFactor, Math.min(maxFactor, requested))
        onChange(item.id, { framePages: start.framePages.map((page) => ids.has(page.id)
          ? { ...page, x: anchorX + (page.x - anchorX) * factor,
            y: anchorY + (page.y - anchorY) * factor,
            width: page.width * factor, height: page.height * factor } : page) })
        return
      }
      const moveX = Math.max(-left, Math.min(dx, start.width - right))
      const moveY = Math.max(-top, Math.min(dy, start.height - bottom))
      onChange(item.id, { framePages: start.framePages.map((page) => ids.has(page.id)
        ? { ...page, x: page.x + moveX, y: page.y + moveY } : page) })
      return
    }
    if (current.pageIndex !== undefined && start.framePages) {
      const page = start.framePages[current.pageIndex]
      if (!page) return
      if (current.pageCorner) {
        const fromLeft = current.pageCorner.endsWith('left')
        const fromTop = current.pageCorner.startsWith('top')
        const anchorX = fromLeft ? page.x + page.width : page.x
        const anchorY = fromTop ? page.y + page.height : page.y
        const horizontal = dx * (fromLeft ? -1 : 1)
        const vertical = dy * (fromTop ? -1 : 1)
        const requested = 1 + (horizontal * page.width + vertical * page.height)
          / (page.width ** 2 + page.height ** 2)
        const minFactor = Math.max(24 / page.width, 24 / page.height)
        const maxFactor = Math.min((fromLeft ? anchorX : start.width - anchorX) / page.width,
          (fromTop ? anchorY : start.height - anchorY) / page.height)
        const factor = Math.max(0, Math.min(maxFactor, Math.max(minFactor, requested)))
        onChange(item.id, { framePages: start.framePages.map((candidate, index) => index === current.pageIndex
          ? { ...candidate, x: fromLeft ? anchorX - page.width * factor : anchorX,
            y: fromTop ? anchorY - page.height * factor : anchorY,
            width: page.width * factor, height: page.height * factor } : candidate) })
        return
      }
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
      aria-label={item.frame ? `Переместить фрейм ${item.name ?? ''}` : `Переместить ${item.name ?? 'изображение'}`}
      onPointerDown={(event) => startGesture(event, item.frame ? { frameMove: true } : {})} onPointerMove={moveGesture}
      onPointerUp={endGesture} onPointerCancel={endGesture} />}
    {item.framePages?.map((page, index) => <button key={page.id} type="button"
      className={`board-image__page${selectedPageIds.includes(page.id) ? ' board-image__page--selected' : ''}`}
      data-board-page-id={page.id} aria-pressed={selectedPageIds.includes(page.id)}
      aria-label={`Страница ${index + 1} документа ${item.name ?? ''}`}
      style={{ left: page.x, top: page.y, width: page.width, height: page.height }}
      disabled={!interactive || groupSelected}
      onPointerDown={(event) => startGesture(event, { pageIndex: index })}
      onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={endGesture}>
      <img src={page.src} alt="" draggable={false} />
    </button>)}
    {interactive && !groupSelected && pageGroupBounds && <>
      <button type="button" className="board-image__page-group-move"
        aria-label="Переместить выделенные страницы"
        style={{ left: pageGroupBounds.left, top: pageGroupBounds.top,
          width: pageGroupBounds.right - pageGroupBounds.left,
          height: pageGroupBounds.bottom - pageGroupBounds.top }}
        onPointerDown={(event) => startPageGroupGesture(event)} onPointerMove={moveGesture}
        onPointerUp={endGesture} onPointerCancel={endGesture} />
      <div className="board-image__page-group" style={{ left: pageGroupBounds.left, top: pageGroupBounds.top,
        width: pageGroupBounds.right - pageGroupBounds.left,
        height: pageGroupBounds.bottom - pageGroupBounds.top }}>
        {CORNERS.map((corner) => <button key={corner} type="button"
          className={`text-box__handle text-box__handle--${corner}`}
          aria-label={`Масштабировать выделенные страницы: ${corner}`}
          onPointerDown={(event) => startPageGroupGesture(event, corner)} onPointerMove={moveGesture}
          onPointerUp={endGesture} onPointerCancel={endGesture}>
          <HandleDot kind="resize" />
        </button>)}
      </div>
    </>}
    {selected && selectedPageIds.length === 1 && !groupSelected && interactive && item.framePages?.map((page, index) =>
      page.id === selectedPageIds[0] && <div key={page.id} className="board-image__page-handles"
        style={{ left: page.x, top: page.y, width: page.width, height: page.height }}>
        {CORNERS.map((corner) => <button key={corner} type="button"
          className={`text-box__handle text-box__handle--${corner}`}
          aria-label={`Масштабировать страницу ${index + 1}: ${corner}`}
          onPointerDown={(event) => startGesture(event, { pageIndex: index, pageCorner: corner })}
          onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={endGesture}>
          <HandleDot kind="resize" />
        </button>)}
      </div>)}
    {item.frame && selected && !groupSelected && interactive && <button type="button"
      className={`board-image__move board-image__move--${moveSide}`}
      aria-label={`Переместить фрейм ${item.name ?? ''}`} title="Переместить фрейм"
      style={{ '--table-control-scale': 1 / scale } as CSSProperties}
      onPointerDown={(event) => startGesture(event, { frameMove: true })} onPointerMove={moveGesture}
      onPointerUp={endGesture} onPointerCancel={endGesture}>
      <img src={dotsIcon} alt="" aria-hidden="true" />
    </button>}
    {selected && !selectedPageIds.length && !groupSelected && interactive && CORNERS.map((corner) => <button key={corner} type="button"
      className={`text-box__handle text-box__handle--${corner}`} aria-label={`Масштабировать изображение: ${corner}`}
      onPointerDown={(event) => startGesture(event, { corner })} onPointerMove={moveGesture}
      onPointerUp={endGesture} onPointerCancel={endGesture}><HandleDot kind="resize" /></button>)}
  </div>
}
