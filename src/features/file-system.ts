import { get, set } from "idb-keyval"

const ROOT_HANDLE_KEY = "root-directory-handle"

export interface FileSystemItem {
  name: string
  kind: "file" | "directory"
  handle: FileSystemHandle
}

export async function pickRootDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    console.log("Opening directory picker...")
    const handle = await (window as any).showDirectoryPicker({
      mode: "readwrite"
    })
    console.log("Directory handle obtained:", handle.name)
    await set(ROOT_HANDLE_KEY, handle)
    return handle
  } catch (error) {
    console.error("Error picking directory:", error)
    if (error instanceof Error) {
      console.error("Error message:", error.message)
      console.error("Error name:", error.name)
    }
    return null
  }
}

export async function getStoredRootDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await get<FileSystemDirectoryHandle>(ROOT_HANDLE_KEY)
    if (!handle) {
      console.log("No stored root handle found.")
      return null
    }

    console.log("Stored handle found, verifying permission...")
    const permission = await verifyPermission(handle)
    if (!permission) {
      console.log("Permission denied for stored handle.")
      return null
    }

    return handle
  } catch (error) {
    console.error("Error retrieving stored directory:", error)
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
    console.log("Current permission status:", currentStatus)
    
    if (currentStatus === "granted") {
      return true
    }

    console.log("Requesting permission...")
    const requestStatus = await (handle as any).requestPermission(options)
    console.log("Requested permission status:", requestStatus)
    
    return requestStatus === "granted"
  } catch (error) {
    console.error("Error verifying permission:", error)
    return false
  }
}

export async function listDirectoryContents(
  directoryHandle: FileSystemDirectoryHandle
): Promise<FileSystemItem[]> {
  const items: FileSystemItem[] = []
  // @ts-ignore
  for await (const entry of directoryHandle.values()) {
    items.push({
      name: entry.name,
      kind: entry.kind,
      handle: entry
    })
  }
  return items
}

export async function getOrCreateSubdirectory(
  parentHandle: FileSystemDirectoryHandle,
  name: string
): Promise<FileSystemDirectoryHandle> {
  return await parentHandle.getDirectoryHandle(name, { create: true })
}

export async function saveFileToDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  file: File
): Promise<FileSystemFileHandle> {
  const fileHandle = await directoryHandle.getFileHandle(file.name, { create: true })
  const writable = await (fileHandle as any).createWritable()
  await writable.write(file)
  await writable.close()
  return fileHandle
}

export async function removeItem(
  parentHandle: FileSystemDirectoryHandle,
  name: string
): Promise<void> {
  await (parentHandle as any).removeEntry(name, { recursive: true })
}
