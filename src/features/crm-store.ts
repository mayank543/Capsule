import { Storage } from "@plasmohq/storage"

const storage = new Storage()

export type SuccessChance = "Low" | "Medium" | "High"

export interface CandidateRecord {
  id: string
  companyName: string
  companyUrl?: string
  jobDescription: string
  successChance: SuccessChance
  referralDone: boolean
  followUpDates: string[] // ISO strings: YYYY-MM-DD
  notes?: string
  lastUpdated: number
  status: "applied" | "interviewing" | "offered" | "rejected"
  dateApplied?: string // ISO string: YYYY-MM-DD
  pointOfContact?: string
}

const CRM_RECORDS_KEY = "candidate-crm-records"
const GEMINI_API_KEY = "gemini-api-key"
const VISIBLE_COLUMNS_KEY = "crm-visible-columns"

export type CRMColumn = "company" | "chances" | "status" | "dateApplied" | "pointOfContact" | "referralDone" | "jobDescription" | "actions"

export const DEFAULT_COLUMNS: CRMColumn[] = ["company", "chances", "status", "actions"]

export async function getVisibleColumns(): Promise<CRMColumn[]> {
  const cols = await storage.get<CRMColumn[]>(VISIBLE_COLUMNS_KEY)
  return cols || DEFAULT_COLUMNS
}

export async function saveVisibleColumns(cols: CRMColumn[]): Promise<void> {
  await storage.set(VISIBLE_COLUMNS_KEY, cols)
}

export async function getGeminiKey(): Promise<string> {
  return await storage.get(GEMINI_API_KEY) || ""
}

export async function saveGeminiKey(key: string): Promise<void> {
  await storage.set(GEMINI_API_KEY, key)
}

export async function getCandidateRecords(): Promise<CandidateRecord[]> {
  const records = await storage.get<CandidateRecord[]>(CRM_RECORDS_KEY)
  return records || []
}

export async function saveCandidateRecords(records: CandidateRecord[]): Promise<void> {
  await storage.set(CRM_RECORDS_KEY, records)
}

export async function addCandidateRecord(record: CandidateRecord): Promise<void> {
  const records = await getCandidateRecords()
  records.push(record)
  await saveCandidateRecords(records)
}

export async function updateCandidateRecord(id: string, updates: Partial<CandidateRecord>): Promise<void> {
  const records = await getCandidateRecords()
  const index = records.findIndex((r) => r.id === id)
  if (index !== -1) {
    records[index] = { ...records[index], ...updates, lastUpdated: Date.now() }
    await saveCandidateRecords(records)
  }
}

export async function deleteCandidateRecord(id: string): Promise<void> {
  const records = await getCandidateRecords()
  const filtered = records.filter((r) => r.id !== id)
  await saveCandidateRecords(filtered)
}
