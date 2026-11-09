import './ToolPanel.css'

export default function ToolPanel() {
  return (
    <div className="tool-panel" role="group" aria-label="Панель инструментов">
      {[1, 2, 3].map((tool) => (
        <button key={tool} type="button" aria-label={`Инструмент ${tool}`}>
          {tool}
        </button>
      ))}
    </div>
  )
}
