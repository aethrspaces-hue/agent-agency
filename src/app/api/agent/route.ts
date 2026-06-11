import Groq from 'groq-sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function buildContextSummary(nodes: any[], edges: any[]): string {
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]))

  const goals = nodes.filter(n => n.type === 'goal')
  const activeTasks = nodes.filter(n => n.type === 'task' && n.status !== 'completed')
  const completedTasks = nodes.filter(n => n.type === 'task' && n.status === 'completed')
  const skills = nodes.filter(n => n.type === 'skill')

  // For each goal, find what tasks and skills feed into it
  const goalConnections: Record<string, { tasks: string[], skills: string[], leads_from: string[] }> = {}
  for (const goal of goals) {
    goalConnections[goal.id] = { tasks: [], skills: [], leads_from: [] }
  }

  for (const edge of edges) {
    const from = byId[edge.from_node]
    const to = byId[edge.to_node]
    if (!from || !to) continue

    if (to.type === 'goal') {
      if (from.type === 'task' && edge.relation === 'part-of') {
        goalConnections[to.id]?.tasks.push(from.content)
      } else if (from.type === 'skill' && edge.relation === 'needed-for') {
        goalConnections[to.id]?.skills.push(from.content)
      } else if (from.type === 'goal' && edge.relation === 'leads-to') {
        goalConnections[to.id]?.leads_from.push(from.content)
      }
    }
  }

  const lines: string[] = []

  lines.push('=== PRIYA\'S CONTEXT ===')
  lines.push('')

  lines.push('ULTIMATE GOALS:')
  for (const goal of goals) {
    const conn = goalConnections[goal.id]
    lines.push(`  • ${goal.content}`)
    if (conn?.tasks.length) lines.push(`      ↑ fed by tasks: ${conn.tasks.join(', ')}`)
    if (conn?.skills.length) lines.push(`      ↑ needs skills: ${conn.skills.join(', ')}`)
    if (conn?.leads_from.length) lines.push(`      ↑ unlocked by: ${conn.leads_from.join(', ')}`)
  }

  lines.push('')
  lines.push('ACTIVE TASKS (what she should be doing right now):')
  for (const task of activeTasks) {
    const status = task.status === 'in_progress' ? ' [IN PROGRESS]' : ''
    lines.push(`  • ${task.content}${status} (priority ${task.priority})`)
  }

  if (completedTasks.length) {
    lines.push('')
    lines.push('COMPLETED TASKS (done, don\'t suggest these):')
    for (const task of completedTasks) {
      lines.push(`  • ${task.content}`)
    }
  }

  lines.push('')
  lines.push('SKILLS SHE IS BUILDING:')
  for (const skill of skills) {
    lines.push(`  • ${skill.content}`)
  }

  lines.push('')
  lines.push('KEY INSIGHT: Everything connects to her job shift goal. DSA + AI/ML + Full stack skills + portfolio are all stepping stones to get there.')

  return lines.join('\n')
}

export async function POST(req: NextRequest) {
  const { message, graph } = await req.json()

  const [{ data: nodes }, { data: edges }] = await Promise.all([
    supabase.from('nodes').select('*').eq('graph', graph).order('priority'),
    supabase.from('edges').select('*'),
  ])

  const contextSummary = buildContextSummary(nodes ?? [], edges ?? [])

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
