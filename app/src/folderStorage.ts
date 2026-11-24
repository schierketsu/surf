export type BoardFolder = { id: string; name: string; color: string }

export type FolderState = {
  folders: BoardFolder[]
  boardFolders: Record<string, string[]>
}

const STORAGE_KEY = 'doska-folders-v1'

export function loadFolderState(): FolderState {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<FolderState> | null
    const folders = Array.isArray(value?.folders)
      ? value.folders.filter((folder): folder is BoardFolder =>
        typeof folder?.id === 'string' && typeof folder.name === 'string'
        && typeof folder.color === 'string' && /^#[0-9a-f]{6}$/i.test(folder.color))
      : []
    const known = new Set(folders.map((folder) => folder.id))
    const boardFolders: Record<string, string[]> = {}
    if (value?.boardFolders && typeof value.boardFolders === 'object') {
      for (const [boardId, folderIds] of Object.entries(value.boardFolders)) {
        if (Array.isArray(folderIds)) boardFolders[boardId] = folderIds.filter((id): id is string =>
          typeof id === 'string' && known.has(id))
      }
    }
    return { folders, boardFolders }
  } catch {
    return { folders: [], boardFolders: {} }
  }
}

export function saveFolderState(state: FolderState) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }
  catch (error) { console.error('Не удалось сохранить папки', error) }
}
