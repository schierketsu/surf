import { useEffect, useLayoutEffect, useRef } from 'react'
import { BOARD_HEIGHT, BOARD_WIDTH } from '../../gridHierarchy'
import './TextBox.css'

export const MIN_FONT_SIZE = 12
export const MAX_FONT_SIZE = 96
export const MIN_TEXT_WIDTH = 150
export const MIN_TEXT_HEIGHT = 32

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
type Gesture = { mode: 'move' | 'resize'; pointerId: number; corner?: Corner; clientX: number; clientY: number; start: TextItem }

const CORNERS = [
  { corner: 'top-left', label: 'верхний левый' },
  { corner: 'top-right', label: 'верхний правый' },
  { corner: 'bottom-left', label: 'нижний левый' },
  { corner: 'bottom-right', label: 'нижний правый' },
] as const

export type TextItem = {
  id: string
  x: number
  y: number
  width: number
  height: number
  baseHeight: number
  html: string
  fontSize: number
  fontFamily: string
  color: string
  highlight: string
  align: 'left' | 'center' | 'right'
  opacity: number
  comment: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikeThrough?: boolean
}

type TextBoxProps = {
  item: TextItem
  selected: boolean
  groupSelected: boolean
  interactive: boolean
  focusOnMount: boolean
  scale: number
  onSelect: (id: string) => void
  onChange: (id: string, changes: Partial<TextItem>) => void
  onCommit: (id: string, html: string, isEmpty: boolean) => void
  onDismiss: () => void
  onEditorRef: (id: string, node: HTMLDivElement | null) => void
  onSaveSelection: () => void
}

export default function TextBox({ item, selected, groupSelected, interactive, focusOnMount, scale, onSelect, onChange, onCommit, onDismiss, onEditorRef, onSaveSelection }: TextBoxProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const measureHeightRef = useRef<() => void>(() => {})

  measureHeightRef.current = () => {
    const editor = editorRef.current
    if (!editor) return
    const height = Math.min(BOARD_HEIGHT, Math.max(item.baseHeight ?? item.height, Math.ceil(editor.scrollHeight) + 2))
    const y = Math.min(item.y, BOARD_HEIGHT - height)
    if (Math.abs(height - item.height) > 0.5 || Math.abs(y - item.y) > 0.5) {
      onChange(item.id, { height, y })
    }
  }

  useLayoutEffect(() => {
    measureHeightRef.current()
  })

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const observer = new ResizeObserver(() => measureHeightRef.current())
    observer.observe(editor)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!focusOnMount || !editorRef.current) return
    const editor = editorRef.current
    const frame = window.requestAnimationFrame(() => {
      if (!editor.isConnected) return
      editor.focus()
      const selection = window.getSelection()
      selection?.selectAllChildren(editor)
      selection?.collapseToEnd()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusOnMount])

  const startGesture = (event: React.PointerEvent<HTMLButtonElement>, mode: 'move' | 'resize', corner?: Corner) => {
    event.preventDefault()
    event.stopPropagation()
    if (!groupSelected || mode !== 'move') onSelect(item.id)
    gesture.current = { mode, pointerId: event.pointerId, corner, clientX: event.clientX, clientY: event.clientY, start: { ...item } }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const continueGesture = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    const dx = (event.clientX - current.clientX) / scale
    const dy = (event.clientY - current.clientY) / scale
    const start = current.start

    if (current.mode === 'move') {
      onChange(item.id, { x: start.x + dx, y: start.y + dy })
      return
    }

    const corner = current.corner!
    const fromLeft = corner.endsWith('left')
    const fromTop = corner.startsWith('top')
    const horizontal = dx * (fromLeft ? -1 : 1)
    const vertical = dy * (fromTop ? -1 : 1)
    const factor = 1 + (horizontal * start.width + vertical * start.height)
      / (start.width ** 2 + start.height ** 2)
    const anchorX = fromLeft ? start.x + start.width : start.x
    const anchorY = fromTop ? start.y + start.height : start.y
    const maxWidth = fromLeft ? anchorX : BOARD_WIDTH - anchorX
    const maxHeight = fromTop ? anchorY : BOARD_HEIGHT - anchorY
    const minFactor = Math.max(MIN_FONT_SIZE / start.fontSize, MIN_TEXT_WIDTH / start.width, MIN_TEXT_HEIGHT / start.height)
    const maxFactor = Math.min(MAX_FONT_SIZE / start.fontSize, maxWidth / start.width, maxHeight / start.height)
    const boundedFactor = Math.max(minFactor, Math.min(maxFactor, factor))
    const width = start.width * boundedFactor
    const height = start.height * boundedFactor
    onChange(item.id, {
      x: fromLeft ? anchorX - width : anchorX,
      y: fromTop ? anchorY - height : anchorY,
      width,
      height,
      baseHeight: (start.baseHeight ?? start.height) * boundedFactor,
      fontSize: Math.round(start.fontSize * boundedFactor * 10) / 10,
    })
  }

  return (
    <div
      className={`text-box${selected ? ' text-box--selected' : ''}`}
      style={{ left: item.x, top: item.y, width: item.width, height: item.height, opacity: item.opacity }}
      onPointerDown={(event) => { event.stopPropagation(); onSelect(item.id) }}
    >
      <div
        ref={(node) => { editorRef.current = node; onEditorRef(item.id, node) }}
        className="text-box__editor"
        contentEditable={interactive}
        tabIndex={interactive ? 0 : -1}
        spellCheck={false}
        suppressContentEditableWarning
        role="textbox"
        aria-label="Текст на доске"
        aria-multiline="true"
        data-placeholder="Введите текст"
        style={{ minHeight: Math.max(30, (item.baseHeight ?? item.height) - 2),
          fontSize: item.fontSize, fontFamily: item.fontFamily, color: item.color, backgroundColor: item.highlight,
          textAlign: item.align, fontWeight: item.bold ? 700 : undefined, fontStyle: item.italic ? 'italic' : undefined,
          textDecoration: [item.underline && 'underline', item.strikeThrough && 'line-through'].filter(Boolean).join(' ') || undefined }}
        dangerouslySetInnerHTML={{ __html: item.html }}
        onInput={() => measureHeightRef.current()}
        onFocus={() => onSelect(item.id)}
        onBlur={(event) => onCommit(item.id, event.currentTarget.innerHTML, !event.currentTarget.textContent?.trim())}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.currentTarget.blur()
            onDismiss()
          }
        }}
        onKeyUp={onSaveSelection}
        onMouseUp={onSaveSelection}
        onDrop={(event) => event.preventDefault()}
        onPaste={(event) => {
          event.preventDefault()
          const content = event.clipboardData.getData('text/plain')
          const selection = window.getSelection()
          if (!selection?.rangeCount) return
          const range = selection.getRangeAt(0)
          range.deleteContents()
          const node = document.createTextNode(content)
          range.insertNode(node)
          range.setStartAfter(node)
          range.collapse(true)
          selection.removeAllRanges()
          selection.addRange(range)
          measureHeightRef.current()
        }}
      />
      {selected && (
        <>
          <button className="text-box__drag-area" type="button" aria-label={groupSelected ? 'Переместить выделенные тексты' : 'Переместить текст'} title="Переместить текст"
            onPointerDown={(event) => startGesture(event, 'move')}
            onPointerMove={continueGesture}
            onPointerUp={() => { gesture.current = null }}
            onPointerCancel={() => { gesture.current = null }} />
          {!groupSelected && CORNERS.map(({ corner, label }) => <button key={corner} className={`text-box__handle text-box__handle--${corner}`}
            type="button" aria-label={`Изменить размер текста: ${label} угол`} title="Изменить размер текста"
            onPointerDown={(event) => startGesture(event, 'resize', corner)}
            onPointerMove={continueGesture}
            onPointerUp={() => { gesture.current = null }}
            onPointerCancel={() => { gesture.current = null }} />)}
        </>
      )}
      {item.comment && <span className="text-box__comment" title={item.comment} aria-label={`Комментарий: ${item.comment}`}>●</span>}
    </div>
  )
}
