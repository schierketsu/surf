import { useEffect, useRef, useState } from 'react'
import cursorIcon from './icons/cursor.png'
import handIcon from './icons/hand.png'
import stickerIcon from './icons/sticker.svg'
import './ToolPanel.css'

type DrawingTool = 'pencil' | 'highlighter'
type NavigationMode = 'cursor' | 'hand'
type ActiveTool = DrawingTool | 'text' | 'sticker' | null
type OpenMenu = 'drawing' | 'stickers' | null
type IconName = DrawingTool | 'text' | 'sticker'

const stickers = [
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

export default function ToolPanel() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [navigationMode, setNavigationMode] = useState<NavigationMode>('cursor')
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('pencil')
  const [activeTool, setActiveTool] = useState<ActiveTool>(null)
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)

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
          setNavigationMode(navigationMode === 'cursor' ? 'hand' : 'cursor')
          setOpenMenu(null)
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
            setActiveTool('text')
            setOpenMenu(null)
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
              }}
            >
              <Icon name={tool} />
            </button>
          ))}
        </div>
      )}

      {openMenu === 'stickers' && (
        <div id="sticker-colors" className="tool-panel__popover tool-panel__popover--stickers" role="group" aria-label="Цвет стикера">
          {stickers.map((sticker) => (
            <button
              key={sticker.name}
              className="tool-panel__swatch"
              type="button"
              aria-label={`${sticker.name} стикер`}
              title={sticker.name}
              style={{ backgroundColor: sticker.fill, borderColor: sticker.border }}
              onClick={() => setOpenMenu(null)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
