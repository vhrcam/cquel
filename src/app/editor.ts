import { align, strictMask, ghostBreak, changedMask } from './align.ts'
import { esc } from './render.ts'

// A textarea with see-through text sits on top of a <pre> that draws the letters:
// typed letters in solid green (red when wrong) and the rest of the answer as transparent letters.

function spans(text: string, cls: (i: number) => string) {
  let out = ''
  let i = 0
  while (i < text.length) {
    const c = cls(i)
    if (c === 'bad' && text[i] === '\n') {
      out += '<span class="bad nl">\n</span>'
      i++
      continue
    }
    let j = i + 1
    while (j < text.length && cls(j) === c && !(c === 'bad' && text[j] === '\n')) j++
    out += `<span class="${c}">${esc(text.slice(i, j))}</span>`
    i = j
  }
  return out
}

export class TraceEditor {
  root: HTMLElement
  layer: HTMLPreElement
  input: HTMLTextAreaElement
  ghost: string | null = null
  private mask: boolean[] = []
  private changed: boolean[] = []
  private fired = false
  private next = 0
  placeholder = ''
  onInput: (value: string) => void = () => {}
  onComplete: () => void = () => {}
  onRun: () => void = () => {}
  onPasteBlocked: () => void = () => {}
  onCaret: () => void = () => {}

  constructor(root: HTMLElement) {
    this.root = root
    root.innerHTML = '<pre class="ed-layer" aria-hidden="true"></pre><textarea class="ed-input" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" aria-label="SQL editor"></textarea>'
    this.layer = root.querySelector('pre')!
    this.input = root.querySelector('textarea')!
    this.input.addEventListener('input', () => this.changedInput())
    this.input.addEventListener('keydown', e => this.key(e))
    for (const ev of ['keyup', 'click', 'focus']) this.input.addEventListener(ev, () => this.onCaret())
    this.input.addEventListener('paste', e => {
      if (this.ghost === null) return
      e.preventDefault()
      this.onPasteBlocked()
    })
  }

  set(value: string, ghost: string | null, before?: string) {
    this.ghost = ghost
    this.mask = ghost ? strictMask(ghost) : []
    this.changed = ghost && before ? changedMask(before, ghost) : []
    this.input.value = value
    this.fired = ghost !== null && align(value, ghost, this.mask).done
    this.render()
  }

  get value() {
    return this.input.value
  }

  // The selected text, when there is some: run just that part.
  selection() {
    const { selectionStart: a, selectionEnd: b, value } = this.input
    const part = value.slice(a, b)
    return b > a && part.trim() ? part : null
  }

  // The query being worked on and where you are in it: the answer and the next letter to trace,
  // or (letters off) your own text and the cursor.
  where() {
    return this.ghost !== null ? { text: this.ghost, pos: this.next } : { text: this.input.value, pos: this.input.selectionStart }
  }

  focus() {
    this.input.focus({ preventScroll: true })
  }

  private changedInput() {
    this.render()
    this.onInput(this.input.value)
    this.onCaret()
  }

  private render() {
    const v = this.input.value
    let html: string
    if (this.ghost !== null) {
      const a = align(v, this.ghost, this.mask)
      this.next = a.next
      html = spans(v, i => (a.marks[i] ? 'ok' : 'bad')) + spans(this.ghost.slice(a.next), k => (this.changed[a.next + k] ? 'gh chg' : 'gh'))
      this.root.classList.toggle('done', a.done)
      if (a.done && !this.fired) {
        this.fired = true
        queueMicrotask(() => this.onComplete())
      }
      if (!a.done) this.fired = false
    } else {
      this.root.classList.remove('done')
      html = v ? `<span class="tx">${esc(v)}</span>` : `<span class="placeholder">${esc(this.placeholder)}</span>`
    }
    this.layer.innerHTML = html + '​'
  }

  private key(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      this.onRun()
      return
    }
    if (e.key === 'Tab' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault()
      this.insert('  ')
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
      const { selectionStart: s, selectionEnd: end, value } = this.input
      if (s !== end) return
      let text = this.ghost !== null && s === value.length ? ghostBreak(value, this.ghost) : null
      if (text === null) {
        const lineStart = value.lastIndexOf('\n', s - 1) + 1
        text = '\n' + value.slice(lineStart, s).match(/^[ \t]*/)![0]
      }
      e.preventDefault()
      this.insert(text)
    }
  }

  private insert(text: string) {
    if (!document.execCommand('insertText', false, text)) {
      this.input.setRangeText(text, this.input.selectionStart, this.input.selectionEnd, 'end')
      this.changedInput()
    }
  }
}
