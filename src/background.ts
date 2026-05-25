export {}

// Use storage to keep track of user preference
import { Storage } from "@plasmohq/storage"
const storage = new Storage()

const updateBehavior = async () => {
  const viewMode = await storage.get("view-mode")
  
  if (viewMode === "popup") {
    // Disable side panel on click
    await (chrome as any).sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
    // We also need to set the popup dynamically
    await chrome.action.setPopup({ popup: "popup.html" })
  } else {
    // Enable side panel on click
    await (chrome as any).sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    // Disable popup so click opens side panel instead
    await chrome.action.setPopup({ popup: "" })
  }
}

// Watch for changes in storage
storage.watch({
  "view-mode": () => {
    updateBehavior()
  }
})

// Initialize on start
updateBehavior()
