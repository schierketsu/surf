import type { Arrow } from './ArrowLayer'
import type { TableItem } from './components/BoardTable/BoardTable'
import type { DrawingItem } from './components/Drawing/Drawing'
import type { StickerItem } from './components/Sticker/Sticker'
import type { TextItem } from './components/TextBox/TextBox'

export type SavedBoard = {
  id: string
  version: 1
  texts: TextItem[]
  stickers: StickerItem[]
  tables: TableItem[]
  drawings: DrawingItem[]
  arrows: Arrow[]
  layerOrder: string[]
  preview: string
}

const DATABASE_NAME = 'doska-boards'
const STORE_NAME = 'boards'
let databasePromise: Promise<IDBDatabase> | null = null
let writeQueue: Promise<void> = Promise.resolve()

function database() {
  if (!databasePromise) databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }).catch((error) => {
    databasePromise = null
    throw error
  })
  return databasePromise
}

export async function loadBoard(id: string): Promise<SavedBoard | null> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id)
    request.onsuccess = () => {
      const value = request.result as SavedBoard | undefined
      resolve(value?.version === 1 ? value : null)
    }
    request.onerror = () => reject(request.error)
  })
}

export function saveBoard(board: SavedBoard): Promise<void> {
  const write = writeQueue.catch(() => {}).then(async () => {
    const db = await database()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put(board)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  })
  writeQueue = write
  return write
}
