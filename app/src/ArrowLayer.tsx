import { BOARD_HEIGHT, BOARD_WIDTH } from './gridHierarchy'
import { type ConnectorSide, type TextItem } from './components/TextBox/TextBox'
import arrowHeadImage from '../../assets/arrow.png'
import HandleDot from './components/HandleDot'

export type Point = { x: number; y: number }
export type ConnectableItem = Pick<TextItem, 'id' | 'x' | 'y' | 'width' | 'height'>
export type Anchor = Point & { textId?: string; side?: ConnectorSide }
export type BendOffset = { along: number; normal: number }
export type ArrowShape = 'straight' | 'elbow' | 'curved'
export type ArrowDash = 'solid' | 'long' | 'short'
export type ArrowEnd = 'none' | 'arrow'
export type Arrow = { id: string; tail: Anchor; head: Anchor; bend: Point; bendOffset?: BendOffset; bendEdited?: boolean;
  color: string; shape?: ArrowShape; dash?: ArrowDash; tailEnd?: ArrowEnd; headEnd?: ArrowEnd;
  curveBends?: [Point, Point, Point]; pendingStraightBend?: Point }
export type ArrowDrag = { kind: 'new' | 'tail' | 'head' | 'bend'; arrowId?: string; tail?: Anchor;
  startClient?: Point; pointerId?: number; active?: boolean; bendIndex?: number }

export function anchorPoint(item: ConnectableItem, side: ConnectorSide): Point {
  const offset = 9
  if (side === 'top') return { x: item.x + item.width / 2, y: item.y - offset }
  if (side === 'bottom') return { x: item.x + item.width / 2, y: item.y + item.height + offset }
  if (side === 'left') return { x: item.x - offset, y: item.y + item.height / 2 }
  return { x: item.x + item.width + offset, y: item.y + item.height / 2 }
}

export function resolveAnchor(anchor: Anchor, texts: ConnectableItem[]): Point {
  const item = texts.find((text) => text.id === anchor.textId)
  return item && anchor.side ? anchorPoint(item, anchor.side) : anchor
}

export function resolveArrowHead(anchor: Anchor, texts: ConnectableItem[]): Point {
  const item = texts.find((text) => text.id === anchor.textId)
  if (!item || !anchor.side) return anchor
  if (anchor.side === 'top') return { x: item.x + item.width / 2, y: item.y }
  if (anchor.side === 'bottom') return { x: item.x + item.width / 2, y: item.y + item.height }
  if (anchor.side === 'left') return { x: item.x, y: item.y + item.height / 2 }
  return { x: item.x + item.width, y: item.y + item.height / 2 }
}

export function resolveArrowShaftEnd(tail: Anchor, head: Anchor, texts: ConnectableItem[]): Point {
  const start = resolveArrowHead(tail, texts)
  const tip = resolveArrowHead(head, texts)
  const dx = tip.x - start.x
  const dy = tip.y - start.y
  const fallback = sideDirection(undefined, { x: dx, y: dy })
  const direction = head.side === 'top' ? { x: 0, y: 1 }
    : head.side === 'bottom' ? { x: 0, y: -1 }
    : head.side === 'left' ? { x: 1, y: 0 }
    : head.side === 'right' ? { x: -1, y: 0 } : fallback
  const inset = 16
  return { x: tip.x - direction.x * inset, y: tip.y - direction.y * inset }
}

function sideDirection(side: ConnectorSide | undefined, fallback: Point): Point {
  if (side === 'top') return { x: 0, y: -1 }
  if (side === 'right') return { x: 1, y: 0 }
  if (side === 'bottom') return { x: 0, y: 1 }
  if (side === 'left') return { x: -1, y: 0 }
  const length = Math.hypot(fallback.x, fallback.y) || 1
  return { x: fallback.x / length, y: fallback.y / length }
}

function curveControls(start: Point, end: Point, tailSide?: ConnectorSide, headSide?: ConnectorSide, bend?: Point, finalDirection?: Point) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const tailDirection = sideDirection(tailSide, { x: dx, y: dy })
  const headDirection = sideDirection(headSide, { x: dx, y: dy })
  const headControlDirection = finalDirection ? { x: -finalDirection.x, y: -finalDirection.y }
    : headSide ? headDirection
    : tailSide === 'left' || tailSide === 'right'
      ? Math.abs(dy) > 12 ? { x: 0, y: -Math.sign(dy) } : { x: -headDirection.x, y: -headDirection.y }
      : tailSide === 'top' || tailSide === 'bottom'
        ? Math.abs(dx) > 12 ? { x: -Math.sign(dx), y: 0 } : { x: -headDirection.x, y: -headDirection.y }
        : { x: -headDirection.x, y: -headDirection.y }
  const distance = Math.hypot(dx, dy)
  const minimumTurn = Math.min(160, distance * .35)
  const tailReach = Math.min(160, Math.max(tailSide ? minimumTurn : 0,
    tailDirection.x ? Math.abs(dx) * .65 : Math.abs(dy) * .65))
  const headReach = Math.min(160, Math.max(headSide ? minimumTurn : 0,
    headControlDirection.x ? Math.abs(dx) * .65 : Math.abs(dy) * .65))
  const first = { x: start.x + tailDirection.x * (tailReach || distance * .3),
    y: start.y + tailDirection.y * (tailReach || distance * .3) }
  const second = { x: end.x + headControlDirection.x * (headReach || distance * .3),
    y: end.y + headControlDirection.y * (headReach || distance * .3) }
  const middle = { x: (start.x + 3 * first.x + 3 * second.x + end.x) / 8,
    y: (start.y + 3 * first.y + 3 * second.y + end.y) / 8 }
  if (!bend) return { first, second, middle }
  const shift = { x: (bend.x - middle.x) * 8 / 3, y: (bend.y - middle.y) * 8 / 3 }
  const a = tailDirection
  const b = headControlDirection
  const determinant = a.x * b.y - a.y * b.x
  if (Math.abs(determinant) > .1) {
    const firstMove = (shift.x * b.y - shift.y * b.x) / determinant
    const secondMove = (a.x * shift.y - a.y * shift.x) / determinant
    return { first: { x: first.x + a.x * firstMove, y: first.y + a.y * firstMove },
      second: { x: second.x + b.x * secondMove, y: second.y + b.y * secondMove }, middle: bend }
  }
  return { first: { x: first.x + shift.x / 2, y: first.y + shift.y / 2 },
    second: { x: second.x + shift.x / 2, y: second.y + shift.y / 2 }, middle: bend }
}

export function initialBend(start: Point, end: Point, tailSide?: ConnectorSide, headSide?: ConnectorSide): Point {
  return curveControls(start, end, tailSide, headSide).middle
}

export function bendOffsetFor(tail: Anchor, head: Anchor, point: Point, texts: ConnectableItem[]): BendOffset {
  const start = resolveArrowHead(tail, texts)
  const end = resolveArrowShaftEnd(tail, head, texts)
  const base = initialBend(start, end, tail.side, head.side)
  const length = Math.hypot(end.x - start.x, end.y - start.y) || 1
  const x = (end.x - start.x) / length
  const y = (end.y - start.y) / length
  return { along: ((point.x - base.x) * x + (point.y - base.y) * y) / length,
    normal: (-(point.x - base.x) * y + (point.y - base.y) * x) / length }
}

function relativeBend(tail: Anchor, head: Anchor, bend: Point, offset: BendOffset | undefined, texts: ConnectableItem[]): Point {
  if (!offset) return bend
  const start = resolveArrowHead(tail, texts)
  const end = resolveArrowShaftEnd(tail, head, texts)
  const base = initialBend(start, end, tail.side, head.side)
  const dx = end.x - start.x
  const dy = end.y - start.y
  return { x: base.x + dx * offset.along - dy * offset.normal,
    y: base.y + dy * offset.along + dx * offset.normal }
}

export function nearestAnchor(point: Point, texts: ConnectableItem[], scale: number, excludeId?: string, occupied?: Set<string>): Anchor | null {
  let best: Anchor | null = null
  let distance = 24 / scale
  for (const item of texts) {
    if (item.id === excludeId) continue
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      if (occupied?.has(`${item.id}:${side}`)) continue
      const anchor = anchorPoint(item, side)
      const next = Math.hypot(point.x - anchor.x, point.y - anchor.y)
      if (next < distance) { best = { ...anchor, textId: item.id, side }; distance = next }
    }
  }
  return best
}

type Hitbox = { left: number; right: number; top: number; bottom: number }

function hitbox(item: ConnectableItem, padding = 0): Hitbox {
  return { left: item.x - padding, right: item.x + item.width + padding,
    top: item.y - padding, bottom: item.y + item.height + padding }
}

function inside(point: Point, box: Hitbox) {
  return point.x > box.left && point.x < box.right && point.y > box.top && point.y < box.bottom
}

export function arrowTarget(point: Point, texts: ConnectableItem[], scale: number, excludeId?: string, occupied?: Set<string>): Anchor {
  const item = [...texts].reverse().find((text) => text.id !== excludeId && inside(point, hitbox(text)))
  if (!item) return nearestAnchor(point, texts, scale, excludeId, occupied) ?? point

  const distances = [
    { side: 'left' as const, distance: point.x - item.x },
    { side: 'right' as const, distance: item.x + item.width - point.x },
    { side: 'top' as const, distance: point.y - item.y },
    { side: 'bottom' as const, distance: item.y + item.height - point.y },
  ].sort((a, b) => a.distance - b.distance)
  const depth = Math.min(12 / scale, item.width / 4, item.height / 4)
  if (distances[0].distance >= depth) {
    const available = (['top', 'right', 'bottom', 'left'] as const)
      .filter((side) => !occupied?.has(`${item.id}:${side}`))
      .map((side) => ({ side, anchor: anchorPoint(item, side) }))
      .sort((a, b) => Math.hypot(point.x - a.anchor.x, point.y - a.anchor.y)
        - Math.hypot(point.x - b.anchor.x, point.y - b.anchor.y))
    if (available[0]) return { ...available[0].anchor, textId: item.id, side: available[0].side }
  }

  const side = distances[0].side
  if (side === 'left') return { x: item.x, y: point.y, side }
  if (side === 'right') return { x: item.x + item.width, y: point.y, side }
  if (side === 'top') return { x: point.x, y: item.y, side }
  return { x: point.x, y: item.y + item.height, side }
}

function crosses(a: Point, b: Point, box: Hitbox) {
  let low = 0
  let high = 1
  for (const [start, delta, min, max] of [
    [a.x, b.x - a.x, box.left, box.right],
    [a.y, b.y - a.y, box.top, box.bottom],
  ]) {
    if (Math.abs(delta) < 1e-8) {
      if (start < min || start > max) return false
    } else {
      const first = (min - start) / delta
      const second = (max - start) / delta
      low = Math.max(low, Math.min(first, second))
      high = Math.min(high, Math.max(first, second))
      if (low >= high) return false
    }
  }
  return inside({ x: a.x + (b.x - a.x) * (low + high) / 2,
    y: a.y + (b.y - a.y) * (low + high) / 2 }, box)
}

function cubicCrossesHitboxes(start: Point, first: Point, second: Point, end: Point, boxes: Hitbox[]) {
  const steps = Math.min(256, Math.max(32, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 6)))
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const s = 1 - t
    const point = { x: s ** 3 * start.x + 3 * s ** 2 * t * first.x + 3 * s * t ** 2 * second.x + t ** 3 * end.x,
      y: s ** 3 * start.y + 3 * s ** 2 * t * first.y + 3 * s * t ** 2 * second.y + t ** 3 * end.y }
    if (boxes.some((box) => inside(point, box))) return true
  }
  return false
}

function visibleRoute(from: Point, to: Point, boxes: Hitbox[], outward?: Point | null): Point[] | null {
  if (!boxes.some((box) => crosses(from, to, box)) && validArrival([from, to], outward)) return [from, to]
  const nodes: Point[] = [from, to]
  if (outward) {
    // Give the route a point beyond the target so it can turn back and approach
    // an attached connector from outside the object instead of cutting through it.
    const leadIn = { x: to.x + outward.x * 24, y: to.y + outward.y * 24 }
    if (leadIn.x >= 0 && leadIn.x <= BOARD_WIDTH && leadIn.y >= 0 && leadIn.y <= BOARD_HEIGHT
      && !boxes.some((box) => inside(leadIn, box) || crosses(leadIn, to, box))) nodes.push(leadIn)
  }
  for (const box of boxes) {
    for (const point of [
      { x: box.left, y: box.top }, { x: box.right, y: box.top },
      { x: box.right, y: box.bottom }, { x: box.left, y: box.bottom },
    ]) {
      if (point.x >= 0 && point.x <= BOARD_WIDTH && point.y >= 0 && point.y <= BOARD_HEIGHT
        && !boxes.some((other) => inside(point, other))) nodes.push(point)
    }
  }
  const distance = nodes.map(() => Infinity)
  const previous = nodes.map(() => -1)
  const visited = nodes.map(() => false)
  distance[0] = 0
  for (let count = 0; count < nodes.length; count++) {
    let current = -1
    for (let index = 0; index < nodes.length; index++) {
      if (!visited[index] && (current < 0 || distance[index] < distance[current])) current = index
    }
    if (current < 0 || !Number.isFinite(distance[current])) break
    if (current === 1) break
    visited[current] = true
    for (let next = 0; next < nodes.length; next++) {
      if (next === 1 && !validArrival([nodes[current], nodes[next]], outward)) continue
      if (next === current || visited[next] || boxes.some((box) => crosses(nodes[current], nodes[next], box))) continue
      const cost = distance[current] + Math.hypot(nodes[next].x - nodes[current].x, nodes[next].y - nodes[current].y)
      if (cost < distance[next]) { distance[next] = cost; previous[next] = current }
    }
  }
  if (!Number.isFinite(distance[1])) return null
  const route: Point[] = []
  for (let index = 1; index >= 0; index = previous[index]) route.push(nodes[index])
  return route.reverse()
}

function validArrival(points: Point[], outward?: Point | null) {
  if (!outward) return true
  const last = points[points.length - 1]
  const before = [...points.slice(0, -1)].reverse().find((point) => point.x !== last.x || point.y !== last.y)
  return !before || (last.x - before.x) * outward.x + (last.y - before.y) * outward.y <= 0
}

function orthogonalRoute(from: Point, to: Point, boxes: Hitbox[], outward?: Point | null): Point[] | null {
  const xs = [...new Set([from.x, to.x, (from.x + to.x) / 2, 0, BOARD_WIDTH,
    ...boxes.flatMap((box) => [box.left, box.right])])].filter((x) => x >= 0 && x <= BOARD_WIDTH).sort((a, b) => a - b)
  const ys = [...new Set([from.y, to.y, (from.y + to.y) / 2, 0, BOARD_HEIGHT,
    ...boxes.flatMap((box) => [box.top, box.bottom])])].filter((y) => y >= 0 && y <= BOARD_HEIGHT).sort((a, b) => a - b)
  const nodes = xs.flatMap((x, column) => ys.map((y, row) => ({ point: { x, y }, column, row })))
  const width = ys.length
  const start = xs.indexOf(from.x) * width + ys.indexOf(from.y)
  const finish = xs.indexOf(to.x) * width + ys.indexOf(to.y)
  if (start < 0 || finish < 0) return null
  // Keep the incoming axis in the search state so equal-length routes prefer fewer turns.
  const distance = nodes.flatMap(() => [Infinity, Infinity])
  const previous = nodes.flatMap(() => [-1, -1])
  const visited = nodes.flatMap(() => [false, false])
  distance[start * 2] = 0
  distance[start * 2 + 1] = 0
  for (let count = 0; count < distance.length; count++) {
    let current = -1
    for (let i = 0; i < distance.length; i++) {
      if (!visited[i] && (current < 0 || distance[i] < distance[current])) current = i
    }
    if (current < 0 || !Number.isFinite(distance[current]) || Math.floor(current / 2) === finish) break
    visited[current] = true
    const node = Math.floor(current / 2)
    const { column, row } = nodes[node]
    for (const [neighbor, axis] of [
      [column > 0 ? node - width : -1, 0], [column + 1 < xs.length ? node + width : -1, 0],
      [row > 0 ? node - 1 : -1, 1], [row + 1 < width ? node + 1 : -1, 1],
    ]) {
      if (neighbor < 0) continue
      const next = neighbor * 2 + axis
      if (neighbor === finish && !validArrival([nodes[node].point, nodes[neighbor].point], outward)) continue
      if (visited[next] || boxes.some((box) => inside(nodes[neighbor].point, box)
        || crosses(nodes[node].point, nodes[neighbor].point, box))) continue
      const a = nodes[node].point
      const b = nodes[neighbor].point
      const turnCost = node === start || current % 2 === axis ? 0 : 24
      const cost = distance[current] + Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + turnCost
      if (cost < distance[next]) { distance[next] = cost; previous[next] = current }
    }
  }
  const finishState = distance[finish * 2] <= distance[finish * 2 + 1] ? finish * 2 : finish * 2 + 1
  if (!Number.isFinite(distance[finishState])) return null
  const route: Point[] = []
  for (let i = finishState; i >= 0; i = previous[i]) route.push(nodes[Math.floor(i / 2)].point)
  return route.reverse().filter((_, index, all) => index === 0 || index === all.length - 1 ||
    (all[index - 1].x !== all[index + 1].x && all[index - 1].y !== all[index + 1].y))
}

function centeredOrthogonalRoute(from: Point, to: Point, boxes: Hitbox[], horizontalFirst: boolean,
  horizontalLast: boolean, outward?: Point | null): Point[] | null {
  const midpoint = horizontalFirst === horizontalLast
    ? horizontalFirst ? (from.x + to.x) / 2 : (from.y + to.y) / 2
    : 0
  const coordinates = horizontalFirst === horizontalLast
    ? [midpoint, horizontalFirst ? from.x : from.y, horizontalFirst ? to.x : to.y,
      ...boxes.flatMap((box) => horizontalFirst ? [box.left, box.right] : [box.top, box.bottom])]
      .sort((a, b) => Math.abs(a - midpoint) - Math.abs(b - midpoint))
    : [0]
  for (const coordinate of coordinates) {
    const corners = horizontalFirst === horizontalLast
      ? horizontalFirst
        ? [{ x: coordinate, y: from.y }, { x: coordinate, y: to.y }]
        : [{ x: from.x, y: coordinate }, { x: to.x, y: coordinate }]
      : horizontalFirst ? [{ x: to.x, y: from.y }] : [{ x: from.x, y: to.y }]
    const points = [from, ...corners, to]
    if (!validArrival(points, outward)) continue
    if (points.some((point) => point.x < 0 || point.x > BOARD_WIDTH || point.y < 0 || point.y > BOARD_HEIGHT)) continue
    if (points.slice(1).some((point, index) => boxes.some((box) => inside(point, box)
      || crosses(points[index], point, box)))) continue
    return points
  }
  return null
}

function pathThrough(points: Point[], radius: number, boxes: Hitbox[]): { path: string; handle: Point } | null {
  let path = `M ${points[0].x} ${points[0].y}`
  const drawn = [points[0]]
  for (let index = 1; index < points.length - 1; index++) {
    const before = points[index - 1]
    const corner = points[index]
    const after = points[index + 1]
    const incoming = Math.hypot(corner.x - before.x, corner.y - before.y)
    const outgoing = Math.hypot(after.x - corner.x, after.y - corner.y)
    if (incoming < 1e-6 || outgoing < 1e-6) continue
    const amount = Math.min(radius, incoming / 2, outgoing / 2)
    const enter = { x: corner.x - (corner.x - before.x) / incoming * amount,
      y: corner.y - (corner.y - before.y) / incoming * amount }
    const leave = { x: corner.x + (after.x - corner.x) / outgoing * amount,
      y: corner.y + (after.y - corner.y) / outgoing * amount }
    drawn.push(enter)
    for (let step = 1; step < 16; step++) {
      const t = step / 16
      const s = 1 - t
      const point = { x: s * s * enter.x + 2 * s * t * corner.x + t * t * leave.x,
        y: s * s * enter.y + 2 * s * t * corner.y + t * t * leave.y }
      if (boxes.some((box) => inside(point, box))) return null
      drawn.push(point)
    }
    drawn.push(leave)
    path += ` L ${enter.x} ${enter.y} Q ${corner.x} ${corner.y} ${leave.x} ${leave.y}`
  }
  const last = points[points.length - 1]
  drawn.push(last)
  return { path: `${path} L ${last.x} ${last.y}`, handle: routeMiddle(drawn) }
}

function routeMiddle(points: Point[]): Point {
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y))
  let remaining = lengths.reduce((total, length) => total + length, 0) / 2
  for (let index = 0; index < lengths.length; index++) {
    if (remaining <= lengths[index]) {
      const factor = lengths[index] ? remaining / lengths[index] : 0
      return { x: points[index].x + (points[index + 1].x - points[index].x) * factor,
        y: points[index].y + (points[index + 1].y - points[index].y) * factor }
    }
    remaining -= lengths[index]
  }
  return points[points.length - 1]
}

function routeBacktracks(points: Point[]) {
  for (let i = 1; i < points.length - 1; i++) {
    const before = points[i - 1]
    const corner = points[i]
    const after = points[i + 1]
    const incoming = { x: corner.x - before.x, y: corner.y - before.y }
    const outgoing = { x: after.x - corner.x, y: after.y - corner.y }
    const cross = incoming.x * outgoing.y - incoming.y * outgoing.x
    const dot = incoming.x * outgoing.x + incoming.y * outgoing.y
    const lengths = Math.hypot(incoming.x, incoming.y) * Math.hypot(outgoing.x, outgoing.y)
    if (lengths > 1e-6 && dot < 0 && Math.abs(cross) < lengths * .02) return true
  }
  return false
}

export function arrowGeometry(tail: Anchor, head: Anchor, bend: Point, texts: ConnectableItem[], bendEdited = false,
  bendOffset?: BendOffset, avoidObstacles = true, shape: ArrowShape = 'curved', curveBends?: [Point, Point, Point],
  pendingStraightBend?: Point, tailEnd: ArrowEnd = 'none') {
  bend = relativeBend(tail, head, bend, bendOffset, texts)
  const start = resolveArrowHead(tail, texts)
  const tip = resolveArrowHead(head, texts)
  const end = resolveArrowShaftEnd(tail, head, texts)
  const tailDirection = sideDirection(tail.side, { x: end.x - start.x, y: end.y - start.y })
  const shaftSpan = Math.hypot(end.x - start.x, end.y - start.y)
  const tailStraightLength = tailEnd === 'arrow'
    ? Math.min(44, 16 + shaftSpan * .25, shaftSpan * .45)
    : 0
  const routeStart = { x: start.x + tailDirection.x * tailStraightLength,
    y: start.y + tailDirection.y * tailStraightLength }
  if (shape === 'straight') {
    const last = curveBends?.[2] ?? pendingStraightBend ?? start
    const dx = tip.x - last.x
    const dy = tip.y - last.y
    const length = Math.hypot(dx, dy) || 1
    const straightEnd = { x: tip.x - dx / length * 16, y: tip.y - dy / length * 16 }
    const center = { x: (start.x + straightEnd.x) / 2, y: (start.y + straightEnd.y) / 2 }
    if (curveBends) return { start, tip, end: straightEnd,
      path: `M ${start.x} ${start.y} ${curveBends.map((point) => `L ${point.x} ${point.y}`).join(' ')} L ${straightEnd.x} ${straightEnd.y}`,
      handle: curveBends[1], bendHandles: curveBends }
    if (pendingStraightBend) return { start, tip, end: straightEnd,
      path: `M ${start.x} ${start.y} L ${pendingStraightBend.x} ${pendingStraightBend.y} L ${straightEnd.x} ${straightEnd.y}`,
      handle: pendingStraightBend, bendHandles: [pendingStraightBend] }
    return { start, tip, end: straightEnd,
      path: `M ${start.x} ${start.y} L ${straightEnd.x} ${straightEnd.y}`, handle: center, bendHandles: [center] }
  }
  if (shape === 'elbow') {
    const horizontalFirst = tail.side === 'left' || tail.side === 'right' ||
      (!tail.side && Math.abs(end.x - routeStart.x) >= Math.abs(end.y - routeStart.y))
    const horizontalLast = head.side === 'left' || head.side === 'right' ||
      (!head.side && horizontalFirst)
    if (avoidObstacles) {
      for (const padding of [18, 8, 1]) {
        const departure = tail.side || tailEnd === 'arrow' ? tailDirection : null
        const arrival = head.side ? sideDirection(head.side, { x: 0, y: 0 }) : null
        const departureLength = tailEnd === 'arrow' ? Math.max(tailStraightLength, padding + 4) : padding + 4
        const from = departure ? { x: start.x + departure.x * departureLength,
          y: start.y + departure.y * departureLength } : start
        const to = arrival ? { x: tip.x + arrival.x * Math.max(44, padding + 4),
          y: tip.y + arrival.y * Math.max(44, padding + 4) } : end
        const boxes = texts.map((item) => hitbox(item, padding))
        const clearLeg = (a: Point, b: Point, attachedId?: string) => !texts.some((item, index) =>
          item.id !== attachedId && crosses(a, b, boxes[index]))
        if (!clearLeg(start, from, tail.textId) || !clearLeg(to, end, head.textId)) continue
        const route = centeredOrthogonalRoute(from, to, boxes, horizontalFirst, horizontalLast, arrival)
          ?? orthogonalRoute(from, to, boxes, arrival)
        if (!route) continue
        const points = [start, ...route, end]
          .filter((point, index, all) => index === 0 || point.x !== all[index - 1].x || point.y !== all[index - 1].y)
        return { start, tip, end, path: `M ${points.map((point) => `${point.x} ${point.y}`).join(' L ')}`,
          handle: routeMiddle(points) }
      }
    }
    const arrival = head.side ? sideDirection(head.side, { x: 0, y: 0 }) : null
    const approach = arrival ? { x: tip.x + arrival.x * 44, y: tip.y + arrival.y * 44 } : end
    const middleX = (routeStart.x + approach.x) / 2
    const middleY = (routeStart.y + approach.y) / 2
    const corners = horizontalFirst === horizontalLast
      ? horizontalFirst
        ? [{ x: approach.x, y: routeStart.y }, approach]
        : [{ x: routeStart.x, y: approach.y }, approach]
      : horizontalFirst
        ? [{ x: middleX, y: routeStart.y }, { x: middleX, y: approach.y }, approach]
        : [{ x: routeStart.x, y: middleY }, { x: approach.x, y: middleY }, approach]
    const points = [start, routeStart, ...corners, end]
      .filter((point, index, all) => index === 0 || point.x !== all[index - 1].x || point.y !== all[index - 1].y)
    return { start, tip, end,
      path: `M ${points.map((point) => `${point.x} ${point.y}`).join(' L ')}`,
      handle: routeMiddle(points) }
  }
  const finalDirection = sideDirection(undefined, { x: tip.x - end.x, y: tip.y - end.y })
  const straightLength = Math.min(28, Math.hypot(end.x - start.x, end.y - start.y) * .25)
  const curveEnd = { x: end.x - finalDirection.x * straightLength,
    y: end.y - finalDirection.y * straightLength }
  const curveStart = { x: start.x + tailDirection.x * tailStraightLength,
    y: start.y + tailDirection.y * tailStraightLength }
  const { first, second, middle } = curveControls(curveStart, curveEnd, tail.side, head.side, undefined, finalDirection)
  if (bendEdited) {
    bend = { ...bend }
    const departure = (bend.x - curveStart.x) * tailDirection.x + (bend.y - curveStart.y) * tailDirection.y
    const arrival = (curveEnd.x - bend.x) * finalDirection.x + (curveEnd.y - bend.y) * finalDirection.y
    const available = (curveEnd.x - curveStart.x) * tailDirection.x + (curveEnd.y - curveStart.y) * tailDirection.y
    if (available > 16 && departure < 8) {
      bend.x += tailDirection.x * (8 - departure)
      bend.y += tailDirection.y * (8 - departure)
    }
    if (available > 16 && arrival < 8) {
      bend.x -= finalDirection.x * (8 - arrival)
      bend.y -= finalDirection.y * (8 - arrival)
    }
    for (const item of texts) {
      const box = hitbox(item, 10)
      if (!inside(bend, box)) continue
      const candidates = [
        { x: box.left - 1, y: bend.y }, { x: box.right + 1, y: bend.y },
        { x: bend.x, y: box.top - 1 }, { x: bend.x, y: box.bottom + 1 },
      ]
      bend = candidates.reduce((best, point) =>
        Math.hypot(point.x - bend.x, point.y - bend.y) < Math.hypot(best.x - bend.x, best.y - bend.y) ? point : best)
    }
  }
  const tailPath = tailStraightLength
    ? `M ${start.x} ${start.y} L ${curveStart.x} ${curveStart.y}`
    : `M ${start.x} ${start.y}`
  let naturalPath = `${tailPath} C ${first.x} ${first.y} ${second.x} ${second.y} ${curveEnd.x} ${curveEnd.y} L ${end.x} ${end.y}`
  let handle = middle
  const segments: [Point, Point, Point, Point][] = [[curveStart, first, second, curveEnd]]
  if (bendEdited) {
    const direction = sideDirection(undefined, { x: curveEnd.x - curveStart.x, y: curveEnd.y - curveStart.y })
    const firstReach = Math.hypot(bend.x - curveStart.x, bend.y - curveStart.y) / 3
    const lastReach = Math.hypot(curveEnd.x - bend.x, curveEnd.y - bend.y) / 3
    const a = { x: curveStart.x + tailDirection.x * firstReach, y: curveStart.y + tailDirection.y * firstReach }
    const b = { x: bend.x - direction.x * firstReach, y: bend.y - direction.y * firstReach }
    const c = { x: bend.x + direction.x * lastReach, y: bend.y + direction.y * lastReach }
    const d = { x: curveEnd.x - finalDirection.x * lastReach, y: curveEnd.y - finalDirection.y * lastReach }
    naturalPath = `${tailPath} C ${a.x} ${a.y} ${b.x} ${b.y} ${bend.x} ${bend.y} C ${c.x} ${c.y} ${d.x} ${d.y} ${curveEnd.x} ${curveEnd.y} L ${end.x} ${end.y}`
    segments.splice(0, 1, [curveStart, a, b, bend], [bend, c, d, curveEnd])
    handle = bend
  }
  if (!avoidObstacles) return { start, tip, end, path: naturalPath, handle }
  const boxes = texts.map((item) => hitbox(item))
  if (!boxes.some((box) => crosses(curveEnd, end, box))
    && !segments.some(([a, b, c, d]) => cubicCrossesHitboxes(a, b, c, d, boxes))) {
    return { start, tip, end, path: naturalPath, handle }
  }
  const clearance = 18
  const escape = tail.side || tailEnd === 'arrow' ? tailDirection : null
  const approach = head.side ? sideDirection(head.side, { x: 0, y: 0 }) : null
  const escapeLength = tailEnd === 'arrow' ? tailStraightLength + clearance + 2 : clearance + 2
  const from = escape ? { x: start.x + escape.x * escapeLength,
    y: start.y + escape.y * escapeLength } : start
  for (const keepBend of bendEdited ? [true, false] : [false]) {
    for (const padding of [clearance, 8, 1]) {
      const obstacles = texts.map((item) => hitbox(item, padding))
      const via = keepBend && !obstacles.some((box) => inside(bend, box)) ? bend : null
      if (keepBend && !via) continue
      for (const distance of [76, 52, 44, clearance + 2]) {
        const to = approach ? { x: tip.x + approach.x * distance, y: tip.y + approach.y * distance }
          : { x: end.x - finalDirection.x * distance, y: end.y - finalDirection.y * distance }
        if (to.x < 0 || to.x > BOARD_WIDTH || to.y < 0 || to.y > BOARD_HEIGHT
          || obstacles.some((box) => inside(to, box))
          || boxes.some((box) => crosses(start, from, box) || crosses(to, end, box))) continue
        const firstLeg = visibleRoute(from, via ?? to, obstacles, via ? null : approach)
        const secondLeg = via ? visibleRoute(via, to, obstacles, approach) : null
        if (!firstLeg || (via && !secondLeg)) continue
        const points = [start, ...firstLeg, ...(secondLeg?.slice(1) ?? []), end]
          .filter((point, index, all) => index === 0 || Math.hypot(point.x - all[index - 1].x, point.y - all[index - 1].y) > 1e-6)
        if (routeBacktracks(points)) continue
        for (const radius of [38, 28, 18, 8, 2]) {
          const route = pathThrough(points, radius, boxes)
          if (route) return { start, tip, end, ...route }
        }
      }
    }
  }
  if (bendEdited) return arrowGeometry(tail, head, initialBend(start, end, tail.side, head.side),
    texts, false, undefined, true, shape, undefined, undefined, tailEnd)
  return { start, tip, end, path: naturalPath, handle }
}

type Props = {
  arrows: Arrow[]
  texts: ConnectableItem[]
  geometries: Map<string, ReturnType<typeof arrowGeometry>>
  view: { x: number; y: number; scale: number }
  selectedId: string | null
  preview: { tail: Anchor; head: Anchor } | null
  layers: Map<string, number>
  multiSelectedIds: string[]
  onSelect: (id: string, additive?: boolean) => void
  onDrag: (drag: ArrowDrag) => void
}

export default function ArrowLayer({ arrows, texts, geometries, view, selectedId, multiSelectedIds, preview, layers, onSelect, onDrag }: Props) {
  const selectedGeometry = selectedId ? geometries.get(selectedId) : null
  const selectedBendHandles = selectedGeometry && 'bendHandles' in selectedGeometry ? selectedGeometry.bendHandles : null
  const topLayer = Math.max(0, ...layers.values()) + 1
  const handle = (point: Point, kind: 'tail' | 'head' | 'bend', bendIndex?: number) => <button key={`${kind}-${bendIndex ?? ''}`} type="button"
    className={kind === 'bend' ? 'text-box__midpoint board-arrow-handle--bend' : 'text-box__handle'}
    aria-label={kind === 'tail' ? 'Перетащить начало стрелки' : kind === 'head' ? 'Перетащить конец стрелки' : 'Изогнуть стрелку'}
    style={{ left: point.x - 10, top: point.y - 10, pointerEvents: 'auto', touchAction: 'none', cursor: 'grab',
      transform: `scale(${1 / view.scale})`, transformOrigin: 'center',
      '--handle-screen-size': `${Math.max(6, Math.min(18, 6 * view.scale))}px` } as React.CSSProperties}
    onPointerDown={(event) => {
      event.preventDefault(); event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      onDrag({ kind, arrowId: selectedId!, bendIndex, startClient: { x: event.clientX, y: event.clientY }, pointerId: event.pointerId })
    }}><HandleDot kind={kind === 'bend' ? 'connector' : 'resize'} /></button>
  const draw = (id: string, tail: Anchor, head: Anchor, color: string, interactive: boolean,
    dash: ArrowDash, shape: ArrowShape, tailEnd: ArrowEnd, headEnd: ArrowEnd,
    geometry: ReturnType<typeof arrowGeometry>, markerScope: string, groupSelected = false) => {
    const { start, tip, end, path } = geometry
    const dashPattern = dash === 'long' ? '14 9' : dash === 'short' ? '3 6' : undefined
    const freeMarker = shape === 'straight' || 'bendHandles' in geometry
    const tailDirection = tail.side
      ? sideDirection(tail.side, { x: end.x - start.x, y: end.y - start.y })
      : sideDirection(undefined, { x: end.x - start.x, y: end.y - start.y })
    const tailShaft = { x: start.x + tailDirection.x * 16, y: start.y + tailDirection.y * 16 }
    return <g key={id}>
      {groupSelected && <path d={`${path} L ${tip.x} ${tip.y}`} fill="none" stroke="#0057ff"
        strokeWidth={7 / view.scale} strokeLinecap="round" opacity={.32} pointerEvents="none" />}
      <path d={path} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round"
        strokeDasharray={dashPattern} pointerEvents="none" />
      {headEnd === 'none'
        ? <path d={`M ${end.x} ${end.y} L ${tip.x} ${tip.y}`} fill="none" stroke={color} strokeWidth={3}
          strokeLinecap="round" strokeDasharray={dashPattern} pointerEvents="none" />
        : <path d={`M ${end.x} ${end.y} L ${tip.x} ${tip.y}`} fill="none" stroke="transparent" strokeWidth={3}
          markerEnd={`url(#board-arrowhead-${markerScope}-${color.slice(1)}-${freeMarker ? 'free' : head.side ?? 'free'})`} pointerEvents="none" />}
      {tailEnd === 'arrow' && <path d={`M ${tailShaft.x} ${tailShaft.y} L ${start.x} ${start.y}`}
        fill="none" stroke="transparent" strokeWidth={3}
        markerEnd={`url(#board-arrowhead-${markerScope}-${color.slice(1)}-${freeMarker ? 'free' : tail.side ?? 'free'})`} pointerEvents="none" />}
      {interactive && <path d={`${path} L ${tip.x} ${tip.y}`} fill="none" stroke="transparent" strokeWidth={16 / view.scale}
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }} onPointerDown={(event) => {
          if (event.button === 0) { event.stopPropagation(); onSelect(id, event.ctrlKey || event.metaKey) }
        }} />}
    </g>
  }
  const markerDefs = (scope: string, color: string) => <defs>
    <mask id={`board-arrow-image-mask-${scope}`} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512" style={{ maskType: 'alpha' }}>
      <image href={arrowHeadImage} width="512" height="512" />
    </mask>
    {(['free', 'top', 'right', 'bottom', 'left'] as const).map((side) => <marker key={side}
      id={`board-arrowhead-${scope}-${color.slice(1)}-${side}`} markerWidth="7" markerHeight="7" viewBox="0 0 512 512" refX="479" refY="256"
      orient={side === 'free' ? 'auto' : side === 'top' ? '90' : side === 'right' ? '180' : side === 'bottom' ? '270' : '0'} markerUnits="strokeWidth">
      <rect width="512" height="512" fill={color} mask={`url(#board-arrow-image-mask-${scope})`} />
    </marker>)}
  </defs>
  return <>
  {arrows.map((arrow, index) => {
    const scope = `arrow-${index}`
    return <svg key={arrow.id} className="board-arrows" data-board-object-kind="arrow" data-board-object-id={arrow.id}
      style={{ zIndex: layers.get(arrow.id) ?? 1 }}
      width={BOARD_WIDTH} height={BOARD_HEIGHT} viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}>
      {markerDefs(scope, arrow.color)}
      {draw(arrow.id, arrow.tail, arrow.head, arrow.color, true,
        arrow.dash ?? 'solid', arrow.shape ?? 'curved', arrow.tailEnd ?? 'none', arrow.headEnd ?? 'arrow', geometries.get(arrow.id)!, scope,
        multiSelectedIds.includes(arrow.id))}
    </svg>
  })}
  {preview && <svg className="board-arrows" style={{ zIndex: topLayer }}
    width={BOARD_WIDTH} height={BOARD_HEIGHT} viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}>
    {markerDefs('preview', '#272727')}
    {draw('preview', preview.tail, preview.head, '#272727', false, 'solid', 'curved', 'none', 'arrow',
      arrowGeometry(preview.tail, preview.head,
        initialBend(resolveArrowHead(preview.tail, texts), resolveArrowShaftEnd(preview.tail, preview.head, texts), preview.tail.side, preview.head.side),
        texts, false, undefined, true), 'preview')}
  </svg>}
  {selectedGeometry && <div className="board-arrow-handles" style={{ width: BOARD_WIDTH, height: BOARD_HEIGHT,
    zIndex: topLayer + 1 }}>
    {handle(selectedGeometry.start, 'tail')}
    {handle(selectedGeometry.tip, 'head')}
    {arrows.find((arrow) => arrow.id === selectedId)?.shape === 'straight'
      ? selectedBendHandles?.map((point, index) => handle(point, 'bend', selectedBendHandles.length === 1 ? 1 : index))
      : arrows.find((arrow) => arrow.id === selectedId)?.shape !== 'elbow'
        ? handle(selectedGeometry.handle, 'bend', 1)
        : null}
  </div>}</>
}
