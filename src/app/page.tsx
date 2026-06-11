'use client'

import { useEffect, useRef, useState } from 'react'
import { Node } from '@/lib/supabase'

type Message = { role: 'user' | 'agent'; text: string }

function AgentChat({ mode }: { mode: string }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'agent', text: "Hey Priya! I know your goals and tasks. Ask me what to work on, or just say hi 👋" }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setLoading(true)
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMsg, graph: mode }),
    })
    const data = await res.json()
    setMessages(prev => [...prev, { role: 'agent', text: data.reply }])
    setLoading(false)
  }

  return (
    <div className="border border-zinc-200 rounded-2xl bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-100 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-400" />
        <span className="text-sm font-medium text-zinc-700">Agent</span>
      </div>
      <div className="h-72 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
              m.role === 'user'
                ? 'bg-zinc-900 text-white rounded-br-sm'
                : 'bg-zinc-100 text-zinc-800 rounded-bl-sm'
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-zinc-100 text-zinc-400 px-4 py-2.5 rounded-2xl rounded-bl-sm text-sm">
              thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t border-zinc-100 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Ask your agent..."
          className="flex-1 px-3 py-2 text-sm rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-xl hover:bg-zinc-700 disabled:opacity-40 transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  )
}

type Mode = 'priya-personal' | 'aethr-shared'

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="flex gap-2 p-1 bg-zinc-100 rounded-xl">
      {(['priya-personal', 'aethr-shared'] as Mode[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            mode === m
              ? 'bg-white shadow text-zinc-900'
              : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          {m === 'priya-personal' ? 'Personal' : 'Aethr'}
        </button>
      ))}
    </div>
  )
}

function NodeCard({
  node,
  onComplete,
}: {
  node: Node
  onComplete: (id: string) => void
}) {
  const typeColors: Record<string, string> = {
    goal: 'bg-violet-50 border-violet-200 text-violet-700',
    task: 'bg-blue-50 border-blue-200 text-blue-700',
    skill: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    blocker: 'bg-red-50 border-red-200 text-red-700',
    session: 'bg-amber-50 border-amber-200 text-amber-700',
  }

  const typeColor = typeColors[node.type] || 'bg-zinc-50 border-zinc-200 text-zinc-700'
  const isDone = node.status === 'completed'

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-xl border bg-white shadow-sm transition-opacity ${
        isDone ? 'opacity-40' : ''
      }`}
    >
      {node.type === 'task' && (
        <button
          onClick={() => !isDone && onComplete(node.id)}
          className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 transition-colors ${
            isDone
              ? 'bg-emerald-500 border-emerald-500'
              : 'border-zinc-300 hover:border-emerald-400'
          }`}
        >
          {isDone && (
            <svg viewBox="0 0 20 20" fill="white" className="w-full h-full p-0.5">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </button>
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium text-zinc-800 ${isDone ? 'line-through' : ''}`}>
          {node.content}
        </p>
      </div>
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${typeColor}`}>
        {node.type}
      </span>
    </div>
  )
}

function Section({ title, nodes, onComplete }: { title: string; nodes: Node[]; onComplete: (id: string) => void }) {
  if (nodes.length === 0) return null
  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">{title}</h2>
      <div className="space-y-2">
        {nodes.map((n) => (
          <NodeCard key={n.id} node={n} onComplete={onComplete} />
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [mode, setMode] = useState<Mode>('priya-personal')
  const [nodes, setNodes] = useState<Node[]>([])
  const [loading, setLoading] = useState(true)
  const [newTask, setNewTask] = useState('')
  const [adding, setAdding] = useState(false)

  const fetchNodes = async () => {
    setLoading(true)
    const res = await fetch(`/api/nodes?graph=${mode}`)
    const data = await res.json()
    setNodes(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { fetchNodes() }, [mode])

  const handleComplete = async (id: string) => {
    await fetch('/api/nodes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'completed' }),
    })
    setNodes((prev) => prev.map((n) => n.id === id ? { ...n, status: 'completed' } : n))
  }

  const handleAddTask = async () => {
    if (!newTask.trim()) return
    setAdding(true)
    const res = await fetch('/api/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        graph: mode,
        type: 'task',
        content: newTask.trim(),
        status: 'active',
        priority: 99,
      }),
    })
    const node = await res.json()
    setNodes((prev) => [...prev, node])
    setNewTask('')
    setAdding(false)
  }

  const goals = nodes.filter((n) => n.type === 'goal')
  const activeTasks = nodes.filter((n) => n.type === 'task' && n.status !== 'completed')
  const completedTasks = nodes.filter((n) => n.type === 'task' && n.status === 'completed')
  const skills = nodes.filter((n) => n.type === 'skill')

  const focusTask = activeTasks[0]
  const totalTasks = activeTasks.length + completedTasks.length
  const progress = totalTasks > 0 ? Math.round((completedTasks.length / totalTasks) * 100) : 0

  return (
    <div className="min-h-screen bg-zinc-50 font-sans">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-zinc-400">{getGreeting()}</p>
            <h1 className="text-2xl font-bold text-zinc-900">
              {mode === 'priya-personal' ? 'Priya' : 'Aethr Spaces'}
            </h1>
          </div>
          <ModeToggle mode={mode} onChange={setMode} />
        </div>

        {/* Focus card */}
        {focusTask && (
          <div className="bg-zinc-900 text-white rounded-2xl p-6 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Focus right now
            </p>
            <p className="text-lg font-semibold leading-snug">{focusTask.content}</p>
            <button
              onClick={() => handleComplete(focusTask.id)}
              className="mt-2 px-4 py-2 bg-white text-zinc-900 text-sm font-medium rounded-lg hover:bg-zinc-100 transition-colors"
            >
              Mark done
            </button>
          </div>
        )}

        {/* Progress bar */}
        {totalTasks > 0 && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-zinc-400">
              <span>Today's progress</span>
              <span>{completedTasks.length}/{totalTasks} tasks</span>
            </div>
            <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-zinc-900 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-zinc-400 text-sm">Loading your context...</div>
        ) : (
          <div className="space-y-6">
            <Section title="Goals" nodes={goals} onComplete={handleComplete} />
            <Section title="Active Tasks" nodes={activeTasks} onComplete={handleComplete} />
            <Section title="Skills" nodes={skills} onComplete={handleComplete} />
            {completedTasks.length > 0 && (
              <Section title="Completed" nodes={completedTasks} onComplete={handleComplete} />
            )}
          </div>
        )}

        {/* Agent chat */}
        <AgentChat mode={mode} />

        {/* Add task */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
            placeholder="Add a task..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
          <button
            onClick={handleAddTask}
            disabled={adding || !newTask.trim()}
            className="px-4 py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-xl hover:bg-zinc-700 disabled:opacity-40 transition-colors"
          >
            {adding ? '...' : 'Add'}
          </button>
        </div>

      </div>
    </div>
  )
}
