import { useEffect, useState, useCallback, useMemo } from "react"
import { getStoredRootDirectory, pickRootDirectory, listDirectoryContents, getOrCreateSubdirectory, saveFileToDirectory, removeItem, type FileSystemItem, verifyPermission } from "./file-system"
import { getCategories, addCategory, saveCategories, updateCategory, removeCategory, type Category, saveFileMetadata, getFileMetadata, type FileMetadata } from "./metadata"
import { Storage } from "@plasmohq/storage"
import { get } from "idb-keyval"
import React from "react"

const storage = new Storage()
const ROOT_HANDLE_KEY = "root-directory-handle"

export const FileVault = ({ isSidePanel = false }: { isSidePanel?: boolean }) => {
  const [rootHandle, setRootHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [files, setFiles] = useState<FileSystemItem[]>([])
  const [fileMetadata, setFileMetadata] = useState<Record<string, FileMetadata>>({})
  const [loading, setLoading] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [viewMode, setViewMode] = useState<string>("sidepanel")
  const [permissionRequired, setPermissionRequired] = useState(false)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [baseRootPath, setBaseRootPath] = useState<string>("")

  const syncPhysicalFolders = useCallback(async (handle: FileSystemDirectoryHandle, currentCats: Category[]) => {
    try {
      const updatedCats = [...currentCats]
      let updated = false
      const scanRecursive = async (dirHandle: FileSystemDirectoryHandle, currentPath = "", depth = 0) => {
        if (depth > 5) return
        const contents = await listDirectoryContents(dirHandle)
        const dirs = contents.filter(item => item.kind === "directory")
        for (const dir of dirs) {
          const relPath = currentPath ? `${currentPath}/${dir.name}` : dir.name
          const exists = updatedCats.find(c => c.path === relPath)
          if (!exists) {
            updatedCats.push({
              id: Math.random().toString(36).substr(2, 9),
              name: dir.name.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
              path: relPath
            })
            updated = true
          }
          await scanRecursive(dir.handle as FileSystemDirectoryHandle, relPath, depth + 1)
        }
      }
      await scanRecursive(handle)
      if (updated) {
        await saveCategories(updatedCats)
        setCategories(updatedCats)
        return updatedCats
      }
    } catch (error) {
      console.error("[SYNC] Sync error:", error)
    }
    return currentCats
  }, [])

  const init = useCallback(async () => {
    setLoading(false) // Start with loading false if we have nothing to do
    setLoading(true)
    try {
      const mode = await storage.get("view-mode")
      if (mode) setViewMode(mode as string)
      const rootPath = await storage.get("base-root-path")
      if (rootPath) setBaseRootPath(rootPath as string)
      const meta = await getFileMetadata()
      setFileMetadata(meta)
      const handle = await getStoredRootDirectory()
      if (handle) {
        setRootHandle(handle)
        setPermissionRequired(false)
        let cats = await getCategories()
        cats = await syncPhysicalFolders(handle, cats)
        setCategories(cats)
        if (cats.length > 0 && !selectedCategory) setSelectedCategory(cats[0])
      } else {
        const storedHandle = await get<FileSystemDirectoryHandle>(ROOT_HANDLE_KEY)
        if (storedHandle) setPermissionRequired(true)
      }
    } catch (err) {
      console.error("[INIT] Init error:", err)
    } finally {
      setLoading(false)
    }
  }, [selectedCategory, syncPhysicalFolders])

  useEffect(() => { init() }, [])

  const handleVerifyPermission = async () => {
    const storedHandle = await get<FileSystemDirectoryHandle>(ROOT_HANDLE_KEY)
    if (storedHandle) {
      const granted = await verifyPermission(storedHandle)
      if (granted) {
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

  const handleToggleVersionMode = async () => {
    if (!selectedCategory) return
    const newState = !selectedCategory.isVersioned
    await updateCategory(selectedCategory.id, { isVersioned: newState })
    const updatedCats = await getCategories()
    setCategories(updatedCats)
    setSelectedCategory({ ...selectedCategory, isVersioned: newState })
  }

  const handleToggleAutoRename = async () => {
    if (!selectedCategory) return
    const newState = !selectedCategory.autoRename
    await updateCategory(selectedCategory.id, { autoRename: newState })
    const updatedCats = await getCategories()
    setCategories(updatedCats)
    setSelectedCategory({ ...selectedCategory, autoRename: newState })
  }

  const handleSetRootPath = async () => {
    const path = prompt("Enter the absolute path to your storage root (e.g., /Users/name/Vault):", baseRootPath)
    if (path !== null) {
      const cleanPath = path.trim().replace(/\/$/, "")
      await storage.set("base-root-path", cleanPath)
      setBaseRootPath(cleanPath)
    }
  }

  const handleCopyPath = (relPath: string) => {
    if (!baseRootPath) {
      alert("Please set the 'Path' first in the top header.")
      handleSetRootPath()
      return
    }
    const fullPath = `${baseRootPath}/${relPath}`.replace(/\/+/g, "/")
    navigator.clipboard.writeText(fullPath)
  }

  const handleSelectRoot = async () => {
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
    try {
      const catHandle = await getOrCreateSubdirectory(rootHandle, category.path)
      const contents = await listDirectoryContents(catHandle)
      const sorted = contents
        .filter(f => f.kind === "file")
        .sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0))
      setFiles(sorted)
    } catch (error) {
      console.error("[UI] Error loading files:", error)
    }
  }, [rootHandle])

  useEffect(() => {
    if (rootHandle && selectedCategory) { loadFiles(selectedCategory) }
  }, [rootHandle, selectedCategory, loadFiles])

  const handleAddCategory = async () => {
    const name = prompt("Category name:")
    if (name) {
      const pathPrefix = selectedCategory ? `${selectedCategory.path}/` : ""
      const fullPath = `${pathPrefix}${name.toLowerCase().replace(/\s+/g, "-")}`
      const newCat: Category = { id: Date.now().toString(), name, path: fullPath }
      await addCategory(newCat)
      setCategories([...categories, newCat])
      setSelectedCategory(newCat)
      if (rootHandle) await getOrCreateSubdirectory(rootHandle, fullPath)
    }
  }

  const handleDeleteCategory = async (category: Category, e: React.MouseEvent) => {
    e.stopPropagation()
    const warning = `Warning: Deleting the folder "${category.name}" will permanently delete it and all its contents from your computer. Proceed?`
    if (confirm(warning)) {
      try {
        if (rootHandle) {
          const parts = category.path.split('/')
          const parentPath = parts.slice(0, -1).join('/')
          const folderName = parts[parts.length - 1]
          const parentHandle = parentPath ? await getOrCreateSubdirectory(rootHandle, parentPath) : rootHandle
          await removeItem(parentHandle, folderName)
        }
        await removeCategory(category.id)
        const updatedCats = await getCategories()
        setCategories(updatedCats)
        if (selectedCategory?.path.startsWith(category.path)) {
          setSelectedCategory(null)
        }
      } catch (err) {
        console.error("[UI] Physical delete error:", err)
        alert("Could not delete the physical folder. It may be in use.")
      }
    }
  }

  const handleAddNote = async (fileName: string) => {
    if (!selectedCategory) return
    const key = `${selectedCategory.path}/${fileName}`
    const note = prompt("Add note for this version:", fileMetadata[key]?.notes || "")
    if (note !== null) {
      await saveFileMetadata(fileName, selectedCategory.path, note)
      const meta = await getFileMetadata()
      setFileMetadata(meta)
    }
  }

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (!selectedCategory || !rootHandle) return
    const droppedFiles = Array.from(e.dataTransfer.files)
    if (droppedFiles.length === 0) return
    const catHandle = await getOrCreateSubdirectory(rootHandle, selectedCategory.path)
    const existingItems = await listDirectoryContents(catHandle)
    let versionCount = existingItems.filter(i => i.kind === "file").length
    for (const file of droppedFiles) {
        let finalFileName = file.name
        if (selectedCategory.autoRename) {
            versionCount++
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
            const pathPart = selectedCategory.path.replace(/\//g, '-')
            const ext = file.name.split('.').pop()
            const originalName = file.name.substring(0, file.name.lastIndexOf('.')).replace(/\s+/g, '-')
            finalFileName = `${pathPart}-${originalName}-v${versionCount}-${dateStr}.${ext}`
        }
        await saveFileToDirectory(catHandle, file, finalFileName)
        await saveFileMetadata(finalFileName, selectedCategory.path, "")
    }
    loadFiles(selectedCategory)
  }, [rootHandle, selectedCategory, loadFiles])

  const handleDeleteFile = async (fileName: string) => {
    if (!selectedCategory || !rootHandle) return
    if (confirm(`Permanently delete ${fileName}?`)) {
      try {
        const catHandle = await getOrCreateSubdirectory(rootHandle, selectedCategory.path)
        await removeItem(catHandle, fileName)
        loadFiles(selectedCategory)
      } catch (err) { 
        console.error("[UI] Delete error", err)
        alert("Could not delete the file. It may be in use.")
      }
    }
  }

  const toggleExpand = (path: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const next = new Set(expandedPaths)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setExpandedPaths(next)
  }

  const categoryTree = useMemo(() => {
    const tree: any[] = []
    const sorted = [...categories].sort((a, b) => a.path.split('/').length - b.path.split('/').length)
    const nodes: Record<string, any> = {}
    sorted.forEach(cat => {
      const parts = cat.path.split('/')
      const parentPath = parts.slice(0, -1).join('/')
      const node = { ...cat, children: [] }
      nodes[cat.path] = node
      if (parentPath && nodes[parentPath]) nodes[parentPath].children.push(node)
      else tree.push(node)
    })
    return tree
  }, [categories])

  const renderTree = (nodes: any[], depth = 0) => {
    return nodes.map(node => {
      const isExpanded = expandedPaths.has(node.path)
      const isSelected = selectedCategory?.path === node.path
      const hasChildren = node.children.length > 0
      return (
        <div key={node.path} className="plasmo-flex plasmo-flex-col">
          <div 
            onClick={() => setSelectedCategory(node)} 
            className={`plasmo-flex plasmo-items-center plasmo-py-1.5 plasmo-px-3 plasmo-cursor-pointer plasmo-transition-colors plasmo-group ${isSelected ? 'plasmo-bg-slate-100 plasmo-text-slate-900' : 'plasmo-text-slate-500 hover:plasmo-bg-slate-50'}`} 
            style={{ paddingLeft: `${depth * 12 + 12}px` }}
          >
            <div 
              onClick={(e) => toggleExpand(node.path, e)} 
              className={`plasmo-w-4 plasmo-h-4 plasmo-flex plasmo-items-center plasmo-justify-center plasmo-mr-1 ${!hasChildren && 'plasmo-invisible'}`}
            >
              <svg className={`plasmo-w-2.5 plasmo-h-2.5 plasmo-transition-transform ${isExpanded ? 'plasmo-rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <svg className={`plasmo-w-4 plasmo-h-4 plasmo-mr-2 plasmo-shrink-0 ${isSelected ? 'plasmo-text-slate-600' : 'plasmo-text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span className="plasmo-text-[12px] plasmo-font-normal plasmo-truncate plasmo-flex-1">{node.name}</span>
            <div className="plasmo-flex plasmo-opacity-0 group-hover:plasmo-opacity-100 plasmo-transition-all">
                <button 
                  onClick={(e) => { e.stopPropagation(); handleCopyPath(node.path); }}
                  className="plasmo-p-1 plasmo-text-slate-300 hover:plasmo-text-slate-600 plasmo-mr-0.5"
                  title="Copy Absolute Path"
                >
                   <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
                <button 
                  onClick={(e) => handleDeleteCategory(node, e)}
                  className="plasmo-opacity-0 group-hover:plasmo-opacity-100 plasmo-p-1 plasmo-text-slate-300 hover:plasmo-text-red-400 plasmo-transition-all"
                >
                   <TrashIcon size={10} />
                </button>
            </div>
          </div>
          {isExpanded && hasChildren && renderTree(node.children, depth + 1)}
        </div>
      )
    })
  }

  if (loading) return (
    <div className="plasmo-h-full plasmo-w-full plasmo-flex plasmo-items-center plasmo-justify-center plasmo-bg-white">
      <div className="plasmo-flex plasmo-flex-col plasmo-items-center">
        <CapsuleLogo className="plasmo-w-8 plasmo-h-8 plasmo-text-slate-200 plasmo-animate-pulse" />
        <span className="plasmo-mt-3 plasmo-text-slate-400 plasmo-text-[10px] plasmo-uppercase plasmo-tracking-widest">Loading</span>
      </div>
    </div>
  )

  if (!rootHandle) return (
    <div className="plasmo-h-full plasmo-w-full plasmo-flex plasmo-flex-col plasmo-items-center plasmo-justify-center plasmo-bg-white plasmo-p-12">
        <div className="plasmo-p-6 plasmo-rounded-full plasmo-bg-slate-50 plasmo-mb-8">
            <CapsuleLogo className="plasmo-w-12 plasmo-h-12 plasmo-text-slate-300" />
        </div>
        <h2 className="plasmo-text-slate-900 plasmo-font-semibold plasmo-text-lg plasmo-mb-2">Initialize Your Vault</h2>
        <p className="plasmo-text-slate-500 plasmo-text-sm plasmo-text-center plasmo-max-w-[280px] plasmo-mb-8">Select a local directory to securely store and manage your project files.</p>
        <button 
            onClick={handleSelectRoot} 
            className="plasmo-bg-white plasmo-text-slate-900 plasmo-border plasmo-border-slate-200 plasmo-px-6 plasmo-py-2.5 plasmo-rounded-lg plasmo-text-sm plasmo-font-medium hover:plasmo-bg-slate-50 hover:plasmo-border-slate-300 plasmo-transition-all"
        >
            Select Storage Folder
        </button>
    </div>
  )

  const breadcrumbs = selectedCategory?.path.split('/') || []

  return (
    <div className="plasmo-flex plasmo-flex-col plasmo-bg-white plasmo-overflow-hidden" style={isSidePanel ? { height: '100vh', width: '100%' } : { height: '600px', width: '800px' }}>
      {/* Clean Minimalism Header */}
      <div className="plasmo-px-5 plasmo-py-3.5 plasmo-bg-white plasmo-border-b plasmo-border-slate-100 plasmo-flex plasmo-justify-between plasmo-items-center plasmo-shrink-0">
        <div className="plasmo-flex plasmo-items-center plasmo-space-x-5">
            <div className="plasmo-flex plasmo-items-center plasmo-space-x-2.5">
                <CapsuleLogo className="plasmo-w-5 plasmo-h-5 plasmo-text-slate-800" />
                <span className="plasmo-text-slate-900 plasmo-font-semibold plasmo-tracking-tight plasmo-text-[15px]">Capsule</span>
            </div>
            <div className="plasmo-h-4 plasmo-w-[1px] plasmo-bg-slate-200"></div>
            <div className="plasmo-flex plasmo-space-x-1">
                <button 
                  onClick={handleToggleViewMode} 
                  className="plasmo-text-[10px] plasmo-text-slate-400 plasmo-px-2.5 plasmo-py-1 plasmo-rounded-md hover:plasmo-bg-slate-50 hover:plasmo-text-slate-600 plasmo-uppercase plasmo-tracking-wider plasmo-transition-colors"
                >
                  {viewMode}
                </button>
                <button 
                  onClick={() => syncPhysicalFolders(rootHandle!, categories)} 
                  className="plasmo-text-[10px] plasmo-text-slate-400 plasmo-px-2.5 plasmo-py-1 plasmo-rounded-md hover:plasmo-bg-slate-50 hover:plasmo-text-slate-600 plasmo-uppercase plasmo-tracking-wider plasmo-transition-colors"
                >
                  Sync
                </button>
                <button 
                  onClick={handleSetRootPath} 
                  className={`plasmo-text-[10px] plasmo-px-2.5 plasmo-py-1 plasmo-rounded-md plasmo-uppercase plasmo-tracking-wider plasmo-transition-colors ${baseRootPath ? 'plasmo-text-slate-600 plasmo-bg-slate-50' : 'plasmo-text-slate-400 hover:plasmo-bg-slate-50 hover:plasmo-text-slate-600'}`}
                >
                  {baseRootPath ? 'Path Set' : 'Set Path'}
                </button>
            </div>
        </div>
        <div className="plasmo-flex plasmo-items-center plasmo-space-x-3">
            {selectedCategory && (
                <div className="plasmo-flex plasmo-bg-slate-50 plasmo-p-0.5 plasmo-rounded-lg plasmo-border plasmo-border-slate-100">
                    <button 
                      onClick={handleToggleAutoRename} 
                      className={`plasmo-text-[9px] plasmo-px-2.5 plasmo-py-1 plasmo-rounded-md plasmo-font-semibold plasmo-uppercase plasmo-tracking-wider plasmo-transition-all ${selectedCategory.autoRename ? 'plasmo-bg-white plasmo-shadow-sm plasmo-text-slate-900' : 'plasmo-text-slate-400 hover:plasmo-text-slate-600'}`}
                    >
                      Rename
                    </button>
                    <button 
                      onClick={handleToggleVersionMode} 
                      className={`plasmo-text-[9px] plasmo-px-2.5 plasmo-py-1 plasmo-rounded-md plasmo-font-semibold plasmo-uppercase plasmo-tracking-wider plasmo-transition-all ${selectedCategory.isVersioned ? 'plasmo-bg-white plasmo-shadow-sm plasmo-text-slate-900' : 'plasmo-text-slate-400 hover:plasmo-text-slate-600'}`}
                    >
                      Version
                    </button>
                </div>
            )}
            <button 
              onClick={handleAddCategory} 
              className="plasmo-bg-white plasmo-text-slate-900 plasmo-border plasmo-border-slate-200 plasmo-px-3.5 plasmo-py-1.5 plasmo-rounded-lg plasmo-font-medium plasmo-text-[11px] hover:plasmo-bg-slate-50 hover:plasmo-border-slate-300 plasmo-transition-all"
            >
              + New Folder
            </button>
        </div>
      </div>

      <div className="plasmo-flex plasmo-flex-1 plasmo-overflow-hidden">
        {/* Minimal Sidebar */}
        <div className="plasmo-w-[220px] plasmo-bg-slate-50/50 plasmo-border-r plasmo-border-slate-100 plasmo-overflow-y-auto plasmo-shrink-0 plasmo-py-4">
            <div className="plasmo-px-4 plasmo-mb-4">
                <span className="plasmo-text-[10px] plasmo-font-bold plasmo-text-slate-400 plasmo-uppercase plasmo-tracking-widest">Workspace</span>
            </div>
            {renderTree(categoryTree)}
            {categories.length === 0 && (
                <div className="plasmo-px-4 plasmo-py-2">
                    <div className="plasmo-rounded-lg plasmo-border plasmo-border-dashed plasmo-border-slate-200 plasmo-p-4 plasmo-text-center">
                        <p className="plasmo-text-[11px] plasmo-text-slate-400">No folders yet.</p>
                    </div>
                </div>
            )}
        </div>

        {/* Workspace */}
        <div 
          className={`plasmo-flex-1 plasmo-flex plasmo-flex-col plasmo-relative plasmo-transition-colors ${isDragging ? 'plasmo-bg-slate-50' : 'plasmo-bg-white'}`} 
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} 
          onDragLeave={() => setIsDragging(false)} 
          onDrop={handleDrop}
        >
          <div className="plasmo-px-6 plasmo-py-3.5 plasmo-bg-white plasmo-border-b plasmo-border-slate-50 plasmo-flex plasmo-items-center plasmo-justify-between">
            <div className="plasmo-flex plasmo-items-center plasmo-space-x-1.5">
                <span className="plasmo-text-[11px] plasmo-font-medium plasmo-text-slate-400 plasmo-cursor-pointer hover:plasmo-text-slate-900" onClick={() => setSelectedCategory(null)}>Vault</span>
                {breadcrumbs.map((crumb, i) => (
                    <React.Fragment key={i}>
                        <svg className="plasmo-w-3 plasmo-h-3 plasmo-text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        <span 
                          className={`plasmo-text-[11px] ${i === breadcrumbs.length - 1 ? 'plasmo-font-semibold plasmo-text-slate-900' : 'plasmo-text-slate-400 plasmo-cursor-pointer hover:plasmo-text-slate-900'}`} 
                          onClick={() => setSelectedCategory(categories.find(c => c.path === breadcrumbs.slice(0, i+1).join('/')) || null)}
                        >
                          {crumb}
                        </span>
                    </React.Fragment>
                ))}
            </div>
            {selectedCategory && (
                <div className="plasmo-flex plasmo-items-center plasmo-space-x-3">
                    <span className="plasmo-text-[10px] plasmo-text-slate-400 plasmo-font-medium plasmo-uppercase plasmo-tracking-wider">{files.length} Items</span>
                </div>
            )}
          </div>

          <div className="plasmo-flex-1 plasmo-overflow-y-auto plasmo-p-8">
            {!selectedCategory ? (
                <div className="plasmo-h-full plasmo-flex plasmo-flex-col plasmo-items-center plasmo-justify-center">
                    <div className="plasmo-p-8 plasmo-rounded-3xl plasmo-bg-slate-50/50 plasmo-mb-6">
                        <CapsuleLogo className="plasmo-w-16 plasmo-h-16 plasmo-text-slate-200" />
                    </div>
                    <p className="plasmo-text-[11px] plasmo-font-semibold plasmo-text-slate-400 plasmo-uppercase plasmo-tracking-[0.2em]">Select a Workspace</p>
                </div>
            ) : (
                <div className={selectedCategory.isVersioned ? "plasmo-flex plasmo-flex-wrap plasmo-gap-y-8 plasmo-items-start" : "plasmo-grid plasmo-grid-cols-4 sm:plasmo-grid-cols-5 md:plasmo-grid-cols-6 plasmo-gap-x-4 plasmo-gap-y-8"}>
                    {files.map((file, index) => {
                        const note = fileMetadata[`${selectedCategory.path}/${file.name}`]?.notes;
                        const isLatest = index === 0 && selectedCategory.isVersioned;
                        return (
                            <React.Fragment key={file.name}>
                                <div className={`plasmo-relative plasmo-group ${selectedCategory.isVersioned ? 'plasmo-w-32' : ''}`}>
                                    <div className={`plasmo-flex plasmo-flex-col plasmo-items-center plasmo-p-3 plasmo-rounded-xl plasmo-transition-all ${isLatest ? 'plasmo-bg-slate-50' : 'hover:plasmo-bg-slate-50/80'}`}>
                                        <div className="plasmo-w-14 plasmo-h-14 plasmo-rounded-xl plasmo-flex plasmo-items-center plasmo-justify-center plasmo-mb-3 plasmo-bg-white plasmo-border plasmo-border-slate-100 plasmo-shadow-sm group-hover:plasmo-border-slate-200 plasmo-transition-all">
                                            <FileIcon name={file.name} size="lg" />
                                        </div>
                                        <p className="plasmo-text-[11px] plasmo-font-medium plasmo-text-slate-700 plasmo-text-center plasmo-w-full plasmo-truncate plasmo-px-1" title={file.name}>
                                            {file.name}
                                        </p>
                                        
                                        {/* Minimal Action Overlay */}
                                        <div className="plasmo-absolute plasmo-top-1 plasmo-right-1 plasmo-flex plasmo-flex-col plasmo-space-y-1 plasmo-opacity-0 group-hover:plasmo-opacity-100 plasmo-transition-opacity">
                                            <button 
                                              onClick={() => handleAddNote(file.name)} 
                                              className="plasmo-p-1.5 plasmo-bg-white plasmo-rounded-md plasmo-shadow-sm plasmo-border plasmo-border-slate-100 plasmo-text-slate-400 hover:plasmo-text-slate-900 plasmo-transition-colors"
                                            >
                                              <svg className="plasmo-w-3 plasmo-h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002 2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                              </svg>
                                            </button>
                                            <button 
                                              onClick={() => handleDeleteFile(file.name)} 
                                              className="plasmo-p-1.5 plasmo-bg-white plasmo-rounded-md plasmo-shadow-sm plasmo-border plasmo-border-slate-100 plasmo-text-slate-400 hover:plasmo-text-red-500 plasmo-transition-colors"
                                            >
                                              <TrashIcon size={12} />
                                            </button>
                                        </div>

                                        {note && (
                                            <div className="plasmo-absolute plasmo-top-2 plasmo-left-2">
                                                <div className="plasmo-relative plasmo-group/note">
                                                    <div className="plasmo-w-2 plasmo-h-2 plasmo-bg-slate-400 plasmo-rounded-full plasmo-ring-2 plasmo-ring-white"></div>
                                                    {/* Minimal Tooltip */}
                                                    <div className="plasmo-absolute plasmo-left-4 plasmo-top-0 plasmo-bg-white plasmo-text-slate-600 plasmo-text-[10px] plasmo-p-2.5 plasmo-rounded-lg plasmo-shadow-xl plasmo-w-40 plasmo-opacity-0 group-hover/note:plasmo-opacity-100 plasmo-transition-opacity plasmo-pointer-events-none plasmo-border plasmo-border-slate-100 plasmo-z-10">
                                                        {note}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {isLatest && (
                                            <div className="plasmo-mt-1.5">
                                                <span className="plasmo-text-[8px] plasmo-bg-slate-100 plasmo-text-slate-600 plasmo-px-1.5 plasmo-py-0.5 plasmo-rounded-md plasmo-font-bold plasmo-uppercase plasmo-tracking-tighter">Latest</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {selectedCategory.isVersioned && index < files.length - 1 && (
                                    <div className="plasmo-flex plasmo-items-center plasmo-justify-center plasmo-w-8 plasmo-h-14 plasmo-mt-3">
                                        <svg className="plasmo-w-4 plasmo-h-4 plasmo-text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                        </svg>
                                    </div>
                                )}
                            </React.Fragment>
                        )
                    })}
                </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Drop Indicator */}
      {isDragging && (
          <div className="plasmo-absolute plasmo-inset-0 plasmo-bg-white/80 plasmo-backdrop-blur-[2px] plasmo-z-50 plasmo-flex plasmo-items-center plasmo-justify-center">
              <div className="plasmo-p-12 plasmo-rounded-3xl plasmo-border-2 plasmo-border-dashed plasmo-border-slate-200 plasmo-flex plasmo-flex-col plasmo-items-center">
                  <svg className="plasmo-w-12 plasmo-h-12 plasmo-text-slate-400 plasmo-mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="plasmo-text-slate-900 plasmo-font-semibold">Drop files to add to {selectedCategory?.name}</p>
              </div>
          </div>
      )}
    </div>
  )
}

const CapsuleLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M50 20L20 40V60L50 80L80 60V40L50 20Z" />
    <circle cx="50" cy="50" r="10" strokeWidth="4" />
  </svg>
)

const FileIcon = ({ name, size = "sm" }: { name: string, size?: "sm" | "lg" }) => {
  const ext = name.split('.').pop()?.toLowerCase()
  
  const getIconConfig = (extension: string) => {
    switch (extension) {
      case 'pdf': return { color: 'plasmo-text-red-500', bg: 'plasmo-bg-red-50', label: 'PDF' }
      case 'doc':
      case 'docx': return { color: 'plasmo-text-blue-600', bg: 'plasmo-bg-blue-50', label: 'DOC' }
      case 'xls':
      case 'xlsx':
      case 'csv': return { color: 'plasmo-text-emerald-600', bg: 'plasmo-bg-emerald-50', label: 'XLS' }
      case 'ppt':
      case 'pptx': return { color: 'plasmo-text-orange-600', bg: 'plasmo-bg-orange-50', label: 'PPT' }
      case 'zip':
      case 'rar':
      case '7z': return { color: 'plasmo-text-amber-600', bg: 'plasmo-bg-amber-50', label: 'ZIP' }
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'webp': return { color: 'plasmo-text-purple-600', bg: 'plasmo-bg-purple-50', label: 'IMG' }
      case 'svg': return { color: 'plasmo-text-pink-500', bg: 'plasmo-bg-pink-50', label: 'SVG' }
      case 'ts':
      case 'tsx': return { color: 'plasmo-text-blue-500', bg: 'plasmo-bg-blue-50', label: 'TS' }
      case 'js':
      case 'jsx': return { color: 'plasmo-text-yellow-600', bg: 'plasmo-bg-yellow-50', label: 'JS' }
      case 'json': return { color: 'plasmo-text-orange-500', bg: 'plasmo-bg-orange-50', label: 'JSON' }
      case 'md':
      case 'txt': return { color: 'plasmo-text-slate-600', bg: 'plasmo-bg-slate-50', label: 'TXT' }
      default: return { color: 'plasmo-text-slate-400', bg: 'plasmo-bg-slate-50', label: extension?.toUpperCase() || 'FILE' }
    }
  }

  const config = getIconConfig(ext || '')
  
  return (
    <div className={`plasmo-relative plasmo-flex plasmo-items-center plasmo-justify-center ${size === 'lg' ? 'plasmo-w-10 plasmo-h-10' : 'plasmo-w-8 plasmo-h-8'}`}>
        <svg className={`plasmo-w-full plasmo-h-full ${config.color}`} viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 2c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8l-6-6H7z" opacity="0.15" />
            <path d="M13 9V3.5L18.5 9H13z" opacity="0.25" />
            <path fillRule="evenodd" clipRule="evenodd" d="M7 2C5.89543 2 5 2.89543 5 4V20C5 21.1046 5.89543 22 7 22H17C18.1046 22 19 21.1046 19 20V8L13 2H7ZM13 3.5V9H18.5L13 3.5ZM7 4H12V10H18V20H7V4Z" />
        </svg>
        <span className={`plasmo-absolute plasmo-bottom-1 plasmo-font-black plasmo-tracking-tighter ${size === 'lg' ? 'plasmo-text-[8px]' : 'plasmo-text-[6px]'} ${config.color} plasmo-opacity-80`}>
            {config.label}
        </span>
    </div>
  )
}

const TrashIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
)
