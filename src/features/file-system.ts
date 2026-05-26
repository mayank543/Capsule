import { get, set } from "idb-keyval"

const ROOT_HANDLE_KEY = "root-directory-handle"

export interface FileSystemItem {
  name: string
  kind: "file" | "directory"
  handle: FileSystemHandle
  lastModified?: number
}

export async function pickRootDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    console.log("[FSA] Opening directory picker...")
    const handle = await (window as any).showDirectoryPicker({
      mode: "readwrite"
    })
    console.log("[FSA] Directory handle obtained:", handle.name)
    await set(ROOT_HANDLE_KEY, handle)
    console.log("[FSA] Handle saved to IndexedDB")
    return handle
  } catch (error) {
    console.error("[FSA] Error picking directory:", error)
    return null
  }
}

export async function getStoredRootDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    console.log("[FSA] Attempting to retrieve stored handle...")
    const handle = await get<FileSystemDirectoryHandle>(ROOT_HANDLE_KEY)
    if (!handle) {
      console.log("[FSA] No handle found in storage.")
      return null
    }

    console.log("[FSA] Handle found:", handle.name, ". Verifying permission...")
    const permission = await verifyPermission(handle)
    console.log("[FSA] Permission granted:", permission)
    if (!permission) return null

    return handle
  } catch (error) {
    console.error("[FSA] Error retrieving stored directory:", error)
    return null
  }
}

export async function verifyPermission(
  handle: FileSystemHandle,
  readWrite: boolean = true
): Promise<boolean> {
  const options: any = {}
  if (readWrite) {
    options.mode = "readwrite"
  }

  try {
    const currentStatus = await (handle as any).queryPermission(options)
    console.log("[FSA] Current status:", currentStatus)
    if (currentStatus === "granted") return true

    console.log("[FSA] Requesting fresh permission...")
    const requestStatus = await (handle as any).requestPermission(options)
    console.log("[FSA] Request status:", requestStatus)
    return requestStatus === "granted"
  } catch (error) {
    console.error("[FSA] Error verifying permission:", error)
    return false
  }
}

export async function listDirectoryContents(
  directoryHandle: FileSystemDirectoryHandle
): Promise<FileSystemItem[]> {
  const items: FileSystemItem[] = []
  try {
    console.log("[FSA] Listing contents for:", directoryHandle.name)
    const iterator = (directoryHandle as any).values()
    
    for await (const entry of iterator) {
      let lastModified: number | undefined
      if (entry.kind === "file") {
        try {
          const file = await (entry as FileSystemFileHandle).getFile()
          lastModified = file.lastModified
        } catch (e) {
          console.warn("[FSA] Could not get date for", entry.name)
        }
      }
      
      items.push({
        name: entry.name,
        kind: entry.kind,
        handle: entry,
        lastModified
      })
    }
  } catch (error) {
    console.error("[FSA] CRITICAL Error listing contents:", error)
  }
  return items
}

/**
 * Gets or creates a deep subdirectory path sequentially.
 * Supports "folder/subfolder/leaf"
 */
export async function getOrCreateSubdirectory(
  parentHandle: FileSystemDirectoryHandle,
  path: string
): Promise<FileSystemDirectoryHandle> {
  console.log(`[FSA] Getting/Creating path: ${path}`)
  const parts = path.split("/").filter(Boolean)
  let currentHandle = parentHandle
  for (const part of parts) {
    currentHandle = await currentHandle.getDirectoryHandle(part, { create: true })
  }
  return currentHandle
}

export async function saveFileToDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  file: File,
  customName?: string
): Promise<FileSystemFileHandle> {
  const name = customName || file.name
  console.log(`[FSA] Saving file: ${name} to ${directoryHandle.name}`)
  const fileHandle = await directoryHandle.getFileHandle(name, { create: true })
  const writable = await (fileHandle as any).createWritable()
  await writable.write(file)
  await writable.close()
  return fileHandle
}

export async function removeItem(
  parentHandle: FileSystemDirectoryHandle,
  name: string
): Promise<void> {
  console.log(`[FSA] Removing entry: ${name} from ${parentHandle.name}`)
  await (parentHandle as any).removeEntry(name, { recursive: true })
}
