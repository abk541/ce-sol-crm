import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { Contract, Opportunity } from '../types'

function wrapText(text: string, maxChars: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length > maxChars && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

function fmtMoney(value?: number) {
  if (value == null) return ''
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function download(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes.slice().buffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function generatePastPerformancePdf({
  contract,
  opportunity,
  description,
}: {
  contract: Contract
  opportunity?: Opportunity
  description: string
}) {
  const templateUrl = `${import.meta.env.BASE_URL}templates/pp-template.pdf`
  const templateBytes = await fetch(templateUrl).then(res => {
    if (!res.ok) throw new Error('Past performance PDF template could not be loaded.')
    return res.arrayBuffer()
  })
  const pdf = await PDFDocument.load(templateBytes)
  const page = pdf.getPage(0)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.08, 0.12, 0.2)
  const muted = rgb(0.28, 0.33, 0.42)
  const awardedDate = opportunity?.status === 'WON'
    ? (opportunity.submittedAt ?? contract.popStart)
    : contract.popStart
  const contractId = contract.contractId || opportunity?.solicitationId || contract.id
  const amount = opportunity?.contractAmount ?? contract.value

  const write = (label: string, value: string, x: number, y: number, width = 42) => {
    page.drawText(label, { x, y, size: 7, font: bold, color: muted })
    wrapText(value || '-', width).slice(0, 2).forEach((line, i) => {
      page.drawText(line, { x, y: y - 12 - i * 11, size: 9, font, color: ink })
    })
  }

  write('PROJECT / CONTRACT', contract.title || opportunity?.solicitation || '-', 56, 705, 62)
  write('DATE OF CONTRACT', awardedDate ? new Date(awardedDate).toLocaleDateString('en-US') : '-', 405, 705, 22)
  write('CONTRACT ID', contractId, 56, 658, 42)
  write('AGENCY', contract.client || opportunity?.client || '-', 235, 658, 42)
  write('LOCATION', contract.location || opportunity?.location || '-', 405, 658, 28)
  write('TYPE', contract.type === 'S&D' ? 'Delivery' : contract.type, 56, 610, 24)
  write('NAICS', contract.naicsCode || opportunity?.naicsCode || '-', 160, 610, 18)
  write('SET ASIDE', contract.setAside || opportunity?.setAside || '-', 245, 610, 18)
  write('TOTAL CONSTRUCTION AMOUNT', fmtMoney(amount), 360, 610, 28)

  page.drawText('PROJECT DESCRIPTION', { x: 56, y: 552, size: 8, font: bold, color: muted })
  wrapText(description, 95).slice(0, 16).forEach((line, i) => {
    page.drawText(line, { x: 56, y: 536 - i * 12, size: 9, font, color: ink })
  })

  const bytes = await pdf.save()
  const safeId = contractId.replace(/[^a-z0-9_-]+/gi, '-')
  download(bytes, `past-performance-${safeId}.pdf`)
}
