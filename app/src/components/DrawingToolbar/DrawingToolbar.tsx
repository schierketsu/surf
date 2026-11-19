import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import LayerMenuItems, { type LayerAction } from '../LayerMenuItems'
import { TEXT_COLORS } from '../TextToolbar/TextToolbar'
import moreIcon from '../TextToolbar/icons/dots.png'
import './DrawingToolbar.css'

type Props = {
  color: string
  width: number
  centerX: number
  top: number
  onColor: (color: string) => void
  onWidth: (width: number) => void
  onCopy: () => void
  onLayer: (action: LayerAction) => void
  onDelete: () => void
}

export default function DrawingToolbar({ color, width, centerX, top, onColor, onWidth, onCopy, onLayer, onDelete }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [toolbarWidth, setToolbarWidth] = useState(0)
  const [menu, setMenu] = useState<'color' | 'more' | null>(null)
  const sliderWidth = Math.max(1, Math.min(32, Math.round(width)))

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const measure = () => setToolbarWidth(root.getBoundingClientRect().width)
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    measure()
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!menu) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenu(null)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menu])

  return <div ref={rootRef} className="text-toolbar drawing-toolbar"
    style={{ left: Math.max(12, Math.min(window.innerWidth - toolbarWidth - 12, centerX - toolbarWidth / 2)), top }}
    role="toolbar" aria-label="Форматирование рисунка"
    onPointerDown={(event) => {
      if (!(event.target instanceof HTMLInputElement)) event.preventDefault()
      event.stopPropagation()
    }}>
    <div className="text-toolbar__row">
      <div className="text-toolbar__control">
        <button className="drawing-toolbar__color" type="button" aria-label="Цвет рисунка"
          aria-expanded={menu === 'color'} onClick={() => setMenu((current) => current === 'color' ? null : 'color')}>
          <span style={{ backgroundColor: color }} />
        </button>
        {menu === 'color' && <div className="text-toolbar__popover text-toolbar__popover--colors drawing-toolbar__colors"
          role="group" aria-label="Цвет рисунка">
          {TEXT_COLORS.map((item) => <button key={item.value} className="text-toolbar__swatch" type="button"
            aria-label={item.name} title={item.name} aria-pressed={color.toUpperCase() === item.value}
            style={{ backgroundColor: item.value }} onClick={() => onColor(item.value)} />)}
          <span className="drawing-toolbar__size-divider" aria-hidden="true" />
          <div className="drawing-toolbar__size">
            <output>{sliderWidth}px</output>
            <input type="range" min="1" max="32" step="1" value={sliderWidth} aria-label="Размер рисунка"
              style={{ '--drawing-color': color,
                '--drawing-size-progress': `${(sliderWidth - 1) / 31 * 100}%` } as CSSProperties}
              onChange={(event) => onWidth(Number(event.target.value))} />
          </div>
        </div>}
      </div>
      <span className="text-toolbar__divider" aria-hidden="true" />
      <div className="text-toolbar__control">
        <button className="text-toolbar__icon-button" type="button" aria-label="Дополнительные действия"
          aria-expanded={menu === 'more'} onClick={() => setMenu((current) => current === 'more' ? null : 'more')}>
          <img className="text-toolbar__asset-icon text-toolbar__asset-icon--more" src={moreIcon} alt="" aria-hidden="true" />
        </button>
        {menu === 'more' && <div className="text-toolbar__popover text-toolbar__popover--more"
          role="group" aria-label="Дополнительные действия">
          <button className="text-toolbar__menu-item" type="button" onClick={() => { setMenu(null); onCopy() }}>
            <span>Копировать</span><span className="text-toolbar__shortcut">Ctrl+C</span>
          </button>
          <LayerMenuItems onAction={(action) => { onLayer(action); setMenu(null) }} />
          <button className="text-toolbar__menu-item" type="button" onClick={() => { setMenu(null); onDelete() }}>
            <span>Удалить</span><span className="text-toolbar__shortcut">Delete</span>
          </button>
        </div>}
      </div>
    </div>
  </div>
}
