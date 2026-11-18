import { useState } from 'react'
import { TEXT_COLORS } from '../TextToolbar/TextToolbar'
import moreIcon from '../TextToolbar/icons/dots.png'
import arrowBarIcon from './icons/arrow_bar.png'
import arrowHeadIcon from '../../../../assets/arrow.png'
import swapIcon from '../../../../assets/swap.png'
import type { ArrowDash, ArrowEnd, ArrowShape } from '../../ArrowLayer'
import './ArrowToolbar.css'

type Props = { color: string; shape: ArrowShape; dash: ArrowDash; tailEnd: ArrowEnd; headEnd: ArrowEnd;
  left: number; top: number; onColor: (color: string) => void; onShape: (shape: ArrowShape) => void;
  onDash: (dash: ArrowDash) => void; onTailEnd: (end: ArrowEnd) => void;
  onHeadEnd: (end: ArrowEnd) => void; onSwapEnds: () => void; onDelete: () => void }

const shapes: { value: ArrowShape; label: string; path: string }[] = [
  { value: 'straight', label: 'Прямая', path: 'M 5 22 L 35 12' },
  { value: 'elbow', label: 'С углом', path: 'M 5 27 H 18 V 15 H 34' },
  { value: 'curved', label: 'Гибкая', path: 'M 5 21 C 15 6 23 34 35 18' },
]
const dashes: { value: ArrowDash; label: string; pattern?: string }[] = [
  { value: 'solid', label: 'Сплошная' },
  { value: 'long', label: 'Большой пунктир', pattern: '10 6' },
  { value: 'short', label: 'Мелкий пунктир', pattern: '1 5' },
]
const ends: { value: ArrowEnd; label: string }[] = [
  { value: 'none', label: 'Без наконечника' },
  { value: 'arrow', label: 'Наконечник' },
]
const TOOLBAR_WIDTH = 250

function EndIcon({ end, position }: { end: ArrowEnd; position: 'tail' | 'head' }) {
  return <span className="arrow-toolbar__end-icon" aria-hidden="true">
    <svg viewBox="0 0 32 24">
      <path d="M 5 12 H 27" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
    {end === 'arrow' && <span className={`arrow-toolbar__end-asset arrow-toolbar__end-asset--${position}`}
      style={{ maskImage: `url(${arrowHeadIcon})`, WebkitMaskImage: `url(${arrowHeadIcon})` }} />}
  </span>
}

export default function ArrowToolbar({ color, shape, dash, tailEnd, headEnd, left, top, onColor, onShape,
  onDash, onTailEnd, onHeadEnd, onSwapEnds, onDelete }: Props) {
  const [menu, setMenu] = useState<'tail' | 'head' | 'color' | 'style' | 'more' | null>(null)
  const toggleMenu = (next: typeof menu) => setMenu((current) => current === next ? null : next)
  return <div className="arrow-toolbar"
    style={{ left: Math.max(12, Math.min(window.innerWidth - TOOLBAR_WIDTH - 12, left - TOOLBAR_WIDTH / 2)), top }}
    role="toolbar" aria-label="Форматирование стрелки" onPointerDown={(event) => event.stopPropagation()}>
    <div className="arrow-toolbar__end-control">
      <button type="button" className="arrow-toolbar__end-button" aria-label="Наконечник хвоста"
        title="Наконечник хвоста" aria-expanded={menu === 'tail'} onClick={() => toggleMenu('tail')}>
        <EndIcon end={tailEnd} position="tail" />
      </button>
      {menu === 'tail' && <div className="arrow-toolbar__end-menu" role="group" aria-label="Наконечник хвоста">
        {ends.map((item) => <button key={item.value} type="button" aria-label={item.label} title={item.label}
          aria-pressed={tailEnd === item.value} onClick={() => { onTailEnd(item.value); setMenu(null) }}>
          <EndIcon end={item.value} position="tail" />
        </button>)}
      </div>}
    </div>
    <button type="button" className="arrow-toolbar__swap-button" aria-label="Поменять наконечники местами"
      title="Поменять наконечники местами" onClick={() => { onSwapEnds(); setMenu(null) }}>
      <img src={swapIcon} alt="" aria-hidden="true" />
    </button>
    <div className="arrow-toolbar__end-control">
      <button type="button" className="arrow-toolbar__end-button" aria-label="Наконечник головы"
        title="Наконечник головы" aria-expanded={menu === 'head'} onClick={() => toggleMenu('head')}>
        <EndIcon end={headEnd} position="head" />
      </button>
      {menu === 'head' && <div className="arrow-toolbar__end-menu" role="group" aria-label="Наконечник головы">
        {ends.map((item) => <button key={item.value} type="button" aria-label={item.label} title={item.label}
          aria-pressed={headEnd === item.value} onClick={() => { onHeadEnd(item.value); setMenu(null) }}>
          <EndIcon end={item.value} position="head" />
        </button>)}
      </div>}
    </div>

    <span className="text-toolbar__divider" aria-hidden="true" />

    <button type="button" className="arrow-toolbar__color" aria-label="Цвет стрелки" aria-expanded={menu === 'color'}
      title="Цвет стрелки" onClick={() => toggleMenu('color')}>
      <span className="arrow-toolbar__color-dot" style={{ backgroundColor: color }} />
    </button>
    {menu === 'color' && <div className="arrow-toolbar__palette" role="group" aria-label="Выбрать цвет стрелки">
      {TEXT_COLORS.map(({ name, value }) => <button key={value} type="button" className="arrow-toolbar__swatch"
        aria-label={`${name}, ${value}`} aria-pressed={color.toUpperCase() === value} title={name}
        style={{ background: value }} onClick={() => { onColor(value); setMenu(null) }} />)}
    </div>}
    <button type="button" className="arrow-toolbar__style-button" aria-label="Тип линии" title="Тип линии"
      aria-expanded={menu === 'style'} onClick={() => toggleMenu('style')}>
      <img className="arrow-toolbar__style-icon" src={arrowBarIcon} alt="" aria-hidden="true" />
    </button>
    {menu === 'style' && <div className="arrow-toolbar__style-menu" role="group" aria-label="Тип линии">
      <div className="arrow-toolbar__style-row" role="group" aria-label="Форма стрелки">
        {shapes.map((item) => <button key={item.value} type="button" aria-label={item.label} title={item.label}
          aria-pressed={shape === item.value} onClick={() => onShape(item.value)}>
          <svg viewBox="0 0 40 40" aria-hidden="true"><path d={item.path} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>)}
      </div>
      <div className="arrow-toolbar__style-row" role="group" aria-label="Пунктирность">
        {dashes.map((item) => <button key={item.value} type="button" aria-label={item.label} title={item.label}
          aria-pressed={dash === item.value} onClick={() => onDash(item.value)}>
          <svg viewBox="0 0 40 40" aria-hidden="true"><path d="M 5 20 H 35" fill="none" stroke="currentColor" strokeWidth="3"
            strokeLinecap="round" strokeDasharray={item.pattern} /></svg>
        </button>)}
      </div>
    </div>}
    <span className="text-toolbar__divider" aria-hidden="true" />
    <div className="text-toolbar__control">
      <button className="text-toolbar__icon-button" type="button" aria-label="Дополнительные действия" aria-expanded={menu === 'more'}
        onClick={() => toggleMenu('more')}>
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
