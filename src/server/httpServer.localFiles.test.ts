import { createServer as createHttpServer, type Server } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer, type ServerInstance } from './httpServer'

describe('local file serving hardening', () => {
  let tempDir = ''
  let instance: ServerInstance | null = null
  let server: Server | null = null
  let baseUrl = ''

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'codexui-local-files-'))
    instance = createServer()
    server = createHttpServer(instance.app)
    await new Promise<void>((resolve, reject) => {
      server?.once('error', reject)
      server?.listen(0, '127.0.0.1', () => {
        server?.off('error', reject)
        const address = server?.address() as AddressInfo
        baseUrl = `http://127.0.0.1:${address.port}`
        resolve()
      })
    })
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!server) {
        resolve()
        return
      }
      server.close(() => resolve())
    })
    instance?.dispose()
    await rm(tempDir, { recursive: true, force: true })
    instance = null
    server = null
    baseUrl = ''
  })

  it('serves browsed HTML as plain source text', async () => {
    const htmlPath = join(tempDir, 'index.html')
    await writeFile(htmlPath, '<script>fetch("/codex-api/rpc")</script>', 'utf8')

    const response = await fetch(`${baseUrl}/codex-local-browse${encodeURI(htmlPath)}`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await response.text()).toContain('fetch("/codex-api/rpc")')
  })

  it('serves direct local HTML files as plain source text', async () => {
    const htmlPath = join(tempDir, 'direct.html')
    await writeFile(htmlPath, '<!doctype html><button>unsafe</button>', 'utf8')

    const response = await fetch(`${baseUrl}/codex-local-file?path=${encodeURIComponent(htmlPath)}`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await response.text()).toContain('<button>unsafe</button>')
  })

  it('serves SVG image route requests as plain source text', async () => {
    const svgPath = join(tempDir, 'icon.svg')
    await writeFile(svgPath, '<svg><script>fetch("/codex-api/rpc")</script></svg>', 'utf8')

    const response = await fetch(`${baseUrl}/codex-local-image?path=${encodeURIComponent(svgPath)}`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await response.text()).toContain('<script>')
  })
})
