import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Database, Queryable } from '../src/db.js'
import { buildApp } from '../src/app.js'
import { hashToken } from '../src/auth.js'
import { ApiError } from '../src/errors.js'
import { loadEnvironment } from '../src/env.js'
import { __test } from '../src/files.js'

function queryable(
  handler: (text: string, values: readonly unknown[] | undefined) => Record<string, unknown>[],
): Queryable {
  return {
    async query(text, values) {
      const rows = handler(text, values)
      return {
        rows,
        rowCount: rows.length,
        command: 'SELECT',
        oid: 0,
        fields: [],
      }
    },
  } as Queryable
}

const storedFile = {
  storage_path: 'contract_awards/award-123-signed.pdf',
  object_key: '44444444-4444-4444-8444-444444444444',
  attachment_id: 'award-123',
  original_name: 'Signed Award.pdf',
  content_type: 'application/pdf',
  size_bytes: 100,
  attached_at: new Date('2026-07-29T12:00:00.000Z'),
  uploader_name: 'Contract Admin',
  content_available: true,
}

const queuedJob = {
  object_key: storedFile.object_key,
  storage_path: storedFile.storage_path,
  queued_at: new Date('2026-07-29T12:00:00.000Z'),
  attempt_count: 0,
  last_attempt_at: null,
  last_error_code: null,
}

const TOKEN = 'f'.repeat(48)
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'
const sessionRow = {
  session_id: '22222222-2222-4222-8222-222222222222',
  account_id: ACCOUNT_ID,
  session_created_at: new Date('2026-07-29T10:00:00.000Z'),
  expires_at: new Date('2026-07-30T10:00:00.000Z'),
  password_version: 1,
  current_password_version: 1,
  assurance_level: 'legacy',
  mfa_verified_at: null,
  id: '33333333-3333-4333-8333-333333333333',
  auth_user_id: ACCOUNT_ID,
  name: 'Contract Editor',
  email: 'editor@example.test',
  username: 'contract-editor',
  role: 'CAPTURE_MANAGER',
  avatar: null,
  status: 'active',
  first_login: false,
  mfa_enabled: false,
  created_at: new Date('2026-07-01T10:00:00.000Z'),
  team: null,
  manager_id: null,
}

function result(rows: Record<string, unknown>[] = []) {
  return {
    rows,
    rowCount: rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  }
}

describe('contract award file cleanup', () => {
  it('requires contract edit or admin permission', async () => {
    const denied = queryable((_text, values) => {
      expect(values?.[1]).toEqual(['contract:edit', 'admin:manageUsers'])
      return [{ allowed: false }]
    })
    await expect(__test.requireContractAwardDelete(denied, 'account-1'))
      .rejects.toMatchObject({ statusCode: 403, code: 'forbidden' })

    const allowed = queryable(() => [{ allowed: true }])
    await expect(__test.requireContractAwardDelete(allowed, 'account-1'))
      .resolves.toBeUndefined()
  })

  it('rejects cleanup outside the dedicated contract-awards namespace', () => {
    expect(() => __test.contractAwardStoragePath('proposals/award.pdf'))
      .toThrowError(ApiError)
  })

  it('never deletes metadata or enqueues cleanup while any contract still references the path', async () => {
    const statements: string[] = []
    const client = queryable((text) => {
      statements.push(text)
      if (text.includes('from app_files.objects')) return [storedFile]
      if (text.includes('private.contract_award_file_is_referenced')) return [{ referenced: true }]
      throw new Error(`Unexpected query: ${text}`)
    })

    await expect(__test.enqueueUnreferencedContractAwardFile(
      client,
      storedFile.storage_path,
      ACCOUNT_ID,
    )).rejects.toMatchObject({ statusCode: 409, code: 'file_still_referenced' })

    expect(statements.some(statement => statement.startsWith('delete from app_files.objects'))).toBe(false)
    expect(statements.some(statement => statement.includes(
      'insert into app_files.contract_award_deletion_queue',
    ))).toBe(false)
  })

  it('deletes unreferenced metadata and durably enqueues the object in the same transaction callback', async () => {
    const statements: string[] = []
    const client = queryable((text) => {
      statements.push(text)
      if (text.startsWith('delete from app_files.objects')) return [storedFile]
      if (text.includes('from app_files.objects')) return [storedFile]
      if (text.includes('private.contract_award_file_is_referenced')) return [{ referenced: false }]
      if (text.includes('insert into app_files.contract_award_deletion_queue')) return [queuedJob]
      throw new Error(`Unexpected query: ${text}`)
    })

    await expect(__test.enqueueUnreferencedContractAwardFile(
      client,
      storedFile.storage_path,
      ACCOUNT_ID,
    )).resolves.toMatchObject(queuedJob)

    const referenceIndex = statements.findIndex(
      statement => statement.includes('private.contract_award_file_is_referenced'),
    )
    const deleteIndex = statements.findIndex(
      statement => statement.startsWith('delete from app_files.objects'),
    )
    const enqueueIndex = statements.findIndex(
      statement => statement.includes('insert into app_files.contract_award_deletion_queue'),
    )
    expect(deleteIndex).toBeGreaterThan(referenceIndex)
    expect(enqueueIndex).toBeGreaterThan(deleteIndex)
  })

  it('does not touch physical bytes when the guarded database transaction rolls back', async () => {
    const events: string[] = []
    const removePhysical = vi.fn(async () => { events.push('rm') })
    const handleQuery = async (text: string) => {
      events.push(text)
      if (text === 'begin' || text === 'rollback') return result()
      if (text === 'commit') throw new Error('commit failed')
      if (text.includes("set_config('app.account_id'")) return result()
      if (text.includes('private.effective_permission_for_auth_user')) return result([{ allowed: true }])
      if (text.startsWith('delete from app_files.objects')) return result([storedFile])
      if (text.includes('from app_files.objects')) return result([storedFile])
      if (text.includes('private.contract_award_file_is_referenced')) return result([{ referenced: false }])
      if (text.includes('insert into app_files.contract_award_deletion_queue')) return result([queuedJob])
      throw new Error(`Unexpected query: ${text}`)
    }
    const client = { query: handleQuery, release: () => undefined }
    const db = {
      query: handleQuery,
      connect: async () => client,
      end: async () => undefined,
    } as unknown as Database
    const dependencies = {
      env: loadEnvironment({
        DATABASE_URL: 'postgresql://example.invalid/app',
        ALLOWED_ORIGINS: 'https://crm.example.test',
        LOG_LEVEL: 'silent',
        ATTACHMENTS_DIR: 'C:\\private-attachments',
      }),
      db,
      fetch: globalThis.fetch,
      now: () => new Date('2026-07-29T12:00:00.000Z'),
    }

    await expect(__test.deleteContractAwardAndAttemptCleanup(
      dependencies,
      ACCOUNT_ID,
      storedFile.storage_path,
      removePhysical,
    )).rejects.toThrow('commit failed')

    expect(removePhysical).not.toHaveBeenCalled()
    expect(events).toContain('rollback')
  })

  it('commits metadata deletion and its durable job before touching physical bytes', async () => {
    const events: string[] = []
    const removePhysical = vi.fn(async () => { events.push('rm') })
    const handleQuery = async (text: string) => {
      events.push(text)
      if (text === 'begin' || text === 'commit' || text === 'rollback') return result()
      if (text.includes("set_config('app.account_id'")) return result()
      if (text.includes('private.effective_permission_for_auth_user')) return result([{ allowed: true }])
      if (text.startsWith('delete from app_files.objects')) return result([storedFile])
      if (text.includes('from app_files.objects')) return result([storedFile])
      if (text.includes('private.contract_award_file_is_referenced')) return result([{ referenced: false }])
      if (text.includes('insert into app_files.contract_award_deletion_queue')) return result([queuedJob])
      if (text.includes('delete from app_files.contract_award_deletion_queue')) return result()
      throw new Error(`Unexpected query: ${text}`)
    }
    const client = { query: handleQuery, release: () => undefined }
    const db = {
      query: handleQuery,
      connect: async () => client,
      end: async () => undefined,
    } as unknown as Database
    const dependencies = {
      env: loadEnvironment({
        DATABASE_URL: 'postgresql://example.invalid/app',
        ALLOWED_ORIGINS: 'https://crm.example.test',
        LOG_LEVEL: 'silent',
        ATTACHMENTS_DIR: 'C:\\private-attachments',
      }),
      db,
      fetch: globalThis.fetch,
      now: () => new Date('2026-07-29T12:00:00.000Z'),
    }

    await expect(__test.deleteContractAwardAndAttemptCleanup(
      dependencies,
      ACCOUNT_ID,
      storedFile.storage_path,
      removePhysical,
    )).resolves.toMatchObject({ status: 'deleted' })

    expect(events.indexOf('rm')).toBeGreaterThan(events.indexOf('commit'))
    expect(removePhysical).toHaveBeenCalledWith(
      join(dependencies.env.attachmentsDir, '44', storedFile.object_key),
    )
  })

  it('keeps the durable job and reports queued when physical removal fails', async () => {
    const statements: string[] = []
    const database = queryable((text) => {
      statements.push(text)
      if (text.startsWith('update app_files.contract_award_deletion_queue')) return []
      throw new Error(`Unexpected query: ${text}`)
    })
    const diskError = Object.assign(new Error('disk busy'), { code: 'EBUSY' })

    await expect(__test.processContractAwardDeletionJob(
      database,
      'C:\\private-attachments',
      queuedJob,
      async () => { throw diskError },
    )).resolves.toBe('queued')

    expect(statements).toHaveLength(1)
    expect(statements[0]).toContain('attempt_count = attempt_count + 1')
    expect(statements.some(statement =>
      statement.includes('delete from app_files.contract_award_deletion_queue'),
    )).toBe(false)
  })

  it('treats an already-missing physical object as an idempotent cleanup success', async () => {
    const statements: string[] = []
    const database = queryable((text) => {
      statements.push(text)
      if (text.includes('delete from app_files.contract_award_deletion_queue')) return []
      throw new Error(`Unexpected query: ${text}`)
    })
    const missing = Object.assign(new Error('already removed'), { code: 'ENOENT' })

    await expect(__test.processContractAwardDeletionJob(
      database,
      'C:\\private-attachments',
      queuedJob,
      async () => { throw missing },
    )).resolves.toBe('deleted')

    expect(statements).toHaveLength(1)
    expect(statements[0]).toContain('delete from app_files.contract_award_deletion_queue')
  })

  it('returns cleanupPending after safe detachment and lets the bounded endpoint finish the job idempotently', async () => {
    const attachmentsDir = await mkdtemp(join(tmpdir(), 'ce-award-cleanup-'))
    const physicalPath = join(
      attachmentsDir,
      storedFile.object_key.slice(0, 2),
      storedFile.object_key,
    )
    await mkdir(physicalPath, { recursive: true })
    await writeFile(join(physicalPath, 'disk-lock-sentinel'), 'busy')
    let metadataPresent = true
    let queuePresent = false
    let attemptCount = 0

    const handleQuery = async (text: string, values?: readonly unknown[]) => {
      if (text === 'begin' || text === 'commit' || text === 'rollback') return result()
      if (text.includes('from app_auth.sessions')) return result([sessionRow])
      if (text.includes("set_config('app.account_id'")) return result()
      if (text.includes('private.effective_permission_for_auth_user')) return result([{ allowed: true }])
      if (text.startsWith('delete from app_files.objects')) {
        if (!metadataPresent) return result()
        metadataPresent = false
        return result([storedFile])
      }
      if (text.includes('from app_files.objects')) {
        return result(metadataPresent ? [storedFile] : [])
      }
      if (text.includes('private.contract_award_file_is_referenced')) {
        return result([{ referenced: false }])
      }
      if (text.includes('insert into app_files.contract_award_deletion_queue')) {
        queuePresent = true
        return result([queuedJob])
      }
      if (text.startsWith('update app_files.contract_award_deletion_queue')) {
        attemptCount += 1
        return result()
      }
      if (text.startsWith('delete from app_files.contract_award_deletion_queue')) {
        queuePresent = false
        return result()
      }
      if (text.includes('from app_files.contract_award_deletion_queue')) {
        expect(values).toEqual([25])
        return result(queuePresent ? [queuedJob] : [])
      }
      throw new Error(`Unexpected query: ${text}`)
    }
    const client = { query: handleQuery, release: () => undefined }
    const db = {
      query: handleQuery,
      connect: async () => client,
      end: async () => undefined,
    } as unknown as Database
    const app = await buildApp({
      env: loadEnvironment({
        DATABASE_URL: 'postgresql://example.invalid/app',
        ALLOWED_ORIGINS: 'https://crm.example.test',
        LOG_LEVEL: 'silent',
        ATTACHMENTS_DIR: attachmentsDir,
      }),
      db,
      fetch: globalThis.fetch,
      now: () => new Date('2026-07-29T12:00:00.000Z'),
    })

    try {
      const detached = await app.inject({
        method: 'DELETE',
        url: `/api/v1/files/contract-awards/${encodeURIComponent(storedFile.storage_path)}`,
        headers: { authorization: `Bearer ${TOKEN}` },
      })
      expect(detached.statusCode).toBe(200)
      expect(detached.json().data).toMatchObject({
        deleted: true,
        cleanupPending: true,
        status: 'queued',
      })
      expect(metadataPresent).toBe(false)
      expect(queuePresent).toBe(true)
      expect(attemptCount).toBe(1)

      await rm(physicalPath, { recursive: true, force: true })
      const retried = await app.inject({
        method: 'POST',
        url: '/api/v1/files/contract-awards/cleanup/retry',
        headers: { authorization: `Bearer ${TOKEN}` },
      })
      expect(retried.statusCode).toBe(200)
      expect(retried.json().data).toMatchObject({
        attempted: 1,
        deleted: 1,
        pending: 0,
        limit: 25,
      })
      expect(queuePresent).toBe(false)
    } finally {
      await app.close()
      await rm(attachmentsDir, { recursive: true, force: true })
    }
  })

  it('sets the authenticated actor inside the cleanup transaction before authorization and reference checks', async () => {
    const queries: Array<{ text: string; values?: readonly unknown[] }> = []
    const handleQuery = async (text: string, values?: readonly unknown[]) => {
      queries.push({ text, values })
      if (text === 'begin' || text === 'commit' || text === 'rollback') return result()
      if (text.includes('from app_auth.sessions')) {
        expect(values?.[0]).toBe(hashToken(TOKEN))
        return result([sessionRow])
      }
      if (text.includes("set_config('app.account_id'")) return result()
      if (text.includes('private.effective_permission_for_auth_user')) return result([{ allowed: true }])
      if (text.includes('from app_files.objects')) return result([storedFile])
      if (text.includes('private.contract_award_file_is_referenced')) return result([{ referenced: true }])
      throw new Error(`Unexpected query: ${text}`)
    }
    const client = { query: handleQuery, release: () => undefined }
    const db = {
      query: handleQuery,
      connect: async () => client,
      end: async () => undefined,
    } as unknown as Database
    const app = await buildApp({
      env: loadEnvironment({
        DATABASE_URL: 'postgresql://example.invalid/app',
        ALLOWED_ORIGINS: 'https://crm.example.test',
        LOG_LEVEL: 'silent',
      }),
      db,
      fetch: globalThis.fetch,
      now: () => new Date('2026-07-29T12:00:00.000Z'),
    })

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/files/contract-awards/${encodeURIComponent(storedFile.storage_path)}`,
      headers: { authorization: `Bearer ${TOKEN}` },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('file_still_referenced')
    const contextIndex = queries.findIndex(query => query.text.includes("set_config('app.account_id'"))
    const permissionIndex = queries.findIndex(query => query.text.includes('private.effective_permission_for_auth_user'))
    const objectLockIndex = queries.findIndex(query =>
      query.text.includes('from app_files.objects')
      && query.text.includes('for update'),
    )
    const referenceIndex = queries.findIndex(
      query => query.text.includes('private.contract_award_file_is_referenced'),
    )
    expect(queries[contextIndex].values).toEqual([ACCOUNT_ID])
    expect(contextIndex).toBeGreaterThan(-1)
    expect(permissionIndex).toBeGreaterThan(contextIndex)
    expect(objectLockIndex).toBeGreaterThan(permissionIndex)
    expect(referenceIndex).toBeGreaterThan(objectLockIndex)
    expect(queries.find(query => query.text.includes('from app_files.objects'))?.values)
      .toEqual([storedFile.storage_path])
    await app.close()
  })

  it('keeps the bounded retry endpoint behind the same contract permission', async () => {
    let allowed = false
    const queries: Array<{ text: string; values?: readonly unknown[] }> = []
    const handleQuery = async (text: string, values?: readonly unknown[]) => {
      queries.push({ text, values })
      if (text === 'begin' || text === 'commit' || text === 'rollback') return result()
      if (text.includes('from app_auth.sessions')) return result([sessionRow])
      if (text.includes("set_config('app.account_id'")) return result()
      if (text.includes('private.effective_permission_for_auth_user')) {
        return result([{ allowed }])
      }
      if (text.includes('from app_files.contract_award_deletion_queue')) {
        return result()
      }
      throw new Error(`Unexpected query: ${text}`)
    }
    const client = { query: handleQuery, release: () => undefined }
    const db = {
      query: handleQuery,
      connect: async () => client,
      end: async () => undefined,
    } as unknown as Database
    const app = await buildApp({
      env: loadEnvironment({
        DATABASE_URL: 'postgresql://example.invalid/app',
        ALLOWED_ORIGINS: 'https://crm.example.test',
        LOG_LEVEL: 'silent',
      }),
      db,
      fetch: globalThis.fetch,
      now: () => new Date('2026-07-29T12:00:00.000Z'),
    })

    const denied = await app.inject({
      method: 'POST',
      url: '/api/v1/files/contract-awards/cleanup/retry',
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(denied.statusCode).toBe(403)
    expect(queries.some(query =>
      query.text.includes('from app_files.contract_award_deletion_queue'),
    )).toBe(false)

    allowed = true
    const accepted = await app.inject({
      method: 'POST',
      url: '/api/v1/files/contract-awards/cleanup/retry',
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(accepted.statusCode).toBe(200)
    expect(accepted.json().data).toMatchObject({
      attempted: 0,
      deleted: 0,
      pending: 0,
      limit: 25,
    })
    expect(queries.find(query =>
      query.text.includes('from app_files.contract_award_deletion_queue'),
    )?.values).toEqual([25])

    await app.close()
  })

  it('denies contract-awards uploads when the user only has a different attachment permission', async () => {
    const attachmentsDir = await mkdtemp(join(tmpdir(), 'ce-award-files-'))
    const queries: Array<{ text: string; values?: readonly unknown[] }> = []
    const handleQuery = async (text: string, values?: readonly unknown[]) => {
      queries.push({ text, values })
      if (text.includes('from app_auth.sessions')) return result([sessionRow])
      if (text.includes('private.effective_permission_for_auth_user')) {
        const requested = values?.[1]
        return result([{
          allowed: Array.isArray(requested) && requested.length > 2,
        }])
      }
      throw new Error(`Unexpected query: ${text}`)
    }
    const db = {
      query: handleQuery,
      end: async () => undefined,
    } as unknown as Database
    const app = await buildApp({
      env: loadEnvironment({
        DATABASE_URL: 'postgresql://example.invalid/app',
        ALLOWED_ORIGINS: 'https://crm.example.test',
        LOG_LEVEL: 'silent',
        ATTACHMENTS_DIR: attachmentsDir,
      }),
      db,
      fetch: globalThis.fetch,
      now: () => new Date('2026-07-29T12:00:00.000Z'),
    })
    const boundary = '----contract-award-test'
    const payload = Buffer.from([
      `--${boundary}\r\n`,
      'Content-Disposition: form-data; name="folder"\r\n\r\n',
      'contract_awards\r\n',
      `--${boundary}\r\n`,
      'Content-Disposition: form-data; name="file"; filename="award.pdf"\r\n',
      'Content-Type: application/pdf\r\n\r\n',
      '%PDF-test\r\n',
      `--${boundary}--\r\n`,
    ].join(''))

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/files',
        headers: {
          authorization: `Bearer ${TOKEN}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      })

      expect(response.statusCode).toBe(403)
      expect(response.json().error.code).toBe('forbidden')
      expect(queries.filter(query => query.text.includes('private.effective_permission_for_auth_user')))
        .toHaveLength(2)
      expect(queries.some(query => query.text.includes('insert into app_files.objects'))).toBe(false)
    } finally {
      await app.close()
      await rm(attachmentsDir, { recursive: true, force: true })
    }
  })

  it('never overwrites an existing contract award object at the same path', async () => {
    const attachmentsDir = await mkdtemp(join(tmpdir(), 'ce-award-files-'))
    const existingPath = join(
      attachmentsDir,
      storedFile.object_key.slice(0, 2),
      storedFile.object_key,
    )
    await mkdir(join(attachmentsDir, storedFile.object_key.slice(0, 2)), { recursive: true })
    await writeFile(existingPath, 'original-signed-award')
    const queries: Array<{ text: string; values?: readonly unknown[] }> = []
    const handleQuery = async (text: string, values?: readonly unknown[]) => {
      queries.push({ text, values })
      if (text === 'begin' || text === 'commit' || text === 'rollback') return result()
      if (text.includes('from app_auth.sessions')) return result([sessionRow])
      if (text.includes('private.effective_permission_for_auth_user')) {
        return result([{ allowed: true }])
      }
      if (text.includes('from app_files.objects') && text.includes('for update')) {
        return result([{ object_key: storedFile.object_key }])
      }
      throw new Error(`Unexpected query: ${text}`)
    }
    const client = { query: handleQuery, release: () => undefined }
    const db = {
      query: handleQuery,
      connect: async () => client,
      end: async () => undefined,
    } as unknown as Database
    const app = await buildApp({
      env: loadEnvironment({
        DATABASE_URL: 'postgresql://example.invalid/app',
        ALLOWED_ORIGINS: 'https://crm.example.test',
        LOG_LEVEL: 'silent',
        ATTACHMENTS_DIR: attachmentsDir,
      }),
      db,
      fetch: globalThis.fetch,
      now: () => new Date('2026-07-29T12:00:00.000Z'),
    })
    const boundary = '----contract-award-existing-test'
    const payload = Buffer.from([
      `--${boundary}\r\n`,
      'Content-Disposition: form-data; name="folder"\r\n\r\n',
      'contract_awards\r\n',
      `--${boundary}\r\n`,
      'Content-Disposition: form-data; name="id"\r\n\r\n',
      'award-123\r\n',
      `--${boundary}\r\n`,
      'Content-Disposition: form-data; name="file"; filename="signed.pdf"\r\n',
      'Content-Type: application/pdf\r\n\r\n',
      '%PDF-replacement\r\n',
      `--${boundary}--\r\n`,
    ].join(''))

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/files',
        headers: {
          authorization: `Bearer ${TOKEN}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      })

      expect(response.statusCode).toBe(409)
      expect(response.json().error.code).toBe('contract_award_file_exists')
      expect(queries.some(query => query.text.includes('insert into app_files.objects'))).toBe(false)
      await expect(readFile(existingPath, 'utf8')).resolves.toBe('original-signed-award')
    } finally {
      await app.close()
      await rm(attachmentsDir, { recursive: true, force: true })
    }
  })
})
