import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Groq from 'groq-sdk'
import { sendTelegramMessage } from '../notify/route'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const MCP_URL = 'https://aethr-mcp.aethr-spaces.workers.dev'

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const type = req.nextUrl.searchParams.get('type') ?? 'evening'

  const contextRes = await fetch(`${MCP_URL}/context?graph=priya-personal`)
  const { nodes } = await contextRes.json()

  const completedToday = nodes?.filter((n: any) => {
    if (n.type !== 'task' || n.status !== 'completed') return false
    const updated = new Date(n.updated_at)
    const today = new Date()
    return updated.toDateString() === today.toDateString()
  }) ?? []

  const activeTasks = nodes?.filter((n: any) =>
    n.type === 'task' && n.status !== 'completed'
  ) ?? []

  if (type === 'evening') {
    const prompt = `
Generate a short evening check-in message for Priya.

Tasks completed today: ${completedToday.length > 0 ? completedToday.map((t: any) => t.content).join(', ') : 'none logged'}
Still active tasks: ${activeTasks.map((t: any) => t.content).join(', ')}

Format (Telegram markdown):
🌙 *Evening check-in*

${completedToday.length > 0 ? '✅ You completed: [list]\n' : '📝 No tasks marked done today — did you get anything done? Reply to log it!\n'}

🎯 *Tomorrow's top priority:* [most important active task]

💬 How did today go? Reply with what you actually got done and I'll update your progress.
    `.trim()

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
    })

    const msg = completion.choices[0]?.message?.content ?? '🌙 Evening check-in! How did today go?'
    await sendTelegramMessage(msg)
  }

  if (type === 'weekly') {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const completedThisWeek = nodes?.filter((n: any) => {
      if (n.type !== 'task' || n.status !== 'completed') return false
      return new Date(n.updated_at) > oneWeekAgo
    }) ?? []

    const prompt = `
Generate a weekly review for Priya.

Tasks completed this week: ${completedThisWeek.length > 0 ? completedThisWeek.map((t: any) => t.content).join(', ') : 'none'}
Still pending: ${activeTasks.map((t: any) => t.content).join(', ')}

Format (Telegram markdown):
📊 *Weekly Review*

✅ *This week you completed:* [list or "Nothing logged — let's do better!"]

📈 *Progress score:* [X/${completedThisWeek.length + activeTasks.length} tasks done]

🎯 *Next week's focus:* [top 3 priorities]

💡 *One thing to remember:* [motivating insight connecting her work to her job shift goal]

Keep it under 120 words.
    `.trim()

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 250,
    })

    const msg = completion.choices[0]?.message?.content ?? '📊 Weekly review time!'
    await sendTelegramMessage(msg)
  }

  return NextResponse.json({ ok: true, type })
}
