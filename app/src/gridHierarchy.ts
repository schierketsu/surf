export const BOARD_WIDTH = 3840
export const BOARD_HEIGHT = 2160

// 6000 / 5^2 = 240: a 48 px mini square becomes the next level's major square.
const ROOT_SIZE = 6000
const BASE_LEVEL = 2
const MAX_LEVEL = 5
export const MINI_CELLS_PER_SIDE = 5

export type WorldRect = {
  left: number
  top: number
  right: number
  bottom: number
}

export function gridLevelForScale(scale: number, minimumScale: number) {
  const minimumDepth = BASE_LEVEL + Math.log(minimumScale) / Math.log(MINI_CELLS_PER_SIDE)
  const baseDepth = BASE_LEVEL + Math.log(scale) / Math.log(MINI_CELLS_PER_SIDE)
  const blendRange = Math.log(minimumScale < 1 ? 1 / minimumScale : MINI_CELLS_PER_SIDE)
  const transition = Math.max(0, Math.min(1, Math.log(scale / minimumScale) / blendRange))
  // Start on a whole level so the furthest view has exactly five cells per major square.
  // Return to the regular levels by 1× zoom (or over a fivefold zoom on very large screens).
  const depth = scale <= minimumScale
    ? Math.round(minimumDepth)
    : baseDepth + (Math.round(minimumDepth) - minimumDepth) * (1 - transition)
  const clampedDepth = Math.max(0, Math.min(MAX_LEVEL, depth))
  const level = Math.floor(clampedDepth)
  return { level, majorSize: ROOT_SIZE / MINI_CELLS_PER_SIDE ** level, progress: clampedDepth - level }
}

export function visitVisibleCells(bounds: WorldRect, targetLevel: number, visit: (x: number, y: number, size: number) => void) {
  const walk = (x: number, y: number, size: number, level: number) => {
    if (x >= bounds.right || y >= bounds.bottom || x + size <= bounds.left || y + size <= bounds.top) return
    if (level === targetLevel) {
      visit(x, y, size)
      return
    }

    const childSize = size / MINI_CELLS_PER_SIDE
    for (let row = 0; row < MINI_CELLS_PER_SIDE; row++) {
      for (let column = 0; column < MINI_CELLS_PER_SIDE; column++) {
        walk(x + column * childSize, y + row * childSize, childSize, level + 1)
      }
    }
  }

  walk(0, 0, ROOT_SIZE, 0)
}
