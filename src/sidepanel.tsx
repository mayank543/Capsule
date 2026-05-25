import { FileVault } from "~features/file-vault"
import "~style.css"

function SidePanel() {
  return (
    <div className="plasmo-min-h-screen plasmo-bg-gray-50">
      <FileVault isSidePanel={true} />
    </div>
  )
}

export default SidePanel
