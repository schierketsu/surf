import { useEffect, useRef } from 'react'
import type { Theme } from './theme'

type BoardCanvasProps = { theme: Theme }

export default function BoardCanvas({ theme }: BoardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const draw = () => {
      const bounds = canvas.getBoundingClientRect()
      const ratio = Math.max(1, window.devicePixelRatio || 1)
      const width = Math.round(bounds.width * ratio)
      const height = Math.round(bounds.height * ratio)
      if (!width || !height) return

      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) return

      const colors = getComputedStyle(canvas)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.fillStyle = colors.getPropertyValue('--canvas-background').trim()
      context.fillRect(0, 0, bounds.width, bounds.height)

      const grid = (spacing: number, thickness: number, color: string) => {
        context.fillStyle = color
        for (let x = 0; x < bounds.width; x += spacing) {
          context.fillRect(x, 0, thickness, bounds.height)
        }
        for (let y = 0; y < bounds.height; y += spacing) {
          context.fillRect(0, y, bounds.width, thickness)
        }
      }

      grid(24, 1, colors.getPropertyValue('--canvas-line').trim())
      grid(96, 2, colors.getPropertyValue('--canvas-line-strong').trim())
    }

    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    window.addEventListener('resize', draw)
    draw()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', draw)
    }
  }, [theme])

  return (
    <main className="board" aria-label="Поле доски">
      <canvas ref={canvasRef} className="board-canvas">
        Поле доски требует поддержки Canvas.
      </canvas>
    </main>
  )
}
