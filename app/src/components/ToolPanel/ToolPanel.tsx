import { useEffect, useRef, useState, type CSSProperties } from 'react'
import cursorIcon from './icons/cursor.png'
import handIcon from './icons/hand.png'
import stickerIcon from './icons/sticker.svg'
import penIcon from '../../../../assets/pen.png'
import { TEXT_COLORS } from '../TextToolbar/TextToolbar'
import './ToolPanel.css'

export type NavigationMode = 'cursor' | 'hand'
export type StickerStyle = { name: string; fill: string; border: string }
export type DrawingStyle = { color: string; width: number; preset: number }
export const STICKER_DRAG_TYPE = 'application/x-doska-sticker+json'
type ActiveTool = 'drawing' | 'text' | 'sticker' | null
type OpenMenu = 'drawing' | 'stickers' | null
type IconName = 'pencil' | 'text' | 'sticker'

const INITIAL_DRAWING_PRESETS: DrawingStyle[] = [
  { color: '#272727', width: 2, preset: 0 },
  { color: '#E60023', width: 8, preset: 1 },
  { color: '#7C3AED', width: 16, preset: 2 },
]

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
  if (name === 'pencil') {
    return <img className="tool-panel__pen-icon" src={penIcon} alt="" aria-hidden="true" />
  }
  return <span className={`tool-panel__icon tool-panel__icon--${name}`} aria-hidden="true" />
}

type ToolPanelProps = {
  onTextToolChange: (active: boolean) => void
  onStickerToolChange: (sticker: StickerStyle | null) => void
  onDrawingToolChange: (style: DrawingStyle | null) => void
  onNavigationModeChange: (mode: NavigationMode) => void
  resetToCursorToken: number
  boardScale: number
}

export default function ToolPanel({ onTextToolChange, onStickerToolChange, onDrawingToolChange,
  onNavigationModeChange, resetToCursorToken, boardScale }: ToolPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const dragPreviewRef = useRef<HTMLDivElement | null>(null)
  const [navigationMode, setNavigationMode] = useState<NavigationMode>('cursor')
  const [drawingPresets, setDrawingPresets] = useState(INITIAL_DRAWING_PRESETS)
  const [activeDrawingPreset, setActiveDrawingPreset] = useState(0)
  const [editingDrawingPreset, setEditingDrawingPreset] = useState<number | null>(null)
  const [activeTool, setActiveTool] = useState<ActiveTool>(null)
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)

  useEffect(() => {
    if (!resetToCursorToken) return
    setNavigationMode('cursor')
    setActiveTool(null)
    setOpenMenu(null)
    setEditingDrawingPreset(null)
  }, [resetToCursorToken])

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current || rootRef.current.contains(event.target as Node)) return
      setOpenMenu((current) => current === 'drawing' ? current : null)
      setEditingDrawingPreset(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null)
        setEditingDrawingPreset(null)
      }
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
        title={activeTool === 'drawing' ? 'Выйти из рисования и включить курсор'
          : navigationMode === 'cursor' ? 'Включить ладонь' : 'Включить курсор'}
        data-mode={activeTool === 'drawing' ? 'drawing' : navigationMode}
        onClick={() => {
          const next = activeTool === 'drawing' ? 'cursor'
            : navigationMode === 'cursor' ? 'hand' : 'cursor'
          setNavigationMode(next)
          onNavigationModeChange(next)
          setOpenMenu(null)
          setEditingDrawingPreset(null)
          setActiveTool(null)
          onTextToolChange(false)
          onStickerToolChange(null)
          onDrawingToolChange(null)
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
          data-active={activeTool === 'drawing'}
          onClick={() => {
            setNavigationMode('cursor')
            onNavigationModeChange('cursor')
            setActiveTool('drawing')
            setOpenMenu(openMenu === 'drawing' ? null : 'drawing')
            onTextToolChange(false)
            onStickerToolChange(null)
            onDrawingToolChange(drawingPresets[activeDrawingPreset])
          }}
        >
          <Icon name="pencil" />
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
            onDrawingToolChange(null)
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
            onDrawingToolChange(null)
          }}
        >
          <Icon name="sticker" />
        </button>
      </div>

      {openMenu === 'drawing' && (
        <div id="drawing-tools" className="tool-panel__popover tool-panel__popover--drawing" role="group" aria-label="Вид инструмента рисования">
          <button className="tool-panel__option" type="button" aria-label="Карандаш" title="Карандаш"
            aria-pressed={activeTool === 'drawing'} onClick={() => {
              setActiveTool('drawing')
              onDrawingToolChange(drawingPresets[activeDrawingPreset])
            }}><Icon name="pencil" /></button>
          <span className="tool-panel__drawing-divider" aria-hidden="true" />
          {drawingPresets.map((preset, index) => <button key={index}
            className="tool-panel__drawing-preset" type="button"
            aria-label={`Кисть ${preset.width} пикселей`} title={`${preset.width} px`}
            aria-pressed={activeDrawingPreset === index}
            onClick={() => {
              setNavigationMode('cursor')
              onNavigationModeChange('cursor')
              setActiveTool('drawing')
              setActiveDrawingPreset(index)
              setEditingDrawingPreset(index)
              onTextToolChange(false)
              onStickerToolChange(null)
              onDrawingToolChange(preset)
            }}>
            <span style={{ width: Math.max(4, Math.min(18, preset.width)), height: Math.max(4, Math.min(18, preset.width)),
              backgroundColor: preset.color }} />
          </button>)}
          {editingDrawingPreset !== null && <div className="tool-panel__drawing-settings" role="group"
            aria-label="Цвет и размер кисти">
            <div className="tool-panel__drawing-colors">
              {TEXT_COLORS.map((color) => <button key={color.value} className="tool-panel__drawing-color" type="button"
                aria-label={color.name} title={color.name}
                aria-pressed={drawingPresets[editingDrawingPreset].color.toUpperCase() === color.value}
                style={{ backgroundColor: color.value }} onClick={() => {
                  const next = drawingPresets.map((preset, index) => index === editingDrawingPreset
                    ? { ...preset, color: color.value } : preset)
                  setDrawingPresets(next)
                  setActiveDrawingPreset(editingDrawingPreset)
                  setActiveTool('drawing')
                  onDrawingToolChange(next[editingDrawingPreset])
                }} />)}
            </div>
            <span className="tool-panel__drawing-settings-divider" aria-hidden="true" />
            <div className="tool-panel__drawing-size">
              <output>{drawingPresets[editingDrawingPreset].width}px</output>
              <input type="range" min="1" max="32" step="1"
                value={drawingPresets[editingDrawingPreset].width} aria-label="Размер кисти"
                style={{ '--drawing-color': drawingPresets[editingDrawingPreset].color,
                  '--drawing-size-progress': `${(drawingPresets[editingDrawingPreset].width - 1) / 31 * 100}%` } as CSSProperties}
                onChange={(event) => {
                  const width = Number(event.target.value)
                  const next = drawingPresets.map((preset, index) => index === editingDrawingPreset
                    ? { ...preset, width } : preset)
                  setDrawingPresets(next)
                  setActiveDrawingPreset(editingDrawingPreset)
                  setActiveTool('drawing')
                  onDrawingToolChange(next[editingDrawingPreset])
                }} />
            </div>
          </div>}
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
                onDrawingToolChange(null)
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
                onDrawingToolChange(null)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
