import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MAX_FONT_SIZE, MIN_FONT_SIZE, type TextItem } from '../TextBox/TextBox'
import italicIcon from './icons/coursive.png'
import boldIcon from './icons/bold.png'
import strikeIcon from './icons/line.png'
import underlineIcon from './icons/underline.png'
import alignLeftIcon from './icons/left.png'
import alignCenterIcon from './icons/center.png'
import alignRightIcon from './icons/right.png'
import './TextToolbar.css'

type Menu = 'font' | 'size' | 'format' | 'align' | null
type FormatCommand = 'bold' | 'italic' | 'underline' | 'strikeThrough'
type ActiveFormats = Record<FormatCommand, boolean>

const EMPTY_FORMATS: ActiveFormats = { bold: false, italic: false, underline: false, strikeThrough: false }

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 30, 32, 36, 40, 48, 56, 64, 72, 96]
const FONTS = [
  { label: 'Doska', value: "'Doska', Arial, sans-serif" },
  { label: 'Monospace', value: 'monospace' },
]
const ALIGN_ICONS = { left: alignLeftIcon, center: alignCenterIcon, right: alignRightIcon }

type TextToolbarProps = {
  item: TextItem
  centerX: number
  top: number
  activeFormatsOverride?: ActiveFormats
  onChange: (changes: Partial<TextItem>) => void
  onFormat: (command: string) => void
}

export default function TextToolbar({ item, centerX, top, activeFormatsOverride, onChange, onFormat }: TextToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<Menu>(null)
  const [toolbarWidth, setToolbarWidth] = useState(0)
  const [activeFormats, setActiveFormats] = useState<ActiveFormats>(EMPTY_FORMATS)
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
  }, [])

  useEffect(() => {
    document.addEventListener('selectionchange', refreshFormats)
    refreshFormats()
    return () => document.removeEventListener('selectionchange', refreshFormats)
  }, [refreshFormats])

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
        if ((event.target as HTMLElement).closest('button')) event.preventDefault()
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

      </div>
    </div>
  )
}
