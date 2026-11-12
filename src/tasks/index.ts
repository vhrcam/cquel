import { fill, type Task, type Track } from './types.ts'
import { orientation } from './orientation.ts'
import { inventory } from './inventory.ts'
import { receiving } from './receiving.ts'
import { shipping } from './shipping.ts'
import { replen } from './replen.ts'
import { labor } from './labor.ts'
import { support } from './support.ts'

const prep = (t: Task): Task => ({
  ...t,
  prompt: fill(t.prompt),
  solution: fill(t.solution),
  given: t.given && fill(t.given),
  returns: t.returns && fill(t.returns),
})

export const tracks: Track[] = [orientation, inventory, receiving, shipping, replen, labor, support].map(tr => ({ ...tr, tasks: tr.tasks.map(prep) }))
export const allTasks = tracks.flatMap(tr => tr.tasks)
export const taskById = new Map(allTasks.map(t => [t.id, t]))
export const trackOf = new Map(tracks.flatMap(tr => tr.tasks.map(t => [t.id, tr] as const)))
export type { Task, Track }
