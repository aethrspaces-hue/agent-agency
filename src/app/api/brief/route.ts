import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Groq from 'groq-sdk'
import { sendTelegramMessage } from '../notify/route'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [{ data: nodes }, { data: edges }] = await Promise.all([
    supabase.from('nodes').select('*').order('priority'),
    supabase.from('edges').select('*'),
  ])

  const personalNodes = nodes?.filter(n => n.graph === 'priya-personal') ?? []
  const aethrNodes = nodes?.filter(n => n.graph === 'aethr-shared') ?? []

  const personalTasks = personalNodes.filter(n => n.type === 'task' && n.status !== 'completed')
  const aethrTasks = aethrNodes.filter(n => n.type === 'task' && n.status !== 'completed')

  const prompt = `
Generate a short, energetic morning brief for Priya.

Personal active tasks: ${personalTasks.map(t => t.content).join(', ')}
Aethr active tasks: ${aethrTasks.map(t => t.content).join(', ')}

Format it exactly like this:
Good morning Priya! Here's your focus for today:

🎯 *Top priority:* [single most important task]

📋 *Today's plan:*
1. [task]
2. [task]
3. [task]

💡 *Remember:* [one motivating sentence connecting today's work to her job shift goal]

Ready? Let's go! 🚀

Keep it under 100 words. Be specific, not generic.
`.trim()

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 200,
  })

  const brief = completion.choices[0]?.message?.content ?? 'Good morning Priya! Time to get to work!'

  await sendTelegramMessage(brief)

  return NextResponse.json({ ok: true, brief })
}
