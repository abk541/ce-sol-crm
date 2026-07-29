import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const RELEASE_TOKEN = '__CE_ERP_RELEASE__'

function entryAssetFromHtml(html) {
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
    .map(match => match[1])
  const entry = scripts.find(src => /(?:^|\/)assets\/index-[^/?#]+\.js(?:[?#].*)?$/.test(src))
  if (!entry) throw new Error('Could not find the built entry asset in dist/index.html.')
  return entry.split(/[?#]/, 1)[0].replace(/^\.?\//, '')
}

export async function stampRelease(distDirectory = resolve('dist')) {
  const dist = resolve(distDirectory)
  const indexPath = resolve(dist, 'index.html')
  const serviceWorkerPath = resolve(dist, 'sw.js')
  const html = await readFile(indexPath, 'utf8')
  const entryRelative = entryAssetFromHtml(html)
  const entryPath = resolve(dist, entryRelative)
  const relativeEntryPath = relative(dist, entryPath)

  if (
    relativeEntryPath === ''
    || relativeEntryPath === '..'
    || relativeEntryPath.startsWith(`..${sep}`)
  ) {
    throw new Error('The built entry asset resolves outside dist/.')
  }

  const [entryAsset, serviceWorker] = await Promise.all([
    readFile(entryPath),
    readFile(serviceWorkerPath, 'utf8'),
  ])
  if (!serviceWorker.includes(RELEASE_TOKEN)) {
    throw new Error(`dist/sw.js is missing the ${RELEASE_TOKEN} token.`)
  }

  const release = createHash('sha256').update(entryAsset).digest('hex').slice(0, 16)
  await writeFile(
    serviceWorkerPath,
    serviceWorker.replaceAll(RELEASE_TOKEN, release),
    'utf8',
  )
  return { release, entry: relativeEntryPath.replaceAll(sep, '/') }
}

const invokedAsScript = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedAsScript) {
  stampRelease(process.argv[2] ? resolve(process.argv[2]) : resolve('dist'))
    .then(({ release, entry }) => {
      console.log(`Stamped service worker release ${release} from ${entry}.`)
    })
    .catch(error => {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
    })
}
