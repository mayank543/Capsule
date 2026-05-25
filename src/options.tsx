import { FileVault } from "~features/file-vault"
import "~style.css"

function OptionsPage() {
  return (
    <div className="plasmo-min-h-screen plasmo-bg-gray-50 plasmo-p-10">
      <div className="plasmo-max-w-4xl plasmo-mx-auto plasmo-bg-white plasmo-shadow-xl plasmo-rounded-2xl plasmo-overflow-hidden">
        <FileVault isSidePanel={true} />
      </div>
    </div>
  )
}

export default OptionsPage
