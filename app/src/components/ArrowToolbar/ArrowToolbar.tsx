import { useState } from 'react'
import { TEXT_COLORS } from '../TextToolbar/TextToolbar'
import moreIcon from '../TextToolbar/icons/dots.png'
import './ArrowToolbar.css'

type Props = { color: string; left: number; top: number; onColor: (color: string) => void; onDelete: () => void }

export default function ArrowToolbar({ color, left, top, onColor, onDelete }: Props) {
  const [menu, setMenu] = useState<'color' | 'more' | null>(null)
  return <div className="arrow-toolbar" style={{ left: Math.max(12, Math.min(window.innerWidth - 90, left - 39)), top }}
    role="toolbar" aria-label="Форматирование стрелки" onPointerDown={(event) => event.stopPropagation()}>
    <button type="button" className="arrow-toolbar__color" aria-label="Цвет стрелки" aria-expanded={menu === 'color'}
      title="Цвет стрелки" onClick={() => setMenu((current) => current === 'color' ? null : 'color')}>
      <span className="arrow-toolbar__color-dot" style={{ backgroundColor: color }} />
    </button>
    {menu === 'color' && <div className="arrow-toolbar__palette" role="group" aria-label="Выбрать цвет стрелки">
      {TEXT_COLORS.map(({ name, value }) => <button key={value} type="button" className="arrow-toolbar__swatch"
        aria-label={`${name}, ${value}`} aria-pressed={color.toUpperCase() === value} title={name}
        style={{ background: value }} onClick={() => { onColor(value); setMenu(null) }} />)}
    </div>}
    <span className="text-toolbar__divider" aria-hidden="true" />
    <div className="text-toolbar__control">
      <button className="text-toolbar__icon-button" type="button" aria-label="Дополнительные действия" aria-expanded={menu === 'more'}
        onClick={() => setMenu((current) => current === 'more' ? null : 'more')}>
        <img className="text-toolbar__asset-icon text-toolbar__asset-icon--more" src={moreIcon} alt="" aria-hidden="true" />
      </button>
      {menu === 'more' && <div className="text-toolbar__popover text-toolbar__popover--more" role="group" aria-label="Дополнительные действия">
        <button className="text-toolbar__menu-item" type="button" onClick={onDelete}>
          <span>Удалить</span><span className="text-toolbar__shortcut">Delete</span>
        </button>
      </div>}
    </div>
  </div>
}
