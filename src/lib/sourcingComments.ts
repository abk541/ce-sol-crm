import type { Comment } from '../types'

function isSourcingComment(value: unknown): value is Comment {
  if (!value || typeof value !== 'object') return false
  const comment = value as Partial<Comment>
  return typeof comment.text === 'string' && comment.text.trim().length > 0
}

export function parseSourcingComments(notes: string | undefined): Comment[] {
  const value = notes?.trim()
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    const comments = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { comments?: unknown }).comments)
        ? (parsed as { comments: unknown[] }).comments
        : []
    if (comments.length) {
      return comments.filter(isSourcingComment).map((comment, index) => ({
        ...comment,
        id: comment.id || `sourcing-comment-${index}`,
        author: comment.author || 'Team member',
        createdAt: comment.createdAt || '',
      }))
    }
  } catch {
    // Plain-text notes from older records are still valid notes.
  }
  return [{
    id: 'legacy-note',
    text: value,
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
