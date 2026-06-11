import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export type Intent =
  | { type: 'complete_task'; task_keywords: string }
  | { type: 'add_task'; content: string }
  | { type: 'show_tasks' }
  | { type: 'chat'; message: string }

export async function detectIntent(message: string): Promise<Intent> {
  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: `You are an intent classifier. Classify the user message into one of these intents and respond with ONLY valid JSON, no markdown.

Intents:
- complete_task: user says they finished/done/completed something. Extract keywords describing what task.
- add_task: user wants to add a new task. Extract the task content.
- show_tasks: user wants to see their current tasks.
- chat: anything else — general conversation, questions, etc.

Examples:
"done with DSA today" -> {"type":"complete_task","task_keywords":"DSA"}
"I finished the landing page" -> {"type":"complete_task","task_keywords":"landing page"}
"add task: review pitch deck" -> {"type":"add_task","content":"review pitch deck"}
"add review pitch deck to my tasks" -> {"type":"add_task","content":"review pitch deck"}
"what are my tasks?" -> {"type":"show_tasks"}
"show my tasks" -> {"type":"show_tasks"}
"what should I work on?" -> {"type":"chat","message":"what should I work on?"}
"I'm feeling tired" -> {"type":"chat","message":"I'm feeling tired"}`,
      },
      { role: 'user', content: message },
    ],
    max_tokens: 100,
  })

  try {
    const raw = completion.choices[0]?.message?.content ?? '{}'
    return JSON.parse(raw) as Intent
  } catch {
    return { type: 'chat', message }
  }
}
