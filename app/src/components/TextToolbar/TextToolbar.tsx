import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { MAX_FONT_SIZE, MIN_FONT_SIZE, type TextItem } from '../TextBox/TextBox'
import italicIcon from './icons/coursive.png'
import boldIcon from './icons/bold.png'
import strikeIcon from './icons/line.png'
import underlineIcon from './icons/underline.png'
import alignLeftIcon from './icons/left.png'
import alignCenterIcon from './icons/center.png'
import alignRightIcon from './icons/right.png'
import textColorIcon from './icons/color_text.png'
import moreIcon from './icons/dots.png'
import './TextToolbar.css'

type Menu = 'font' | 'size' | 'format' | 'align' | 'color' | 'background' | 'more' | null
type FormatCommand = 'bold' | 'italic' | 'underline' | 'strikeThrough'
type ActiveFormats = Record<FormatCommand, boolean>

const EMPTY_FORMATS: ActiveFormats = { bold: false, italic: false, underline: false, strikeThrough: false }

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 30, 32, 36, 40, 48, 56, 64, 72, 96]
const FONTS = [
  { label: 'Doska', value: "'Doska', Arial, sans-serif" },
  { label: 'Monospace', value: 'monospace' },
]
const ALIGN_ICONS = { left: alignLeftIcon, center: alignCenterIcon, right: alignRightIcon }
const TEXT_COLORS = [
  { name: 'Светло-жёлтый', value: '#FFF4B3' }, { name: 'Жёлтый', value: '#FFC400' },
  { name: 'Белый', value: '#FFFFFF' },
  { name: 'Персиковый', value: '#F6D3B5' }, { name: 'Оранжевый', value: '#FF6D00' },
  { name: 'Светло-серый', value: '#E5E5E5' },
  { name: 'Светло-розовый', value: '#FFC2C7' }, { name: 'Розовый', value: '#FF3366' },
  { name: 'Красный', value: '#E60023' }, { name: 'Серый', value: '#A8A8A8' },
  { name: 'Мятный', value: '#A5EBC8' }, { name: 'Зелёный', value: '#00C853' },
  { name: 'Тёмно-зелёный', value: '#087532' }, { name: 'Тёмно-серый', value: '#5F5F5F' },
  { name: 'Светло-синий', value: '#C4DCFA' }, { name: 'Голубой', value: '#5E9BF0' },
  { name: 'Синий', value: '#0057FF' }, { name: 'Чёрный', value: '#272727' },
  { name: 'Лавандовый', value: '#DED8FA' }, { name: 'Фиолетовый', value: '#7C3AED' },
  { name: 'Пурпурный', value: '#D500F9' }, { name: 'Бирюзовый', value: '#00AFAF' },
  { name: 'Лаймовый', value: '#84CC16' },
]

function normalizeColor(value: string) {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase()
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(value)
  return rgb ? `#${rgb.slice(1).map((part) => Number(part).toString(16).padStart(2, '0')).join('').toUpperCase()}` : null
}

function parseBackground(value: string) {
  if (!value || value === 'transparent') return { color: null, opacity: 0 }
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i.exec(value)
  if (rgba) {
    const color = `#${rgba.slice(1, 4).map((part) => Number(part).toString(16).padStart(2, '0')).join('').toUpperCase()}`
    return { color, opacity: Math.round(Number(rgba[4]) * 100) }
  }
  return { color: normalizeColor(value) ?? value, opacity: 100 }
}

function backgroundValue(color: string, opacity: number) {
  if (opacity === 100) return color
  const channels = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16))
  return `rgba(${channels.join(', ')}, ${opacity / 100})`
}

function textColors(item: TextItem, editor?: HTMLElement | null) {
  const root = editor ?? document.createElement('div')
  if (!editor) root.innerHTML = item.html
  const colors: string[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null

  while ((node = walker.nextNode())) {
    if (!node.textContent?.trim()) continue
    let color = item.color
    for (let element = node.parentElement; element && element !== root; element = element.parentElement) {
      const inlineColor = element.style.color || element.getAttribute('color')
      if (inlineColor) {
        color = inlineColor
        break
      }
    }
    color = normalizeColor(color) ?? color
    if (!colors.includes(color)) colors.push(color)
  }

  return colors.length ? colors : [normalizeColor(item.color) ?? item.color]
}

type TextToolbarProps = {
  item: TextItem
  items: TextItem[]
  centerX: number
  top: number
  activeFormatsOverride?: ActiveFormats
  onChange: (changes: Partial<TextItem>) => void
  onFormat: (command: string) => void
  onColor: (color: string) => void
  onDelete: () => void
}

export default function TextToolbar({ item, items, centerX, top, activeFormatsOverride, onChange, onFormat, onColor, onDelete }: TextToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<Menu>(null)
  const [toolbarWidth, setToolbarWidth] = useState(0)
  const [activeFormats, setActiveFormats] = useState<ActiveFormats>(EMPTY_FORMATS)
  const [inlineColor, setInlineColor] = useState<string | null>(null)
  const [, refreshColors] = useState(0)
  const background = parseBackground(item.highlight)
  const lastBackgroundColor = useRef(background.color ?? '#FFF4B3')
  const toggleMenu = (next: Menu) => setMenu((current) => current === next ? null : next)
  const setSize = (size: number) => onChange({ fontSize: Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, size)) })
  const fontName = FONTS.find((font) => font.value === item.fontFamily)?.label ?? 'Doska'
  const fontSizeLabel = Math.round(item.fontSize)
  const displayedFormats = activeFormatsOverride ?? {
    bold: activeFormats.bold || Boolean(item.bold),
    italic: activeFormats.italic || Boolean(item.italic),
    underline: activeFormats.underline || Boolean(item.underline),
    strikeThrough: activeFormats.strikeThrough || Boolean(item.strikeThrough),
  }
  const hasActiveFormat = Object.values(displayedFormats).some(Boolean)
  const editor = items.length === 1 ? document.querySelector<HTMLElement>('.text-box--selected .text-box__editor') : null
  const indicatorColors = [...new Set(items.flatMap((selectedItem) => textColors(selectedItem, editor)))]
  const activeColor = inlineColor ?? (indicatorColors.length === 1 ? indicatorColors[0] : null)
  const sameBackground = items.every((selectedItem) => selectedItem.highlight === item.highlight)
  const backgroundHue = background.color ?? lastBackgroundColor.current
  const setBackground = (color: string | null, opacity: number) => {
    if (color) lastBackgroundColor.current = color
    onChange({ highlight: color ? backgroundValue(color, opacity) : 'transparent' })
  }
  const setBackgroundFromPointer = (event: ReactPointerEvent<HTMLInputElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const opacity = Math.max(0, Math.min(100, Math.round((event.clientX - bounds.left) / bounds.width * 100)))
    setBackground(backgroundHue, opacity)
  }
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

  const refreshFormats = useCallback(() => {
    const editor = document.querySelector('.text-box--selected .text-box__editor')
    const selection = window.getSelection()
    const next = editor && selection?.anchorNode && editor.contains(selection.anchorNode)
      ? {
          bold: document.queryCommandState('bold'),
          italic: document.queryCommandState('italic'),
          underline: document.queryCommandState('underline'),
          strikeThrough: document.queryCommandState('strikeThrough'),
        }
      : EMPTY_FORMATS
    setActiveFormats((current) => Object.keys(EMPTY_FORMATS).every((key) =>
      current[key as FormatCommand] === next[key as FormatCommand]) ? current : next)
    setInlineColor(editor && selection && !selection.isCollapsed && selection.anchorNode && editor.contains(selection.anchorNode)
      ? normalizeColor(document.queryCommandValue('foreColor')) : null)
  }, [])

  useEffect(() => {
    document.addEventListener('selectionchange', refreshFormats)
    refreshFormats()
    return () => document.removeEventListener('selectionchange', refreshFormats)
  }, [refreshFormats])

  useEffect(() => {
    if (items.length !== 1) return
    const selectedEditor = document.querySelector('.text-box--selected .text-box__editor')
    if (!selectedEditor) return
    const observer = new MutationObserver(() => refreshColors((current) => current + 1))
    observer.observe(selectedEditor, { subtree: true, childList: true, characterData: true, attributes: true })
    return () => observer.disconnect()
  }, [item.id, items.length])

  const applyFormat = (command: FormatCommand) => {
    onFormat(command)
    refreshFormats()
    setMenu(null)
  }

  return (
    <div
      ref={toolbarRef}
      className="text-toolbar"
      style={{ left, top }}
      role="toolbar"
      aria-label="Форматирование текста"
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <div className="text-toolbar__row">
        <div className="text-toolbar__control text-toolbar__control--font">
          <button className="text-toolbar__font" type="button" aria-label="Шрифт" aria-expanded={menu === 'font'}
            onClick={() => toggleMenu('font')}>
            <span>{fontName}</span><span className="text-toolbar__arrow text-toolbar__arrow--down" aria-hidden="true" />
          </button>
          {menu === 'font' && <div className="text-toolbar__popover text-toolbar__popover--font" role="group" aria-label="Выбор шрифта">
            {FONTS.map((font) => <button key={font.value} type="button" style={{ fontFamily: font.value }}
              aria-pressed={item.fontFamily === font.value}
              onClick={() => { onChange({ fontFamily: font.value }); setMenu(null) }}>{font.label}</button>)}
          </div>}
        </div>

        <span className="text-toolbar__divider" />

        <div className="text-toolbar__control text-toolbar__control--size">
          <button className="text-toolbar__size-value" type="button" aria-label="Размер шрифта" aria-expanded={menu === 'size'}
            onClick={() => toggleMenu('size')}>
            {fontSizeLabel}
          </button>
          <div className="text-toolbar__size-steps">
            <button type="button" aria-label="Увеличить размер текста" disabled={item.fontSize >= MAX_FONT_SIZE}
              onClick={() => setSize(fontSizeLabel + 1)}><span className="text-toolbar__arrow text-toolbar__arrow--up" /></button>
            <button type="button" aria-label="Уменьшить размер текста" disabled={item.fontSize <= MIN_FONT_SIZE}
              onClick={() => setSize(fontSizeLabel - 1)}><span className="text-toolbar__arrow text-toolbar__arrow--down" /></button>
          </div>
          {menu === 'size' && <div className="text-toolbar__popover text-toolbar__popover--size" role="group" aria-label="Выбор размера текста">
            {FONT_SIZES.map((size) => <button key={size} type="button" aria-pressed={fontSizeLabel === size}
              onClick={() => { setSize(size); setMenu(null) }}>{size}</button>)}
          </div>}
        </div>

        <span className="text-toolbar__divider" />

        <div className="text-toolbar__control">
          <button className="text-toolbar__icon-button" type="button" aria-label="Начертание" aria-expanded={menu === 'format'} data-active={hasActiveFormat}
            onClick={() => toggleMenu('format')}><img className="text-toolbar__asset-icon" src={boldIcon} alt="" aria-hidden="true" /></button>
          {menu === 'format' && <div className="text-toolbar__popover text-toolbar__popover--format" role="group" aria-label="Начертание текста">
            <button type="button" aria-label="Полужирный" title="Полужирный" aria-pressed={displayedFormats.bold} onClick={() => applyFormat('bold')}><img className="text-toolbar__asset-icon" src={boldIcon} alt="" aria-hidden="true" /></button>
            <button type="button" aria-label="Курсив" title="Курсив" aria-pressed={displayedFormats.italic} onClick={() => applyFormat('italic')}><img className="text-toolbar__asset-icon" src={italicIcon} alt="" aria-hidden="true" /></button>
            <button type="button" aria-label="Подчёркнутый" title="Подчёркнутый" aria-pressed={displayedFormats.underline} onClick={() => applyFormat('underline')}><img className="text-toolbar__asset-icon" src={underlineIcon} alt="" aria-hidden="true" /></button>
            <button type="button" aria-label="Зачёркнутый" title="Зачёркнутый" aria-pressed={displayedFormats.strikeThrough} onClick={() => applyFormat('strikeThrough')}><img className="text-toolbar__asset-icon text-toolbar__asset-icon--strike" src={strikeIcon} alt="" aria-hidden="true" /></button>
          </div>}
        </div>

        <div className="text-toolbar__control">
          <button className="text-toolbar__icon-button" type="button" aria-label="Выравнивание" aria-expanded={menu === 'align'}
            onClick={() => toggleMenu('align')}><img className="text-toolbar__asset-icon text-toolbar__asset-icon--align" src={ALIGN_ICONS[item.align]} alt="" aria-hidden="true" /></button>
          {menu === 'align' && <div className="text-toolbar__popover text-toolbar__popover--compact" role="group" aria-label="Выравнивание">
            {(['left', 'center', 'right'] as const).map((align) => <button key={align} type="button"
              aria-label={`По ${align === 'left' ? 'левому краю' : align === 'center' ? 'центру' : 'правому краю'}`}
              aria-pressed={item.align === align} onClick={() => { onChange({ align }); setMenu(null) }}>
              <img className="text-toolbar__asset-icon text-toolbar__asset-icon--align" src={ALIGN_ICONS[align]} alt="" aria-hidden="true" />
            </button>)}
          </div>}
        </div>

        <div className="text-toolbar__control">
          <button className="text-toolbar__icon-button" type="button" aria-label="Цвет текста" aria-expanded={menu === 'color'}
            onClick={() => toggleMenu('color')}>
            <span className="text-toolbar__color-icon" aria-hidden="true">
              <img className="text-toolbar__asset-icon text-toolbar__asset-icon--color" src={textColorIcon} alt="" />
              <span className="text-toolbar__color-line">
                {indicatorColors.map((color) => <span key={color} style={{ backgroundColor: color }} />)}
              </span>
            </span>
          </button>
          {menu === 'color' && <div className="text-toolbar__popover text-toolbar__popover--colors" role="group" aria-label="Цвет текста">
            {TEXT_COLORS.map(({ name, value }) => <button key={value} className="text-toolbar__swatch" type="button"
              aria-label={`${name}, ${value}`} aria-pressed={activeColor === value} title={name}
              style={{ backgroundColor: value }}
              onClick={() => { onColor(value); setInlineColor(value) }} />)}
          </div>}
        </div>

        <div className="text-toolbar__control">
          <button className="text-toolbar__icon-button" type="button" aria-label="Фон текстового блока" aria-expanded={menu === 'background'}
            onClick={() => toggleMenu('background')}>
            <span className="text-toolbar__background-icon" aria-hidden="true">
              <span style={{ backgroundColor: item.highlight }} />
            </span>
          </button>
          {menu === 'background' && <div className="text-toolbar__popover text-toolbar__popover--background" role="group" aria-label="Фон текстового блока">
            <div className="text-toolbar__background-grid">
              <button className="text-toolbar__swatch text-toolbar__swatch--transparent" type="button"
                aria-label="Прозрачный фон" aria-pressed={sameBackground && background.color === null} title="Прозрачный"
                onClick={() => setBackground(null, 0)} />
              {TEXT_COLORS.map(({ name, value }) => <button key={value} className="text-toolbar__swatch" type="button"
                aria-label={`${name}, ${value}`} aria-pressed={sameBackground && background.color === value} title={name}
                style={{ backgroundColor: value }}
                onClick={() => setBackground(value, background.color ? background.opacity : 100)} />)}
            </div>
            <div className="text-toolbar__background-opacity" data-disabled={background.color === null}>
              <output>{background.opacity}%</output>
              <input type="range" min="0" max="100" value={background.opacity} aria-label="Непрозрачность фона" disabled={background.color === null}
                style={{ background: background.color === null
                  ? 'conic-gradient(#d8dce1 25%, #fff 0 50%, #d8dce1 0 75%, #fff 0) 0 0 / 8px 8px'
                  : `linear-gradient(90deg, transparent, ${backgroundHue}), conic-gradient(#d8dce1 25%, #fff 0 50%, #d8dce1 0 75%, #fff 0) 0 0 / 8px 8px` }}
                onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setBackgroundFromPointer(event) }}
                onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) setBackgroundFromPointer(event) }}
                onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
                onChange={(event) => setBackground(backgroundHue, Number(event.target.value))} />
            </div>
          </div>}
        </div>

        <span className="text-toolbar__divider" />

        <div className="text-toolbar__control">
          <button className="text-toolbar__icon-button" type="button" aria-label="Дополнительные действия" aria-expanded={menu === 'more'}
            onClick={() => toggleMenu('more')}><img className="text-toolbar__asset-icon text-toolbar__asset-icon--more" src={moreIcon} alt="" aria-hidden="true" /></button>
          {menu === 'more' && <div className="text-toolbar__popover text-toolbar__popover--more" role="group" aria-label="Дополнительные действия">
            <button className="text-toolbar__menu-item" type="button" onClick={onDelete}>
              <span>Удалить</span><span className="text-toolbar__shortcut">Delete</span>
            </button>
          </div>}
        </div>

      </div>
    </div>
  )
}
