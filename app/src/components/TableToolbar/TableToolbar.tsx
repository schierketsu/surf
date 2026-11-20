import { useLayoutEffect, useRef, useState } from 'react'
import type { TableCellData } from '../BoardTable/BoardTable'
import { MAX_FONT_SIZE, MIN_FONT_SIZE } from '../TextBox/TextBox'
import LayerMenuItems, { type LayerAction } from '../LayerMenuItems'
import { STICKER_COLORS } from '../ToolPanel/ToolPanel'
import boldIcon from '../TextToolbar/icons/bold.png'
import italicIcon from '../TextToolbar/icons/coursive.png'
import underlineIcon from '../TextToolbar/icons/underline.png'
import strikeIcon from '../TextToolbar/icons/line.png'
import leftIcon from '../TextToolbar/icons/left.png'
import centerIcon from '../TextToolbar/icons/center.png'
import rightIcon from '../TextToolbar/icons/right.png'
import moreIcon from '../TextToolbar/icons/dots.png'
import mergeIcon from '../../../../assets/mergecell.svg'
import splitIcon from '../../../../assets/splitcell.svg'
import '../TextToolbar/TextToolbar.css'
import './TableToolbar.css'

type Format = 'bold' | 'italic' | 'underline' | 'strikeThrough'
type Menu = 'size' | 'color' | 'format' | 'align' | 'more' | null
type Props = {
  cells: TableCellData[]
  selectedLine: { axis: 'row' | 'column'; index: number } | null
  fontSize: number
  centerX: number
  top: number
  onFontSize: (size: number) => void
  onChangeCells: (changes: Partial<TableCellData>) => void
  onFormat: (format: Format) => void
  onMerge: () => void
  onSplit: () => void
  onDeleteLine: () => void
  onCopy: () => void
  onLayer: (action: LayerAction) => void
  onDelete: () => void
}

const ALIGN_ICONS = { left: leftIcon, center: centerIcon, right: rightIcon }
const FONT_SIZES = [10, 12, 14, 18, 24, 36, 48, 64, 96]
const FORMATS = [
  ['bold', 'Полужирный', boldIcon], ['italic', 'Курсив', italicIcon],
  ['underline', 'Подчёркнутый', underlineIcon], ['strikeThrough', 'Зачёркнутый', strikeIcon],
] as const

export default function TableToolbar({ cells, selectedLine, fontSize, centerX, top, onFontSize, onChangeCells, onFormat,
  onMerge, onSplit, onDeleteLine, onCopy,
  onLayer, onDelete }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [menu, setMenu] = useState<Menu>(null)
  const [sizeInput, setSizeInput] = useState(String(Math.round(fontSize)))
  const [editingSize, setEditingSize] = useState(false)
  const cellMode = cells.length > 0
  const first = cells[0]
  const commonFill = cells.every((cell) => cell.fill === first?.fill) ? first?.fill : null
  const commonAlign = cells.every((cell) => cell.align === first?.align) ? first?.align : 'left'
  const left = width ? Math.max(12, Math.min(window.innerWidth - width - 12, centerX - width / 2)) : centerX
  const toggle = (next: Menu) => setMenu((current) => current === next ? null : next)
  const fontSizeLabel = Math.round(fontSize)
  const setSize = (size: number) => {
    const bounded = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, size))
    setSizeInput(String(bounded))
    onFontSize(bounded)
  }
  const applySizeInput = () => {
    if (!sizeInput.trim()) return
    const size = Number(sizeInput)
    if (!Number.isFinite(size)) return
    setSize(Math.round(size))
    setMenu(null)
  }

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const measure = () => setWidth(root.getBoundingClientRect().width)
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    measure()
    return () => observer.disconnect()
  }, [])

  return <div ref={rootRef} className="text-toolbar table-toolbar" style={{ left, top }} role="toolbar"
    aria-label={cellMode ? 'Форматирование ячеек таблицы' : 'Действия с таблицей'}
    onPointerDown={(event) => {
      if (!(event.target instanceof HTMLInputElement)) event.preventDefault()
      event.stopPropagation()
    }}>
    <div className="text-toolbar__row">
      {!cellMode && <div className="text-toolbar__control text-toolbar__control--size">
        <input className="text-toolbar__size-value" type="number" min={MIN_FONT_SIZE} max={MAX_FONT_SIZE} step="1"
          value={editingSize ? sizeInput : String(fontSizeLabel)} aria-label="Размер шрифта таблицы" aria-expanded={menu === 'size'}
          onFocus={() => { setSizeInput(String(fontSizeLabel)); setEditingSize(true); setMenu('size') }}
          onClick={() => setMenu('size')}
          onChange={(event) => setSizeInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applySizeInput(); event.currentTarget.blur() } }}
          onBlur={() => {
            const size = Number(sizeInput)
            if (sizeInput.trim() && Number.isFinite(size)) setSize(Math.round(size))
            else setSizeInput(String(fontSizeLabel))
            setEditingSize(false)
          }} />
        <div className="text-toolbar__size-steps">
          <button type="button" aria-label="Увеличить размер текста таблицы" disabled={fontSize >= MAX_FONT_SIZE}
            onClick={() => setSize(fontSizeLabel + 1)}><span className="text-toolbar__arrow text-toolbar__arrow--up" /></button>
          <button type="button" aria-label="Уменьшить размер текста таблицы" disabled={fontSize <= MIN_FONT_SIZE}
            onClick={() => setSize(fontSizeLabel - 1)}><span className="text-toolbar__arrow text-toolbar__arrow--down" /></button>
        </div>
        {menu === 'size' && <div className="text-toolbar__popover text-toolbar__popover--size" role="group" aria-label="Выбор размера текста таблицы">
          {FONT_SIZES.map((size) => <button key={size} type="button" aria-pressed={fontSizeLabel === size}
            onClick={() => { setSize(size); setMenu(null) }}>{size}</button>)}
        </div>}
      </div>}
      {!cellMode && <span className="text-toolbar__divider" aria-hidden="true" />}
      {cellMode && <>
        <div className="text-toolbar__control">
          <button className="table-toolbar__color-button" type="button" aria-label="Цвет фона ячеек"
            aria-expanded={menu === 'color'} onClick={() => toggle('color')}>
            <span style={{ backgroundColor: commonFill ?? '#fff' }} />
          </button>
          {menu === 'color' && <div className="text-toolbar__popover text-toolbar__popover--colors table-toolbar__colors"
            role="group" aria-label="Цвет фона ячеек">
            {STICKER_COLORS.map((color) => <button key={color.name} className="text-toolbar__swatch" type="button"
              aria-label={color.name} aria-pressed={commonFill === color.fill} title={color.name}
              style={{ backgroundColor: color.fill }} onClick={() => { onChangeCells({ fill: color.fill }); setMenu(null) }} />)}
            <button className="text-toolbar__swatch table-toolbar__white" type="button" aria-label="Белый"
              aria-pressed={commonFill === '#FFFFFF'} title="Белый"
              onClick={() => { onChangeCells({ fill: '#FFFFFF' }); setMenu(null) }} />
          </div>}
        </div>
        <div className="text-toolbar__control">
          <button className="text-toolbar__icon-button" type="button" aria-label="Начертание текста ячеек"
            aria-expanded={menu === 'format'} data-active={cells.some((cell) => Boolean(cell.bold || cell.italic || cell.underline || cell.strikeThrough))}
            onClick={() => toggle('format')}><img className="text-toolbar__asset-icon" src={boldIcon} alt="" aria-hidden="true" /></button>
          {menu === 'format' && <div className="text-toolbar__popover text-toolbar__popover--format" role="group" aria-label="Начертание">
            {FORMATS.map(([format, label, icon]) => <button key={format} type="button" aria-label={label}
              aria-pressed={cells.every((cell) => Boolean(cell[format]))}
              onClick={() => { onFormat(format); setMenu(null) }}>
              <img className="text-toolbar__asset-icon" src={icon} alt="" aria-hidden="true" />
            </button>)}
          </div>}
        </div>
        <div className="text-toolbar__control">
          <button className="text-toolbar__icon-button" type="button" aria-label="Выравнивание текста ячеек"
            aria-expanded={menu === 'align'} onClick={() => toggle('align')}>
            <img className="text-toolbar__asset-icon text-toolbar__asset-icon--align" src={ALIGN_ICONS[commonAlign]} alt="" aria-hidden="true" />
          </button>
          {menu === 'align' && <div className="text-toolbar__popover text-toolbar__popover--compact" role="group" aria-label="Выравнивание">
            {(['left', 'center', 'right'] as const).map((align) => <button key={align} type="button"
              aria-label={align === 'left' ? 'По левому краю' : align === 'center' ? 'По центру' : 'По правому краю'}
              aria-pressed={cells.every((cell) => cell.align === align)}
              onClick={() => { onChangeCells({ align }); setMenu(null) }}>
              <img className="text-toolbar__asset-icon text-toolbar__asset-icon--align" src={ALIGN_ICONS[align]} alt="" aria-hidden="true" />
            </button>)}
          </div>}
        </div>
        <div className="text-toolbar__control">
          <button className="text-toolbar__icon-button table-toolbar__merge" type="button"
            aria-label="Объединить ячейки" title="Объединить ячейки" disabled={cells.length < 2} onClick={onMerge}>
            <img className="text-toolbar__asset-icon" src={mergeIcon} alt="" aria-hidden="true" />
          </button>
        </div>
        <div className="text-toolbar__control">
          <button className="text-toolbar__icon-button table-toolbar__merge" type="button"
            aria-label="Разъединить ячейки" title="Разъединить ячейки"
            disabled={!cells.some((cell) => (cell.rowSpan ?? 1) > 1 || (cell.colSpan ?? 1) > 1)} onClick={onSplit}>
            <img className="text-toolbar__asset-icon" src={splitIcon} alt="" aria-hidden="true" />
          </button>
        </div>
        <span className="text-toolbar__divider" aria-hidden="true" />
      </>}
      <div className="text-toolbar__control">
        <button className="text-toolbar__icon-button" type="button" aria-label="Дополнительные действия"
          aria-expanded={menu === 'more'} onClick={() => toggle('more')}>
          <img className="text-toolbar__asset-icon text-toolbar__asset-icon--more" src={moreIcon} alt="" aria-hidden="true" />
        </button>
        {menu === 'more' && <div className="text-toolbar__popover text-toolbar__popover--more" role="group" aria-label="Дополнительные действия">
          <button className="text-toolbar__menu-item" type="button" onClick={() => { onCopy(); setMenu(null) }}>
            <span>Копировать</span>
            <span className="text-toolbar__shortcut">Ctrl+C</span></button>
          {cellMode ? <>
            <button className="text-toolbar__menu-item" type="button" onClick={() => { onChangeCells({ text: '' }); setMenu(null) }}>
              <span>Очистить</span><span className="text-toolbar__shortcut">Del</span></button>
            {selectedLine && <button className="text-toolbar__menu-item" type="button"
              onClick={() => { onDeleteLine(); setMenu(null) }}>
              <span>Удалить</span><span className="text-toolbar__shortcut">Ctrl+Del</span></button>}
          </> : <>
            <LayerMenuItems onAction={(action) => { onLayer(action); setMenu(null) }} />
            <button className="text-toolbar__menu-item" type="button" onClick={() => { onDelete(); setMenu(null) }}>
              <span>Удалить</span><span className="text-toolbar__shortcut">Del</span></button>
          </>}
        </div>}
      </div>
    </div>
  </div>
}
