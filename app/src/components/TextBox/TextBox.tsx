import { useEffect, useLayoutEffect, useRef } from 'react'
import { BOARD_HEIGHT, BOARD_WIDTH } from '../../gridHierarchy'
import './TextBox.css'

export const MIN_FONT_SIZE = 10
export const MAX_FONT_SIZE = 96
export const MIN_TEXT_WIDTH = 16
export const MIN_TEXT_HEIGHT = 24

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
type Edge = 'top' | 'right' | 'bottom' | 'left'
export type ConnectorSide = Edge
type Gesture = { mode: 'move' | 'resize'; pointerId: number; corner?: Corner; edge?: Edge; clientX: number; clientY: number; start: TextItem; contentWidth: number; contentHeight: number; wasSelected: boolean; moved: boolean }

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
  minY: number
  maxY: number
  onSelect: (id: string) => void
  onEdit: (id: string) => void
  onChange: (id: string, changes: Partial<TextItem>) => void
  onCommit: (id: string, html: string, isEmpty: boolean) => void
  onDismiss: () => void
  onEditorRef: (id: string, node: HTMLDivElement | null) => void
  onSaveSelection: () => void
  showConnectors: boolean
  occupiedSides: ConnectorSide[]
  snapSide: ConnectorSide | null
  onConnectorStart: (id: string, side: ConnectorSide, client: { x: number; y: number }, pointerId: number) => void
}

export default function TextBox({ item, selected, groupSelected, interactive, editing, focusOnMount, scale, minY, maxY, onSelect, onEdit, onChange, onCommit, onDismiss, onEditorRef, onSaveSelection, showConnectors, occupiedSides, snapSide, onConnectorStart }: TextBoxProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const focusPoint = useRef<{ x: number; y: number } | null>(null)
  const measureHeightRef = useRef<() => void>(() => {})
  const lastValidHtml = useRef(item.html)
  const lastMeasuredHeight = useRef<number | null>(null)
  const lastMeasuredWidth = useRef<number | null>(null)

  measureHeightRef.current = () => {
    const editor = editorRef.current
    if (!editor) return
    if (gesture.current?.mode === 'resize') return
    const mirror = editor.cloneNode(true) as HTMLDivElement
    mirror.removeAttribute('contenteditable')
    mirror.removeAttribute('data-placeholder')
    if (!editor.textContent?.trim()) mirror.textContent = editor.getAttribute('data-placeholder') ?? ''
    mirror.style.position = 'fixed'
    mirror.style.left = '-10000px'
    mirror.style.top = '0'
    mirror.style.width = 'max-content'
    mirror.style.minHeight = '0'
    mirror.style.maxHeight = 'none'
    mirror.style.whiteSpace = 'pre'
    mirror.style.overflowWrap = 'normal'
    mirror.style.visibility = 'hidden'
    document.body.appendChild(mirror)
    const contentWidth = Math.ceil(mirror.getBoundingClientRect().width) + 4
    const contentHeight = Math.ceil(mirror.scrollHeight) + 2
    mirror.remove()
    const contentChanged = editor.innerHTML !== lastValidHtml.current
    const availableHeight = Math.min(BOARD_HEIGHT, maxY - minY)
    if (contentHeight > availableHeight) {
      if (contentChanged) {
        editor.innerHTML = lastValidHtml.current
        lastMeasuredHeight.current = Math.ceil(editor.scrollHeight) + 2
        const selection = window.getSelection()
        selection?.selectAllChildren(editor)
        selection?.collapseToEnd()
        if (item.html !== editor.innerHTML) onCommit(item.id, editor.innerHTML, false)
      } else if (contentHeight > item.height + 1 && item.fontSize > MIN_FONT_SIZE) {
        const fontSize = Math.max(MIN_FONT_SIZE, Math.floor(item.fontSize * (availableHeight - 2) / contentHeight))
        if (fontSize < item.fontSize) onChange(item.id, { fontSize })
        lastMeasuredHeight.current = contentHeight
      } else {
        lastMeasuredHeight.current = contentHeight
      }
      return
    }
    lastValidHtml.current = editor.innerHTML
    lastMeasuredHeight.current = contentHeight
    lastMeasuredWidth.current = contentWidth
    const height = Math.max(MIN_TEXT_HEIGHT, contentHeight)
    const width = Math.max(MIN_TEXT_WIDTH, Math.min(BOARD_WIDTH, contentWidth))
    if (Math.abs(height - item.height) > 0.5 || Math.abs(width - item.width) > 0.5 || item.baseHeight !== MIN_TEXT_HEIGHT) {
      const y = Math.max(minY, Math.min(item.y, maxY - height))
      onChange(item.id, { width, height, baseHeight: MIN_TEXT_HEIGHT, y })
    }
  }

  useLayoutEffect(() => {
    const editor = editorRef.current
    if (!editor || document.activeElement === editor || editor.innerHTML === item.html) return
    editor.innerHTML = item.html
  }, [item.html])

  useLayoutEffect(() => {
    measureHeightRef.current()
  }, [item.html, item.width, item.height, item.baseHeight, item.fontSize, item.fontFamily,
    item.bold, item.italic, item.underline, item.strikeThrough, editing])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const observer = new ResizeObserver(() => measureHeightRef.current())
    observer.observe(editor)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let active = true
    const remeasure = () => { if (active) measureHeightRef.current() }
    document.fonts.addEventListener('loadingdone', remeasure)
    const weight = item.bold ? 700 : 400
    document.fonts.load(`${weight} ${item.fontSize}px ${item.fontFamily}`).then(remeasure, remeasure)
    return () => { active = false; document.fonts.removeEventListener('loadingdone', remeasure) }
  }, [item.fontFamily, item.fontSize, item.bold])

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
    gesture.current = { mode, pointerId: event.pointerId, corner, edge, clientX: event.clientX, clientY: event.clientY,
      start: { ...item }, contentWidth: lastMeasuredWidth.current ?? item.width,
      contentHeight: lastMeasuredHeight.current ?? item.height, wasSelected: selected && !groupSelected, moved: false }
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
      topDistance > 0 ? (anchorY - minY) / topDistance : Infinity,
      bottomDistance > 0 ? (maxY - anchorY) / bottomDistance : Infinity,
    )
    if (maxFactor < minFactor) return
    const boundedFactor = Math.max(minFactor, Math.min(maxFactor, factor))
    const width = Math.max(MIN_TEXT_WIDTH, (current.contentWidth - 10) * boundedFactor + 10)
    const height = Math.max(MIN_TEXT_HEIGHT, (current.contentHeight - 10) * boundedFactor + 10)
    onChange(item.id, {
      x: anchorX + (start.x - anchorX) * (width / start.width),
      y: anchorY + (start.y - anchorY) * (height / start.height),
      width,
      height,
      baseHeight: MIN_TEXT_HEIGHT,
      fontSize: Math.round(start.fontSize * boundedFactor * 10) / 10,
    })
  }

  return (
    <div
      className={`text-box${selected ? ' text-box--selected' : ''}`}
      style={{ left: item.x, top: item.y, width: item.width, height: item.height, opacity: item.opacity, backgroundColor: item.highlight }}
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
        data-placeholder="Введите что-нибудь"
        style={{ minHeight: Math.max(0, (item.baseHeight ?? item.height) - 2), maxHeight: Math.max(0, item.height - 2),
          fontSize: item.fontSize, fontFamily: item.fontFamily, color: item.color,
          textAlign: item.align, fontWeight: item.bold ? 700 : undefined, fontStyle: item.italic ? 'italic' : undefined,
          textDecoration: [item.underline && 'underline', item.strikeThrough && 'line-through'].filter(Boolean).join(' ') || undefined }}
        onInput={() => measureHeightRef.current()}
        onFocus={() => onSelect(item.id)}
        onBlur={(event) => {
          const intoToolbar = event.relatedTarget instanceof HTMLElement && Boolean(event.relatedTarget.closest('.text-toolbar'))
          const isEmpty = !event.currentTarget.textContent?.trim()
          if (isEmpty) event.currentTarget.innerHTML = ''
          onCommit(item.id, event.currentTarget.innerHTML, isEmpty && !intoToolbar)
        }}
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
        aria-label={groupSelected ? 'Переместить выделенные тексты' : 'Выделить или переместить блок; повторное нажатие для редактирования'}
        title="Перетащить для перемещения · повторное нажатие для редактирования"
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
          if (current.wasSelected && editorRef.current) {
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
            onPointerUp={() => { gesture.current = null; requestAnimationFrame(() => measureHeightRef.current()) }}
            onPointerCancel={() => { gesture.current = null; requestAnimationFrame(() => measureHeightRef.current()) }} />)}
          {!groupSelected && CORNERS.map(({ corner, label }) => <button key={corner} className={`text-box__handle text-box__handle--${corner}`}
            type="button" aria-label={`Изменить размер текста: ${label} угол`} title="Изменить размер текста"
            onPointerDown={(event) => startGesture(event, 'resize', corner)}
            onPointerMove={continueGesture}
            onPointerUp={() => { gesture.current = null; requestAnimationFrame(() => measureHeightRef.current()) }}
            onPointerCancel={() => { gesture.current = null; requestAnimationFrame(() => measureHeightRef.current()) }} />)}
        </>
      )}
      {interactive && !groupSelected && (selected || showConnectors) && EDGES.filter(({ edge }) => !occupiedSides.includes(edge)).map(({ edge }) => <button key={edge} type="button"
        className={`text-box__midpoint text-box__midpoint--${edge}${snapSide === edge ? ' text-box__midpoint--snap' : ''}`}
        aria-label={`Начать стрелку: ${edge} сторона`}
        onPointerDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onConnectorStart(item.id, edge, { x: event.clientX, y: event.clientY }, event.pointerId)
        }} />)}
      {item.comment && <span className="text-box__comment" title={item.comment} aria-label={`Комментарий: ${item.comment}`}>●</span>}
    </div>
  )
}
