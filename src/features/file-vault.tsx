import { useEffect, useState, useCallback } from "react"
import { getStoredRootDirectory, pickRootDirectory, listDirectoryContents, getOrCreateSubdirectory, saveFileToDirectory, type FileSystemItem, verifyPermission } from "./file-system"
import { getCategories, addCategory, saveCategories, type Category, saveFileMetadata } from "./metadata"
import { Storage } from "@plasmohq/storage"
import { get } from "idb-keyval"

const storage = new Storage()
const ROOT_HANDLE_KEY = "root-directory-handle"

export const FileVault = ({ isSidePanel = false }: { isSidePanel?: boolean }) => {
  const [rootHandle, setRootHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [files, setFiles] = useState<FileSystemItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [viewMode, setViewMode] = useState<string>("sidepanel")
  const [permissionRequired, setPermissionRequired] = useState(false)

  const syncPhysicalFolders = useCallback(async (handle: FileSystemDirectoryHandle, currentCats: Category[]) => {
    try {
      console.log("[SYNC] Starting physical folder sync...")
      const contents = await listDirectoryContents(handle)
      console.log("[SYNC] Found contents:", contents.length, "items")
      
      const physicalDirs = contents.filter(item => item.kind === "directory")
      console.log("[SYNC] Physical directories discovered:", physicalDirs.map(d => d.name))
      
      let updated = false
      const updatedCats = [...currentCats]
      
      for (const dir of physicalDirs) {
        const exists = updatedCats.find(c => c.path.toLowerCase() === dir.name.toLowerCase())
        if (!exists) {
          console.log(`[SYNC] New category discovered: ${dir.name}`)
          updatedCats.push({
            id: Date.now().toString() + Math.random(),
            name: dir.name.split(/[-_]/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
            path: dir.name
          })
          updated = true
        } else {
          console.log(`[SYNC] Folder already in categories: ${dir.name}`)
        }
      }
      
      if (updated) {
        console.log("[SYNC] Updating storage with discovered categories...")
        await saveCategories(updatedCats)
        setCategories(updatedCats)
        return updatedCats
      } else {
        console.log("[SYNC] No new categories to add.")
      }
    } catch (error) {
      console.error("[SYNC] Error during sync:", error)
    }
    return currentCats
  }, [])

  const init = useCallback(async () => {
    console.log("[INIT] Starting initialization...")
    setLoading(true)
    try {
      const mode = await storage.get("view-mode")
      if (mode) setViewMode(mode as string)

      const handle = await getStoredRootDirectory()
      if (handle) {
        console.log("[INIT] Stored handle valid, setting root handle...")
        setRootHandle(handle)
        setPermissionRequired(false)
        let cats = await getCategories()
        console.log("[INIT] Categories from storage:", cats)
        cats = await syncPhysicalFolders(handle, cats)
        setCategories(cats)
        if (cats.length > 0 && !selectedCategory) {
          console.log("[INIT] Selecting first category:", cats[0].name)
          setSelectedCategory(cats[0])
        }
      } else {
        console.log("[INIT] No stored handle or permission missing.")
        const storedHandle = await get<FileSystemDirectoryHandle>(ROOT_HANDLE_KEY)
        if (storedHandle) {
          console.log("[INIT] Handle exists in IDB but needs permission.")
          setPermissionRequired(true)
        }
      }
    } catch (err) {
      console.error("[INIT] Error during init:", err)
    } finally {
      setLoading(false)
    }
  }, [selectedCategory, syncPhysicalFolders])

  useEffect(() => {
    init()
  }, [])

  const handleVerifyPermission = async () => {
    console.log("[UI] Verifying permission...")
    const storedHandle = await get<FileSystemDirectoryHandle>(ROOT_HANDLE_KEY)
    if (storedHandle) {
      const granted = await verifyPermission(storedHandle)
      if (granted) {
        console.log("[UI] Permission granted, re-initializing...")
        setRootHandle(storedHandle)
        setPermissionRequired(false)
        init()
      }
    }
  }

  const handleToggleViewMode = async () => {
    const newMode = viewMode === "sidepanel" ? "popup" : "sidepanel"
    await storage.set("view-mode", newMode)
    setViewMode(newMode)
  }

  const handleSelectRoot = async () => {
    console.log("[UI] Selecting new root...")
    const handle = await pickRootDirectory()
    if (handle) {
      setRootHandle(handle)
      setPermissionRequired(false)
      let cats = await getCategories()
      cats = await syncPhysicalFolders(handle, cats)
      setCategories(cats)
      if (cats.length > 0) setSelectedCategory(cats[0])
    }
  }

  const loadFiles = useCallback(async (category: Category) => {
    if (!rootHandle) return
    console.log("[UI] Loading files for category:", category.name)
    try {
      const catHandle = await getOrCreateSubdirectory(rootHandle, category.path)
      const contents = await listDirectoryContents(catHandle)
      setFiles(contents.filter(f => f.kind === "file"))
    } catch (error) {
      console.error("[UI] Error loading files:", error)
    }
  }, [rootHandle])

  useEffect(() => {
    if (rootHandle && selectedCategory) {
      loadFiles(selectedCategory)
    }
  }, [rootHandle, selectedCategory, loadFiles])

  const handleAddCategory = async () => {
    const name = prompt("Category name:")
    if (name) {
      const id = Date.now().toString()
      const newCat: Category = { id, name, path: name.toLowerCase().replace(/\s+/g, "-") }
      await addCategory(newCat)
      setCategories([...categories, newCat])
      if (!selectedCategory) setSelectedCategory(newCat)
      if (rootHandle) await getOrCreateSubdirectory(rootHandle, newCat.path)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (!selectedCategory || !rootHandle) return

    const droppedFiles = Array.from(e.dataTransfer.files)
    if (droppedFiles.length === 0) return

    console.log("[UI] Files dropped:", droppedFiles.length)
    const catHandle = await getOrCreateSubdirectory(rootHandle, selectedCategory.path)
    for (const file of droppedFiles) {
      await saveFileToDirectory(catHandle, file)
      await saveFileMetadata(file.name, selectedCategory.path, "")
    }
    loadFiles(selectedCategory)
  }

  const handleDeleteFile = async (fileName: string) => {
    if (!selectedCategory || !rootHandle) return
    if (confirm(`Delete ${fileName}?`)) {
      try {
        const catHandle = await getOrCreateSubdirectory(rootHandle, selectedCategory.path)
        await (catHandle as any).removeEntry(fileName)
        loadFiles(selectedCategory)
      } catch (err) {
        console.error("[UI] Delete error", err)
      }
    }
  }

  if (loading) return <div className="plasmo-p-4">Loading...</div>

  if (permissionRequired) {
    return (
      <div className={`plasmo-p-8 plasmo-flex plasmo-flex-col plasmo-items-center plasmo-justify-center plasmo-space-y-4 ${isSidePanel ? 'plasmo-w-full' : 'plasmo-w-[400px]'}`}>
        <h1 className="plasmo-text-xl plasmo-font-bold">Access Required</h1>
        <p className="plasmo-text-center plasmo-text-gray-600 plasmo-text-sm">Capsule needs your permission to access the folder you selected earlier.</p>
        <button 
          onClick={handleVerifyPermission}
          className="plasmo-bg-blue-600 plasmo-text-white plasmo-px-4 plasmo-py-2 plasmo-rounded hover:plasmo-bg-blue-700"
        >
          Verify Access
        </button>
      </div>
    )
  }

  if (!rootHandle) {
    return (
      <div className={`plasmo-p-8 plasmo-flex plasmo-flex-col plasmo-items-center plasmo-justify-center plasmo-space-y-4 ${isSidePanel ? 'plasmo-w-full' : 'plasmo-w-[400px]'}`}>
        <h1 className="plasmo-text-xl plasmo-font-bold plasmo-text-center">Welcome to Capsule</h1>
        <p className="plasmo-text-center plasmo-text-gray-600 plasmo-text-sm">Please select a folder on your system to use as your root storage.</p>
        <button 
          onClick={handleSelectRoot}
          className="plasmo-bg-blue-600 plasmo-text-white plasmo-px-4 plasmo-py-2 plasmo-rounded hover:plasmo-bg-blue-700 plasmo-transition"
        >
          Select Root Folder
        </button>
      </div>
    )
  }

  return (
    <div className={`plasmo-flex plasmo-flex-col plasmo-bg-gray-50 plasmo-overflow-hidden ${isSidePanel ? 'plasmo-w-full plasmo-h-screen' : 'plasmo-w-[500px] plasmo-h-[600px]'}`}>
      <div className="plasmo-p-4 plasmo-bg-white plasmo-border-b plasmo-flex plasmo-justify-between plasmo-items-center shrink-0">
        <div className="plasmo-flex plasmo-items-center plasmo-space-x-3">
          <h2 className="plasmo-font-bold plasmo-text-lg">Capsule</h2>
          <button 
            onClick={handleToggleViewMode}
            className="plasmo-text-[10px] plasmo-bg-gray-100 plasmo-text-gray-500 plasmo-px-2 plasmo-py-0.5 plasmo-rounded-md hover:plasmo-bg-gray-200 plasmo-transition plasmo-uppercase plasmo-font-bold"
            title="Toggle between Popup and Side Panel"
          >
            {viewMode === "sidepanel" ? "Side Panel" : "Popup"}
          </button>
          <button 
            onClick={() => syncPhysicalFolders(rootHandle!, categories)}
            className="plasmo-text-[10px] plasmo-bg-blue-50 plasmo-text-blue-500 plasmo-px-2 plasmo-py-0.5 plasmo-rounded-md hover:plasmo-bg-blue-100 plasmo-transition plasmo-uppercase plasmo-font-bold"
            title="Sync folders from disk"
          >
            Sync
          </button>
        </div>
        <button 
          onClick={handleAddCategory}
          className="plasmo-text-sm plasmo-bg-blue-50 plasmo-text-blue-600 plasmo-px-3 plasmo-py-1 plasmo-rounded-full plasmo-font-medium hover:plasmo-bg-blue-100"
        >
          + Add Category
        </button>
      </div>

      <div className="plasmo-flex plasmo-flex-1 plasmo-overflow-hidden">
        <div className="plasmo-w-1/3 plasmo-border-r plasmo-bg-gray-50 plasmo-overflow-y-auto shrink-0">
          <div className="plasmo-p-2 space-y-1">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat)}
                className={`plasmo-w-full plasmo-text-left plasmo-p-3 plasmo-text-sm plasmo-rounded-lg plasmo-transition ${selectedCategory?.id === cat.id ? "plasmo-bg-white plasmo-shadow-sm plasmo-font-bold plasmo-text-blue-600 plasmo-ring-1 plasmo-ring-gray-200" : "hover:plasmo-bg-gray-200 text-gray-600"}`}
              >
                {cat.name}
              </button>
            ))}
          </div>
          {categories.length === 0 && (
            <div className="plasmo-p-4 plasmo-text-xs plasmo-text-gray-500 plasmo-italic plasmo-text-center">No categories yet.</div>
          )}
        </div>

        <div 
          className={`plasmo-flex-1 plasmo-flex plasmo-flex-col plasmo-relative ${isDragging ? "plasmo-bg-blue-50" : "plasmo-bg-white"}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          {!selectedCategory ? (
            <div className="plasmo-flex-1 plasmo-flex plasmo-flex-col plasmo-items-center plasmo-justify-center plasmo-text-gray-400 plasmo-p-8 plasmo-text-center space-y-2">
              <div className="plasmo-w-12 plasmo-h-12 plasmo-bg-gray-100 plasmo-rounded-full plasmo-flex plasmo-items-center plasmo-justify-center plasmo-text-2xl">📁</div>
              <p className="plasmo-text-sm">Select or create a category to view files.</p>
            </div>
          ) : (
            <>
              <div className="plasmo-p-3 plasmo-bg-gray-50 plasmo-border-b plasmo-flex plasmo-justify-between plasmo-items-center shrink-0">
                <span className="plasmo-text-xs plasmo-font-bold plasmo-uppercase plasmo-tracking-wider plasmo-text-gray-500">{selectedCategory.name}</span>
                <span className="plasmo-text-[10px] plasmo-bg-gray-200 plasmo-text-gray-600 plasmo-px-1.5 plasmo-py-0.5 plasmo-rounded plasmo-uppercase plasmo-font-bold">{files.length} files</span>
              </div>
              
              <div className="plasmo-flex-1 plasmo-overflow-y-auto plasmo-p-2 space-y-1">
                {files.map(file => (
                  <div key={file.name} className="plasmo-flex plasmo-items-center plasmo-p-2.5 hover:plasmo-bg-blue-50/50 plasmo-rounded-lg plasmo-group plasmo-transition plasmo-cursor-default">
                    <div className="plasmo-w-9 plasmo-h-9 plasmo-bg-gray-100 group-hover:plasmo-bg-blue-100 plasmo-rounded plasmo-flex plasmo-items-center plasmo-justify-center plasmo-mr-3 plasmo-transition shrink-0">
                      <FileIcon name={file.name} />
                    </div>
                    <div className="plasmo-flex-1 plasmo-min-w-0">
                      <p className="plasmo-text-sm plasmo-font-medium plasmo-text-gray-700 plasmo-truncate">{file.name}</p>
                    </div>
                    <button 
                      onClick={() => handleDeleteFile(file.name)}
                      className="plasmo-opacity-0 group-hover:plasmo-opacity-100 plasmo-p-1.5 plasmo-text-gray-400 hover:plasmo-text-red-600 plasmo-transition"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ))}
                {files.length === 0 && !isDragging && (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 py-20 space-y-2">
                    <div className="plasmo-text-3xl">📥</div>
                    <p className="plasmo-text-sm">Drag and drop files here</p>
                  </div>
                )}
              </div>
            </>
          )}

          {isDragging && (
            <div className="plasmo-absolute plasmo-inset-0 plasmo-bg-blue-500/10 plasmo-backdrop-blur-[1px] plasmo-border-4 plasmo-border-blue-500/50 plasmo-border-dashed plasmo-flex plasmo-items-center justify-center pointer-events-none z-10">
              <div className="bg-white px-6 py-3 rounded-2xl shadow-xl font-bold text-blue-600 flex flex-col items-center space-y-2">
                <span className="text-2xl">✨</span>
                <span>Drop to store in {selectedCategory?.name}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const FileIcon = ({ name }: { name: string }) => {
  const ext = name.split('.').pop()?.toLowerCase()
  const icons: Record<string, string> = {
    pdf: 'PDF', doc: 'DOC', docx: 'DOC', ppt: 'PPT', pptx: 'PPT',
    xls: 'XLS', xlsx: 'XLS', csv: 'CSV', zip: 'ZIP', rar: 'ZIP'
  }
  const colors: Record<string, string> = {
    pdf: 'plasmo-text-red-600', doc: 'plasmo-text-blue-600', docx: 'plasmo-text-blue-600',
    ppt: 'plasmo-text-orange-600', pptx: 'plasmo-text-orange-600',
    xls: 'plasmo-text-green-600', xlsx: 'plasmo-text-green-600'
  }
  return <span className={`plasmo-text-[10px] plasmo-font-bold ${colors[ext!] || 'plasmo-text-gray-500'}`}>{icons[ext!] || 'FILE'}</span>
}

const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18"></path>
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
  </svg>
)
