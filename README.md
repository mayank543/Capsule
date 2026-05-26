# Capsule 💊

Capsule is a smart local file manager built as a Chrome Extension. It allows you to organize files on your computer into customizable categories that map directly to physical subfolders, all through a convenient browser interface.

## 🚀 Features

- **Local File System Access:** Securely connect to any folder on your machine using the File System Access API.
- **Physical Organization:** Creating a category in the extension creates a real folder on your disk.
- **Smart Drag & Drop:** Effortlessly move files from your OS into specific categories.
- **Persistent Handles:** Remembers your root storage folder across browser sessions.
- **Dual View Modes:** Toggle between a persistent **Side Panel** for heavy work and a **Popup** for quick access.
- **File Management:** List and delete files directly from the browser.

## 🛠️ Tech Stack

- [Plasmo](https://www.plasmo.com/) - The Browser Extension Framework
- [React](https://reactjs.org/) - UI Library
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [TypeScript](https://www.typescriptlang.org/) - Type Safety
- [IndexedDB (idb-keyval)](https://github.com/jakearchibald/idb-keyval) - Persistent File Handles

## 📦 Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/mayank543/Capsule.git
   cd Capsule
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Load into Chrome:**
   - Open Chrome and go to `chrome://extensions`.
   - Enable **Developer mode** (top right).
   - Click **Load unpacked**.
   - Select the `build/chrome-mv3-dev` folder in your project directory.

## 📖 Usage

1. Click the Capsule icon to open the **Side Panel** (or Popup, depending on your setting).
2. For the first-time setup, go to the **Options page** (Right-click icon -> Options) to select your **Root Storage Folder**.
3. Grant the "View and edit files" permission when prompted by Chrome.
4. Create categories (e.g., "Resumes", "PPTs") and drag your files in!

## ⚠️ Troubleshooting (Folder Selection Issues)

If clicking "Select Root Folder" doesn't do anything or the permission prompt doesn't appear:

1. **Use the Options Page:** The Chrome popup can sometimes close too quickly, breaking the folder selection process. 
2. **Right-click** the Capsule extension icon in your browser toolbar.
3. Select **Options** (or go to `Manage Extension` -> `Extension Options`).
4. In the new window that opens, click **Select Root Folder**.
5. **Look for the Chrome Permission Bar:** A small bar will appear at the top of the browser tab asking for permission to "View and edit files". You **must** click **Allow** for the extension to work.

---

## 🚧 Work in Progress

This project is actively being developed. Current focus areas:
- [ ] Nested categories (Sub-folders).
- [ ] Search functionality within the vault.
- [ ] File previewing for common formats.
- [ ] Manual notes and descriptions for individual files.
- [ ] Version history tracking.

*Note: This is an experimental tool using modern browser APIs. Always keep backups of your important files.*
