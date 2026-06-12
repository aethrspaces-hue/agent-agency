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

const PRIYANKA_CONTEXT = `
=== WHO PRIYANKA IS ===
Name: Priyanka. Casual style — bro, lowercase, no punctuation.
Role: Frontend Associate Engineer @ OpenText Hyderabad (~16 months). Stack: React, TypeScript, GCP, Databricks, Docker.
Partner: Pavansai (Android/web dev).

=== CRITICAL — 45-60 DAY JOB HUNT ===
OpenText is restructuring → layoffs likely. She MUST land a job within 60 days.
Targets: Whatfix, Chargebee, Groww, CRED, PhonePe, Razorpay.
NON-NEGOTIABLE: 1 concrete job action every day. If not mentioned, ask.

=== VENTURES ===
- Aethr: AI/creative agency. Priyanka owns ALL tech. Co-founder dynamic feels imbalanced.
- PlacePro (placepro-eta.vercel.app): Solo edtech product, ₹199/₹299/₹499. Razorpay pending.
- Inkbloom: Digital products on Payhip. Melon Paws: craft sub-brand.

=== PRIORITY ORDER ===
1. Land job (60 days, non-negotiable)
2. PlacePro revenue (Razorpay, launch)
3. Aethr client work
4. Everything else

=== WATCH FOR ===
- Too many open fronts → redirect to top 3
- DSA gaps → encourage Strivers sheet daily
- Overwhelm → give ONE tiny next step
- Don't let Aethr crowd out job search time
`.trim()

export async function POST(req: NextRequest) {
  const body = await req.json()
  const message = body?.message
  if (!message?.text) return NextResponse.json({ ok: true })

  const userText = message.text
  const chatId = message.chat.id.toString()
  if (chatId !== process.env.TELEGRAM_CHAT_ID) return NextResponse.json({ ok: true })

  // approve/reject lead commands — human-only transitions, no LLM needed
  const leadCmd = userText.match(/^(approve|reject)\s+([0-9a-f-]{36})/i)
  if (leadCmd) {
    const to_status = leadCmd[1].toLowerCase() === 'approve' ? 'approved' : 'rejected'
    const res = await fetch(`${MCP_URL}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: leadCmd[2], agent: 'priya', to_status }),
    })
    const result = await res.json()
    if (result.ok) {
      await sendTelegramMessage(
        to_status === 'approved'
          ? `✅ Approved: *${result.node.content}*\n\nApply/send the message, then reply *contacted ${leadCmd[2]}* and I'll track the follow-up.\n${result.node.source_url ?? ''}`
          : `🗑️ Rejected: ${result.node.content}`
      )
    } else {
      await sendTelegramMessage(`⚠️ Couldn't update: ${result.error}`)
    }
    return NextResponse.json({ ok: true })
  }

  // contacted <id> — mark lead as contacted, chaser takes over follow-ups
  const contactedCmd = userText.match(/^contacted\s+([0-9a-f-]{36})/i)
  if (contactedCmd) {
    const res = await fetch(`${MCP_URL}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: contactedCmd[1], agent: 'priya', to_status: 'contacted' }),
    })
    const result = await res.json()
    await sendTelegramMessage(result.ok
      ? `📬 Marked contacted: *${result.node.content}* — I'll nudge you if no reply in 4 days.`
      : `⚠️ ${result.error}`)
    return NextResponse.json({ ok: true })
  }

  const intent = await detectIntent(userText)

  // COMPLETE TASK
  if (intent.type === 'complete_task') {
    const { data: nodes } = await supabase
      .from('nodes')
      .select('*')
      .eq('graph', 'priya-personal')
      .eq('type', 'task')
      .neq('status', 'completed')

    const rawKeywords = intent.task_keywords.toLowerCase().split(' ')
    // filter out stop words, keep meaningful keywords (3+ chars)
    const stopWords = new Set(['done', 'with', 'the', 'and', 'for', 'my', 'its', 'its', 'a', 'an', 'is', 'are', 'was', 'i', 'on', 'in', 'at', 'to', 'of', 'it'])
    const keywords = rawKeywords.filter(kw => kw.length >= 3 && !stopWords.has(kw))
    const searchTerms = keywords.length > 0 ? keywords : rawKeywords.filter(kw => kw.length >= 3)
    const matched = nodes?.find(n =>
      searchTerms.some(kw => n.content.toLowerCase().includes(kw))
    )

    if (matched) {
      await fetch(`${MCP_URL}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: matched.id, agent: 'telegram-agent', to_status: 'completed' }),
      })

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

  // PARK TASK
  if (intent.type === 'park_task') {
    const { data: nodes } = await supabase
      .from('nodes')
      .select('*')
      .eq('graph', 'priya-personal')
      .eq('type', 'task')
      .neq('status', 'completed')

    const rawKeywords = intent.task_keywords.toLowerCase().split(' ')
    const stopWords = new Set(['done', 'with', 'the', 'and', 'for', 'my', 'its', 'a', 'an', 'is', 'are', 'was', 'i', 'on', 'in', 'at', 'to', 'of', 'it'])
    const keywords = rawKeywords.filter(kw => kw.length >= 3 && !stopWords.has(kw))
    const searchTerms = keywords.length > 0 ? keywords : rawKeywords.filter(kw => kw.length >= 3)
    const matched = nodes?.find(n =>
      searchTerms.some(kw => n.content.toLowerCase().includes(kw))
    )

    if (matched) {
      await fetch(`${MCP_URL}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: matched.id, agent: 'telegram-agent', to_status: 'parked' }),
      })

      await sendTelegramMessage(`🅿️ "${matched.content}" parked — removed from your active list.\n\nFocus on your job action + DSA. That's it.`)
    } else {
      await sendTelegramMessage(`Couldn't find a task matching "${intent.task_keywords}". Type *show tasks* to see your list.`)
    }
    return NextResponse.json({ ok: true })
  }

  // ADD TASK
  if (intent.type === 'add_task') {
    await supabase.from('nodes').insert({
      graph: 'priya-personal',
      type: 'task',
      content: intent.content,
      status: 'active',
      priority: 99,
      created_by: 'priya',
      confidence: 1.0,
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
      .not('status', 'in', '("completed","parked")')
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
You are Aethr — Priyanka's sharp, no-BS personal agent on Telegram.
Talk like a smart friend. Casual, direct, warm. Max 3-4 sentences.

${PRIYANKA_CONTEXT}

CURRENT GRAPH:
${contextSummary}

RULES:
- Always anchor to job hunt — 60 days, ticking
- ONE clear next action, never a list
- Overwhelmed → smallest possible step
- Tired/low energy → acknowledge, then lightest possible task
- If she hasn't mentioned her daily job action → ask about it
- Celebrate wins fast, move to next immediately
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
