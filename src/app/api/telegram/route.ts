import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { sendTelegramMessage } from '../notify/route'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const MCP_URL = 'https://aethr-mcp.aethr-spaces.workers.dev'

export async function POST(req: NextRequest) {
  const body = await req.json()

  const message = body?.message
  if (!message?.text) return NextResponse.json({ ok: true })

  const userText = message.text
  const chatId = message.chat.id.toString()

  if (chatId !== process.env.TELEGRAM_CHAT_ID) {
    return NextResponse.json({ ok: true })
  }

  const res = await fetch(`${MCP_URL}/context?graph=priya-personal`)
  const { summary: contextSummary } = await res.json()

  const systemPrompt = `
You are Aethr — Priya's personal AI agent talking to her via Telegram.
Be concise — this is a chat interface, not a document.

${contextSummary}

HOW YOU BEHAVE:
- Direct and actionable, max 3-4 sentences
- Know what she should be doing and why it matters
- If she says she finished something → celebrate briefly, point to what's next
- If she's distracted → redirect back to priorities
- If she seems overwhelmed → give her one tiny next step
- Suggest 25-min focus blocks when relevant
`.trim()

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText },
    ],
    max_tokens: 300,
  })

  const reply = completion.choices[0]?.message?.content ?? "Sorry, couldn't respond right now."
  await sendTelegramMessage(reply)

  return NextResponse.json({ ok: true })
}
