import { useLayoutEffect, useRef, useState } from 'react'
import type { StickerItem } from '../Sticker/Sticker'
import { STICKER_COLORS } from '../ToolPanel/ToolPanel'
import boldIcon from '../TextToolbar/icons/bold.png'
import italicIcon from '../TextToolbar/icons/coursive.png'
import strikeIcon from '../TextToolbar/icons/line.png'
import underlineIcon from '../TextToolbar/icons/underline.png'
import alignLeftIcon from '../TextToolbar/icons/left.png'
import alignCenterIcon from '../TextToolbar/icons/center.png'
import alignRightIcon from '../TextToolbar/icons/right.png'
import moreIcon from '../TextToolbar/icons/dots.png'
import '../TextToolbar/TextToolbar.css'
import './StickerToolbar.css'

type Menu = 'format' | 'align' | 'color' | 'more' | null
type Format = 'bold' | 'italic' | 'underline' | 'strikeThrough'
const ALIGN_ICONS = { left: alignLeftIcon, center: alignCenterIcon, right: alignRightIcon }

type Props = {
  item: StickerItem
  centerX: number
  top: number
  onChange: (changes: Partial<StickerItem>) => void
  onFormat: (command: Format) => void
  onCopy: () => void
  onDelete: () => void
}

export default function StickerToolbar({ item, centerX, top, onChange, onFormat, onCopy, onDelete }: Props) {
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [toolbarWidth, setToolbarWidth] = useState(0)
  const [menu, setMenu] = useState<Menu>(null)
  const toggleMenu = (next: Menu) => setMenu((current) => current === next ? null : next)
  const hasFormat = Boolean(item.bold || item.italic || item.underline || item.strikeThrough)
  const left = toolbarWidth
    ? Math.max(12, Math.min(window.innerWidth - toolbarWidth - 12, centerX - toolbarWidth / 2))
    : centerX

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current
    if (!toolbar) return
    const measure = () => setToolbarWidth(toolbar.getBoundingClientRect().width)
    const observer = new ResizeObserver(measure)
    observer.observe(toolbar)
    measure()
    return () => observer.disconnect()
  }, [])

  return <div ref={toolbarRef} className="text-toolbar sticker-toolbar" style={{ left, top }} role="toolbar"
    aria-label="Форматирование стикера"
    onPointerDown={(event) => { event.preventDefault(); event.stopPropagation() }}>
    <div className="text-toolbar__row">
      <div className="text-toolbar__control text-toolbar__control--size sticker-toolbar__auto-size">
        <button type="button" className="sticker-toolbar__auto" disabled aria-label="Автоматический размер шрифта">Авто</button>
        <div className="text-toolbar__size-steps">
          <button type="button" disabled aria-label="Увеличить размер текста"><span className="text-toolbar__arrow text-toolbar__arrow--up" /></button>
          <button type="button" disabled aria-label="Уменьшить размер текста"><span className="text-toolbar__arrow text-toolbar__arrow--down" /></button>
        </div>
      </div>

      <span className="text-toolbar__divider" aria-hidden="true" />

      <div className="text-toolbar__control">
        <button className="text-toolbar__icon-button" type="button" aria-label="Начертание" aria-expanded={menu === 'format'}
          data-active={hasFormat} onClick={() => toggleMenu('format')}>
          <img className="text-toolbar__asset-icon" src={boldIcon} alt="" aria-hidden="true" />
        </button>
        {menu === 'format' && <div className="text-toolbar__popover text-toolbar__popover--format" role="group" aria-label="Начертание текста">
          {([
            ['bold', 'Полужирный', boldIcon], ['italic', 'Курсив', italicIcon],
            ['underline', 'Подчёркнутый', underlineIcon], ['strikeThrough', 'Зачёркнутый', strikeIcon],
          ] as const).map(([format, label, icon]) => <button key={format} type="button" aria-label={label}
            aria-pressed={Boolean(item[format])} onClick={() => { onFormat(format); setMenu(null) }}>
            <img className={`text-toolbar__asset-icon${format === 'strikeThrough' ? ' text-toolbar__asset-icon--strike' : ''}`}
              src={icon} alt="" aria-hidden="true" />
          </button>)}
        </div>}
      </div>

      <div className="text-toolbar__control">
        <button className="text-toolbar__icon-button" type="button" aria-label="Выравнивание" aria-expanded={menu === 'align'}
          onClick={() => toggleMenu('align')}>
          <img className="text-toolbar__asset-icon text-toolbar__asset-icon--align" src={ALIGN_ICONS[item.align]} alt="" aria-hidden="true" />
        </button>
        {menu === 'align' && <div className="text-toolbar__popover text-toolbar__popover--compact" role="group" aria-label="Выравнивание">
          {(['left', 'center', 'right'] as const).map((align) => <button key={align} type="button"
            aria-label={align === 'left' ? 'По левому краю' : align === 'center' ? 'По центру' : 'По правому краю'}
            aria-pressed={item.align === align} onClick={() => { onChange({ align }); setMenu(null) }}>
            <img className="text-toolbar__asset-icon text-toolbar__asset-icon--align" src={ALIGN_ICONS[align]} alt="" aria-hidden="true" />
          </button>)}
        </div>}
      </div>

      <div className="text-toolbar__control">
        <button className="sticker-toolbar__color-button" type="button" aria-label="Цвет стикера" aria-expanded={menu === 'color'}
          onClick={() => toggleMenu('color')}><span style={{ backgroundColor: item.fill }} /></button>
        {menu === 'color' && <div className="text-toolbar__popover text-toolbar__popover--colors sticker-toolbar__colors"
          role="group" aria-label="Цвет стикера">
          {STICKER_COLORS.map((color) => <button key={color.name} className="text-toolbar__swatch" type="button"
            aria-label={color.name} aria-pressed={item.fill === color.fill} title={color.name}
            style={{ backgroundColor: color.fill }}
            onClick={() => { onChange({ fill: color.fill, border: color.border, name: color.name }); setMenu(null) }} />)}
        </div>}
      </div>

      <span className="text-toolbar__divider" aria-hidden="true" />

      <div className="text-toolbar__control">
        <button className="text-toolbar__icon-button" type="button" aria-label="Дополнительные действия" aria-expanded={menu === 'more'}
          onClick={() => toggleMenu('more')}><img className="text-toolbar__asset-icon text-toolbar__asset-icon--more" src={moreIcon} alt="" aria-hidden="true" /></button>
        {menu === 'more' && <div className="text-toolbar__popover text-toolbar__popover--more" role="group" aria-label="Дополнительные действия">
          <button className="text-toolbar__menu-item" type="button" onClick={() => { onCopy(); setMenu(null) }}><span>Копировать</span><span className="text-toolbar__shortcut">Ctrl+C</span></button>
          <button className="text-toolbar__menu-item" type="button" onClick={() => { onDelete(); setMenu(null) }}><span>Удалить</span><span className="text-toolbar__shortcut">Del</span></button>
        </div>}
      </div>
    </div>
  </div>
}
