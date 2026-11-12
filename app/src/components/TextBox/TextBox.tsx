import { useEffect, useLayoutEffect, useRef } from 'react'
import { BOARD_HEIGHT, BOARD_WIDTH } from '../../gridHierarchy'
import './TextBox.css'

export const MIN_FONT_SIZE = 12
export const MAX_FONT_SIZE = 96
export const MIN_TEXT_WIDTH = 150
export const MIN_TEXT_HEIGHT = 32

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
type Edge = 'top' | 'right' | 'bottom' | 'left'
type Gesture = { mode: 'move' | 'resize'; pointerId: number; corner?: Corner; edge?: Edge; clientX: number; clientY: number; start: TextItem; moved: boolean }

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

function isOverWrittenText(editor: HTMLDivElement, x: number, y: number) {
  if (!editor.textContent?.trim()) return false
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let node: Node | null
  while ((node = walker.nextNode())) {
    range.selectNodeContents(node)
    for (const rect of range.getClientRects()) {
      if (x >= rect.left - 2 && x <= rect.right + 2 && y >= rect.top - 2 && y <= rect.bottom + 2) return true
    }
  }
  return false
}

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
  editing: boolean
  focusOnMount: boolean
  scale: number
  onSelect: (id: string) => void
  onEdit: (id: string) => void
  onChange: (id: string, changes: Partial<TextItem>) => void
  onCommit: (id: string, html: string, isEmpty: boolean) => void
  onDismiss: () => void
  onEditorRef: (id: string, node: HTMLDivElement | null) => void
  onSaveSelection: () => void
}

export default function TextBox({ item, selected, groupSelected, interactive, editing, focusOnMount, scale, onSelect, onEdit, onChange, onCommit, onDismiss, onEditorRef, onSaveSelection }: TextBoxProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const focusPoint = useRef<{ x: number; y: number } | null>(null)
  const measureHeightRef = useRef<() => void>(() => {})
  const lastValidHtml = useRef(item.html)

  measureHeightRef.current = () => {
    const editor = editorRef.current
    if (!editor) return
    const contentHeight = Math.ceil(editor.scrollHeight) + 2
    if (contentHeight > BOARD_HEIGHT) {
      if (editor.innerHTML !== lastValidHtml.current) {
        editor.innerHTML = lastValidHtml.current
        const selection = window.getSelection()
        selection?.selectAllChildren(editor)
        selection?.collapseToEnd()
        if (item.html !== editor.innerHTML) onCommit(item.id, editor.innerHTML, false)
      } else if (item.fontSize > MIN_FONT_SIZE) {
        const fontSize = Math.max(MIN_FONT_SIZE, Math.floor(item.fontSize * (BOARD_HEIGHT - 2) / contentHeight))
        if (fontSize < item.fontSize) onChange(item.id, { fontSize })
      }
      return
    }
    lastValidHtml.current = editor.innerHTML
    const height = Math.max(item.baseHeight ?? item.height, contentHeight)
    const y = Math.min(item.y, BOARD_HEIGHT - height)
    if (Math.abs(height - item.height) > 0.5 || Math.abs(y - item.y) > 0.5) {
      onChange(item.id, { height, y })
    }
  }

  useLayoutEffect(() => {
    const editor = editorRef.current
    if (!editor || document.activeElement === editor || editor.innerHTML === item.html) return
    editor.innerHTML = item.html
  }, [item.html])

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
      const point = focusPoint.current
      focusPoint.current = null
      if (point && selection) {
        const range = document.caretRangeFromPoint?.(point.x, point.y)
        if (range && editor.contains(range.startContainer)) {
          selection.removeAllRanges()
          selection.addRange(range)
          return
        }
      }
      selection?.selectAllChildren(editor)
      selection?.collapseToEnd()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusOnMount])

  const startGesture = (event: React.PointerEvent<HTMLButtonElement>, mode: 'move' | 'resize', corner?: Corner, edge?: Edge) => {
    event.preventDefault()
    event.stopPropagation()
    if (!groupSelected || mode !== 'move') onSelect(item.id)
    gesture.current = { mode, pointerId: event.pointerId, corner, edge, clientX: event.clientX, clientY: event.clientY, start: { ...item }, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const continueGesture = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    const dx = (event.clientX - current.clientX) / scale
    const dy = (event.clientY - current.clientY) / scale
    const start = current.start

    if (current.mode === 'move') {
      if (!current.moved && Math.hypot(event.clientX - current.clientX, event.clientY - current.clientY) < 4) return
      current.moved = true
      onChange(item.id, { x: start.x + dx, y: start.y + dy })
      return
    }

    let anchorX: number
    let anchorY: number
    let factor: number
    if (current.edge) {
      const edge = current.edge
      anchorX = edge === 'left' ? start.x + start.width : edge === 'right' ? start.x : start.x + start.width / 2
      anchorY = edge === 'top' ? start.y + start.height : edge === 'bottom' ? start.y : start.y + start.height / 2
      factor = 1 + (edge === 'left' ? -dx / start.width : edge === 'right' ? dx / start.width
        : edge === 'top' ? -dy / start.height : dy / start.height)
    } else {
      const corner = current.corner!
      const fromLeft = corner.endsWith('left')
      const fromTop = corner.startsWith('top')
      anchorX = fromLeft ? start.x + start.width : start.x
      anchorY = fromTop ? start.y + start.height : start.y
      const horizontal = dx * (fromLeft ? -1 : 1)
      const vertical = dy * (fromTop ? -1 : 1)
      factor = 1 + (horizontal * start.width + vertical * start.height)
        / (start.width ** 2 + start.height ** 2)
    }
    const minFactor = Math.max(MIN_FONT_SIZE / start.fontSize, MIN_TEXT_WIDTH / start.width, MIN_TEXT_HEIGHT / start.height)
    const leftDistance = anchorX - start.x
    const rightDistance = start.x + start.width - anchorX
    const topDistance = anchorY - start.y
    const bottomDistance = start.y + start.height - anchorY
    const maxFactor = Math.min(
      MAX_FONT_SIZE / start.fontSize,
      leftDistance > 0 ? anchorX / leftDistance : Infinity,
      rightDistance > 0 ? (BOARD_WIDTH - anchorX) / rightDistance : Infinity,
      topDistance > 0 ? anchorY / topDistance : Infinity,
      bottomDistance > 0 ? (BOARD_HEIGHT - anchorY) / bottomDistance : Infinity,
    )
    if (maxFactor < minFactor) return
    const boundedFactor = Math.max(minFactor, Math.min(maxFactor, factor))
    const width = start.width * boundedFactor
    const height = start.height * boundedFactor
    onChange(item.id, {
      x: anchorX + (start.x - anchorX) * boundedFactor,
      y: anchorY + (start.y - anchorY) * boundedFactor,
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
        contentEditable={interactive && editing}
        tabIndex={interactive && editing ? 0 : -1}
        spellCheck={false}
        suppressContentEditableWarning
        role="textbox"
        aria-label="Текст на доске"
        aria-multiline="true"
        data-placeholder="Введите текст"
        style={{ minHeight: Math.max(30, (item.baseHeight ?? item.height) - 2), maxHeight: BOARD_HEIGHT - 2,
          fontSize: item.fontSize, fontFamily: item.fontFamily, color: item.color, backgroundColor: item.highlight,
          textAlign: item.align, fontWeight: item.bold ? 700 : undefined, fontStyle: item.italic ? 'italic' : undefined,
          textDecoration: [item.underline && 'underline', item.strikeThrough && 'line-through'].filter(Boolean).join(' ') || undefined }}
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
          onSaveSelection()
        }}
      />
      {interactive && !editing && <button className="text-box__body-drag" type="button"
        aria-label={groupSelected ? 'Переместить выделенные тексты; нажать на текст для редактирования' : 'Выделить или переместить блок; нажать на текст для редактирования'}
        title="Перетащить для перемещения · нажать на текст для редактирования"
        onPointerDown={(event) => startGesture(event, 'move')}
        onPointerMove={continueGesture}
        onPointerUp={(event) => {
          const current = gesture.current
          gesture.current = null
          if (!current || current.pointerId !== event.pointerId) return
          if (current.moved || Math.hypot(event.clientX - current.clientX, event.clientY - current.clientY) >= 4) {
            onChange(item.id, {
              x: current.start.x + (event.clientX - current.clientX) / scale,
              y: current.start.y + (event.clientY - current.clientY) / scale,
            })
            return
          }
          if (editorRef.current && isOverWrittenText(editorRef.current, event.clientX, event.clientY)) {
            focusPoint.current = { x: event.clientX, y: event.clientY }
            onEdit(item.id)
          }
        }}
        onPointerCancel={() => { gesture.current = null }} />}
      {selected && (
        <>
          {!groupSelected && EDGES.map(({ edge, label }) => <button key={edge} className={`text-box__drag-area text-box__drag-area--${edge}`}
            type="button" aria-label={`Масштабировать текст: ${label} граница`}
            title="Масштабировать текст"
            onPointerDown={(event) => startGesture(event, 'resize', undefined, edge)}
            onPointerMove={continueGesture}
            onPointerUp={() => { gesture.current = null }}
            onPointerCancel={() => { gesture.current = null }} />)}
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
