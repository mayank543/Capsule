import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
}

const PlasmoOverlay = () => {
  // Empty content script overlay
  return null
}

export default PlasmoOverlay
