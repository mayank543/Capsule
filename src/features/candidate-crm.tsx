import React, { useState, useEffect, useMemo, useCallback } from "react"
import { getCandidateRecords, saveCandidateRecords, updateCandidateRecord, deleteCandidateRecord, getGeminiKey, saveGeminiKey, getVisibleColumns, saveVisibleColumns, type CandidateRecord, type SuccessChance, type CRMColumn } from "./crm-store"
import { processWithGemini } from "./ai-service"

interface CandidateCRMProps {
    isFullPage?: boolean
}

const ALL_COLUMNS: { id: CRMColumn, label: string }[] = [
    { id: 'company', label: 'Company' },
    { id: 'jobDescription', label: 'Description' },
    { id: 'dateApplied', label: 'Applied' },
    { id: 'pointOfContact', label: 'Contact' },
    { id: 'referralDone', label: 'Referral' },
    { id: 'followUp', label: 'Follow Up' },
    { id: 'chances', label: 'Chances' },
    { id: 'status', label: 'Status' },
    { id: 'actions', label: 'Actions' }
]

const COLUMN_WIDTHS: Record<CRMColumn, string> = {
    company: 'plasmo-w-32',
    jobDescription: 'plasmo-w-40',
    dateApplied: 'plasmo-w-24',
    pointOfContact: 'plasmo-w-24',
    referralDone: 'plasmo-w-16',
    followUp: 'plasmo-w-28',
    chances: 'plasmo-w-20',
    status: 'plasmo-w-24',
    actions: 'plasmo-w-16'
}

export const CandidateCRM = ({ isFullPage = false }: CandidateCRMProps) => {
  const [records, setRecords] = useState<CandidateRecord[]>([])
  const [inputText, setInputText] = useState("")
  const [loading, setLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [showSettings, setShowSettings] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [aiResponse, setAiResponse] = useState<{ message: string, type: 'query' | 'error' } | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [visibleColumns, setVisibleColumns] = useState<CRMColumn[]>(['company', 'followUp', 'status', 'actions'])

  // Internal Sub-Tabs to toggle between Grid, Archives, and Data Entry
  const [activeSubTab, setActiveSubTab] = useState<'grid' | 'archives' | 'add'>('grid')

  const [quickForm, setQuickForm] = useState({
    companyName: "",
    companyUrl: "",
    jobDescription: "",
    successChance: "Medium" as SuccessChance,
    referralDone: false,
    status: "applied" as CandidateRecord['status'],
    dateApplied: new Date().toISOString().split('T')[0],
    followUpTargetDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    pointOfContact: ""
  })

  useEffect(() => {
    loadRecords()
    loadApiKey()
    loadColumnPrefs()
  }, [])

  const loadRecords = async () => {
    try {
        setLoading(true)
        const stored = await getCandidateRecords()
        setRecords(stored || [])
    } catch (err) {
        console.error("Failed to load records:", err)
    } finally {
        setLoading(false)
    }
  }

  const loadApiKey = async () => {
    try {
        const key = await getGeminiKey()
        setApiKey(key)
    } catch (err) {
        console.error("Failed to load API key:", err)
    }
  }

  const loadColumnPrefs = async () => {
    const cols = await getVisibleColumns()
    setVisibleColumns(cols)
  }

  const handleSaveApiKey = async () => {
    await saveGeminiKey(apiKey)
    setShowSettings(false)
    alert("API Key saved!")
  }

  const toggleColumn = async (colId: CRMColumn) => {
    let newCols: CRMColumn[]
    if (visibleColumns.includes(colId)) {
        if (visibleColumns.length <= 1) return // Keep at least one
        newCols = visibleColumns.filter(id => id !== colId)
    } else {
        if (visibleColumns.length >= 7) {
            alert("Max 7 columns allowed!")
            return
        }
        newCols = [...visibleColumns, colId]
    }

    const sortedCols = ALL_COLUMNS.filter(c => newCols.includes(c.id)).map(c => c.id)
    setVisibleColumns(sortedCols)
    await saveVisibleColumns(sortedCols)
  }

  const handleQuickAdd = async () => {
    if (!quickForm.companyName.trim()) return
    const newRecord: CandidateRecord = {
      id: Math.random().toString(36).substr(2, 9),
      ...quickForm,
      followUpDates: [],
      followUpDone: false,
      notes: "",
      lastUpdated: Date.now()
    }
    await saveCandidateRecords([...records, newRecord])
    setQuickForm({
      companyName: "",
      companyUrl: "",
      jobDescription: "",
      successChance: "Medium",
      referralDone: false,
      status: "applied",
      dateApplied: new Date().toISOString().split('T')[0],
      followUpTargetDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      pointOfContact: ""
    })
    loadRecords()
    setActiveSubTab('grid')
  }

  const handleAIProcess = async () => {
    if (!inputText.trim()) return
    setIsProcessing(true)
    setAiResponse(null)

    try {
        const response = await processWithGemini(inputText)
        if (response.type === "update" && response.data) {
            const companyName = response.data.companyName
            const existing = records.find(r => r.companyName.toLowerCase() === companyName.toLowerCase())
            if (existing) {
                await updateCandidateRecord(existing.id, response.data)
            } else {
                const newRecord: CandidateRecord = {
                    id: Math.random().toString(36).substr(2, 9),
                    companyName: response.data.companyName || "New Opportunity",
                    companyUrl: response.data.companyUrl || "",
                    jobDescription: response.data.jobDescription || "",
                    successChance: response.data.successChance || "Medium",
                    referralDone: !!response.data.referralDone,
                    followUpDates: response.data.followUpDates || [],
                    followUpDone: false,
                    followUpTargetDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    notes: response.data.notes || "",
                    status: response.data.status || "applied",
                    dateApplied: response.data.dateApplied || new Date().toISOString().split('T')[0],
                    pointOfContact: response.data.pointOfContact || "",
                    lastUpdated: Date.now()
                }
                await saveCandidateRecords([...records, newRecord])
            }
            setInputText("")
            loadRecords()
            setActiveSubTab('grid')
        } else if (response.type === "query") {
            setAiResponse({ message: response.message || "", type: 'query' })
        } else if (response.type === "error") {
            setAiResponse({ message: response.message || "Error processing", type: 'error' })
        }
    } catch (err) {
        setAiResponse({ message: "AI Process failed.", type: 'error' })
    } finally {
        setIsProcessing(false)
    }
  }

  const filteredRecords = useMemo(() => {
    let base = records.filter(r => 
        r.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.jobDescription.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.pointOfContact && r.pointOfContact.toLowerCase().includes(searchQuery.toLowerCase()))
    )

    const sortFn = (a: CandidateRecord, b: CandidateRecord) => {
        // Primary sort: Date Applied (newest first)
        const dateA = a.dateApplied || ""
        const dateB = b.dateApplied || ""
        if (dateA !== dateB) return dateB.localeCompare(dateA)
        
        // Fallback: Stable ID sort to prevent jumping
        return b.id.localeCompare(a.id)
    }

    if (activeSubTab === 'archives') {
        return base.filter(r => r.status === 'rejected' || r.status === 'ghosted').sort(sortFn)
    } else {
        return base.filter(r => r.status !== 'rejected' && r.status !== 'ghosted').sort(sortFn)
    }
  }, [records, searchQuery, activeSubTab])

  const today = new Date().toISOString().split('T')[0]

  const getDaysBetween = (startStr?: string, endStr?: string) => {
    if (!startStr || !endStr) return null
    const start = new Date(startStr)
    const end = new Date(endStr)
    const diffTime = end.getTime() - start.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  const chanceStyles = {
    High: "plasmo-bg-emerald-50 plasmo-text-emerald-800 plasmo-border-emerald-200",
    Medium: "plasmo-bg-amber-50 plasmo-text-amber-800 plasmo-border-amber-100",
    Low: "plasmo-bg-rose-50 plasmo-text-rose-800 plasmo-border-rose-100"
  }

  const openFullTab = () => {
    const url = chrome.runtime.getURL("options.html")
    chrome.tabs.create({ url })
  }

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const renderCell = (record: CandidateRecord, colId: CRMColumn) => {
    const daysUntilFollowUp = getDaysBetween(today, record.followUpTargetDate)
    const isDue = daysUntilFollowUp !== null && daysUntilFollowUp <= 0

    switch (colId) {
        case 'company':
            return (
                <div className="plasmo-flex plasmo-items-center">
                    {isDue && record.status !== 'rejected' && record.status !== 'ghosted' && (
                        <div className="plasmo-w-2 plasmo-h-2 plasmo-bg-rose-500 plasmo-rounded-full plasmo-mr-2 plasmo-animate-pulse" title="Follow-up Required"></div>
                    )}
                    <div className="plasmo-flex plasmo-flex-col plasmo-flex-1">
                        <input className="plasmo-w-full plasmo-text-[13px] plasmo-font-semibold plasmo-text-slate-900 plasmo-bg-transparent focus:plasmo-outline-none" defaultValue={record.companyName} onBlur={(e) => updateCandidateRecord(record.id, { companyName: e.target.value }).then(loadRecords)} />
                        <div className="plasmo-flex plasmo-items-center plasmo-space-x-2 plasmo-mt-0.5">
                            {record.companyUrl && <a href={record.companyUrl.startsWith('http') ? record.companyUrl : `https://${record.companyUrl}`} target="_blank" rel="noreferrer" className="plasmo-text-[10px] plasmo-font-medium plasmo-text-blue-600 hover:plasmo-underline">Link ↗</a>}
                        </div>
                    </div>
                </div>
            )
        case 'chances':
            return (
                <select className={`plasmo-w-full plasmo-text-[10px] plasmo-px-2 plasmo-py-1 plasmo-rounded-lg plasmo-font-bold plasmo-cursor-pointer plasmo-border ${chanceStyles[record.successChance]}`} defaultValue={record.successChance} onChange={(e) => updateCandidateRecord(record.id, { successChance: e.target.value as any }).then(loadRecords)}>
                    {['Low', 'Medium', 'High'].map(c => <option key={c} value={c} className="plasmo-bg-white plasmo-text-slate-900">{c}</option>)}
                </select>
            )
        case 'status':
            return (
                <select className="plasmo-w-full plasmo-text-[11px] plasmo-bg-white plasmo-border plasmo-border-slate-300 plasmo-rounded-lg plasmo-font-semibold plasmo-cursor-pointer plasmo-text-slate-900 focus:plasmo-border-slate-500 focus:plasmo-outline-none" defaultValue={record.status} onChange={(e) => updateCandidateRecord(record.id, { status: e.target.value as any }).then(loadRecords)}>
                    {['applied', 'interviewing', 'offered', 'rejected', 'ghosted'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
            )
        case 'dateApplied':
            return (
                <div className="plasmo-flex plasmo-items-center plasmo-space-x-2">
                    <input type="date" className="plasmo-flex-1 plasmo-text-[11px] plasmo-font-semibold plasmo-text-slate-900 plasmo-bg-transparent focus:plasmo-outline-none" defaultValue={record.dateApplied} onChange={(e) => updateCandidateRecord(record.id, { dateApplied: e.target.value }).then(loadRecords)} />
                </div>
            )
        case 'pointOfContact':
            return (
                <input className="plasmo-w-full plasmo-text-[11px] plasmo-font-semibold plasmo-text-slate-900 plasmo-bg-transparent focus:plasmo-outline-none" placeholder="Contact..." defaultValue={record.pointOfContact} onBlur={(e) => updateCandidateRecord(record.id, { pointOfContact: e.target.value }).then(loadRecords)} />
            )
        case 'referralDone':
            return (
                <button onClick={() => updateCandidateRecord(record.id, { referralDone: !record.referralDone }).then(loadRecords)} className={`plasmo-px-3 plasmo-py-1 plasmo-rounded-lg plasmo-text-[10px] plasmo-font-bold plasmo-border ${record.referralDone ? 'plasmo-bg-slate-900 plasmo-text-white plasmo-border-slate-900' : 'plasmo-bg-white plasmo-text-slate-700 plasmo-border-slate-400 hover:plasmo-border-slate-500'}`}>{record.referralDone ? 'Yes' : 'No'}</button>
            )
        case 'followUp':
            return (
                <div className="plasmo-flex plasmo-items-center plasmo-space-x-2">
                    <span className={`plasmo-text-[10px] plasmo-font-bold ${isDue ? 'plasmo-text-rose-600 plasmo-animate-pulse' : 'plasmo-text-slate-500'}`}>
                        {isDue ? 'Due!' : `${daysUntilFollowUp}d left`}
                    </span>
                </div>
            )
        case 'jobDescription':
            return (
                <textarea className="plasmo-w-full plasmo-text-[11px] plasmo-font-semibold plasmo-text-slate-900 plasmo-bg-transparent focus:plasmo-outline-none plasmo-resize-none plasmo-h-8" defaultValue={record.jobDescription} onBlur={(e) => updateCandidateRecord(record.id, { jobDescription: e.target.value }).then(loadRecords)} />
            )
        case 'actions':
            return (
                <div className="plasmo-flex plasmo-items-center plasmo-justify-end plasmo-space-x-1">
                    <button onClick={() => toggleExpand(record.id)} className={`plasmo-p-1.5 plasmo-rounded-md plasmo-transition-all ${expandedId === record.id ? 'plasmo-bg-slate-100 plasmo-text-slate-900' : 'plasmo-text-slate-600 hover:plasmo-bg-slate-50 hover:plasmo-text-slate-900'}`} title="View Details">
                        <svg className="plasmo-w-4 plasmo-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </button>
                    <button onClick={() => { if(confirm("Delete record?")) deleteCandidateRecord(record.id).then(loadRecords) }} className="plasmo-p-1.5 plasmo-text-slate-400 hover:plasmo-text-rose-500 plasmo-transition-colors">
                        <TrashIcon size={14} />
                    </button>
                </div>
            )
        default:
            return null
    }
  }

  const counts = useMemo(() => {
    return {
        pipeline: records.filter(r => r.status !== 'rejected' && r.status !== 'ghosted').length,
        archives: records.filter(r => r.status === 'rejected' || r.status === 'ghosted').length,
        due: records.filter(r => {
            const days = getDaysBetween(today, r.followUpTargetDate)
            return days !== null && days <= 0 && r.status !== 'rejected' && r.status !== 'ghosted'
        }).length
    }
  }, [records, today])

  if (loading) return (
    <div className="plasmo-h-full plasmo-w-full plasmo-flex plasmo-items-center plasmo-justify-center plasmo-bg-white">
      <div className="plasmo-flex plasmo-flex-col plasmo-items-center">
        <CapsuleLogo className="plasmo-w-8 plasmo-h-8 plasmo-text-slate-200 plasmo-animate-pulse" />
        <span className="plasmo-mt-3 plasmo-text-slate-400 plasmo-text-[10px] plasmo-uppercase plasmo-tracking-widest">Loading</span>
      </div>
    </div>
  )

  return (
    <div className="plasmo-flex plasmo-flex-col plasmo-bg-white plasmo-h-full plasmo-overflow-hidden">
      {/* Minimalism Header (FileVault style) */}
      <div className="plasmo-px-5 plasmo-py-3.5 plasmo-bg-white plasmo-border-b plasmo-border-slate-100 plasmo-flex plasmo-justify-between plasmo-items-center plasmo-shrink-0">
        <div className="plasmo-flex plasmo-items-center plasmo-space-x-5">
            <div className="plasmo-flex plasmo-items-center plasmo-space-x-2.5">
                <CapsuleLogo className="plasmo-w-5 plasmo-h-5 plasmo-text-slate-800" />
                <span className="plasmo-text-slate-900 plasmo-font-semibold plasmo-tracking-tight plasmo-text-[15px]">Capsule CRM</span>
            </div>
            <div className="plasmo-h-4 plasmo-w-[1px] plasmo-bg-slate-200"></div>
            <div className="plasmo-flex plasmo-bg-slate-50 plasmo-p-0.5 plasmo-rounded-lg plasmo-border plasmo-border-slate-100">
                <button onClick={() => setActiveSubTab('grid')} className={`plasmo-text-[10px] plasmo-px-3 plasmo-py-1 plasmo-rounded-md plasmo-font-semibold plasmo-uppercase plasmo-tracking-wider plasmo-transition-all plasmo-flex plasmo-items-center ${activeSubTab === 'grid' ? 'plasmo-bg-white plasmo-shadow-sm plasmo-text-slate-900' : 'plasmo-text-slate-400 hover:plasmo-text-slate-600'}`}>
                    Pipeline
                    <span className={`plasmo-ml-1.5 plasmo-px-1.5 plasmo-py-0.5 plasmo-rounded-md plasmo-text-[9px] ${activeSubTab === 'grid' ? 'plasmo-bg-slate-100 plasmo-text-slate-600' : 'plasmo-bg-slate-200/50 plasmo-text-slate-400'}`}>{counts.pipeline}</span>
                    {counts.due > 0 && <span className="plasmo-ml-1 plasmo-w-4 plasmo-h-4 plasmo-bg-rose-500 plasmo-text-white plasmo-rounded-full plasmo-flex plasmo-items-center plasmo-justify-center plasmo-text-[8px]">{counts.due}</span>}
                </button>
                <button onClick={() => setActiveSubTab('archives')} className={`plasmo-text-[10px] plasmo-px-3 plasmo-py-1 plasmo-rounded-md plasmo-font-semibold plasmo-uppercase plasmo-tracking-wider plasmo-transition-all plasmo-flex plasmo-items-center ${activeSubTab === 'archives' ? 'plasmo-bg-white plasmo-shadow-sm plasmo-text-slate-900' : 'plasmo-text-slate-400 hover:plasmo-text-slate-600'}`}>
                    Archives
                    <span className={`plasmo-ml-1.5 plasmo-px-1.5 plasmo-py-0.5 plasmo-rounded-md plasmo-text-[9px] ${activeSubTab === 'archives' ? 'plasmo-bg-slate-100 plasmo-text-slate-600' : 'plasmo-bg-slate-200/50 plasmo-text-slate-400'}`}>{counts.archives}</span>
                </button>
                <button onClick={() => setActiveSubTab('add')} className={`plasmo-text-[10px] plasmo-px-3 plasmo-py-1 plasmo-rounded-md plasmo-font-semibold plasmo-uppercase plasmo-tracking-wider plasmo-transition-all ${activeSubTab === 'add' ? 'plasmo-bg-white plasmo-shadow-sm plasmo-text-slate-900' : 'plasmo-text-slate-400 hover:plasmo-text-slate-600'}`}>Add New</button>
            </div>
        </div>

        <div className="plasmo-flex plasmo-items-center plasmo-space-x-3">
            {activeSubTab !== 'add' && (
                <div className="plasmo-relative">
                    <input type="text" placeholder="Search..." className="plasmo-text-[11px] plasmo-px-3 plasmo-py-1.5 plasmo-bg-slate-50 plasmo-border-none plasmo-rounded-lg focus:plasmo-ring-1 focus:plasmo-ring-slate-200 plasmo-w-40 plasmo-text-slate-900" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
            )}
            <button onClick={() => setShowSettings(!showSettings)} className={`plasmo-p-1.5 plasmo-rounded-lg plasmo-transition-colors ${showSettings ? 'plasmo-bg-slate-100 plasmo-text-slate-900' : 'plasmo-text-slate-400 hover:plasmo-bg-slate-50'}`} title="Settings">
                <svg className="plasmo-w-4 plasmo-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
            {!isFullPage && (
                <button onClick={openFullTab} className="plasmo-p-1.5 plasmo-text-slate-400 hover:plasmo-text-slate-900" title="Full View">
                    <svg className="plasmo-w-4 plasmo-h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </button>
            )}
        </div>
      </div>

      {showSettings && (
          <div className="plasmo-px-8 plasmo-py-6 plasmo-bg-slate-100 plasmo-border-b plasmo-border-slate-300">
              <div className="plasmo-grid plasmo-grid-cols-1 md:plasmo-grid-cols-2 plasmo-gap-8">
                  <div>
                      <label className="plasmo-text-[10px] plasmo-font-bold plasmo-text-slate-600 plasmo-uppercase plasmo-tracking-widest plasmo-mb-3 plasmo-block">Gemini API Key</label>
                      <div className="plasmo-flex plasmo-space-x-2">
                          <input type="password" placeholder="Paste key here..." className="plasmo-flex-1 plasmo-bg-white plasmo-text-slate-700 plasmo-text-[12px] plasmo-px-3 plasmo-py-2 plasmo-rounded-lg plasmo-border plasmo-border-slate-300 focus:plasmo-border-slate-400 focus:plasmo-outline-none" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
                          <button onClick={handleSaveApiKey} className="plasmo-bg-white plasmo-text-slate-900 plasmo-px-4 plasmo-py-2 plasmo-rounded-lg plasmo-text-[11px] plasmo-font-semibold plasmo-border plasmo-border-slate-300 hover:plasmo-bg-slate-50">Save</button>
                      </div>
                  </div>
                  <div>
                      <label className="plasmo-text-[10px] plasmo-font-bold plasmo-text-slate-600 plasmo-uppercase plasmo-tracking-widest plasmo-mb-3 plasmo-block">Visible Columns (Max 7)</label>
                      <div className="plasmo-flex plasmo-flex-wrap plasmo-gap-1.5">
                          {ALL_COLUMNS.map(col => (
                              <button key={col.id} onClick={() => toggleColumn(col.id)} className={`plasmo-px-2.5 plasmo-py-1 plasmo-rounded-md plasmo-text-[10px] plasmo-font-semibold plasmo-transition-all ${visibleColumns.includes(col.id) ? 'plasmo-bg-slate-900 plasmo-text-white' : 'plasmo-bg-white plasmo-text-slate-500 plasmo-border plasmo-border-slate-300 hover:plasmo-text-slate-700'}`}>
                                  {col.label}
                              </button>
                          ))}
                      </div>
                  </div>
              </div>
          </div>
      )}

      <div className="plasmo-flex-1 plasmo-overflow-y-auto">
        {activeSubTab === 'add' ? (
            <div className="plasmo-p-8 plasmo-space-y-10 plasmo-max-w-4xl plasmo-mx-auto">
                <div className="plasmo-bg-white">
                    <label className="plasmo-text-[10px] plasmo-font-bold plasmo-text-slate-700 plasmo-uppercase plasmo-tracking-[0.15em] plasmo-mb-4 plasmo-block">Auto-Fill via AI</label>
                    <div className="plasmo-relative">
                        <textarea className="plasmo-w-full plasmo-h-32 plasmo-p-4 plasmo-text-[13px] plasmo-bg-slate-50 plasmo-rounded-2xl plasmo-resize-none focus:plasmo-ring-1 focus:plasmo-ring-slate-200 focus:plasmo-outline-none plasmo-transition-all plasmo-text-slate-700" placeholder="e.g. 'Just applied to Google for Senior Frontend Role, recruiter is Jane Doe...'" value={inputText} onChange={(e) => setInputText(e.target.value)} />
                        <button onClick={handleAIProcess} disabled={!inputText.trim() || isProcessing} className="plasmo-absolute plasmo-bottom-3 plasmo-right-3 plasmo-bg-slate-900 plasmo-text-white plasmo-px-4 plasmo-py-2 plasmo-rounded-xl plasmo-text-[11px] plasmo-font-bold hover:plasmo-bg-black disabled:plasmo-opacity-30 plasmo-flex plasmo-items-center">
                            {isProcessing && <div className="plasmo-w-3.5 plasmo-h-3.5 plasmo-border-2 plasmo-border-white/30 plasmo-border-t-white plasmo-rounded-full plasmo-animate-spin plasmo-mr-2"></div>}
                            Generate Record
                        </button>
                    </div>
                </div>

                <div className="plasmo-bg-white">
                    <label className="plasmo-text-[10px] plasmo-font-bold plasmo-text-slate-700 plasmo-uppercase plasmo-tracking-[0.15em] plasmo-mb-4 plasmo-block">Manual Entry</label>
                    <div className="plasmo-grid plasmo-grid-cols-1 sm:plasmo-grid-cols-2 plasmo-gap-4">
                        <input type="text" placeholder="Company Name" className="plasmo-w-full plasmo-text-[12px] plasmo-px-4 plasmo-py-2.5 plasmo-bg-white plasmo-border plasmo-border-slate-300 plasmo-rounded-xl focus:plasmo-border-slate-400 focus:plasmo-outline-none" value={quickForm.companyName} onChange={(e) => setQuickForm({...quickForm, companyName: e.target.value})} />
                        <input type="text" placeholder="Company URL (Optional)" className="plasmo-w-full plasmo-text-[12px] plasmo-px-4 plasmo-py-2.5 plasmo-bg-white plasmo-border plasmo-border-slate-300 plasmo-rounded-xl focus:plasmo-border-slate-400 focus:plasmo-outline-none" value={quickForm.companyUrl} onChange={(e) => setQuickForm({...quickForm, companyUrl: e.target.value})} />
                        <div className="plasmo-flex plasmo-flex-col">
                            <label className="plasmo-text-[9px] plasmo-font-bold plasmo-text-slate-700 plasmo-uppercase plasmo-mb-1.5 plasmo-ml-1">Date Applied</label>
                            <input type="date" className="plasmo-w-full plasmo-text-[12px] plasmo-px-4 plasmo-py-2.5 plasmo-bg-white plasmo-border plasmo-border-slate-300 plasmo-rounded-xl focus:plasmo-border-slate-400 focus:plasmo-outline-none" value={quickForm.dateApplied} onChange={(e) => setQuickForm({...quickForm, dateApplied: e.target.value})} />
                        </div>
                        <div className="plasmo-flex plasmo-flex-col">
                            <label className="plasmo-text-[9px] plasmo-font-bold plasmo-text-slate-700 plasmo-uppercase plasmo-mb-1.5 plasmo-ml-1">Follow Up Date</label>
                            <input type="date" className="plasmo-w-full plasmo-text-[12px] plasmo-px-4 plasmo-py-2.5 plasmo-bg-white plasmo-border plasmo-border-slate-300 plasmo-rounded-xl focus:plasmo-border-slate-400 focus:plasmo-outline-none" value={quickForm.followUpTargetDate} onChange={(e) => setQuickForm({...quickForm, followUpTargetDate: e.target.value})} />
                        </div>
                        <div className="plasmo-flex plasmo-flex-col">
                            <label className="plasmo-text-[9px] plasmo-font-bold plasmo-text-slate-700 plasmo-uppercase plasmo-mb-1.5 plasmo-ml-1">Point of Contact</label>
                            <input type="text" placeholder="e.g. Recruiter Name" className="plasmo-w-full plasmo-text-[12px] plasmo-px-4 plasmo-py-2.5 plasmo-bg-white plasmo-border plasmo-border-slate-300 plasmo-rounded-xl focus:plasmo-border-slate-400 focus:plasmo-outline-none" value={quickForm.pointOfContact} onChange={(e) => setQuickForm({...quickForm, pointOfContact: e.target.value})} />
                        </div>
                    </div>
                    <div className="plasmo-flex plasmo-items-center plasmo-justify-between plasmo-mt-6 plasmo-p-4 plasmo-bg-slate-50 plasmo-rounded-2xl">
                        <div className="plasmo-flex plasmo-items-center plasmo-space-x-2.5">
                            <input type="checkbox" id="ref-check-sub" className="plasmo-w-4 plasmo-h-4 plasmo-rounded plasmo-border-slate-300" checked={quickForm.referralDone} onChange={(e) => setQuickForm({...quickForm, referralDone: e.target.checked})} />
                            <label htmlFor="ref-check-sub" className="plasmo-text-[11px] plasmo-font-semibold plasmo-text-slate-600">Referral Obtained</label>
                        </div>
                        <div className="plasmo-flex plasmo-items-center plasmo-space-x-3">
                            <label className="plasmo-text-[11px] plasmo-font-semibold plasmo-text-slate-400">Success Chance:</label>
                            <select className="plasmo-text-[11px] plasmo-bg-white plasmo-border plasmo-border-slate-300 plasmo-rounded-lg plasmo-py-1.5 plasmo-px-4 plasmo-font-bold" value={quickForm.successChance} onChange={(e) => setQuickForm({...quickForm, successChance: e.target.value as any})}>
                                <option value="Low">Low</option>
                                <option value="Medium">Medium</option>
                                <option value="High">High</option>
                            </select>
                        </div>
                    </div>
                    <button onClick={handleQuickAdd} disabled={!quickForm.companyName.trim()} className="plasmo-w-full plasmo-mt-8 plasmo-bg-slate-900 plasmo-text-white plasmo-py-3.5 plasmo-rounded-2xl plasmo-text-[13px] plasmo-font-bold hover:plasmo-bg-black plasmo-transition-all">
                        Add to Pipeline
                    </button>
                </div>

                {aiResponse && (
                    <div className={`plasmo-p-4 plasmo-rounded-2xl plasmo-border ${aiResponse.type === 'query' ? 'plasmo-bg-blue-50 plasmo-text-blue-700 plasmo-border-blue-100' : 'plasmo-bg-rose-50 plasmo-text-rose-700 plasmo-border-rose-100'}`}>
                        <p className="plasmo-text-[12px] plasmo-font-medium">{aiResponse.message}</p>
                        <button onClick={() => setAiResponse(null)} className="plasmo-text-[10px] plasmo-font-bold plasmo-uppercase plasmo-mt-2.5 plasmo-underline">Dismiss</button>
                    </div>
                )}
            </div>
        ) : (
            <div className="plasmo-overflow-x-auto">
                <table className="plasmo-w-full plasmo-text-left plasmo-border-collapse plasmo-min-w-max plasmo-border plasmo-border-slate-300">
                    <thead>
                        <tr className="plasmo-bg-slate-50">
                            {visibleColumns.map(colId => (
                                <th key={colId} className={`plasmo-px-3 plasmo-py-2 plasmo-text-[10px] plasmo-font-bold plasmo-uppercase plasmo-tracking-widest plasmo-text-slate-500 plasmo-border plasmo-border-slate-300 ${COLUMN_WIDTHS[colId]} ${colId === 'actions' ? 'text-right' : ''}`}>
                                    {ALL_COLUMNS.find(c => c.id === colId)?.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="">
                        {filteredRecords.length === 0 ? (
                            <tr>
                                <td colSpan={visibleColumns.length} className="plasmo-px-6 plasmo-py-32 plasmo-text-center plasmo-border plasmo-border-slate-300">
                                    <div className="plasmo-inline-flex plasmo-p-8 plasmo-rounded-3xl plasmo-bg-slate-50/50 plasmo-mb-4">
                                        <CapsuleLogo className="plasmo-w-10 plasmo-h-10 plasmo-text-slate-200" />
                                    </div>
                                    <p className="plasmo-text-slate-400 plasmo-text-[13px] plasmo-font-medium">No records here.</p>
                                </td>
                            </tr>
                        ) : (
                            filteredRecords.map(record => {
                                const isExpanded = expandedId === record.id
                                const isArchived = record.status === 'rejected' || record.status === 'ghosted'

                                return (
                                <React.Fragment key={record.id}>
                                    <tr className={`plasmo-group hover:plasmo-bg-slate-50/30 plasmo-transition-all ${isExpanded ? 'plasmo-bg-slate-50/80' : ''}`}>
                                        {visibleColumns.map(colId => (
                                            <td key={colId} className="plasmo-px-3 plasmo-py-2 plasmo-border plasmo-border-slate-300">
                                                {renderCell(record, colId)}
                                            </td>
                                        ))}
                                    </tr>
                                    {isExpanded && (
                                        <tr className="plasmo-bg-slate-100">
                                            <td colSpan={visibleColumns.length} className="plasmo-px-4 plasmo-py-4 plasmo-border plasmo-border-slate-300">
                                                <div className="plasmo-grid plasmo-grid-cols-1 md:plasmo-grid-cols-3 plasmo-gap-8 plasmo-bg-white plasmo-p-6 plasmo-rounded-3xl plasmo-border plasmo-border-slate-100 plasmo-shadow-sm">
                                                    <div className="plasmo-flex plasmo-flex-col">
                                                        <label className="plasmo-text-[10px] plasmo-font-bold plasmo-text-slate-700 plasmo-uppercase plasmo-mb-2">Job Description</label>
                                                        <textarea className="plasmo-w-full plasmo-text-[12px] plasmo-font-medium plasmo-text-slate-900 plasmo-bg-slate-50 plasmo-p-4 plasmo-rounded-2xl plasmo-border plasmo-border-slate-300 plasmo-h-32 plasmo-resize-none focus:plasmo-ring-1 focus:plasmo-ring-slate-300 focus:plasmo-outline-none" defaultValue={record.jobDescription} onBlur={(e) => updateCandidateRecord(record.id, { jobDescription: e.target.value }).then(loadRecords)} />
                                                    </div>
                                                    <div className="plasmo-flex plasmo-flex-col plasmo-space-y-6">
                                                        <div>
                                                            <label className="plasmo-text-[10px] plasmo-font-bold plasmo-text-slate-700 plasmo-uppercase plasmo-mb-2 plasmo-block">Date Applied</label>
                                                            <input type="date" className="plasmo-w-full plasmo-text-[12px] plasmo-font-medium plasmo-text-slate-900 plasmo-bg-slate-50 plasmo-px-4 plasmo-py-2.5 plasmo-rounded-xl plasmo-border plasmo-border-slate-300 focus:plasmo-ring-1 focus:plasmo-ring-slate-300 focus:plasmo-outline-none" defaultValue={record.dateApplied} onChange={(e) => updateCandidateRecord(record.id, { dateApplied: e.target.value }).then(loadRecords)} />
                                                        </div>
                                                        <div>
                                                            <label className="plasmo-text-[10px] plasmo-font-bold plasmo-text-slate-700 plasmo-uppercase plasmo-mb-2 plasmo-block">Point of Contact</label>
                                                            <input className="plasmo-w-full plasmo-text-[12px] plasmo-font-medium plasmo-text-slate-900 plasmo-bg-slate-50 plasmo-px-4 plasmo-py-2.5 plasmo-rounded-xl plasmo-border plasmo-border-slate-300 focus:plasmo-ring-1 focus:plasmo-ring-slate-300 focus:plasmo-outline-none" placeholder="e.g. Hiring Manager" defaultValue={record.pointOfContact} onBlur={(e) => updateCandidateRecord(record.id, { pointOfContact: e.target.value }).then(loadRecords)} />
                                                        </div>
                                                    </div>
                                                    <div className="plasmo-flex plasmo-flex-col plasmo-space-y-6">
                                                        <div>
                                                            <label className="plasmo-text-[10px] plasmo-font-bold plasmo-text-slate-700 plasmo-uppercase plasmo-mb-2 plasmo-block">{isArchived ? 'Archive Reason' : 'Follow Up'}</label>
                                                            {isArchived ? (
                                                                <input className="plasmo-w-full plasmo-text-[12px] plasmo-font-medium plasmo-text-slate-900 plasmo-bg-slate-50 plasmo-px-4 plasmo-py-2.5 plasmo-rounded-xl plasmo-border plasmo-border-slate-300 focus:plasmo-ring-1 focus:plasmo-ring-slate-300 focus:plasmo-outline-none" placeholder="Reason (Optional)" defaultValue={record.archiveReason} onBlur={(e) => updateCandidateRecord(record.id, { archiveReason: e.target.value }).then(loadRecords)} />
                                                            ) : (
                                                                <input type="date" className="plasmo-w-full plasmo-text-[12px] plasmo-font-medium plasmo-text-slate-900 plasmo-bg-slate-50 plasmo-px-4 plasmo-py-2.5 plasmo-rounded-xl plasmo-border plasmo-border-slate-300 focus:plasmo-ring-1 focus:plasmo-ring-slate-300 focus:plasmo-outline-none" defaultValue={record.followUpTargetDate} onChange={(e) => updateCandidateRecord(record.id, { followUpTargetDate: e.target.value }).then(loadRecords)} />
                                                            )}
                                                        </div>
                                                        <div className="plasmo-flex plasmo-flex-col">
                                                            <label className="plasmo-text-[10px] plasmo-font-bold plasmo-text-slate-700 plasmo-uppercase plasmo-mb-2">Notes</label>
                                                            <textarea className="plasmo-w-full plasmo-text-[11px] plasmo-font-medium plasmo-text-slate-900 plasmo-bg-slate-50 plasmo-p-4 plasmo-rounded-2xl plasmo-border plasmo-border-slate-300 plasmo-h-16 plasmo-resize-none focus:plasmo-ring-1 focus:plasmo-ring-slate-300 focus:plasmo-outline-none" placeholder="Add any extra notes..." defaultValue={record.notes} onBlur={(e) => updateCandidateRecord(record.id, { notes: e.target.value }).then(loadRecords)} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>
        )}
      </div>
    </div>
  )
}

const CapsuleLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M50 20L20 40V60L50 80L80 60V40L50 20Z" />
    <circle cx="50" cy="50" r="10" strokeWidth="4" />
  </svg>
)

const TrashIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
)
