import minusIcon from './icons/minus.png'
import plusIcon from './icons/plus.png'
import './ZoomControls.css'

type ZoomControlsProps = {
  onZoomOut: () => void
  onZoomIn: () => void
  atMinZoom: boolean
  atMaxZoom: boolean
}

export default function ZoomControls({ onZoomOut, onZoomIn, atMinZoom, atMaxZoom }: ZoomControlsProps) {
  return (
    <div className="zoom-controls" role="group" aria-label="Масштаб доски">
      <button type="button" aria-label="Уменьшить масштаб" title="Уменьшить масштаб" onClick={onZoomOut} disabled={atMinZoom}>
        <img src={minusIcon} alt="" aria-hidden="true" />
      </button>
      <button type="button" aria-label="Увеличить масштаб" title="Увеличить масштаб" onClick={onZoomIn} disabled={atMaxZoom}>
        <img src={plusIcon} alt="" aria-hidden="true" />
      </button>
    </div>
  )
}
