import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { sendTelegramMessage } from '../notify/route'
import { getTodayEvents, getImportantEmails } from '@/lib/google'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const MCP_URL = 'https://aethr-mcp.aethr-spaces.workers.dev'

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [personalRes, aethrRes, events, emails] = await Promise.all([
    fetch(`${MCP_URL}/context?graph=priya-personal`).then(r => r.json()),
    fetch(`${MCP_URL}/context?graph=aethr-shared`).then(r => r.json()),
    getTodayEvents(),
    getImportantEmails(),
  ])

  const prompt = `
Generate a short, energetic morning brief for Priya.

PERSONAL CONTEXT:
${personalRes.summary}

AETHR CONTEXT:
${aethrRes.summary}

TODAY'S MEETINGS:
${events}

IMPORTANT UNREAD EMAILS:
${emails}

Format it exactly like this (use Telegram markdown):
Good morning Priya! ☀️

🎯 *Top priority:* [single most important task]

📋 *Today's plan:*
1. [task]
2. [task]
3. [task]

📅 *Meetings today:*
[list meetings or "No meetings today"]

📬 *Check these emails:*
[list important emails or "Inbox clear!"]

💡 *Remember:* [one motivating sentence connecting today's work to her job shift goal]

Ready? Let's go! 🚀

Keep it under 150 words. Be specific.
`.trim()

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 300,
  })

  const brief = completion.choices[0]?.message?.content ?? 'Good morning Priya! Time to get to work!'
  await sendTelegramMessage(brief)

  return NextResponse.json({ ok: true, brief })
}
