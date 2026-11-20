import { memo, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { BOARD_HEIGHT, BOARD_WIDTH } from '../../gridHierarchy'
import HandleDot from '../HandleDot'
import dotsIcon from '../../../../assets/dots.png'
import plusIcon from '../../../../assets/plus.png'
import './BoardTable.css'

export const TABLE_CELL_WIDTH = 120
export const TABLE_CELL_HEIGHT = 56
export const MIN_TABLE_CELL_WIDTH = 40
export const MIN_TABLE_CELL_HEIGHT = 28
export type TableCellData = {
  text: string
  fill: string
  align: 'left' | 'center' | 'right'
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikeThrough?: boolean
  rowSpan?: number
  colSpan?: number
  mergedInto?: string
}
export const createTableCell = (): TableCellData => ({ text: '', fill: '#FFFFFF', align: 'left' })

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
type Side = 'top' | 'right' | 'bottom' | 'left'
type Gesture = { pointerId: number; clientX: number; clientY: number; start: TableItem;
  mode: 'move' | 'resize' | 'row' | 'column'; corner?: Corner; side?: Side; index?: number }
const CORNERS: Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const SIDES: Side[] = ['top', 'right', 'bottom', 'left']

export type TableItem = {
  id: string
  x: number
  y: number
  cells: TableCellData[][]
  cellWidth: number
  columnWidths?: number[]
  cellHeight: number
  rowHeights: number[]
  rowMinHeights?: number[]
  fontSize: number
}

export const tableHeight = (item: TableItem) => item.rowHeights.reduce((total, height) => total + height, 0)
export const tableColumnWidths = (item: TableItem) => item.columnWidths
  ?? Array(item.cells[0]?.length ?? 0).fill(item.cellWidth)
export const tableWidth = (item: TableItem) => tableColumnWidths(item).reduce((total, width) => total + width, 0)

type Props = {
  item: TableItem
  selected: boolean
  groupSelected: boolean
  selectedCells: string[]
  interactive: boolean
  scale: number
  layer: number
  onSelect: (id: string) => void
  onCellSelect: (id: string, row: number, column: number, additive: boolean, range: boolean) => void
  onRowSelect: (id: string, row: number) => void
  onColumnSelect: (id: string, column: number) => void
  onChange: (id: string, changes: Partial<TableItem>) => void
  onRowHeight: (id: string, row: number, height: number) => void
}

type CellActions = {
  select: (row: number, column: number, event: ReactPointerEvent<HTMLTextAreaElement>) => void
  edit: (row: number, column: number) => void
  focus: (row: number, column: number) => void
  blur: (row: number, column: number) => void
  change: (row: number, column: number, value: string) => void
  measure: (row: number, column: number, rowSpan: number, height: number) => void
}

const TableCell = memo(function TableCell({ value, width, height, row, column, rowSpan, colSpan, fontSize, label, editing, selected, actions }: {
  value: TableCellData; width: number; height: number; row: number; column: number; rowSpan: number; colSpan: number
  fontSize: number; label: string; editing: boolean; selected: boolean
  actions: CellActions
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])
  useLayoutEffect(() => {
    const editor = ref.current
    if (!editor) return
    editor.style.height = '0px'
    const contentHeight = editor.scrollHeight + 1
    editor.style.height = `${height}px`
    actions.measure(row, column, rowSpan, Math.ceil(contentHeight))
  }, [value.text, value.bold, value.italic, width, fontSize, row, column, rowSpan, actions])

  return <textarea ref={ref} className={`board-table__cell${selected ? ' board-table__cell--selected' : ''}`}
    aria-label={label} aria-selected={selected}
    style={{ width, height, gridRow: `${row + 1} / span ${rowSpan}`, gridColumn: `${column + 1} / span ${colSpan}`,
      fontSize, backgroundColor: value.fill, textAlign: value.align,
      fontWeight: value.bold ? 700 : undefined, fontStyle: value.italic ? 'italic' : undefined,
      textDecoration: [value.underline && 'underline', value.strikeThrough && 'line-through'].filter(Boolean).join(' ') || undefined }}
    value={value.text} readOnly={!editing} spellCheck={false}
    onPointerDown={(event) => actions.select(row, column, event)}
    onDoubleClick={() => actions.edit(row, column)}
    onFocus={() => actions.focus(row, column)}
    onBlur={() => actions.blur(row, column)}
    onChange={(event) => actions.change(row, column, event.target.value)} />
})

export default function BoardTable({ item, selected, groupSelected, selectedCells, interactive, scale, layer,
  onSelect, onCellSelect, onRowSelect, onColumnSelect, onChange, onRowHeight }: Props) {
  const gesture = useRef<Gesture | null>(null)
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const measuredHeights = useRef(new Map<number, Map<number, number>>())
  const cellContextRef = useRef({ item, interactive, editingCell, onCellSelect, onChange, onRowHeight })
  cellContextRef.current = { item, interactive, editingCell, onCellSelect, onChange, onRowHeight }
  const cellActionsRef = useRef<CellActions | null>(null)
  if (!cellActionsRef.current) cellActionsRef.current = {
    select: (row, column, event) => {
      const { item, interactive, editingCell, onCellSelect } = cellContextRef.current
      if (!interactive) return
      event.stopPropagation()
      if (editingCell !== `${row}:${column}` || event.ctrlKey || event.metaKey || event.shiftKey) {
        event.preventDefault()
        if (document.activeElement instanceof HTMLTextAreaElement
          && document.activeElement.classList.contains('board-table__cell')) document.activeElement.blur()
        setEditingCell(null)
      }
      onCellSelect(item.id, row, column, event.ctrlKey || event.metaKey, event.shiftKey)
    },
    edit: (row, column) => {
      if (cellContextRef.current.interactive) setEditingCell(`${row}:${column}`)
    },
    focus: (row, column) => {
      const { item, interactive, editingCell, onCellSelect } = cellContextRef.current
      if (interactive && editingCell === `${row}:${column}`) onCellSelect(item.id, row, column, false, false)
    },
    blur: (row, column) => setEditingCell((current) => current === `${row}:${column}` ? null : current),
    change: (row, column, text) => {
      const { item, onChange } = cellContextRef.current
      const value = item.cells[row]?.[column]
      if (!value) return
      const cells = item.cells.map((currentRow) => [...currentRow])
      cells[row][column] = { ...value, text }
      onChange(item.id, { cells })
    },
    measure: (row, column, rowSpan, measured) => {
      const { item, onRowHeight } = cellContextRef.current
      const otherRows = item.rowHeights.slice(row + 1, row + rowSpan)
        .reduce((sum, current) => sum + current, 0)
      const contentHeight = Math.max(MIN_TABLE_CELL_HEIGHT, measured - otherRows)
      const measuredRow = measuredHeights.current.get(row) ?? new Map<number, number>()
      measuredRow.set(column, contentHeight)
      measuredHeights.current.set(row, measuredRow)
      const visibleHeights = [...measuredRow].filter(([index]) => !item.cells[row][index]?.mergedInto)
        .map(([, value]) => value)
      onRowHeight(item.id, row, Math.max(item.rowMinHeights?.[row] ?? item.cellHeight, ...visibleHeights))
    },
  }
  const cellActions = cellActionsRef.current
  const rows = item.cells.length
  const columns = item.cells[0]?.length ?? 0
  const columnWidths = tableColumnWidths(item)
  const width = tableWidth(item)
  const height = tableHeight(item)

  useLayoutEffect(() => {
    if (editingCell && (!selected || !interactive || !selectedCells.includes(editingCell))) setEditingCell(null)
  }, [editingCell, interactive, selected, selectedCells])

  const startGesture = (event: ReactPointerEvent<HTMLButtonElement>, mode: Gesture['mode'], corner?: Corner,
    side?: Side, index?: number) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    onSelect(item.id)
    gesture.current = { mode, corner, side, index, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
      start: { ...item } }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const continueGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    const start = current.start
    const startColumns = tableColumnWidths(start)
    const startWidth = tableWidth(start)
    const startHeight = tableHeight(start)
    const dx = (event.clientX - current.clientX) / scale
    const dy = (event.clientY - current.clientY) / scale
    if (current.mode === 'column') {
      const index = current.index!
      const next = Math.max(MIN_TABLE_CELL_WIDTH,
        Math.min(BOARD_WIDTH - start.x - startWidth + startColumns[index], startColumns[index] + dx))
      onChange(item.id, { columnWidths: startColumns.map((value, column) => column === index ? next : value) })
      return
    }
    if (current.mode === 'row') {
      const index = current.index!
      const next = Math.max(MIN_TABLE_CELL_HEIGHT,
        Math.min(BOARD_HEIGHT - start.y - startHeight + start.rowHeights[index], start.rowHeights[index] + dy))
      onChange(item.id, { rowHeights: start.rowHeights.map((value, row) => row === index ? next : value),
        rowMinHeights: (start.rowMinHeights ?? Array(rows).fill(start.cellHeight))
          .map((value, row) => row === index ? next : value) })
      return
    }
    if (current.mode === 'move') {
      onChange(item.id, {
        x: Math.max(0, Math.min(BOARD_WIDTH - startWidth, start.x + dx)),
        y: Math.max(0, Math.min(BOARD_HEIGHT - startHeight, start.y + dy)),
      })
      return
    }
    const minWidth = startWidth * Math.max(...startColumns.map((value) => MIN_TABLE_CELL_WIDTH / value))
    const minHeight = startHeight * Math.max(...start.rowHeights.map((value) => MIN_TABLE_CELL_HEIGHT / value))
    const side = current.side
    if (side === 'left') {
      const x = Math.max(0, Math.min(start.x + startWidth - minWidth, start.x + dx))
      const factor = (start.x + startWidth - x) / startWidth
      onChange(item.id, { x, cellWidth: start.cellWidth * factor,
        columnWidths: startColumns.map((value) => value * factor) })
    } else if (side === 'right') {
      const nextWidth = Math.max(minWidth, Math.min(BOARD_WIDTH - start.x, startWidth + dx))
      const factor = nextWidth / startWidth
      onChange(item.id, { cellWidth: start.cellWidth * factor,
        columnWidths: startColumns.map((value) => value * factor) })
    } else if (side === 'top') {
      const y = Math.max(0, Math.min(start.y + startHeight - minHeight, start.y + dy))
      const factor = (start.y + startHeight - y) / startHeight
      onChange(item.id, { y, cellHeight: start.cellHeight * factor,
        rowHeights: start.rowHeights.map((rowHeight) => rowHeight * factor),
        rowMinHeights: (start.rowMinHeights ?? Array(rows).fill(start.cellHeight)).map((value) => value * factor) })
    } else if (side === 'bottom') {
      const nextHeight = Math.max(minHeight, Math.min(BOARD_HEIGHT - start.y, startHeight + dy))
      const factor = nextHeight / startHeight
      onChange(item.id, { cellHeight: start.cellHeight * factor,
        rowHeights: start.rowHeights.map((rowHeight) => rowHeight * factor),
        rowMinHeights: (start.rowMinHeights ?? Array(rows).fill(start.cellHeight)).map((value) => value * factor) })
    } else {
      const corner = current.corner!
      const fromLeft = corner.endsWith('left')
      const fromTop = corner.startsWith('top')
      const anchorX = fromLeft ? start.x + startWidth : start.x
      const anchorY = fromTop ? start.y + startHeight : start.y
      const factor = 1 + (dx * (fromLeft ? -1 : 1) * startWidth
        + dy * (fromTop ? -1 : 1) * startHeight) / (startWidth ** 2 + startHeight ** 2)
      const minFactor = Math.max(minWidth / startWidth, minHeight / startHeight)
      const maxFactor = Math.min(fromLeft ? anchorX / startWidth : (BOARD_WIDTH - anchorX) / startWidth,
        fromTop ? anchorY / startHeight : (BOARD_HEIGHT - anchorY) / startHeight)
      const bounded = Math.max(minFactor, Math.min(maxFactor, factor))
      const nextWidth = startWidth * bounded
      const nextHeight = startHeight * bounded
      onChange(item.id, { x: fromLeft ? anchorX - nextWidth : anchorX,
        y: fromTop ? anchorY - nextHeight : anchorY,
        cellWidth: start.cellWidth * bounded, columnWidths: startColumns.map((value) => value * bounded),
        cellHeight: start.cellHeight * bounded,
        rowHeights: start.rowHeights.map((rowHeight) => rowHeight * bounded),
        rowMinHeights: (start.rowMinHeights ?? Array(rows).fill(start.cellHeight)).map((value) => value * bounded) })
    }
  }

  const finishGesture = () => { gesture.current = null }

  return <div className={`board-table${selected ? ' board-table--selected' : ''}`}
    data-board-object-kind="table" data-board-object-id={item.id}
    style={{ left: item.x, top: item.y, width, height, zIndex: layer, pointerEvents: interactive ? 'auto' : 'none',
      '--table-control-scale': 1 / scale, '--handle-inverse-scale': 1 / scale,
      '--handle-screen-size': `${Math.max(6, Math.min(18, 6 * scale))}px` } as CSSProperties}
    onPointerDown={(event) => { if (interactive) { event.stopPropagation(); onSelect(item.id) } }}>
    <div className="board-table__grid"
      style={{ gridTemplateColumns: columnWidths.map((columnWidth) => `${columnWidth}px`).join(' '),
        gridTemplateRows: item.rowHeights.map((rowHeight) => `${rowHeight}px`).join(' ') }}>
      {item.cells.map((row, rowIndex) => row.map((value, columnIndex) => value.mergedInto ? null :
        <TableCell key={`${rowIndex}-${columnIndex}`}
          width={columnWidths.slice(columnIndex, columnIndex + (value.colSpan ?? 1)).reduce((sum, current) => sum + current, 0)}
          height={item.rowHeights.slice(rowIndex, rowIndex + (value.rowSpan ?? 1)).reduce((sum, current) => sum + current, 0)}
          row={rowIndex} column={columnIndex} rowSpan={value.rowSpan ?? 1} colSpan={value.colSpan ?? 1}
          fontSize={item.fontSize} actions={cellActions}
          label={`Строка ${rowIndex + 1}, столбец ${columnIndex + 1}`}
          value={value} editing={interactive && editingCell === `${rowIndex}:${columnIndex}`}
          selected={selectedCells.some((key) => {
            const [selectedRow, selectedColumn] = key.split(':').map(Number)
            return selectedRow >= rowIndex && selectedRow < rowIndex + (value.rowSpan ?? 1)
              && selectedColumn >= columnIndex && selectedColumn < columnIndex + (value.colSpan ?? 1)
          })} />))}
    </div>
    {interactive && <>
      {item.rowHeights.map((rowHeight, rowIndex) => <button key={`row-${rowIndex}`} type="button"
        className="board-table__edge-select board-table__edge-select--row"
        style={{ top: item.rowHeights.slice(0, rowIndex).reduce((sum, current) => sum + current, 0), height: rowHeight }}
        aria-label={`Выделить строку ${rowIndex + 1}`} title={`Выделить строку ${rowIndex + 1}`}
        onPointerDown={(event) => { event.stopPropagation(); if (event.button === 0) event.preventDefault() }}
        onClick={(event) => { event.stopPropagation(); onRowSelect(item.id, rowIndex) }} />)}
      {Array.from({ length: columns }, (_, columnIndex) => <button key={`column-${columnIndex}`} type="button"
        className="board-table__edge-select board-table__edge-select--column"
        style={{ left: columnWidths.slice(0, columnIndex).reduce((sum, current) => sum + current, 0),
          width: columnWidths[columnIndex] }}
        aria-label={`Выделить столбец ${columnIndex + 1}`} title={`Выделить столбец ${columnIndex + 1}`}
        onPointerDown={(event) => { event.stopPropagation(); if (event.button === 0) event.preventDefault() }}
        onClick={(event) => { event.stopPropagation(); onColumnSelect(item.id, columnIndex) }} />)}
      {columnWidths.flatMap((_, columnIndex) => item.rowHeights.map((rowHeight, rowIndex) => {
        const leftKey = item.cells[rowIndex][columnIndex].mergedInto ?? `${rowIndex}:${columnIndex}`
        const rightKey = columnIndex + 1 < columns
          ? item.cells[rowIndex][columnIndex + 1].mergedInto ?? `${rowIndex}:${columnIndex + 1}` : null
        if (leftKey === rightKey) return null
        return <button key={`column-boundary-${rowIndex}-${columnIndex}`} type="button"
          className="board-table__boundary board-table__boundary--column"
          style={{ left: columnWidths.slice(0, columnIndex + 1).reduce((sum, current) => sum + current, 0),
            top: item.rowHeights.slice(0, rowIndex).reduce((sum, current) => sum + current, 0), height: rowHeight }}
          aria-label={`Изменить ширину столбца ${columnIndex + 1}`}
          onPointerDown={(event) => startGesture(event, 'column', undefined, undefined, columnIndex)}
          onPointerMove={continueGesture} onPointerUp={finishGesture} onPointerCancel={finishGesture} />
      }))}
      {item.rowHeights.flatMap((_, rowIndex) => columnWidths.map((columnWidth, columnIndex) => {
        const topKey = item.cells[rowIndex][columnIndex].mergedInto ?? `${rowIndex}:${columnIndex}`
        const bottomKey = rowIndex + 1 < rows
          ? item.cells[rowIndex + 1][columnIndex].mergedInto ?? `${rowIndex + 1}:${columnIndex}` : null
        if (topKey === bottomKey) return null
        return <button key={`row-boundary-${rowIndex}-${columnIndex}`} type="button"
          className="board-table__boundary board-table__boundary--row"
          style={{ top: item.rowHeights.slice(0, rowIndex + 1).reduce((sum, current) => sum + current, 0),
            left: columnWidths.slice(0, columnIndex).reduce((sum, current) => sum + current, 0), width: columnWidth }}
          aria-label={`Изменить высоту строки ${rowIndex + 1}`}
          onPointerDown={(event) => startGesture(event, 'row', undefined, undefined, rowIndex)}
          onPointerMove={continueGesture} onPointerUp={finishGesture} onPointerCancel={finishGesture} />
      }))}
    </>}
    {interactive && selected && !groupSelected && <>
      <button type="button" className="board-table__move" aria-label="Переместить таблицу"
        title="Переместить таблицу"
        onPointerDown={(event) => startGesture(event, 'move')} onPointerMove={continueGesture}
        onPointerUp={finishGesture} onPointerCancel={finishGesture}
        onClick={(event) => { event.stopPropagation(); onSelect(item.id) }}>
        <img src={dotsIcon} alt="" aria-hidden="true" />
      </button>
      <button type="button" className="board-table__add board-table__add--row" aria-label="Добавить строку"
        title="Добавить строку" disabled={height + item.cellHeight > BOARD_HEIGHT} onClick={(event) => {
          event.stopPropagation()
          onChange(item.id, { y: Math.min(item.y, BOARD_HEIGHT - height - item.cellHeight),
            rowHeights: [...item.rowHeights, item.cellHeight],
            rowMinHeights: [...(item.rowMinHeights ?? Array(rows).fill(item.cellHeight)), item.cellHeight],
            cells: [...item.cells, Array.from({ length: columns }, createTableCell)] })
        }}><img src={plusIcon} alt="" aria-hidden="true" /></button>
      <button type="button" className="board-table__add board-table__add--column" aria-label="Добавить столбец"
        title="Добавить столбец" disabled={width + item.cellWidth > BOARD_WIDTH} onClick={(event) => {
          event.stopPropagation()
          onChange(item.id, { x: Math.min(item.x, BOARD_WIDTH - width - item.cellWidth),
            columnWidths: [...columnWidths, item.cellWidth],
            cells: item.cells.map((row) => [...row, createTableCell()]) })
        }}><img src={plusIcon} alt="" aria-hidden="true" /></button>
      {SIDES.map((side) => <button key={side} type="button"
        className={`board-table__resize board-table__resize--${side}`}
        aria-label={`Изменить размер таблицы: ${side} сторона`}
        onPointerDown={(event) => startGesture(event, 'resize', undefined, side)}
        onPointerMove={continueGesture} onPointerUp={finishGesture} onPointerCancel={finishGesture}>
        <HandleDot kind="resize" />
      </button>)}
      {CORNERS.map((corner) => <button key={corner} type="button"
        className={`board-table__resize board-table__resize--${corner}`}
        aria-label={`Масштабировать таблицу: ${corner} угол`}
        onPointerDown={(event) => startGesture(event, 'resize', corner)}
        onPointerMove={continueGesture} onPointerUp={finishGesture} onPointerCancel={finishGesture}>
        <HandleDot kind="resize" />
      </button>)}
    </>}
  </div>
}
