import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { BOARD_HEIGHT, BOARD_WIDTH } from '../../gridHierarchy'
import type { ConnectorSide } from '../TextBox/TextBox'
import type { StickerStyle } from '../ToolPanel/ToolPanel'
import HandleDot from '../HandleDot'
import './Sticker.css'

const MIN_STICKER_SIZE = 56
type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
type Gesture = { mode: 'move' | 'corner' | 'edge'; pointerId: number; clientX: number; clientY: number;
  start: StickerItem; corner?: Corner; edge?: ConnectorSide }

const CORNERS: Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const SIDES: ConnectorSide[] = ['top', 'right', 'bottom', 'left']

function hasStickerText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;/gi, '')
    .replace(/\u00a0/g, '')
    .trim().length > 0
}

export type StickerItem = StickerStyle & {
  id: string
  x: number
  y: number
  width: number
  height: number
  html: string
  fontSize: number
  align: 'left' | 'center' | 'right'
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikeThrough?: boolean
}

type Props = {
  item: StickerItem
  selected: boolean
  groupSelected: boolean
  interactive: boolean
  editing: boolean
  focusOnMount: boolean
  scale: number
  layer: number
  showConnectors: boolean
  occupiedSides: ConnectorSide[]
  snapSide: ConnectorSide | null
  onSelect: (id: string, additive?: boolean) => void
  onEdit: (id: string) => void
  onChange: (id: string, changes: Partial<StickerItem>) => void
  onEditorRef: (id: string, node: HTMLDivElement | null) => void
  onSaveSelection: () => void
  onConnectorStart: (id: string, side: ConnectorSide, client: { x: number; y: number }, pointerId: number) => void
}

export default function Sticker({ item, selected, groupSelected, interactive, editing, focusOnMount, scale, layer, showConnectors, occupiedSides, snapSide,
  onSelect, onEdit, onChange, onEditorRef, onSaveSelection, onConnectorStart }: Props) {
  const gesture = useRef<Gesture | null>(null)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const empty = !hasStickerText(item.html)

  const fitText = () => {
    const editor = editorRef.current
    if (!editor) return
    let low = 8
    let high = 16
    let best = low
    while (low <= high) {
      const size = Math.floor((low + high) / 2)
      editor.style.fontSize = `${size}px`
      if (editor.scrollHeight <= editor.clientHeight + 1 && editor.scrollWidth <= editor.clientWidth + 1) {
        best = size
        low = size + 1
      } else {
        high = size - 1
      }
    }
    editor.style.fontSize = `${best}px`
    if (item.fontSize !== best) onChange(item.id, { fontSize: best })
  }

  useLayoutEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    if (document.activeElement !== editor && editor.innerHTML !== item.html) editor.innerHTML = item.html
    fitText()
  }, [item.html, item.width, item.height, item.bold, item.italic, item.underline, item.strikeThrough])

  useEffect(() => {
    if (!focusOnMount || !editorRef.current) return
    const editor = editorRef.current
    const frame = requestAnimationFrame(() => {
      editor.focus()
      const selection = window.getSelection()
      selection?.selectAllChildren(editor)
      selection?.collapseToEnd()
    })
    return () => cancelAnimationFrame(frame)
  }, [focusOnMount])

  const startGesture = (event: React.PointerEvent<HTMLButtonElement>, mode: Gesture['mode'], corner?: Corner, edge?: ConnectorSide) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const additive = event.ctrlKey || event.metaKey
    onSelect(item.id, additive)
    if (additive) return
    gesture.current = { mode, corner, edge, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, start: { ...item } }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const continueGesture = (event: React.PointerEvent<HTMLButtonElement>) => {
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

    if (current.mode === 'edge') {
      const edge = current.edge!
      if (edge === 'left') {
        const x = Math.max(0, Math.min(start.x + start.width - MIN_STICKER_SIZE, start.x + dx))
        onChange(item.id, { x, width: start.x + start.width - x })
      } else if (edge === 'right') {
        onChange(item.id, { width: Math.max(MIN_STICKER_SIZE, Math.min(BOARD_WIDTH - start.x, start.width + dx)) })
      } else if (edge === 'top') {
        const y = Math.max(0, Math.min(start.y + start.height - MIN_STICKER_SIZE, start.y + dy))
        onChange(item.id, { y, height: start.y + start.height - y })
      } else {
        onChange(item.id, { height: Math.max(MIN_STICKER_SIZE, Math.min(BOARD_HEIGHT - start.y, start.height + dy)) })
      }
      return
    }

    const corner = current.corner!
    const fromLeft = corner.endsWith('left')
    const fromTop = corner.startsWith('top')
    const anchorX = fromLeft ? start.x + start.width : start.x
    const anchorY = fromTop ? start.y + start.height : start.y
    const horizontal = dx * (fromLeft ? -1 : 1)
    const vertical = dy * (fromTop ? -1 : 1)
    const factor = 1 + (horizontal * start.width + vertical * start.height) / (start.width ** 2 + start.height ** 2)
    const minFactor = Math.max(MIN_STICKER_SIZE / start.width, MIN_STICKER_SIZE / start.height)
    const maxFactor = Math.min(
      fromLeft ? anchorX / start.width : (BOARD_WIDTH - anchorX) / start.width,
      fromTop ? anchorY / start.height : (BOARD_HEIGHT - anchorY) / start.height,
    )
    const bounded = Math.max(minFactor, Math.min(maxFactor, factor))
    const width = start.width * bounded
    const height = start.height * bounded
    onChange(item.id, {
      x: fromLeft ? anchorX - width : anchorX,
      y: fromTop ? anchorY - height : anchorY,
      width,
      height,
    })
  }

  const finishGesture = () => { gesture.current = null }

  return <div className={`board-sticker${selected ? ' board-sticker--selected' : ''}`}
    data-board-object-kind="sticker" data-board-object-id={item.id}
    aria-label={`${item.name} стикер`}
    style={{ left: item.x, top: item.y, width: item.width, height: item.height, backgroundColor: item.fill, zIndex: layer,
      '--handle-inverse-scale': 1 / scale,
      '--handle-screen-size': `${Math.max(6, Math.min(18, 6 * scale))}px` } as CSSProperties}>
    <div ref={(node) => { editorRef.current = node; onEditorRef(item.id, node) }}
      className={`board-sticker__editor${empty ? ' board-sticker__editor--empty' : ''}`}
      contentEditable={interactive && editing} suppressContentEditableWarning spellCheck={false}
      tabIndex={interactive && editing ? 0 : -1} role="textbox" aria-label="Текст стикера" aria-multiline="true"
      style={{ fontSize: item.fontSize, textAlign: item.align, fontWeight: item.bold ? 700 : undefined,
        fontStyle: item.italic ? 'italic' : undefined,
        textDecoration: [item.underline && 'underline', item.strikeThrough && 'line-through'].filter(Boolean).join(' ') || undefined }}
      onPointerDown={(event) => { if (editing) event.stopPropagation() }}
      onInput={(event) => {
        const html = event.currentTarget.textContent?.replace(/\u00a0/g, '').trim()
          ? event.currentTarget.innerHTML : ''
        onChange(item.id, { html })
        requestAnimationFrame(fitText)
      }}
      onFocus={() => { if (interactive) onSelect(item.id) }}
      onBlur={(event) => onChange(item.id, { html: event.currentTarget.textContent?.replace(/\u00a0/g, '').trim()
        ? event.currentTarget.innerHTML : '' })}
      onKeyDown={(event) => { if (event.key === 'Escape') event.currentTarget.blur() }}
      onKeyUp={onSaveSelection} onMouseUp={onSaveSelection} />
    {interactive && !editing && <button type="button" className="board-sticker__body" aria-label="Переместить стикер"
      onPointerDown={(event) => startGesture(event, 'move')} onPointerMove={continueGesture}
      onPointerUp={finishGesture} onPointerCancel={finishGesture}
      onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); onEdit(item.id) }} />}
    {selected && !groupSelected && SIDES.map((side) => <button key={`edge-${side}`} type="button"
      className={`text-box__drag-area text-box__drag-area--${side}`} aria-label={`Изменить размер стикера: ${side} сторона`}
      onPointerDown={(event) => startGesture(event, 'edge', undefined, side)} onPointerMove={continueGesture}
      onPointerUp={finishGesture} onPointerCancel={finishGesture} />)}
    {selected && !groupSelected && CORNERS.map((corner) => <button key={corner} type="button"
      className={`text-box__handle text-box__handle--${corner}`} aria-label={`Масштабировать стикер: ${corner} угол`}
      onPointerDown={(event) => startGesture(event, 'corner', corner)} onPointerMove={continueGesture}
      onPointerUp={finishGesture} onPointerCancel={finishGesture}><HandleDot kind="resize" /></button>)}
    {interactive && !groupSelected && (selected || showConnectors) && SIDES.filter((side) => !occupiedSides.includes(side)).map((side) =>
      <button key={`connector-${side}`} type="button"
        className={`text-box__midpoint text-box__midpoint--${side}${snapSide === side ? ' text-box__midpoint--snap' : ''}`}
        aria-label={`Начать стрелку от стикера: ${side} сторона`}
        onPointerDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onConnectorStart(item.id, side, { x: event.clientX, y: event.clientY }, event.pointerId)
        }}><HandleDot kind="connector" snap={snapSide === side} /></button>)}
  </div>
}
