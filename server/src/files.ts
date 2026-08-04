import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'
import { requireCompleted } from './auth.js'
import { ApiError } from './errors.js'
import { asServiceUser, transaction } from './db.js'
import type { Queryable } from './db.js'
import type { Dependencies } from './types.js'

interface StoredFile {
  storage_path: string
  object_key: string
  attachment_id: string
  original_name: string
  content_type: string | null
  size_bytes: string | number
  attached_at: Date
  uploader_name: string
  content_available: boolean
}

interface ContractAwardDeletionJob {
  object_key: string
  storage_path: string
  queued_at: Date
  attempt_count: number
  last_attempt_at: Date | null
  last_error_code: string | null
}

interface ContractAwardCleanupResult {
  job: ContractAwardDeletionJob
  status: 'deleted' | 'queued'
}

const UNSAFE_CONTENT_TYPES = new Set([
  'image/svg+xml',
  'text/html',
  'application/xhtml+xml',
  'application/xml',
  'text/xml',
])

const FILE_WRITE_PERMISSIONS = [
  'admin:manageUsers',
  'opportunity:create',
  'opportunity:edit',
  'opportunity:comment',
  'opportunity:submitProposal',
  'sourcing:write',
  'nonSubmission:submit',
  'contract:edit',
  'contract:comment',
  'contract:allCommChannels',
  'operations:manage',
  'pastPerformance:manage',
  'hr:manageCertifications',
  'hr:reviewRequests',
  'comment:editAny',
] as const

const CONTRACT_AWARD_FOLDER_PREFIX = 'contract_awards/'
const CONTRACT_AWARD_RETRY_LIMIT = 25
const FILE_AVAILABILITY_BATCH_LIMIT = 100

export type FileAvailabilityReason = 'available' | 'not_found' | 'content_unavailable'

export interface FileAvailabilityResult {
  storagePath: string
  available: boolean
  reason: FileAvailabilityReason
}

export interface FileAvailabilityRow {
  storage_path: string
  object_key: string
  content_available: boolean
  size_bytes: string | number
}

function validatedStoragePath(value: unknown, label = 'path'): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 1024
    || /[\u0000\r\n]/.test(value)
  ) {
    throw new ApiError(400, 'invalid_request', `${label} is invalid.`)
  }
  return value
}

function storedObjectPath(attachmentsDir: string, objectKey: string): string {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(objectKey)) {
    throw new ApiError(500, 'file_metadata_invalid', 'The attachment metadata is invalid.')
  }
  return join(attachmentsDir, objectKey.slice(0, 2), objectKey)
}

function availabilityPaths(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'invalid_request', 'request must be an object.')
  }
  const body = value as Record<string, unknown>
  const unexpected = Object.keys(body).filter(key => key !== 'paths')
  if (unexpected.length > 0 || !Array.isArray(body.paths)) {
    throw new ApiError(400, 'invalid_request', 'Only a paths array is supported.')
  }
  if (body.paths.length > FILE_AVAILABILITY_BATCH_LIMIT) {
    throw new ApiError(
      400,
      'invalid_request',
      `No more than ${FILE_AVAILABILITY_BATCH_LIMIT} attachment paths can be checked at once.`,
    )
  }
  const paths = body.paths.map((path, index) => validatedStoragePath(path, `paths[${index}]`))
  if (new Set(paths).size !== paths.length) {
    throw new ApiError(400, 'invalid_request', 'paths must not contain duplicates.')
  }
  return paths
}

function matchesStoredFileSize(
  metadata: { isFile(): boolean; size: number } | null,
  sizeBytes: string | number,
): boolean {
  const expectedSize = Number(sizeBytes)
  return metadata?.isFile() === true
    && Number.isSafeInteger(expectedSize)
    && expectedSize >= 0
    && metadata.size === expectedSize
}

export async function inspectFileAvailabilityRows(
  attachmentsDir: string,
  paths: readonly string[],
  rows: readonly FileAvailabilityRow[],
): Promise<FileAvailabilityResult[]> {
  if (paths.length === 0) return []
  const byPath = new Map(rows.map(row => [row.storage_path, row]))

  return Promise.all(paths.map(async (storagePath): Promise<FileAvailabilityResult> => {
    const row = byPath.get(storagePath)
    if (!row) return { storagePath, available: false, reason: 'not_found' }
    if (!row.content_available) {
      return { storagePath, available: false, reason: 'content_unavailable' }
    }
    let physicalPath: string
    try {
      physicalPath = storedObjectPath(attachmentsDir, row.object_key)
    } catch {
      return { storagePath, available: false, reason: 'content_unavailable' }
    }
    const metadata = await stat(physicalPath).catch(() => null)
    return matchesStoredFileSize(metadata, row.size_bytes)
      ? { storagePath, available: true, reason: 'available' }
      : { storagePath, available: false, reason: 'content_unavailable' }
  }))
}

export async function inspectFileAvailability(
  database: Queryable,
  attachmentsDir: string,
  paths: readonly string[],
): Promise<FileAvailabilityResult[]> {
  if (paths.length === 0) return []
  const result = await database.query<FileAvailabilityRow>(
    `select storage_path, object_key::text as object_key, content_available, size_bytes
       from app_files.objects
      where storage_path = any($1::text[])`,
    [paths],
  )
  return inspectFileAvailabilityRows(attachmentsDir, paths, result.rows)
}

function cleanFolder(value: string | undefined): string {
  const cleaned = (value || 'misc').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 64)
  return cleaned || 'misc'
}

function cleanName(value: string): string {
  const base = value.replace(/[\u0000-\u001f\u007f/\\]+/g, '_').trim().slice(-255)
  return base || 'attachment'
}

function cleanId(value: string | undefined): string {
  if (!value) return randomUUID()
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(value)) {
    throw new ApiError(400, 'invalid_request', 'id contains unsupported characters.')
  }
  return value
}

function isoDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) throw new ApiError(400, 'invalid_request', 'attachedAt is invalid.')
  return parsed
}

function attachmentResult(row: StoredFile): Record<string, unknown> {
  return {
    id: row.attachment_id,
    name: row.original_name,
    attachedAt: new Date(row.attached_at).toISOString(),
    uploadedBy: row.uploader_name,
    mimeType: row.content_type || undefined,
    size: Number(row.size_bytes),
    storagePath: row.storage_path,
  }
}

async function requireFileWrite(
  dependencies: Dependencies,
  accountId: string,
  folder: string,
): Promise<void> {
  // Every completed active account may submit an HR request. Do not make HR
  // attachments depend on an unrelated opportunity/contract write override.
  if (folder === 'hr_requests') return
  const result = await dependencies.db.query<{ allowed: boolean }>(
    `select exists (
       select 1 from unnest($2::text[]) permission
        where private.effective_permission_for_auth_user($1, permission)
     ) as allowed`,
    [accountId, FILE_WRITE_PERMISSIONS],
  )
  if (result.rows[0]?.allowed !== true) {
    throw new ApiError(403, 'forbidden', 'You do not have permission to upload attachments.')
  }
}

function contractAwardStoragePath(value: string): string {
  const path = value.trim()
  if (
    !path.startsWith(CONTRACT_AWARD_FOLDER_PREFIX)
    || path.length > 1024
    || /[\u0000\r\n]/.test(path)
  ) {
    throw new ApiError(
      400,
      'invalid_contract_award_path',
      'Only private contract award files can be cleaned up through this endpoint.',
    )
  }
  return path
}

async function requireContractAwardDelete(
  client: Queryable,
  accountId: string,
): Promise<void> {
  const result = await client.query<{ allowed: boolean }>(
    `select exists (
       select 1 from unnest($2::text[]) permission
        where private.effective_permission_for_auth_user($1, permission)
     ) as allowed`,
    [accountId, ['contract:edit', 'admin:manageUsers']],
  )
  if (result.rows[0]?.allowed !== true) {
    throw new ApiError(
      403,
      'forbidden',
      'You do not have permission to remove contract award files.',
    )
  }
}

type RemovePhysicalFile = (path: string) => Promise<void>

async function enqueueUnreferencedContractAwardFile(
  client: Queryable,
  requestedPath: string,
  accountId: string,
): Promise<ContractAwardDeletionJob> {
  const storagePath = contractAwardStoragePath(requestedPath)

  const stored = await client.query<StoredFile>(
    `select object_file.*, ''::text as uploader_name
       from app_files.objects object_file
      where object_file.storage_path = $1
      for update`,
    [storagePath],
  )
  const file = stored.rows[0]
  if (!file) {
    const pending = await client.query<ContractAwardDeletionJob>(
      `select *
         from app_files.contract_award_deletion_queue
        where storage_path = $1
        order by queued_at, object_key
        limit 1`,
      [storagePath],
    )
    if (pending.rows[0]) return pending.rows[0]
    throw new ApiError(404, 'file_not_found', 'The contract award file was not found.')
  }

  // This definer function acquires a SHARE lock and performs an all-contract
  // reference check without granting the service role broad contract access.
  // The outer transaction retains its lock through metadata cleanup.
  const references = await client.query<{ referenced: boolean }>(
    'select private.contract_award_file_is_referenced($1) as referenced',
    [storagePath],
  )
  if (references.rows[0]?.referenced === true) {
    throw new ApiError(
      409,
      'file_still_referenced',
      'This award file is still attached to a contract and was not removed.',
    )
  }
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(file.object_key)) {
    throw new ApiError(500, 'file_cleanup_failed', 'The award file metadata is invalid.')
  }

  const deleted = await client.query<StoredFile>(
    `delete from app_files.objects
      where storage_path = $1
        and object_key = $2
      returning *, ''::text as uploader_name`,
    [storagePath, file.object_key],
  )
  if (!deleted.rows[0]) {
    throw new ApiError(
      409,
      'file_cleanup_conflict',
      'The award file changed during cleanup. Please retry.',
    )
  }

  const queued = await client.query<ContractAwardDeletionJob>(
    `insert into app_files.contract_award_deletion_queue
       (object_key, storage_path, queued_by)
     values ($1, $2, $3)
     on conflict (object_key) do nothing
     returning *`,
    [file.object_key, storagePath, accountId],
  )
  if (queued.rows[0]) return queued.rows[0]

  const existing = await client.query<ContractAwardDeletionJob>(
    `select *
       from app_files.contract_award_deletion_queue
      where object_key = $1`,
    [file.object_key],
  )
  if (!existing.rows[0] || existing.rows[0].storage_path !== storagePath) {
    throw new ApiError(
      409,
      'file_cleanup_conflict',
      'The award file cleanup job changed. Please retry.',
    )
  }
  return existing.rows[0]
}

function physicalObjectPath(attachmentsDir: string, objectKey: string): string {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(objectKey)) {
    throw new ApiError(500, 'file_cleanup_failed', 'The award file cleanup job is invalid.')
  }
  return join(attachmentsDir, objectKey.slice(0, 2), objectKey)
}

function filesystemErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return 'cleanup_failed'
  const code = typeof error.code === 'string' ? error.code : 'cleanup_failed'
  return /^[A-Za-z0-9_-]{1,64}$/.test(code) ? code : 'cleanup_failed'
}

async function markContractAwardCleanupFailure(
  database: Queryable,
  job: ContractAwardDeletionJob,
  errorCode: string,
): Promise<void> {
  await database.query(
    `update app_files.contract_award_deletion_queue
        set attempt_count = attempt_count + 1,
            last_attempt_at = now(),
            last_error_code = $2
      where object_key = $1`,
    [job.object_key, errorCode],
  )
}

async function processContractAwardDeletionJob(
  database: Queryable,
  attachmentsDir: string,
  job: ContractAwardDeletionJob,
  removePhysicalFile: RemovePhysicalFile = async path => rm(path),
): Promise<'deleted' | 'queued'> {
  const physicalPath = physicalObjectPath(attachmentsDir, job.object_key)
  try {
    await removePhysicalFile(physicalPath)
  } catch (error) {
    if (filesystemErrorCode(error) !== 'ENOENT') {
      await markContractAwardCleanupFailure(
        database,
        job,
        filesystemErrorCode(error),
      ).catch(() => undefined)
      return 'queued'
    }
  }

  try {
    await database.query(
      `delete from app_files.contract_award_deletion_queue
        where object_key = $1`,
      [job.object_key],
    )
    return 'deleted'
  } catch {
    // The byte removal is idempotent. Keeping the durable job lets a later
    // retry observe ENOENT and finish removing the queue record safely.
    await markContractAwardCleanupFailure(
      database,
      job,
      'queue_finalize_failed',
    ).catch(() => undefined)
    return 'queued'
  }
}

async function deleteContractAwardAndAttemptCleanup(
  dependencies: Dependencies,
  accountId: string,
  requestedPath: string,
  removePhysicalFile?: RemovePhysicalFile,
): Promise<ContractAwardCleanupResult> {
  const job = await asServiceUser(dependencies.db, accountId, async client => {
    await requireContractAwardDelete(client, accountId)
    return enqueueUnreferencedContractAwardFile(client, requestedPath, accountId)
  })

  const status = await processContractAwardDeletionJob(
    dependencies.db,
    dependencies.env.attachmentsDir,
    job,
    removePhysicalFile,
  )
  return { job, status }
}

async function retryQueuedContractAwardDeletions(
  dependencies: Dependencies,
  accountId: string,
  removePhysicalFile?: RemovePhysicalFile,
): Promise<{ attempted: number; deleted: number; pending: number }> {
  const jobs = await asServiceUser(dependencies.db, accountId, async client => {
    await requireContractAwardDelete(client, accountId)
    const pending = await client.query<ContractAwardDeletionJob>(
      `select *
         from app_files.contract_award_deletion_queue
        order by coalesce(last_attempt_at, queued_at), queued_at, object_key
        limit $1`,
      [CONTRACT_AWARD_RETRY_LIMIT],
    )
    return pending.rows
  })

  let deleted = 0
  for (const job of jobs) {
    const status = await processContractAwardDeletionJob(
      dependencies.db,
      dependencies.env.attachmentsDir,
      job,
      removePhysicalFile,
    )
    if (status === 'deleted') deleted += 1
  }
  return {
    attempted: jobs.length,
    deleted,
    pending: jobs.length - deleted,
  }
}

interface UploadedTemp {
  part: MultipartFile
  path: string
  bytes: number
  sha256: string
}

async function writeTemporaryFile(
  part: MultipartFile,
  temporaryDirectory: string,
  maxBytes: number,
): Promise<UploadedTemp> {
  await mkdir(temporaryDirectory, { recursive: true, mode: 0o700 })
  const path = join(temporaryDirectory, randomUUID())
  let bytes = 0
  const digest = createHash('sha256')
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length
      if (bytes > maxBytes) {
        callback(new ApiError(413, 'file_too_large', `Attachments cannot exceed ${maxBytes} bytes.`))
        return
      }
      digest.update(chunk)
      callback(null, chunk)
    },
  })
  try {
    await pipeline(part.file, meter, createWriteStream(path, { flags: 'wx', mode: 0o600 }))
    if (part.file.truncated) throw new ApiError(413, 'file_too_large', 'The attachment exceeds the upload limit.')
    return { part, path, bytes, sha256: digest.digest('hex') }
  } catch (error) {
    await rm(path, { force: true }).catch(() => undefined)
    throw error
  }
}

async function multipartUpload(request: FastifyRequest, dependencies: Dependencies): Promise<Record<string, unknown>> {
  const temporaryDirectory = join(dependencies.env.attachmentsDir, '.tmp')
  const fields: Record<string, string> = {}
  let uploaded: UploadedTemp | null = null

  try {
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== 'file' || uploaded) {
          part.file.resume()
          throw new ApiError(400, 'invalid_request', 'Exactly one file field is required.')
        }
        uploaded = await writeTemporaryFile(part, temporaryDirectory, dependencies.env.maxUploadBytes)
      } else if (['folder', 'id', 'attachedAt'].includes(part.fieldname)) {
        fields[part.fieldname] = String(part.value ?? '')
      } else {
        throw new ApiError(400, 'invalid_request', `Unsupported multipart field: ${part.fieldname}.`)
      }
    }
    if (!uploaded) throw new ApiError(400, 'invalid_request', 'A file field is required.')
    const temporaryUpload = uploaded
    const folder = cleanFolder(fields.folder)
    await requireFileWrite(dependencies, request.auth?.accountId as string, folder)
    if (folder === 'contract_awards') {
      await requireContractAwardDelete(
        dependencies.db,
        request.auth?.accountId as string,
      )
    }

    const originalName = cleanName(temporaryUpload.part.filename)
    const id = cleanId(fields.id)
    const storagePath = `${folder}/${id}-${originalName.replace(/[^A-Za-z0-9._-]+/g, '_')}`
    const contentType = UNSAFE_CONTENT_TYPES.has(temporaryUpload.part.mimetype.toLowerCase())
      ? 'application/octet-stream'
      : (temporaryUpload.part.mimetype || 'application/octet-stream').slice(0, 255)
    const attachedAt = isoDate(fields.attachedAt, dependencies.now())
    const objectKey = randomUUID()
    const finalPath = join(dependencies.env.attachmentsDir, objectKey.slice(0, 2), objectKey)
    await mkdir(dirname(finalPath), { recursive: true, mode: 0o700 })
    await rename(temporaryUpload.path, finalPath)
    temporaryUpload.path = ''

    try {
      const result = await transaction(dependencies.db, async (client) => {
        const prior = await client.query<{ object_key: string }>(
          'select object_key from app_files.objects where storage_path = $1 for update',
          [storagePath],
        )
        if (prior.rows[0]) {
          throw new ApiError(
            409,
            folder === 'contract_awards' ? 'contract_award_file_exists' : 'attachment_file_exists',
            folder === 'contract_awards'
              ? 'An award file with this identifier and name already exists. Upload it with a new name.'
              : 'An attachment with this identifier and name already exists. Upload it again to create a new file.',
          )
        }
        const inserted = await client.query<StoredFile>(
          `insert into app_files.objects
             (storage_path, object_key, attachment_id, original_name, content_type, size_bytes, sha256,
               attached_at, uploaded_by, content_available)
            values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
           returning *, $10::text as uploader_name`,
          [
            storagePath,
            objectKey,
            id,
            originalName,
            contentType,
            temporaryUpload.bytes,
            temporaryUpload.sha256,
            attachedAt,
            request.auth?.accountId,
            request.auth?.profile.username || request.auth?.profile.name || '',
          ],
        )
        return inserted.rows[0]
      })
      if (!result) throw new ApiError(500, 'upload_failed', 'The uploaded attachment could not be recorded.')
      return { data: attachmentResult(result), error: null }
    } catch (error) {
      await rm(finalPath, { force: true }).catch(() => undefined)
      if ((error as { code?: unknown })?.code === '23505') {
        throw new ApiError(
          409,
          folder === 'contract_awards' ? 'contract_award_file_exists' : 'attachment_file_exists',
          folder === 'contract_awards'
            ? 'An award file with this identifier and name already exists. Upload it with a new name.'
            : 'An attachment with this identifier and name already exists. Upload it again to create a new file.',
        )
      }
      throw error
    }
  } finally {
    if (uploaded?.path) await rm(uploaded.path, { force: true }).catch(() => undefined)
  }
}

async function sendFile(
  request: FastifyRequest,
  storagePath: string,
  dependencies: Dependencies,
): Promise<unknown> {
  validatedStoragePath(storagePath, 'The attachment path')
  const result = await dependencies.db.query<StoredFile>(
    `select object_file.*, coalesce(profile.username, profile.name, '') as uploader_name
       from app_files.objects object_file
       left join public.users profile on profile.auth_user_id = object_file.uploaded_by
      where object_file.storage_path = $1`,
    [storagePath],
  )
  const file = result.rows[0]
  if (!file) throw new ApiError(404, 'file_not_found', 'The attachment was not found.')
  if (!file.content_available) {
    throw new ApiError(410, 'file_content_unavailable', 'This historical attachment has metadata, but its content was unavailable during migration.')
  }
  const physicalPath = storedObjectPath(dependencies.env.attachmentsDir, file.object_key)
  const metadata = await stat(physicalPath).catch(() => null)
  if (!matchesStoredFileSize(metadata, file.size_bytes)) {
    throw new ApiError(410, 'file_content_unavailable', 'The attachment content is currently unavailable.')
  }

  return { file, physicalPath }
}

export function registerFileRoutes(app: FastifyInstance, dependencies: Dependencies): void {
  app.post(
    '/api/v1/files',
    { preHandler: (request) => requireCompleted(request, dependencies) },
    async (request) => multipartUpload(request, dependencies),
  )

  app.post(
    '/api/v1/files/availability',
    { preHandler: (request) => requireCompleted(request, dependencies) },
    async (request) => ({
      data: await inspectFileAvailability(
        dependencies.db,
        dependencies.env.attachmentsDir,
        availabilityPaths(request.body),
      ),
      error: null,
    }),
  )

  const download = async (request: FastifyRequest, reply: import('fastify').FastifyReply, path: string) => {
    const result = await sendFile(request, path, dependencies) as { file: StoredFile; physicalPath: string }
    const dispositionName = result.file.original_name.replace(/["\\\r\n]/g, '_')
    return reply
      .header('Content-Type', result.file.content_type || 'application/octet-stream')
      .header('Content-Length', String(result.file.size_bytes))
      .header('Content-Disposition', `attachment; filename="${dispositionName}"; filename*=UTF-8''${encodeURIComponent(dispositionName)}`)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', 'private, no-store')
      .send(createReadStream(result.physicalPath))
  }

  app.get<{ Params: { encodedPath: string } }>(
    '/api/v1/files/:encodedPath',
    { preHandler: (request) => requireCompleted(request, dependencies) },
    async (request, reply) => download(request, reply, request.params.encodedPath),
  )
  app.get<{ Querystring: { path?: string } }>(
    '/api/v1/files',
    { preHandler: (request) => requireCompleted(request, dependencies) },
    async (request, reply) => download(request, reply, request.query.path || ''),
  )

  app.delete<{ Params: { encodedPath: string } }>(
    '/api/v1/files/contract-awards/:encodedPath',
    { preHandler: (request) => requireCompleted(request, dependencies) },
    async (request) => {
      const accountId = request.auth?.accountId as string
      const cleanup = await deleteContractAwardAndAttemptCleanup(
        dependencies,
        accountId,
        request.params.encodedPath,
      )
      return {
        data: {
          deleted: true,
          storagePath: cleanup.job.storage_path,
          cleanupPending: cleanup.status === 'queued',
          status: cleanup.status,
        },
        error: null,
      }
    },
  )

  app.post(
    '/api/v1/files/contract-awards/cleanup/retry',
    { preHandler: (request) => requireCompleted(request, dependencies) },
    async (request) => {
      const accountId = request.auth?.accountId as string
      const result = await retryQueuedContractAwardDeletions(
        dependencies,
        accountId,
      )
      return {
        data: {
          ...result,
          limit: CONTRACT_AWARD_RETRY_LIMIT,
        },
        error: null,
      }
    },
  )
}

export const __test = {
  availabilityPaths,
  inspectFileAvailability,
  inspectFileAvailabilityRows,
  contractAwardStoragePath,
  requireContractAwardDelete,
  enqueueUnreferencedContractAwardFile,
  processContractAwardDeletionJob,
  deleteContractAwardAndAttemptCleanup,
  retryQueuedContractAwardDeletions,
}
