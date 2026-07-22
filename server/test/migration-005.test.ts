import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../migrations/005_notification_read_receipts.sql', import.meta.url),
  'utf8',
)

describe('notification receipt migration', () => {
  it('keeps receipts private and keyed per account', () => {
    expect(migration).toContain('primary key (notification_id, account_id)')
    expect(migration).toContain('references app_auth.accounts(id)')
    expect(migration).toContain('references public.notifications(id)')
    expect(migration).toContain('enable row level security')
    expect(migration).toContain('account_id = app_auth.request_account_id()')
    expect(migration).toContain('revoke all on table app_auth.notification_reads')
  })

  it('does not expose receipts through the public application schema', () => {
    expect(migration).not.toContain('create table public.notification_reads')
    expect(migration).not.toContain('from public, anon')
    expect(migration).not.toContain('grant select, insert, update on table app_auth.notification_reads\n  to anon')
  })

  it('materializes legacy shared reads for every account before clearing the shared flag', () => {
    expect(migration).toMatch(
      /insert into app_auth\.notification_reads \(notification_id, account_id, read_at\)[\s\S]*?from public\.notifications notification\s+cross join app_auth\.accounts account\s+where notification\.read is true[\s\S]*?on conflict \(notification_id, account_id\) do nothing;/,
    )
    expect(migration).toMatch(/update public\.notifications\s+set read = false\s+where read is true;/)

    const backfillPosition = migration.indexOf('insert into app_auth.notification_reads')
    const resetPosition = migration.indexOf('update public.notifications')
    expect(backfillPosition).toBeGreaterThan(-1)
    expect(resetPosition).toBeGreaterThan(backfillPosition)
  })

  it('does not reference the unavailable anon role in a revoke statement', () => {
    expect(migration).not.toMatch(/revoke[\s\S]*?from\s+[^;]*\banon\b/i)
  })
})
