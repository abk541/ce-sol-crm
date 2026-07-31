import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../migrations/010_notification_popup_deliveries.sql', import.meta.url),
  'utf8',
)

describe('notification popup delivery migration', () => {
  it('keeps delivery state private and account-scoped', () => {
    expect(migration).toContain('primary key (notification_id, account_id)')
    expect(migration).toContain('claimed_at timestamptz not null')
    expect(migration).toContain('delivered_at timestamptz')
    expect(migration).toContain('references public.notifications(id)')
    expect(migration).toContain('references app_auth.accounts(id)')
    expect(migration).toContain('enable row level security')
    expect(migration).toContain('account_id = app_auth.request_account_id()')
    expect(migration).toContain('revoke all on table app_auth.notification_popup_deliveries')
    expect(migration).toContain('grant select, insert, update')
    expect(migration).toContain('notification_popup_deliveries_update_own')
  })

  it('baselines only existing notifications tied to an authenticated profile', () => {
    expect(migration).toMatch(/join public\.users profile\s+on profile\.id = notification\.target_user_id/)
    expect(migration).toContain('where profile.auth_user_id is not null')
    expect(migration).toContain('on conflict (notification_id, account_id) do nothing')
  })
})
