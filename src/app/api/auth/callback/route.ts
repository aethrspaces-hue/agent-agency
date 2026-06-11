import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'No code' }, { status: 400 })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }),
  })

  const tokens = await res.json()
  if (tokens.error) return NextResponse.json({ error: tokens.error, description: tokens.error_description }, { status: 400 })

  // Delete existing token node then insert fresh
  await supabase.from('nodes').delete().eq('content', 'google-tokens').eq('graph', 'priya-personal')

  const { error: insertError } = await supabase.from('nodes').insert({
    graph: 'priya-personal',
    type: 'session',
    content: 'google-tokens',
    metadata: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    },
    status: 'active',
    priority: 0,
  })

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.redirect('https://agent-agency-gamma.vercel.app?connected=google')
}
