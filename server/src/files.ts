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
import { transaction } from './db.js'
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

async function requireFileWrite(dependencies: Dependencies, accountId: string): Promise<void> {
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
  await requireFileWrite(dependencies, request.auth?.accountId as string)
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

    const originalName = cleanName(temporaryUpload.part.filename)
    const id = cleanId(fields.id)
    const storagePath = `${cleanFolder(fields.folder)}/${id}-${originalName.replace(/[^A-Za-z0-9._-]+/g, '_')}`
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
        const inserted = await client.query<StoredFile>(
          `insert into app_files.objects
             (storage_path, object_key, attachment_id, original_name, content_type, size_bytes, sha256,
              attached_at, uploaded_by, content_available)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
           on conflict (storage_path) do update set
             object_key = excluded.object_key,
             attachment_id = excluded.attachment_id,
             original_name = excluded.original_name,
             content_type = excluded.content_type,
             size_bytes = excluded.size_bytes,
             sha256 = excluded.sha256,
             attached_at = excluded.attached_at,
             uploaded_by = excluded.uploaded_by,
             content_available = true,
             updated_at = now()
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
        return {
          file: inserted.rows[0],
          previousObjectKey: prior.rows[0]?.object_key ?? null,
        }
      })
      if (!result.file) throw new ApiError(500, 'upload_failed', 'The uploaded attachment could not be recorded.')
      if (result.previousObjectKey && result.previousObjectKey !== objectKey) {
        const oldPath = join(
          dependencies.env.attachmentsDir,
          result.previousObjectKey.slice(0, 2),
          result.previousObjectKey,
        )
        await rm(oldPath, { force: true }).catch(() => undefined)
      }
      return { data: attachmentResult(result.file), error: null }
    } catch (error) {
      await rm(finalPath, { force: true }).catch(() => undefined)
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
  if (!storagePath || storagePath.length > 1024 || /[\u0000\r\n]/.test(storagePath)) {
    throw new ApiError(400, 'invalid_request', 'The attachment path is invalid.')
  }
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
  const physicalPath = join(dependencies.env.attachmentsDir, file.object_key.slice(0, 2), file.object_key)
  const metadata = await stat(physicalPath).catch(() => null)
  if (!metadata?.isFile()) {
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
}
