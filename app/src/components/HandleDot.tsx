type Props = { kind: 'resize' | 'connector'; snap?: boolean }

export default function HandleDot({ kind, snap = false }: Props) {
  const fill = kind === 'resize' || snap ? '#fff' : '#0057ff'
  const stroke = kind === 'resize' ? '#8893a4' : snap ? '#0057ff' : '#fff'
  return <svg className="board-handle-dot" viewBox="0 0 6 6" aria-hidden="true" focusable="false">
    <circle cx="3" cy="3" r="2.5" fill={fill} stroke={stroke} strokeWidth="1" />
  </svg>
}
