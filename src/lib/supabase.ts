import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Node = {
  id: string
  graph: string
  type: 'goal' | 'task' | 'skill' | 'session' | 'blocker'
  content: string
  metadata: Record<string, unknown>
  status: string
  priority: number
  created_at: string
  updated_at: string
}
