import { useEffect, useRef, useState, type MouseEvent } from 'react'
import BoardCanvas from './BoardCanvas'
import { loadBoard } from './boardStorage'
import { renderBoardPreview } from './boardPreview'
import { loadFolderState, saveFolderState } from './folderStorage'
import TemplateControl from './components/TemplateControl/TemplateControl'
import { TEXT_COLORS } from './components/TextToolbar/TextToolbar'
import menuIcon from '../../assets/dots_hor.svg'
import './HomeScreen.css'

const boards = [
  { id: 'id1', name: 'Шаблон', createdAt: '24-11-2026' },
  { id: 'id2', name: 'Шаблон 2', createdAt: '24-11-2026' },
] as const
type BoardId = typeof boards[number]['id']
const boardPath = (id: BoardId) => `/doska/${id}`
const DASHBOARD_PAGE_COUNT = 10
const CARDS_PER_PAGE = 15
const FOLDER_COLORS = ['Тёмный', 'Красный', 'Оранжевый', 'Жёлтый', 'Зелёный', 'Синий', 'Фиолетовый', 'Розовый']
  .flatMap((name) => TEXT_COLORS.filter((color) => color.name === name))

function paginationItems(current: number, total: number): Array<number | 'ellipsis'> {
  const visible = new Set([1, total, current - 1, current, current + 1])
  if (current <= 2) visible.add(3)
  if (current >= total - 1) visible.add(total - 2)
  const pages = [...visible].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b)
  const items: Array<number | 'ellipsis'> = []
  pages.forEach((page, index) => {
    if (index > 0) {
      const gap = page - pages[index - 1]
      if (gap === 2) items.push(page - 1)
      else if (gap > 2) items.push('ellipsis')
    }
    items.push(page)
  })
  return items
}

function currentPage() {
  return boards.find((board) => window.location.pathname === boardPath(board.id))?.id ?? 'home'
}

export default function App() {
  const [page, setPage] = useState(currentPage)
  const [dashboardPage, setDashboardPage] = useState(1)
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [openBoardMenuId, setOpenBoardMenuId] = useState<BoardId | null>(null)
  const [foldersActive, setFoldersActive] = useState(false)
  const [folderState, setFolderState] = useState(loadFolderState)
  const [folderDraft, setFolderDraft] = useState<{ name: string; color: string } | null>(null)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [showBoardFolderOptions, setShowBoardFolderOptions] = useState(false)
  const saveBoardRef = useRef<(() => Promise<string>) | null>(null)
  const boardMenuRef = useRef<HTMLDivElement>(null)
  const folderNameRef = useRef<HTMLInputElement>(null)
  const isCreatingFolder = folderDraft !== null

  useEffect(() => saveFolderState(folderState), [folderState])
  useEffect(() => { if (isCreatingFolder) folderNameRef.current?.select() }, [isCreatingFolder])

  useEffect(() => {
    if (!openBoardMenuId) return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !boardMenuRef.current?.contains(event.target)) {
        setOpenBoardMenuId(null)
        setShowBoardFolderOptions(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpenBoardMenuId(null); setShowBoardFolderOptions(false) }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [openBoardMenuId])

  useEffect(() => {
    let cancelled = false
    Promise.all(boards.map(async (board) => {
      try {
        const saved = await loadBoard(board.id)
        return [board.id, saved ? renderBoardPreview(saved) : ''] as const
      }
      catch { return [board.id, ''] as const }
    })).then((entries) => { if (!cancelled) setPreviews(Object.fromEntries(entries)) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const onPopState = () => setPage(currentPage())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const openBoard = (event: MouseEvent<HTMLAnchorElement>, id: BoardId) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    setOpenBoardMenuId(null)
    window.history.pushState(null, '', boardPath(id))
    setPage(id)
  }

  const returnToDashboard = async () => {
    try {
      const preview = await saveBoardRef.current?.()
      if (preview !== undefined) setPreviews((current) => ({ ...current, [page]: preview }))
    } catch (error) { console.error('Не удалось сохранить доску', error) }
    window.history.pushState(null, '', '/')
    setPage('home')
  }

  const changeDashboardPage = (nextPage: number) => {
    if (nextPage < 1 || nextPage > DASHBOARD_PAGE_COUNT) return
    setOpenBoardMenuId(null)
    setDashboardPage(nextPage)
    window.requestAnimationFrame(() => window.scrollTo(0, 0))
  }

  const startFolder = () => {
    setFoldersActive(true)
    if (folderDraft) { folderNameRef.current?.focus(); return }
    setFolderDraft({ name: 'Без названия', color: '#0057FF' })
  }

  const createFolder = () => {
    if (!folderDraft) return
    const folder = { id: crypto.randomUUID(), name: folderDraft.name.trim() || 'Без названия', color: folderDraft.color }
    setFolderState((current) => ({ ...current, folders: [folder, ...current.folders] }))
    setFolderDraft(null)
  }

  const toggleBoardFolder = (boardId: BoardId, folderId: string) => {
    setFolderState((current) => {
      const assigned = current.boardFolders[boardId] ?? []
      const next = assigned.includes(folderId) ? assigned.filter((id) => id !== folderId) : [...assigned, folderId]
      return { ...current, boardFolders: { ...current.boardFolders, [boardId]: next } }
    })
  }

  const assignedFolders = Object.fromEntries(boards.map((board) => [board.id,
    folderState.folders.filter((folder) => folderState.boardFolders[board.id]?.includes(folder.id))])) as Record<BoardId, typeof folderState.folders>
  const visibleBoards = selectedFolderId
    ? boards.filter((board) => assignedFolders[board.id].some((folder) => folder.id === selectedFolderId))
    : boards

  if (page === 'home') return <main className="home-screen">
    <aside className="home-screen__sidebar" aria-label="Боковая панель">
      <nav className="home-screen__sidebar-nav" aria-label="Разделы досок">
        <button className="home-screen__all-boards" type="button"
          aria-current={selectedFolderId === null ? 'page' : undefined}
          onClick={() => setSelectedFolderId(null)}>Все доски</button>
        <div className="home-screen__folders-row">
          <button className="home-screen__folders" type="button" aria-expanded={foldersActive}
            aria-controls="home-screen-folder-list"
            onClick={() => setFoldersActive((current) => !current)}>
            Папки<span className="home-screen__filter-arrow" aria-hidden="true" />
          </button>
          <button className="home-screen__add-folder" type="button" aria-label="Добавить папку"
            onClick={startFolder}>+</button>
        </div>
        {foldersActive && <div className="home-screen__folder-list" id="home-screen-folder-list">
          {folderDraft && <>
            <div className="home-screen__folder-colors" role="group" aria-label="Цвет новой папки">
              {FOLDER_COLORS.map(({ name, value }) => <button className="home-screen__folder-color" key={value}
                type="button" aria-label={name} aria-pressed={folderDraft.color === value} title={name}
                style={{ backgroundColor: value }}
                onClick={() => setFolderDraft((current) => current && { ...current, color: value })} />)}
            </div>
            <div className="home-screen__folder-draft">
              <input ref={folderNameRef} value={folderDraft.name} aria-label="Название новой папки"
                onChange={(event) => setFolderDraft((current) => current && { ...current, name: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') createFolder()
                  if (event.key === 'Escape') setFolderDraft(null)
                }} />
              <button className="home-screen__save-folder" type="button" aria-label="Сохранить папку"
                onClick={createFolder}>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m5 12 5 5 9-10" stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </>}
          {folderState.folders.map((folder) => <button className="home-screen__folder-item" type="button"
            key={folder.id} aria-current={selectedFolderId === folder.id ? 'page' : undefined}
            style={{ color: folder.color }} onClick={() => { setSelectedFolderId(folder.id); setDashboardPage(1) }}>
            {folder.name}
          </button>)}
        </div>}
      </nav>
      <div className="home-screen__profile">
        <span className="home-screen__avatar" aria-hidden="true" />
        <span>Саламон Михаил</span>
      </div>
    </aside>
    <section className="home-screen__content" aria-label="Список досок">
      <div className="home-screen__header">
        <input className="home-screen__search" type="text" aria-label="Поиск досок" placeholder="Поиск досок" />
      </div>
      <div className="home-screen__actions">
        <button className="home-screen__create" type="button" disabled>Новая доска</button>
        <div className="home-screen__sort-controls" aria-label="Фильтры досок">
          <button className="home-screen__filter home-screen__filter--disabled" type="button" disabled>Дата</button>
          <button className="home-screen__filter home-screen__filter--disabled" type="button" disabled>
            Сортировать<span className="home-screen__filter-arrow" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="home-screen__grid">
        {(selectedFolderId || dashboardPage === 1) && visibleBoards.map((board) => <div className="home-screen__item" key={board.id}>
          <div className={`home-screen__thumbnail-wrap${openBoardMenuId === board.id ? ' home-screen__thumbnail-wrap--menu-open' : ''}`}
            ref={openBoardMenuId === board.id ? boardMenuRef : undefined}>
            <a className="home-screen__thumbnail home-screen__thumbnail--active"
              href={boardPath(board.id)} onClick={(event) => openBoard(event, board.id)}
              aria-label={`Открыть доску ${board.name}`}>
              {previews[board.id] && <img className="home-screen__preview" src={previews[board.id]} alt="" />}
            </a>
            {assignedFolders[board.id].length > 0 && <span className="home-screen__folder-tags" role="img"
              aria-label={`Папки: ${assignedFolders[board.id].map((folder) => folder.name).join(', ')}`}>
              {assignedFolders[board.id].map((folder) => <span className="home-screen__folder-tag"
                key={folder.id} style={{ backgroundColor: folder.color }} />)}
            </span>}
            <button className="home-screen__card-menu-button" type="button"
              aria-label={`Меню доски ${board.name}`} aria-expanded={openBoardMenuId === board.id}
              aria-controls={openBoardMenuId === board.id ? `board-card-menu-${board.id}` : undefined}
              onClick={() => { setShowBoardFolderOptions(false); setOpenBoardMenuId((current) => current === board.id ? null : board.id) }}>
              <img src={menuIcon} alt="" aria-hidden="true" />
            </button>
            {openBoardMenuId === board.id && <div id={`board-card-menu-${board.id}`} className="home-screen__card-menu">
              <button className="home-screen__card-menu-item home-screen__card-menu-item--active" type="button"
                aria-expanded={showBoardFolderOptions} aria-controls={`board-folder-options-${board.id}`}
                onClick={() => setShowBoardFolderOptions((current) => !current)}>Отнести к папке</button>
              {showBoardFolderOptions && <div className="home-screen__board-folder-options"
                id={`board-folder-options-${board.id}`} role="group" aria-label="Папки доски">
                {folderState.folders.length === 0 && <span className="home-screen__no-folders">Папок пока нет</span>}
                {folderState.folders.map((folder) => <label className="home-screen__board-folder-option" key={folder.id}>
                  <input type="checkbox" checked={folderState.boardFolders[board.id]?.includes(folder.id) ?? false}
                    onChange={() => toggleBoardFolder(board.id, folder.id)} />
                  <span className="home-screen__board-folder-dot" style={{ backgroundColor: folder.color }} />
                  <span>{folder.name}</span>
                </label>)}
              </div>}
              {[0, 1].map((index) => <button className="home-screen__card-menu-item" type="button"
                key={index} disabled>Заглушка</button>)}
            </div>}
          </div>
          <span className="home-screen__name">{board.name}
            <span className="home-screen__board-id">#{board.id.toUpperCase()}</span>
          </span>
          <span className="home-screen__created">Дата создания: {board.createdAt}</span>
        </div>)}
        {!selectedFolderId && Array.from({ length: CARDS_PER_PAGE - (dashboardPage === 1 ? boards.length : 0) }, (_, index) =>
          <div className="home-screen__item home-screen__item--placeholder" key={`${dashboardPage}-${index}`}>
          <div className="home-screen__thumbnail" />
          <span className="home-screen__name">Заглушка</span>
        </div>)}
      </div>
      {!selectedFolderId && <nav className="home-screen__pagination" aria-label="Страницы досок">
        <button type="button" className="home-screen__pagination-arrow" aria-label="Предыдущая страница"
          disabled={dashboardPage === 1} onClick={() => changeDashboardPage(dashboardPage - 1)}>
          <svg className="home-screen__chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15.5 5 L8.5 12 L15.5 19" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {paginationItems(dashboardPage, DASHBOARD_PAGE_COUNT).map((item, index) => item === 'ellipsis'
          ? <span className="home-screen__pagination-ellipsis" aria-hidden="true" key={`ellipsis-${index}`}>…</span>
          : <button type="button" key={item} aria-label={`Страница ${item}`}
              aria-current={item === dashboardPage ? 'page' : undefined}
              onClick={() => changeDashboardPage(item)}>{item}</button>)}
        <button type="button" className="home-screen__pagination-arrow" aria-label="Следующая страница"
          disabled={dashboardPage === DASHBOARD_PAGE_COUNT} onClick={() => changeDashboardPage(dashboardPage + 1)}>
          <svg className="home-screen__chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M8.5 5 L15.5 12 L8.5 19" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </nav>}
    </section>
  </main>

  return (
    <div className="app-shell">
      <BoardCanvas key={page} boardId={page} saveRef={saveBoardRef} />
      <TemplateControl name={boards.find((board) => board.id === page)?.name ?? ''} onReturn={returnToDashboard} />
    </div>
  )
}
