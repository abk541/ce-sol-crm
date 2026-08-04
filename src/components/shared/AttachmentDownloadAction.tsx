import { useState, type ReactNode } from 'react'
import { Download } from 'lucide-react'
import toast from 'react-hot-toast'
import type { FileAttachment } from '../../types'
import {
  attachmentAccessErrorMessage,
  downloadAttachment,
  hasAttachmentSource,
} from '../../lib/attachments'

interface AttachmentDownloadActionProps {
  attachment: FileAttachment
  className?: string
  iconSize?: number
  fallbackMessage?: string
  onAttempt?: () => void
}

export function AttachmentDownloadAction({
  attachment,
  className = '',
  iconSize = 11,
  fallbackMessage = 'Attachment could not be downloaded.',
  onAttempt,
}: AttachmentDownloadActionProps) {
  const [downloading, setDownloading] = useState(false)
  const downloadable = hasAttachmentSource(attachment)

  const handleDownload = async () => {
    if (!downloadable || downloading) return
    onAttempt?.()
    setDownloading(true)
    try {
      await downloadAttachment(attachment)
    } catch (error) {
      toast.error(attachmentAccessErrorMessage(error, fallbackMessage))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => { void handleDownload() }}
      disabled={!downloadable || downloading}
      className={`inline-flex flex-shrink-0 items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-55 ${className}`}
      title={downloadable ? `Download ${attachment.name}` : 'The original file must be re-uploaded.'}
      aria-label={downloadable ? `Download ${attachment.name}` : `${attachment.name}: re-upload required`}
    >
      <Download size={iconSize} />
      {downloadable ? (downloading ? 'Downloading…' : 'Download') : 'Re-upload required'}
    </button>
  )
}

interface AttachmentDownloadRowProps extends AttachmentDownloadActionProps {
  className?: string
  nameClassName?: string
  actionClassName?: string
  leading?: ReactNode
  details?: ReactNode
}

export function AttachmentDownloadRow({
  attachment,
  className = '',
  nameClassName = '',
  actionClassName = '',
  leading,
  details,
  iconSize,
  fallbackMessage,
  onAttempt,
}: AttachmentDownloadRowProps) {
  return (
    <div className={`flex min-w-0 items-center justify-between gap-3 ${className}`}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {leading}
        <div className="min-w-0 flex-1">
          <p className={`truncate ${nameClassName}`} title={attachment.name}>{attachment.name}</p>
          {details}
        </div>
      </div>
      <AttachmentDownloadAction
        attachment={attachment}
        className={actionClassName}
        iconSize={iconSize}
        fallbackMessage={fallbackMessage}
        onAttempt={onAttempt}
      />
    </div>
  )
}
