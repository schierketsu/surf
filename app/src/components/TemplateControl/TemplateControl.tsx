import { useEffect, useRef, useState } from 'react'
import menuIcon from './icons/menu.png'
import './TemplateControl.css'

export default function TemplateControl({ name, onReturn }: { name: string; onReturn: () => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div ref={rootRef} className="template-control" role="group" aria-label="Текущий шаблон">
      <button className="template-control__more" type="button" aria-label="Меню шаблона" title="Меню шаблона"
        aria-expanded={open} aria-controls={open ? 'template-control-menu' : undefined}
        onClick={() => setOpen((current) => !current)}>
        <img src={menuIcon} alt="" aria-hidden="true" />
      </button>
      <span className="template-control__label">{name}</span>
      {open && <div id="template-control-menu" className="template-control__menu" role="menu">
        <button className="template-control__menu-item" type="button" role="menuitem"
          onClick={() => { setOpen(false); onReturn() }}>Вернуться</button>
        {Array.from({ length: 6 }, (_, index) =>
          <button className="template-control__menu-item" type="button" role="menuitem"
            key={index} disabled>Заглушка</button>)}
      </div>}
    </div>
  )
}
