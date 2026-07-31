import type { Comment } from '../types'

function normalizeSourcingComment(value: unknown, index: number): Comment | null {
  if (!value || typeof value !== 'object') return null
  const comment = value as Partial<Record<keyof Comment, unknown>>
  const text = typeof comment.text === 'string' ? comment.text.trim() : ''
  if (!text) return null
  return {
    id: typeof comment.id === 'string' && comment.id.trim()
      ? comment.id.trim()
      : `sourcing-comment-${index}`,
    text,
    author: typeof comment.author === 'string' ? comment.author.trim() : '',
    createdAt: typeof comment.createdAt === 'string' ? comment.createdAt.trim() : '',
  }
}

export function parseSourcingComments(notes: string | undefined): Comment[] {
  const value = notes?.trim()
  if (!value) return []
  let legacyText = value
  try {
    const parsed = JSON.parse(value) as unknown
    // Some early imports JSON-encoded a plain note as a string rather than an
    // array. Unwrap it so the user sees the original note instead of quotes.
    if (typeof parsed === 'string' && parsed.trim()) legacyText = parsed.trim()
    const isStructuredHistory = Array.isArray(parsed)
      || Boolean(parsed && typeof parsed === 'object' && Array.isArray((parsed as { comments?: unknown }).comments))
    if (isStructuredHistory) {
      const comments = Array.isArray(parsed)
        ? parsed
        : (parsed as { comments: unknown[] }).comments
      return comments
        .map(normalizeSourcingComment)
        .filter((comment): comment is Comment => comment !== null)
    }
  } catch {
    // Plain-text notes from older records are still valid notes.
  }
  return [{
    id: 'legacy-note',
    text: legacyText,
    author: 'Legacy note',
    createdAt: '',
  }]
}

export function serializeSourcingComments(comments: Comment[]): string {
  return JSON.stringify(comments.filter(comment => comment.text.trim()))
}

export function sourcingNotesText(notes: string | undefined): string {
  return parseSourcingComments(notes).map(comment => comment.text.trim()).filter(Boolean).join(' ')
}
