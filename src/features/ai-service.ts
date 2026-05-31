import { getCandidateRecords, getGeminiKey, type CandidateRecord } from "./crm-store"

export interface AIServiceResponse {
  type: "update" | "query" | "error"
  data?: Partial<CandidateRecord> & { companyName: string }
  message?: string
}

export const processWithGemini = async (text: string): Promise<AIServiceResponse> => {
  const apiKey = await getGeminiKey()
  if (!apiKey) {
    return { type: "error", message: "Gemini API Key not found. Please set it in settings." }
  }

  const records = await getCandidateRecords()
  const context = JSON.stringify(records.map(r => ({
    company: r.companyName,
    status: r.status,
    followUps: r.followUpDates,
    chance: r.successChance,
    applied: r.dateApplied,
    contact: r.pointOfContact
  })))

  const prompt = `
    You are a Candidate CRM Assistant. Your job is to parse natural language and either update records or answer questions about existing records.
    
    Current Records Context:
    ${context}

    Current Date: ${new Date().toISOString().split('T')[0]}

    Instructions:
    1. If the user is providing information about a job application (e.g., "Applied to Google", "JD is ...", "referral done"), return a JSON object of type "update".
    2. If the user is asking a question (e.g., "When is my next follow up?", "What did I say about Microsoft?"), return a message of type "query".
    3. For updates, extract: companyName, jobDescription, successChance (Low, Medium, High), referralDone (boolean), followUpDates (array of YYYY-MM-DD), status (applied, interviewing, offered, rejected), dateApplied (YYYY-MM-DD), pointOfContact, and notes.
    4. If it's an update for an existing company, only provide the changed fields.
    5. Return ONLY a JSON object.

    JSON Structure for Update:
    {
      "type": "update",
      "data": {
        "companyName": "string",
        "jobDescription": "string",
        "successChance": "Low" | "Medium" | "High",
        "referralDone": boolean,
        "followUpDates": ["YYYY-MM-DD"],
        "status": "applied" | "interviewing" | "offered" | "rejected",
        "dateApplied": "YYYY-MM-DD",
        "pointOfContact": "string",
        "notes": "string"
      }
    }

    JSON Structure for Query:
    {
      "type": "query",
      "message": "your answer based on context"
    }

    User Input: "${text}"
  `

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    })

    const result = await response.json()
    const content = result.candidates?.[0]?.content?.parts?.[0]?.text
    
    if (!content) throw new Error("No response from Gemini")

    // Extract JSON from potential markdown blocks
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    const jsonStr = jsonMatch ? jsonMatch[0] : content
    
    return JSON.parse(jsonStr)
  } catch (error) {
    console.error("Gemini Error:", error)
    return { type: "error", message: "Failed to process with AI. Check console or API key." }
  }
}
