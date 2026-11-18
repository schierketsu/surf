import { useEffect, useRef, useState } from 'react'
import cursorIcon from './icons/cursor.png'
import handIcon from './icons/hand.png'
import stickerIcon from './icons/sticker.svg'
import './ToolPanel.css'

type DrawingTool = 'pencil' | 'highlighter'
export type NavigationMode = 'cursor' | 'hand'
export type StickerStyle = { name: string; fill: string; border: string }
export const STICKER_DRAG_TYPE = 'application/x-doska-sticker+json'
type ActiveTool = DrawingTool | 'text' | 'sticker' | null
type OpenMenu = 'drawing' | 'stickers' | null
type IconName = DrawingTool | 'text' | 'sticker'

export const STICKER_COLORS = [
  { name: 'Жёлтый', fill: '#fff3b0', border: '#f6db84' },
  { name: 'Персиковый', fill: '#ffc49d', border: '#ff9d69' },
  { name: 'Коралловый', fill: '#f8babb', border: '#ef9298' },
  { name: 'Розовый', fill: '#f2c5e2', border: '#e6a0ce' },
  { name: 'Голубой', fill: '#bad9f5', border: '#81baff' },
  { name: 'Сиреневый', fill: '#dfd0f5', border: '#bfa5ee' },
  { name: 'Бирюзовый', fill: '#9edbeb', border: '#55bdd6' },
  { name: 'Лавандовый', fill: '#c5d3f7', border: '#9eaff0' },
  { name: 'Зелёный', fill: '#c6dca2', border: '#a0c474' },
  { name: 'Мятный', fill: '#afe0d1', border: '#7ccab5' },
  { name: 'Светло-серый', fill: '#f0f0f0', border: '#d4d4d4' },
  { name: 'Серый', fill: '#dddddd', border: '#bababa' },
] as const

function Icon({ name }: { name: IconName }) {
  if (name === 'sticker') {
    return <img className="tool-panel__sticker-icon" src={stickerIcon} alt="" aria-hidden="true" />
  }
  return <span className={`tool-panel__icon tool-panel__icon--${name}`} aria-hidden="true" />
}

type ToolPanelProps = {
  onTextToolChange: (active: boolean) => void
  onStickerToolChange: (sticker: StickerStyle | null) => void
  onNavigationModeChange: (mode: NavigationMode) => void
  resetToCursorToken: number
  boardScale: number
}

export default function ToolPanel({ onTextToolChange, onStickerToolChange, onNavigationModeChange, resetToCursorToken, boardScale }: ToolPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const dragPreviewRef = useRef<HTMLDivElement | null>(null)
  const [navigationMode, setNavigationMode] = useState<NavigationMode>('cursor')
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('pencil')
  const [activeTool, setActiveTool] = useState<ActiveTool>(null)
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)

  useEffect(() => {
    if (!resetToCursorToken) return
    setNavigationMode('cursor')
    setActiveTool(null)
    setOpenMenu(null)
  }, [resetToCursorToken])

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpenMenu(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  useEffect(() => () => dragPreviewRef.current?.remove(), [])

  return (
    <div className="tool-panel-root" ref={rootRef}>
      <button
        className="tool-panel__navigation"
        type="button"
        role="switch"
        aria-checked={navigationMode === 'hand'}
        aria-label="Режим ладони"
        title={navigationMode === 'cursor' ? 'Включить ладонь' : 'Включить курсор'}
        data-mode={navigationMode}
        onClick={() => {
          const next = navigationMode === 'cursor' ? 'hand' : 'cursor'
          setNavigationMode(next)
          onNavigationModeChange(next)
          setOpenMenu(null)
          setActiveTool(null)
          onTextToolChange(false)
          onStickerToolChange(null)
        }}
      >
        <span className="tool-panel__navigation-slot">
          <img className="tool-panel__navigation-icon tool-panel__navigation-icon--cursor" src={cursorIcon} alt="" aria-hidden="true" />
        </span>
        <span className="tool-panel__navigation-slot">
          <img className="tool-panel__navigation-icon tool-panel__navigation-icon--hand" src={handIcon} alt="" aria-hidden="true" />
        </span>
      </button>
      <div className="tool-panel" role="group" aria-label="Панель инструментов">
        <button
          className="tool-panel__button"
          type="button"
          aria-label="Инструменты рисования"
          title="Инструменты рисования"
          aria-expanded={openMenu === 'drawing'}
          aria-controls="drawing-tools"
          data-active={activeTool === 'pencil' || activeTool === 'highlighter'}
          onClick={() => {
            setActiveTool(drawingTool)
            setOpenMenu(openMenu === 'drawing' ? null : 'drawing')
            onTextToolChange(false)
            onStickerToolChange(null)
          }}
        >
          <Icon name={drawingTool} />
        </button>
        <button
          className="tool-panel__button"
          type="button"
          aria-label="Текст"
          title="Текст"
          data-active={activeTool === 'text'}
          onClick={() => {
            setNavigationMode('cursor')
            onNavigationModeChange('cursor')
            setActiveTool('text')
            setOpenMenu(null)
            onTextToolChange(true)
            onStickerToolChange(null)
          }}
        >
          <Icon name="text" />
        </button>
        <button
          className="tool-panel__button"
          type="button"
          aria-label="Стикеры"
          title="Стикеры"
          aria-expanded={openMenu === 'stickers'}
          aria-controls="sticker-colors"
          data-active={activeTool === 'sticker'}
          onClick={() => {
            setActiveTool('sticker')
            setOpenMenu(openMenu === 'stickers' ? null : 'stickers')
            onTextToolChange(false)
            onStickerToolChange(null)
          }}
        >
          <Icon name="sticker" />
        </button>
      </div>

      {openMenu === 'drawing' && (
        <div id="drawing-tools" className="tool-panel__popover tool-panel__popover--drawing" role="group" aria-label="Вид инструмента рисования">
          {(['pencil', 'highlighter'] as const).map((tool) => (
            <button
              key={tool}
              className="tool-panel__option"
              type="button"
              aria-label={tool === 'pencil' ? 'Карандаш' : 'Маркер'}
              title={tool === 'pencil' ? 'Карандаш' : 'Маркер'}
              aria-pressed={drawingTool === tool}
              onClick={() => {
                setDrawingTool(tool)
                setActiveTool(tool)
                setOpenMenu(null)
                onTextToolChange(false)
                onStickerToolChange(null)
              }}
            >
              <Icon name={tool} />
            </button>
          ))}
        </div>
      )}

      {openMenu === 'stickers' && (
        <div id="sticker-colors" className="tool-panel__popover tool-panel__popover--stickers" role="group" aria-label="Цвет стикера">
          {STICKER_COLORS.map((sticker) => (
            <button
              key={sticker.name}
              className="tool-panel__swatch"
              type="button"
              draggable
              aria-label={`${sticker.name} стикер`}
              title={sticker.name}
              style={{ backgroundColor: sticker.fill, borderColor: sticker.border }}
              onClick={() => {
                setNavigationMode('cursor')
                onNavigationModeChange('cursor')
                setActiveTool('sticker')
                setOpenMenu(null)
                onTextToolChange(false)
                onStickerToolChange(sticker)
              }}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'copy'
                event.dataTransfer.setData(STICKER_DRAG_TYPE, JSON.stringify(sticker))
                const preview = document.createElement('div')
                preview.className = 'tool-panel__sticker-drag-preview'
                preview.style.backgroundColor = sticker.fill
                const previewSize = Math.min(160 * boardScale,
                  Math.max(80, Math.min(window.innerWidth, window.innerHeight) - 32))
                preview.style.width = `${previewSize}px`
                preview.style.height = `${previewSize}px`
                preview.style.left = `${event.clientX}px`
                preview.style.top = `${event.clientY}px`
                document.body.appendChild(preview)
                dragPreviewRef.current?.remove()
                dragPreviewRef.current = preview

                const nativeGhost = document.createElement('div')
                nativeGhost.className = 'tool-panel__native-drag-ghost'
                document.body.appendChild(nativeGhost)
                event.dataTransfer.setDragImage(nativeGhost, 0, 0)
                requestAnimationFrame(() => nativeGhost.remove())
              }}
              onDrag={(event) => {
                if (!dragPreviewRef.current || event.clientX === 0 && event.clientY === 0) return
                dragPreviewRef.current.style.left = `${event.clientX}px`
                dragPreviewRef.current.style.top = `${event.clientY}px`
              }}
              onDragEnd={() => {
                dragPreviewRef.current?.remove()
                dragPreviewRef.current = null
                setActiveTool(null)
                setOpenMenu(null)
                onStickerToolChange(null)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
