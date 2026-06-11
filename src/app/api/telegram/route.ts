import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { createClient } from '@supabase/supabase-js'
import { sendTelegramMessage } from '../notify/route'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function buildContextSummary(nodes: any[], edges: any[]): string {
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]))
  const goals = nodes.filter(n => n.type === 'goal')
  const activeTasks = nodes.filter(n => n.type === 'task' && n.status !== 'completed')
  const skills = nodes.filter(n => n.type === 'skill')

  const goalConnections: Record<string, { tasks: string[], skills: string[] }> = {}
  for (const goal of goals) goalConnections[goal.id] = { tasks: [], skills: [] }

  for (const edge of edges) {
    const from = byId[edge.from_node]
    const to = byId[edge.to_node]
    if (!from || !to || to.type !== 'goal') continue
    if (from.type === 'task') goalConnections[to.id]?.tasks.push(from.content)
    if (from.type === 'skill') goalConnections[to.id]?.skills.push(from.content)
  }

  const lines = ['=== PRIYA\'S CONTEXT ===', '', 'GOALS:']
  for (const goal of goals) {
    const conn = goalConnections[goal.id]
    lines.push(`  • ${goal.content}`)
    if (conn?.tasks.length) lines.push(`      ↑ tasks: ${conn.tasks.join(', ')}`)
    if (conn?.skills.length) lines.push(`      ↑ skills: ${conn.skills.join(', ')}`)
  }

  lines.push('', 'ACTIVE TASKS:')
  for (const task of activeTasks) {
    lines.push(`  • ${task.content} (priority ${task.priority})`)
  }

  lines.push('', 'SKILLS BUILDING:')
  for (const skill of skills) lines.push(`  • ${skill.content}`)

  return lines.join('\n')
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  const message = body?.message
  if (!message?.text) return NextResponse.json({ ok: true })

  const userText = message.text
  const chatId = message.chat.id.toString()

  if (chatId !== process.env.TELEGRAM_CHAT_ID) {
    return NextResponse.json({ ok: true })
  }

  const [{ data: nodes }, { data: edges }] = await Promise.all([
    supabase.from('nodes').select('*').order('priority'),
    supabase.from('edges').select('*'),
  ])

  const personalNodes = (nodes ?? []).filter(n => n.graph === 'priya-personal')
  const contextSummary = buildContextSummary(personalNodes, edges ?? [])

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
