import menuIcon from './icons/menu.png'
import './TemplateControl.css'

export default function TemplateControl() {
  return (
    <div className="template-control" role="group" aria-label="Текущий шаблон">
      <span className="template-control__label">Шаблон</span>
      <button className="template-control__more" type="button" aria-label="Меню шаблона" title="Меню шаблона">
        <img src={menuIcon} alt="" aria-hidden="true" />
      </button>
    </div>
  )
}
