// Progress, drafts and settings live in this browser only.

type Saved = {
  current?: string
  ghost?: boolean
  progress: Record<string, { traced?: boolean; solved?: boolean }>
  drafts: Record<string, string>
  closed: string[]
}

const KEY = 'cquel:v1'

function load(): Saved {
  const empty: Saved = { progress: {}, drafts: {}, closed: [] }
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...empty, ...JSON.parse(raw) }
  } catch {}
  return empty
}

export const saved = load()

let timer = 0
export function persist() {
  clearTimeout(timer)
  timer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(saved))
    } catch {}
  }, 200)
}
