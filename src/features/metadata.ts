import { Storage } from "@plasmohq/storage"

const storage = new Storage()

export interface Category {
  id: string
  name: string
  path: string
  description?: string
  parentId?: string
  isVersioned?: boolean
  autoRename?: boolean
}

export interface FileMetadata {
  fileName: string
  categoryPath: string
  notes?: string
  lastModified: number
}

const CATEGORIES_KEY = "categories"
const FILE_METADATA_KEY = "file-metadata"

export async function getCategories(): Promise<Category[]> {
  const categories = await storage.get<Category[]>(CATEGORIES_KEY)
  return categories || []
}

export async function saveCategories(categories: Category[]): Promise<void> {
  await storage.set(CATEGORIES_KEY, categories)
}

export async function addCategory(category: Category): Promise<void> {
  const categories = await getCategories()
  categories.push(category)
  await saveCategories(categories)
}

export async function updateCategory(categoryId: string, updates: Partial<Category>): Promise<void> {
  const categories = await getCategories()
  const index = categories.findIndex((c) => c.id === categoryId)
  if (index !== -1) {
    categories[index] = { ...categories[index], ...updates }
    await saveCategories(categories)
  }
}

export async function getFileMetadata(): Promise<Record<string, FileMetadata>> {
  const metadata = await storage.get<Record<string, FileMetadata>>(FILE_METADATA_KEY)
  return metadata || {}
}

export async function saveFileMetadata(
  fileName: string,
  categoryPath: string,
  notes: string
): Promise<void> {
  const allMetadata = await getFileMetadata()
  const key = `${categoryPath}/${fileName}`
  allMetadata[key] = {
    fileName,
    categoryPath,
    notes,
    lastModified: Date.now()
  }
  await storage.set(FILE_METADATA_KEY, allMetadata)
}

export async function removeCategory(categoryId: string): Promise<void> {
  const categories = await getCategories()
  const filtered = categories.filter((c) => c.id !== categoryId)
  await saveCategories(filtered)
}
