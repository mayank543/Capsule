import { useEffect, useState } from "react"
import { getStoredRootDirectory, pickRootDirectory, listDirectoryContents, getOrCreateSubdirectory, saveFileToDirectory, type FileSystemItem } from "./file-system"
import { getCategories, addCategory, type Category, saveFileMetadata } from "./metadata"
import { Storage } from "@plasmohq/storage"

const storage = new Storage()

export const FileVault = ({ isSidePanel = false }: { isSidePanel?: boolean }) => {
  const [rootHandle, setRootHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [files, setFiles] = useState<FileSystemItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [viewMode, setViewMode] = useState<string>("sidepanel")

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      try {
        const mode = await storage.get("view-mode")
        if (mode) setViewMode(mode)

        const handle = await getStoredRootDirectory()
        if (handle) {
          setRootHandle(handle)
          const cats = await getCategories()
          setCategories(cats)
          if (cats.length > 0) setSelectedCategory(cats[0])
        }
      } catch (err) {
        console.error("Init error", err)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const handleToggleViewMode = async () => {
    const newMode = viewMode === "sidepanel" ? "popup" : "sidepanel"
    await storage.set("view-mode", newMode)
    setViewMode(newMode)
  }

  const handleSelectRoot = async () => {
    const handle = await pickRootDirectory()
    if (handle) {
      setRootHandle(handle)
      const cats = await getCategories()
      setCategories(cats)
    }
  }

  useEffect(() => {
    if (rootHandle && selectedCategory) {
      loadFiles(selectedCategory)
    }
  }, [rootHandle, selectedCategory])

  const loadFiles = async (category: Category) => {
    try {
      const catHandle = await getOrCreateSubdirectory(rootHandle!, category.path)
      const contents = await listDirectoryContents(catHandle)
      setFiles(contents.filter(f => f.kind === "file"))
    } catch (error) {
      console.error("Error loading files:", error)
    }
  }

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
        console.error("Delete error", err)
      }
    }
  }

  if (loading) return <div className="plasmo-p-4">Loading...</div>

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
      <div className="plasmo-p-4 plasmo-bg-white plasmo-border-b plasmo-flex plasmo-justify-between plasmo-items-center plasmo-shrink-0">
        <div className="plasmo-flex plasmo-items-center plasmo-space-x-3">
          <h2 className="plasmo-font-bold plasmo-text-lg">Capsule</h2>
          <button 
            onClick={handleToggleViewMode}
            className="plasmo-text-[10px] plasmo-bg-gray-100 plasmo-text-gray-500 plasmo-px-2 plasmo-py-0.5 plasmo-rounded-md hover:plasmo-bg-gray-200 plasmo-transition plasmo-uppercase plasmo-font-bold"
            title="Toggle between Popup and Side Panel"
          >
            {viewMode === "sidepanel" ? "Side Panel" : "Popup"}
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
        <div className="plasmo-w-1/3 plasmo-border-r plasmo-bg-gray-50 plasmo-overflow-y-auto plasmo-shrink-0">
          <div className="plasmo-p-2 plasmo-space-y-1">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat)}
                className={`plasmo-w-full plasmo-text-left plasmo-p-3 plasmo-text-sm plasmo-rounded-lg plasmo-transition ${selectedCategory?.id === cat.id ? "plasmo-bg-white plasmo-shadow-sm plasmo-font-bold plasmo-text-blue-600 plasmo-ring-1 plasmo-ring-gray-200" : "hover:plasmo-bg-gray-200 plasmo-text-gray-600"}`}
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
            <div className="plasmo-flex-1 plasmo-flex plasmo-flex-col plasmo-items-center plasmo-justify-center plasmo-text-gray-400 plasmo-p-8 plasmo-text-center plasmo-space-y-2">
              <div className="plasmo-w-12 plasmo-h-12 plasmo-bg-gray-100 plasmo-rounded-full plasmo-flex plasmo-items-center plasmo-justify-center plasmo-text-2xl">📁</div>
              <p className="plasmo-text-sm">Select or create a category to view files.</p>
            </div>
          ) : (
            <>
              <div className="plasmo-p-3 plasmo-bg-gray-50 plasmo-border-b plasmo-flex plasmo-justify-between plasmo-items-center plasmo-shrink-0">
                <span className="plasmo-text-xs plasmo-font-bold plasmo-uppercase plasmo-tracking-wider plasmo-text-gray-500">{selectedCategory.name}</span>
                <span className="plasmo-text-[10px] plasmo-bg-gray-200 plasmo-text-gray-600 plasmo-px-1.5 plasmo-py-0.5 plasmo-rounded plasmo-uppercase plasmo-font-bold">{files.length} files</span>
              </div>
              
              <div className="plasmo-flex-1 plasmo-overflow-y-auto plasmo-p-2 plasmo-space-y-1">
                {files.map(file => (
                  <div key={file.name} className="plasmo-flex plasmo-items-center plasmo-p-2.5 hover:plasmo-bg-blue-50/50 plasmo-rounded-lg plasmo-group plasmo-transition plasmo-cursor-default">
                    <div className="plasmo-w-9 plasmo-h-9 plasmo-bg-gray-100 group-hover:plasmo-bg-blue-100 plasmo-rounded plasmo-flex plasmo-items-center plasmo-justify-center plasmo-mr-3 plasmo-transition plasmo-shrink-0">
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
                  <div className="plasmo-h-full plasmo-flex plasmo-flex-col plasmo-items-center plasmo-justify-center plasmo-text-gray-400 plasmo-py-20 plasmo-space-y-2">
                    <div className="plasmo-text-3xl">📥</div>
                    <p className="plasmo-text-sm">Drag and drop files here</p>
                  </div>
                )}
              </div>
            </>
          )}

          {isDragging && (
            <div className="plasmo-absolute plasmo-inset-0 plasmo-bg-blue-500/10 plasmo-backdrop-blur-[1px] plasmo-border-4 plasmo-border-blue-500/50 plasmo-border-dashed plasmo-flex plasmo-items-center plasmo-justify-center plasmo-pointer-events-none plasmo-z-10">
              <div className="plasmo-bg-white plasmo-px-6 plasmo-py-3 plasmo-rounded-2xl plasmo-shadow-xl plasmo-font-bold plasmo-text-blue-600 plasmo-flex plasmo-flex-col plasmo-items-center plasmo-space-y-2">
                <span className="plasmo-text-2xl">✨</span>
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
