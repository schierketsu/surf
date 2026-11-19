export type LayerAction = 'front' | 'forward' | 'backward' | 'back'

const ACTIONS: { action: LayerAction; label: string; shortcut: string }[] = [
  { action: 'front', label: 'На передний план', shortcut: ']' },
  { action: 'back', label: 'На задний план', shortcut: '[' },
]

export default function LayerMenuItems({ onAction }: { onAction: (action: LayerAction) => void }) {
  return <>
    {ACTIONS.map(({ action, label, shortcut }) => <button key={action} className="text-toolbar__menu-item"
      type="button" onClick={() => onAction(action)}>
      <span>{label}</span><span className="text-toolbar__shortcut">{shortcut}</span>
    </button>)}
  </>
}
