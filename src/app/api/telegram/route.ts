import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { createClient } from '@supabase/supabase-js'
import { sendTelegramMessage } from '../notify/route'
import { detectIntent } from '@/lib/intent'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const MCP_URL = 'https://aethr-mcp.aethr-spaces.workers.dev'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const message = body?.message
  if (!message?.text) return NextResponse.json({ ok: true })

  const userText = message.text
  const chatId = message.chat.id.toString()
  if (chatId !== process.env.TELEGRAM_CHAT_ID) return NextResponse.json({ ok: true })

  const intent = await detectIntent(userText)

  // COMPLETE TASK
  if (intent.type === 'complete_task') {
    const { data: nodes } = await supabase
      .from('nodes')
      .select('*')
      .eq('graph', 'priya-personal')
      .eq('type', 'task')
      .neq('status', 'completed')

    const keywords = intent.task_keywords.toLowerCase().split(' ')
    const matched = nodes?.find(n =>
      keywords.some(kw => n.content.toLowerCase().includes(kw))
    )

    if (matched) {
      await supabase
        .from('nodes')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', matched.id)

      const nextRes = await fetch(`${MCP_URL}/next-task?graph=priya-personal`)
      const next = await nextRes.json()

      const reply = next
        ? `✅ "${matched.content}" marked done!\n\nNext up: *${next.content}* — want to start a 25-min block?`
        : `✅ "${matched.content}" marked done!\n\n🎉 All tasks complete! Add something new or take a well-deserved break.`

      await sendTelegramMessage(reply)
      return NextResponse.json({ ok: true })
    } else {
      await sendTelegramMessage(`Hmm, I couldn't find a task matching "${intent.task_keywords}". Type *show tasks* to see your active tasks.`)
      return NextResponse.json({ ok: true })
    }
  }

  // ADD TASK
  if (intent.type === 'add_task') {
    await supabase.from('nodes').insert({
      graph: 'priya-personal',
      type: 'task',
      content: intent.content,
      status: 'active',
      priority: 99,
    })
    await sendTelegramMessage(`✅ Added task: *${intent.content}*\n\nFinish your current task first, then I'll remind you about this.`)
    return NextResponse.json({ ok: true })
  }

  // SHOW TASKS
  if (intent.type === 'show_tasks') {
    const { data: nodes } = await supabase
      .from('nodes')
      .select('*')
      .eq('graph', 'priya-personal')
      .eq('type', 'task')
      .neq('status', 'completed')
      .order('priority')

    if (!nodes?.length) {
      await sendTelegramMessage('No active tasks! Add something new.')
      return NextResponse.json({ ok: true })
    }

    const list = nodes.map((n, i) => `${i + 1}. ${n.content}`).join('\n')
    await sendTelegramMessage(`📋 *Your active tasks:*\n\n${list}`)
    return NextResponse.json({ ok: true })
  }

  // CHAT — general conversation
  const res = await fetch(`${MCP_URL}/context?graph=priya-personal`)
  const { summary: contextSummary } = await res.json()

  const systemPrompt = `
You are Aethr — Priya's personal AI agent on Telegram.
Be concise — max 3-4 sentences.

${contextSummary}

HOW YOU BEHAVE:
- Direct and actionable
- Know what she should be doing and why it matters
- If overwhelmed → one tiny next step
- Suggest 25-min focus blocks when relevant
- If she mentions energy/mood → adjust tone and plan accordingly
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
