import React, { useState } from "react"
import { FileVault } from "~features/file-vault"
import { CandidateCRM } from "~features/candidate-crm"
import "~style.css"

function IndexPopup() {
  const [activeTab, setActiveTab] = useState<'files' | 'crm'>('crm')

  return (
    <div className="plasmo-flex plasmo-flex-col plasmo-w-[800px] plasmo-h-[600px] plasmo-bg-white">
      {/* Navigation Bar */}
      <div className="plasmo-flex plasmo-p-2 plasmo-bg-slate-900 plasmo-space-x-1">
        <button 
          onClick={() => setActiveTab('files')}
          className={`plasmo-flex-1 plasmo-py-2 plasmo-text-[10px] plasmo-font-black plasmo-uppercase plasmo-tracking-tighter plasmo-rounded-lg plasmo-transition-all ${activeTab === 'files' ? 'plasmo-bg-white plasmo-text-slate-900' : 'plasmo-text-slate-400 hover:plasmo-text-white'}`}
        >
          File Vault
        </button>
        <button 
          onClick={() => setActiveTab('crm')}
          className={`plasmo-flex-1 plasmo-py-2 plasmo-text-[10px] plasmo-font-black plasmo-uppercase plasmo-tracking-tighter plasmo-rounded-lg plasmo-transition-all ${activeTab === 'crm' ? 'plasmo-bg-white plasmo-text-slate-900' : 'plasmo-text-slate-400 hover:plasmo-text-white'}`}
        >
          Candidate CRM
        </button>
      </div>

      <div className="plasmo-flex-1 plasmo-overflow-hidden">
        {activeTab === 'files' ? (
          <FileVault isSidePanel={false} />
        ) : (
          <CandidateCRM isFullPage={false} />
        )}
      </div>
    </div>
  )
}

export default IndexPopup
