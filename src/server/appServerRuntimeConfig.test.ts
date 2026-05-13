import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildAppServerArgs,
  isUnsafeAppServerRuntimeConfig,
  resolveAppServerRuntimeConfig,
} from './appServerRuntimeConfig'

describe('app-server runtime config', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults to workspace-write with on-request approvals', () => {
    vi.stubEnv('CODEXUI_SANDBOX_MODE', '')
    vi.stubEnv('CODEXUI_APPROVAL_POLICY', '')

    expect(resolveAppServerRuntimeConfig()).toEqual({
      sandboxMode: 'workspace-write',
      approvalPolicy: 'on-request',
    })

    expect(buildAppServerArgs()).toEqual([
      'app-server',
      '-c',
      'approval_policy="on-request"',
      '-c',
      'sandbox_mode="workspace-write"',
    ])
  })

  it('honors explicit unsafe local runtime environment values', () => {
    vi.stubEnv('CODEXUI_SANDBOX_MODE', 'danger-full-access')
    vi.stubEnv('CODEXUI_APPROVAL_POLICY', 'never')

    const config = resolveAppServerRuntimeConfig()

    expect(config).toEqual({
      sandboxMode: 'danger-full-access',
      approvalPolicy: 'never',
    })
    expect(isUnsafeAppServerRuntimeConfig(config)).toBe(true)
    expect(buildAppServerArgs()).toContain('approval_policy="never"')
    expect(buildAppServerArgs()).toContain('sandbox_mode="danger-full-access"')
  })

  it('falls back to safe defaults for invalid environment values', () => {
    vi.stubEnv('CODEXUI_SANDBOX_MODE', 'bad-sandbox')
    vi.stubEnv('CODEXUI_APPROVAL_POLICY', 'bad-policy')

    expect(resolveAppServerRuntimeConfig()).toEqual({
      sandboxMode: 'workspace-write',
      approvalPolicy: 'on-request',
    })
  })
})
