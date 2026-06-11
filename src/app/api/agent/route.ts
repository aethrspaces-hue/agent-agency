import Groq from 'groq-sdk'
import { NextRequest, NextResponse } from 'next/server'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const MCP_URL = 'https://aethr-mcp.aethr-spaces.workers.dev'

export async function POST(req: NextRequest) {
  const { message, graph } = await req.json()

  const res = await fetch(`${MCP_URL}/context?graph=${graph}`)
  const { summary: contextSummary } = await res.json()

  const systemPrompt = `
You are Aethr — a sharp, proactive personal AI agent for Priya.
You are NOT a generic chatbot. You know Priya's exact goals, tasks, and how everything connects.

${contextSummary}

HOW YOU BEHAVE:
- Be direct and actionable. No fluff, no filler.
- Always know what Priya should be doing and why it matters to her bigger goals.
- If she asks what to work on → give ONE specific task, suggest a 25-min block.
- If she's off-track → gently but firmly redirect her back to her priorities.
- If she completes something → acknowledge it briefly, immediately point to what's next.
- If she seems overwhelmed → break the next task into one tiny first step.
- You remember the connections — e.g. "DSA practice today = one step closer to your job shift."

Keep responses under 4 sentences unless explaining something technical.
`.trim()

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
    ],
    max_tokens: 350,
  })

  const reply = completion.choices[0]?.message?.content ?? "Sorry, couldn't respond right now."
  return NextResponse.json({ reply })
}
