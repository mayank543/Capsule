import { CandidateCRM } from "~features/candidate-crm"
import "~style.css"

function OptionsPage() {
  return (
    <div className="plasmo-min-h-screen plasmo-bg-slate-100 plasmo-py-10 plasmo-px-6">
      <div className="plasmo-max-w-[1200px] plasmo-mx-auto plasmo-bg-white plasmo-shadow-2xl plasmo-rounded-3xl plasmo-overflow-hidden plasmo-border-2 plasmo-border-slate-200">
        <CandidateCRM isFullPage={true} />
      </div>
    </div>
  )
}

export default OptionsPage
