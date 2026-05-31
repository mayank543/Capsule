# Capsule 💊

I started this project as a simple tool to manage a root folder on my machine directly from my browser. I thought it would make my life a lot easier to have a quick interface for my personal files while surfing the web. As I kept using it, I realized I needed a better way to track my job applications and interviews, so I ended up adding the Candidate CRM as well.

I’ll probably add more features as I need them, but at this version, it is already helpful enough for me to use every day!

## 🚀 Features

### 📁 File Vault (The "Storage Capsule")
*   **Local File System Access:** Securely connect to any folder on your machine using the modern File System Access API.
*   **Physical Folder Mapping:** When you create a category in the extension, it creates a real physical folder on your disk.
*   **Smart Drag & Drop:** Effortlessly move files from your computer into specific browser categories.
*   **Persistent Handles:** Once connected, the extension remembers your root folder across browser sessions.
*   **Dual View:** Use it as a persistent **Side Panel** for heavy organization or a **Popup** for quick file uploads.

### 💼 Candidate CRM (The "Pipeline")
*   **Application Tracking:** Track your job applications with details like company name, date applied, and point of contact.
*   **AI-Powered Quick Add:** Paste a job description or a recruiter message, and the built-in Gemini AI will automatically extract the company and details to create a record for you.
*   **Visual Status:** Monitor your chances (Low/Medium/High) and application status (Applied/Interviewing/Offered/Rejected) at a glance.
*   **Follow-up Reminders:** Highlights applications that have gone cold (>10 days) so you never miss a follow-up.
*   **Customizable Layout:** Choose which columns are visible to keep your pipeline as clean or as detailed as you want.

## 📖 How to Use

### 1. Setting up the File Vault
1.  **Select Root Folder:** Right-click the extension icon and go to **Options**. Click "Select Root Folder" and pick a folder on your computer where you want Capsule to store everything.
2.  **Grant Permissions:** Look for the Chrome permission bar at the top of the tab and click **Allow** to let the extension write files to that folder.
3.  **Create Categories:** Use the "Add Category" button to create subfolders. You can then drag and drop files from your desktop directly into these categories.

### 2. Using the CRM
1.  **Set your API Key:** In the CRM tab, click the **Settings icon** (gear) and paste your Gemini API Key. This is required for the AI Auto-Fill feature.
2.  **Add Applications:** Use the "Add New" sub-tab to either type in application details manually or use the AI textarea to auto-generate a record from text.
3.  **Manage Pipeline:** Use the "Pipeline" sub-tab to see all your active applications. You can edit fields directly in the table or click the **Info icon** in the Actions column to add detailed notes.

## 🛠️ Tech Stack

- **Framework:** [Plasmo](https://www.plasmo.com/) (Chrome Extension Framework)
- **UI:** React, Tailwind CSS
- **AI:** Google Gemini API
- **Persistence:** Browser Extension Storage & File System Access API

---

_Note: This is a personal tool built to solve my own workflow needs. It uses modern browser APIs—always keep backups of your important files!_
