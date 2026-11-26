type WithId = { id: string }

export function boardObjectIds(board: {
  drawings: WithId[]
  images: WithId[]
  stickers: WithId[]
  tables: WithId[]
  texts: WithId[]
  arrows: WithId[]
}) {
  return [
    ...board.drawings.map((item) => item.id),
    ...board.images.map((item) => item.id),
    ...board.stickers.map((item) => item.id),
    ...board.tables.map((item) => item.id),
    ...board.texts.map((item) => item.id),
    ...board.arrows.map((item) => item.id),
  ]
}

export function normalizeLayerOrder(order: string[], objectIds: string[]) {
  const existing = new Set(objectIds)
  const normalized = order.filter((id) => existing.has(id))
  const known = new Set(normalized)
  objectIds.forEach((id) => { if (!known.has(id)) normalized.push(id) })
  return normalized
}
