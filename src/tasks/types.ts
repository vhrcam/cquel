import { seedFacts } from '../db/seed.ts'

export type Kind = 'query' | 'fix-query' | 'fix-data'

export type Task = {
  id: string
  title: string
  kind: Kind
  skills: string[]
  prompt: string
  returns?: string
  tables: string[]
  solution: string
  given?: string
  check?: string[]
  note?: string
}

export type Track = { id: string; name: string; role: string; tasks: Task[] }

export const facts = seedFacts()

export const fill = (text: string) => text.replace(/\{(\w+)\}/g, (_, key) => String(facts[key] ?? `{${key}}`))
