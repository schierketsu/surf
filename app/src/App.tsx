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
const MAX_FOLDER_NAME_LENGTH = 12
const FOLDER_COLORS = TEXT_COLORS.filter(({ name }) => name !== 'Белый' && name !== 'Жёлтый')

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
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null)
  const [folderMenuColorsOpen, setFolderMenuColorsOpen] = useState(false)
  const [foldersActive, setFoldersActive] = useState(false)
  const [folderState, setFolderState] = useState(loadFolderState)
  const [folderDraft, setFolderDraft] = useState<{ id?: string; name: string; color: string } | null>(null)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [folderMenuOpensLeft, setFolderMenuOpensLeft] = useState(false)
  const saveBoardRef = useRef<(() => Promise<string>) | null>(null)
  const boardMenuRef = useRef<HTMLDivElement>(null)
  const folderMenuRef = useRef<HTMLDivElement>(null)
  const folderNameRef = useRef<HTMLInputElement>(null)
  const folderEditorRef = useRef<HTMLDivElement>(null)
  const addFolderRef = useRef<HTMLButtonElement>(null)
  const isEditingFolder = folderDraft !== null
  const isCreatingFolder = folderDraft !== null && !folderDraft.id

  useEffect(() => saveFolderState(folderState), [folderState])
  useEffect(() => {
    if (!isEditingFolder) return
    const input = folderNameRef.current
    if (!input) return
    if (isCreatingFolder) input.select()
    else {
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    }
  }, [isEditingFolder, isCreatingFolder, folderDraft?.id])

  useEffect(() => {
    if (!isCreatingFolder) return
    const cancelOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (folderEditorRef.current?.contains(event.target) || addFolderRef.current?.contains(event.target)) return
      setFolderDraft(null)
    }
    document.addEventListener('pointerdown', cancelOutside)
    return () => document.removeEventListener('pointerdown', cancelOutside)
  }, [isCreatingFolder])

  useEffect(() => {
    if (!openBoardMenuId) return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !boardMenuRef.current?.contains(event.target)) {
        setOpenBoardMenuId(null)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenBoardMenuId(null)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [openBoardMenuId])

  useEffect(() => {
    if (!openFolderMenuId) return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !folderMenuRef.current?.contains(event.target)) {
        setOpenFolderMenuId(null)
        setFolderMenuColorsOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpenFolderMenuId(null)
      setFolderMenuColorsOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [openFolderMenuId])

  useEffect(() => {
    let cancelled = false
    Promise.all(boards.map(async (board) => {
      try {
        const saved = await loadBoard(board.id)
        return [board.id, saved ? await renderBoardPreview(saved) : ''] as const
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
    setOpenFolderMenuId(null)
    if (folderDraft) { folderNameRef.current?.focus(); return }
    setFolderDraft({ name: 'Без названия', color: '#272727' })
  }

  const saveFolder = () => {
    if (!folderDraft) return
    const name = folderDraft.name.trim().slice(0, MAX_FOLDER_NAME_LENGTH).trim() || 'Без названия'
    if (folderDraft.id) {
      setFolderState((current) => ({ ...current, folders: current.folders.map((folder) =>
        folder.id === folderDraft.id ? { ...folder, name, color: folderDraft.color } : folder) }))
    } else {
      const folder = { id: crypto.randomUUID(), name, color: folderDraft.color }
      setFolderState((current) => ({ ...current, folders: [folder, ...current.folders] }))
    }
    setFolderDraft(null)
  }

  const deleteFolder = (id: string) => {
    setFolderState((current) => ({
      folders: current.folders.filter((folder) => folder.id !== id),
      boardFolders: Object.fromEntries(Object.entries(current.boardFolders).map(([boardId, folderIds]) =>
        [boardId, folderIds.filter((folderId) => folderId !== id)])),
    }))
    if (selectedFolderId === id) { setSelectedFolderId(null); setDashboardPage(1) }
    setOpenFolderMenuId(null)
    setFolderMenuColorsOpen(false)
  }

  const changeFolderColor = (id: string, color: string) => {
    setFolderState((current) => ({ ...current, folders: current.folders.map((folder) =>
      folder.id === id ? { ...folder, color } : folder) }))
    setOpenFolderMenuId(null)
    setFolderMenuColorsOpen(false)
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

  const folderEditor = folderDraft && <div className="home-screen__folder-draft" ref={folderEditorRef}>
    <input ref={folderNameRef} value={folderDraft.name}
      aria-label={folderDraft.id ? 'Название папки' : 'Название новой папки'}
      maxLength={MAX_FOLDER_NAME_LENGTH}
      style={{ color: folderDraft.color }}
      onChange={(event) => setFolderDraft((current) => current && { ...current, name: event.target.value })}
      onKeyDown={(event) => {
        if (event.key === 'Enter') saveFolder()
        if (event.key === 'Escape') setFolderDraft(null)
      }} />
    <button className="home-screen__save-folder" type="button" aria-label="Сохранить папку"
      onClick={saveFolder}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m5 12 5 5 9-10" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  </div>

  if (page === 'home') return <main className="home-screen">
    <aside className="home-screen__sidebar" aria-label="Боковая панель">
      <nav className="home-screen__sidebar-nav" aria-label="Разделы досок">
        <button className="home-screen__all-boards" type="button"
          aria-current={selectedFolderId === null ? 'page' : undefined}
          onClick={() => setSelectedFolderId(null)}>Все доски</button>
        <div className="home-screen__folders-row">
          <button className="home-screen__folders" type="button" aria-expanded={foldersActive}
            aria-controls="home-screen-folder-list"
            onClick={() => { setFoldersActive((current) => !current)
              setOpenFolderMenuId(null); setFolderMenuColorsOpen(false) }}>
            <svg className="home-screen__folders-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M3 19V6a1 1 0 0 1 1-1h4.032a1 1 0 0 1 .768.36l1.9 2.28a1 1 0 0 0 .768.36H16a1 1 0 0 1 1 1v1M3 19l3-8h15l-3 8H3Z" />
            </svg>
            Папки<span className="home-screen__filter-arrow" aria-hidden="true" />
          </button>
          <button className="home-screen__add-folder" type="button" aria-label="Добавить папку" ref={addFolderRef}
            onClick={startFolder}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {foldersActive && <div className="home-screen__folder-list" id="home-screen-folder-list">
          {folderDraft && !folderDraft.id && folderEditor}
          {folderState.folders.map((folder) => folderDraft?.id === folder.id ? <div key={folder.id}>{folderEditor}</div>
            : <div className={`home-screen__folder-row${openFolderMenuId === folder.id ? ' home-screen__folder-row--menu-open' : ''}`}
              key={folder.id} ref={openFolderMenuId === folder.id ? folderMenuRef : undefined}>
              <button className="home-screen__folder-item" type="button"
                aria-current={selectedFolderId === folder.id ? 'page' : undefined}
                style={{ color: folder.color }} onClick={() => { setSelectedFolderId(folder.id); setDashboardPage(1) }}
                onDoubleClick={() => {
                  setFolderDraft({ id: folder.id, name: folder.name, color: folder.color })
                  setOpenFolderMenuId(null)
                }}>
                {folder.name}
              </button>
              <button className="home-screen__card-menu-button home-screen__folder-menu-button" type="button"
                aria-label={`Меню папки ${folder.name}`} aria-expanded={openFolderMenuId === folder.id}
                aria-controls={openFolderMenuId === folder.id ? `folder-menu-${folder.id}` : undefined}
                onClick={() => {
                  setOpenBoardMenuId(null)
                  setFolderMenuColorsOpen(false)
                  setOpenFolderMenuId((current) => current === folder.id ? null : folder.id)
                }}>
                <img src={menuIcon} alt="" aria-hidden="true" />
              </button>
              {openFolderMenuId === folder.id && <div className="home-screen__folder-action-menu" id={`folder-menu-${folder.id}`}
                role="menu" aria-label={`Действия с папкой ${folder.name}`}>
                <button type="button" role="menuitem" onClick={() => deleteFolder(folder.id)}>Удалить</button>
                <button type="button" role="menuitem" onClick={() => {
                  setFolderDraft({ id: folder.id, name: folder.name, color: folder.color })
                  setOpenFolderMenuId(null)
                }}>Изменить название</button>
                <button type="button" role="menuitem" aria-expanded={folderMenuColorsOpen}
                  aria-controls={folderMenuColorsOpen ? `folder-menu-colors-${folder.id}` : undefined}
                  onClick={() => setFolderMenuColorsOpen((current) => !current)}>Изменить цвет</button>
                {folderMenuColorsOpen && <div className="home-screen__folder-action-colors"
                  id={`folder-menu-colors-${folder.id}`} role="group" aria-label="Цвет папки">
                  {FOLDER_COLORS.map(({ name, value }) => <button key={value} type="button"
                    className="home-screen__folder-color" aria-label={name} title={name}
                    aria-pressed={folder.color === value} style={{ backgroundColor: value }}
                    onClick={() => changeFolderColor(folder.id, value)} />)}
                </div>}
              </div>}
            </div>)}
        </div>}
      </nav>
      <div className="home-screen__profile">
        <span className="home-screen__avatar" aria-hidden="true" />
        <span className="home-screen__profile-details">
          <span>Саламон Михаил</span>
          <span className="home-screen__profile-role">Роль в системе</span>
        </span>
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
        {selectedFolderId && visibleBoards.length === 0 && <p className="home-screen__empty-folder">В папке пока нет досок</p>}
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
              onClick={() => { setOpenFolderMenuId(null); setFolderMenuColorsOpen(false)
                setOpenBoardMenuId((current) => current === board.id ? null : board.id) }}>
              <img src={menuIcon} alt="" aria-hidden="true" />
            </button>
            {openBoardMenuId === board.id && <div id={`board-card-menu-${board.id}`} className="home-screen__card-menu">
              <div className={`home-screen__folder-submenu${folderMenuOpensLeft ? ' home-screen__folder-submenu--left' : ''}`}
                onMouseEnter={(event) => setFolderMenuOpensLeft(window.innerWidth - event.currentTarget.getBoundingClientRect().right < 238)}
                onFocus={(event) => setFolderMenuOpensLeft(window.innerWidth - event.currentTarget.getBoundingClientRect().right < 238)}>
                <button className="home-screen__card-menu-item home-screen__card-menu-item--active" type="button"
                  aria-controls={`board-folder-options-${board.id}`}>Отнести к папке</button>
                <div className="home-screen__board-folder-options" id={`board-folder-options-${board.id}`}
                  role="group" aria-label="Папки доски">
                  {folderState.folders.length === 0 && <span className="home-screen__no-folders">Папок пока нет</span>}
                  {folderState.folders.map((folder) => <label className="home-screen__board-folder-option" key={folder.id}>
                    <input type="checkbox" checked={folderState.boardFolders[board.id]?.includes(folder.id) ?? false}
                      onChange={() => toggleBoardFolder(board.id, folder.id)} />
                    <span style={{ color: folder.color }}>{folder.name}</span>
                  </label>)}
                </div>
              </div>
              <button className="home-screen__card-menu-item" type="button" disabled>Сведения</button>
              <button className="home-screen__card-menu-item" type="button" disabled>Удалить</button>
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
