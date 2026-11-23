import { useEffect, useRef, useState, type MouseEvent } from 'react'
import BoardCanvas from './BoardCanvas'
import { loadBoard } from './boardStorage'
import { renderBoardPreview } from './boardPreview'
import TemplateControl from './components/TemplateControl/TemplateControl'
import './HomeScreen.css'

const boards = [
  { id: 'id1', name: 'Шаблон' },
  { id: 'id2', name: 'Шаблон 2' },
] as const
type BoardId = typeof boards[number]['id']
const boardPath = (id: BoardId) => `/doska/${id}`
const DASHBOARD_PAGE_COUNT = 3
const CARDS_PER_PAGE = 16

function currentPage() {
  return boards.find((board) => window.location.pathname === boardPath(board.id))?.id ?? 'home'
}

export default function App() {
  const [page, setPage] = useState(currentPage)
  const [dashboardPage, setDashboardPage] = useState(1)
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const saveBoardRef = useRef<(() => Promise<string>) | null>(null)

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

  const changeDashboardPage = (direction: -1 | 1) => {
    setDashboardPage((current) => current + direction)
    window.requestAnimationFrame(() => window.scrollTo(0, 0))
  }

  if (page === 'home') return <main className="home-screen">
    <section className="home-screen__content" aria-labelledby="home-title">
      <div className="home-screen__header">
        <h1 id="home-title" className="home-screen__title">Доска</h1>
        <button className="home-screen__create" type="button" disabled>Создать</button>
      </div>
      <input className="home-screen__search" type="text" aria-label="Поиск досок" placeholder="Поиск досок" />
      <div className="home-screen__filters" aria-label="Фильтры досок">
        <div className="home-screen__filter-group">
          {['Все', 'Избранное'].map((filter) =>
            <span className="home-screen__filter" key={filter}>{filter}</span>)}
        </div>
        <div className="home-screen__filter-group">
          <button className="home-screen__filter home-screen__filter--disabled" type="button" disabled>Дата</button>
          <button className="home-screen__filter home-screen__filter--disabled" type="button" disabled>
            Сортировать<span className="home-screen__sort-arrow" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="home-screen__grid">
        {dashboardPage === 1 && boards.map((board) => <div className="home-screen__item" key={board.id}>
          <a className={`home-screen__thumbnail home-screen__thumbnail--active${board.id === 'id2' ? ' home-screen__thumbnail--gray' : ''}`}
            href={boardPath(board.id)} onClick={(event) => openBoard(event, board.id)}
            aria-label={`Открыть доску ${board.name}`}>
            {previews[board.id] && <img className="home-screen__preview" src={previews[board.id]} alt="" />}
          </a>
          <span className="home-screen__name">{board.name}
            <span className="home-screen__board-id">#{board.id.toUpperCase()}</span>
          </span>
          <span className="home-screen__created">Дата создания: Пусто</span>
        </div>)}
        {Array.from({ length: CARDS_PER_PAGE - (dashboardPage === 1 ? boards.length : 0) }, (_, index) =>
          <div className="home-screen__item" key={`${dashboardPage}-${index}`}>
          <div className="home-screen__thumbnail" />
          <span className="home-screen__name">Заглушка</span>
        </div>)}
      </div>
      <nav className="home-screen__pagination" aria-label="Страницы досок">
        <button type="button" disabled={dashboardPage === 1}
          onClick={() => changeDashboardPage(-1)}>Назад</button>
        <span className="home-screen__page-count" aria-live="polite">{dashboardPage} из {DASHBOARD_PAGE_COUNT}</span>
        <button type="button" disabled={dashboardPage === DASHBOARD_PAGE_COUNT}
          onClick={() => changeDashboardPage(1)}>Вперёд</button>
      </nav>
    </section>
  </main>

  return (
    <div className="app-shell">
      <BoardCanvas key={page} boardId={page} saveRef={saveBoardRef} />
      <TemplateControl name={boards.find((board) => board.id === page)?.name ?? ''} onReturn={returnToDashboard} />
    </div>
  )
}
