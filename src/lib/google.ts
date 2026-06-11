import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase
    .from('nodes')
    .select('metadata')
    .eq('content', 'google-tokens')
    .single()

  if (!data?.metadata) return null

  const { access_token, refresh_token, expires_at } = data.metadata

  // Refresh if expired
  if (Date.now() > expires_at - 60000) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token,
        grant_type: 'refresh_token',
      }),
    })
    const tokens = await res.json()

    await supabase.from('nodes').update({
      metadata: {
        access_token: tokens.access_token,
        refresh_token,
        expires_at: Date.now() + tokens.expires_in * 1000,
      }
    }).eq('content', 'google-tokens')

    return tokens.access_token
  }

  return access_token
}

export async function getTodayEvents(): Promise<string> {
  const token = await getAccessToken()
  if (!token) return 'Google Calendar not connected.'

  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59).toISOString()

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startOfDay}&timeMax=${endOfDay}&singleEvents=true&orderBy=startTime`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  const data = await res.json()
  const events = data.items ?? []

  if (events.length === 0) return 'No meetings today.'

  return events.map((e: any) => {
    const time = e.start?.dateTime
      ? new Date(e.start.dateTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      : 'All day'
    return `${time} — ${e.summary}`
  }).join('\n')
}

export async function getImportantEmails(): Promise<string> {
  const token = await getAccessToken()
  if (!token) return 'Gmail not connected.'

  const res = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread is:important&maxResults=5',
    { headers: { Authorization: `Bearer ${token}` } }
  )

  const data = await res.json()
  const messages = data.messages ?? []

  if (messages.length === 0) return 'No important unread emails.'

  const details = await Promise.all(
    messages.map(async (m: any) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const msg = await msgRes.json()
      const headers = msg.payload?.headers ?? []
      const subject = headers.find((h: any) => h.name === 'Subject')?.value ?? '(no subject)'
      const from = headers.find((h: any) => h.name === 'From')?.value ?? 'Unknown'
      return `• ${subject} — from ${from}`
    })
  )

  return details.join('\n')
}
