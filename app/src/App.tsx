import BoardCanvas from './BoardCanvas'
import TemplateControl from './components/TemplateControl/TemplateControl'

export default function App() {
  return (
    <div className="app-shell">
      <BoardCanvas />
      <TemplateControl />
    </div>
  )
}
