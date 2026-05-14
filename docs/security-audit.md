# Security Audit Tracker

Last updated: 2026-05-14

Scope: static review of the local web UI, CLI, server bridge, auth middleware, local file browser/editor, integrated terminal, provider proxy, skills sync, Telegram integration, and supply-chain posture. No dynamic exploit testing has been run yet.

## Overall Verdict

This project is suitable as a personal, local, trusted-LAN development base.

It is not yet suitable as a public, team, or semi-trusted plugin/application security base without hardening. The main pattern is that powerful local desktop capabilities are exposed through one local web origin. If that origin, an authenticated browser session, or same-origin rendered content is compromised, the attacker can reach local files, shell/session operations, and model/tool execution paths.

## Severity Model

- High: likely local command execution, arbitrary file access/write, token exposure, or broad trust-boundary bypass after a plausible UI/session/origin compromise.
- Medium: meaningful hardening gap or abuse path that usually requires an authenticated user, local access, or a second weakness.
- Low: configuration hygiene or defense-in-depth issue.

## Open Issues

### SEC-001: Runtime sandbox is hardcoded to full local access

Severity: High
Status: First fix implemented

Evidence:
- `src/server/codexAppServerBridge.ts`: `AppServerProcess.buildAppServerConfig()` hardcodes `approval_policy="never"` and `sandbox_mode="danger-full-access"`.
- `src/server/appServerRuntimeConfig.ts` contains configurable runtime helpers, but this process path does not appear to use them.
- `scripts/dev.cjs` also defaults `CODEXUI_SANDBOX_MODE=danger-full-access` and `CODEXUI_APPROVAL_POLICY=never`.

Risk:
If the web UI or authenticated browser session is compromised, the app-server runtime can become no-approval local command execution with full filesystem access.

Recommended fix:
- Route app-server runtime creation through one central runtime config.
- Default normal product/CLI startup to `workspace-write` plus `on-request`.
- Keep `pnpm run dev` as an explicitly unsafe local-development shortcut that injects `danger-full-access` plus `never`.
- Make dangerous defaults visibly opt-in with a startup warning or clear startup output.

Decision notes:
- Agreed on 2026-05-14: the security baseline should be `workspace-write + on-request`.
- `danger-full-access + never` remains acceptable only as an intentional trusted-local/dev mode, not as the generic app-server default.
- Agreed on 2026-05-14: the safer default applies to normal product/CLI startup and every `codex app-server` child process started by the app, including temporary account-validation app-servers.
- Agreed on 2026-05-14: `scripts/dev.cjs` may remain an explicit unsafe developer convenience entrypoint because the developer actively chooses that mode.
- Discussed on 2026-05-14: a VS Code-like permission selector in the composer is desirable, with three user-facing modes: default, automatic review, and full access.
- For the first fix, runtime permission remains global because the current architecture shares one main `codex app-server` across projects/threads. Per-project or per-thread runtime isolation should be treated as a later architecture change.
- Agreed on 2026-05-14: the first implementation will not include the composer permission selector. Scope is limited to safer defaults, unified app-server config, unsafe-mode visibility, and tests.
- Agreed on 2026-05-14: the first implementation may include a read-only warning/status indicator in the composer when the current global runtime is unsafe. This is not a permission selector and should not imply per-message permission isolation.
- Agreed on 2026-05-14: the first composer warning only needs to trigger for the highest-risk runtime combination: `danger-full-access + never`.
- Agreed on 2026-05-14: the composer warning label should read `Full access`, with tooltip/title copy explaining that full local access is enabled and Codex will not ask for approvals.

Implementation notes:
- Implemented on 2026-05-14: normal runtime defaults now resolve to `workspace-write + on-request`.
- Implemented on 2026-05-14: `AppServerProcess.buildAppServerConfig()` now reuses centralized `buildAppServerArgs()` instead of hardcoding unsafe args.
- Implemented on 2026-05-14: `GET /codex-api/runtime-config` exposes a read-only runtime status for the frontend.
- Implemented on 2026-05-14: CLI startup prints a warning when the effective runtime is `danger-full-access + never`.
- Implemented on 2026-05-14: the composer shows a read-only `Full access` pill when the global runtime is `danger-full-access + never`.

Validation:
- Start the app with no special env vars and confirm effective sandbox/approval values are safe.
- Start with explicit dev env vars and confirm the unsafe mode is shown as intentional.
- In unsafe runtime mode, confirm the composer shows a warning/status indicator near the input controls.
- `pnpm exec vitest run src/server/appServerRuntimeConfig.test.ts` passed.
- `pnpm run build:frontend` passed.
- `pnpm run build:cli` passed.
- Built CLI without runtime env returned `{"sandboxMode":"workspace-write","approvalPolicy":"on-request","isUnsafe":false}` from `/codex-api/runtime-config`.
- Built CLI with `CODEXUI_SANDBOX_MODE=danger-full-access CODEXUI_APPROVAL_POLICY=never` printed the full-access warning and returned `{"sandboxMode":"danger-full-access","approvalPolicy":"never","isUnsafe":true}`.

### SEC-002: Local file browser serves arbitrary absolute files on the app origin

Severity: High
Status: First fix implemented

Evidence:
- `src/server/httpServer.ts`: `/codex-local-browse/*path` serves local paths.
- `src/server/httpServer.ts`: `/codex-local-file` serves local file content.
- `src/server/localBrowseUi.ts` renders a browser/editor UI for local files.

Risk:
Untrusted local HTML opened through this feature can execute under the same origin as privileged `/codex-api/*` endpoints. That creates a same-origin escalation path from "view local file" to "call app APIs".

Recommended fix:
- Serve browsed local files from an isolated origin, opaque sandboxed iframe, or a forced download/text-rendering mode.
- Never execute local HTML/JS in the privileged app origin.
- Add explicit allowlists or project-root scoping where possible.

Decision notes:
- Agreed on 2026-05-14: local project HTML should behave like source-code viewing in CodexUI, not like same-origin web preview.
- Agreed on 2026-05-14: the first fix should prevent active local files such as HTML from executing under the CodexUI origin. Safe source viewing is preferred over inline preview.
- Agreed on 2026-05-14: first-fix active source treatment includes `.html`, `.htm`, `.svg`, `.xml`, and `.xhtml`.
- Agreed on 2026-05-14: `/codex-local-browse` should serve those active source files as plain text with MIME sniffing disabled. A richer source viewer/editor should be treated as a later feature.
- Agreed on 2026-05-14: `/codex-local-file?path=...` must receive the same active-source protection so it cannot bypass `/codex-local-browse` hardening.
- Previewing runnable HTML should happen through a project dev server or a future isolated preview design, not through `/codex-local-browse` in the privileged app origin.

Implementation notes:
- Implemented on 2026-05-14: active local source extensions are recognized centrally in `localBrowseUi`.
- Implemented on 2026-05-14: `/codex-local-browse`, `/codex-local-file`, and SVG requests through `/codex-local-image` return active source files as `text/plain; charset=utf-8` with `X-Content-Type-Options: nosniff`.
- Implemented on 2026-05-14: active source responses are streamed instead of read fully into memory.

Validation:
- Create a local HTML file that attempts to call `/codex-api/*`; verify it cannot access privileged APIs.
- `pnpm exec vitest run src/server/httpServer.localFiles.test.ts` passed.
- `pnpm run build:frontend` passed.
- `pnpm run build:cli` passed.
- Built CLI endpoint checks confirmed `/codex-local-browse`, `/codex-local-file`, and `/codex-local-image` return active source examples as plain text with `nosniff`.

### SEC-003: Local text editor can write arbitrary absolute text-like paths

Severity: High
Status: Open

Evidence:
- `src/server/httpServer.ts`: `/codex-local-file` supports write operations.
- `src/server/localBrowseUi.ts`: `isTextEditableFile()` decides which files are editable by extension/name.

Risk:
Any authenticated or same-origin attacker can potentially edit sensitive local text files such as shell profiles, project configs, token files, service files, or scripts.

Recommended fix:
- Require explicit per-root trust before edits.
- Restrict writes to workspace roots by default.
- Add confirmation for hidden files, dotfiles, scripts, env files, keys, service files, and executable paths.

Validation:
- Attempt writes outside the workspace and to sensitive filename patterns; verify they are blocked or require explicit confirmation.

### SEC-004: Auth bypass rules are convenience-first

Severity: High
Status: Open

Evidence:
- `src/server/authMiddleware.ts` bypasses password auth for localhost-style access and Tailscale IP ranges.
- `src/cli/index.ts` listens on `0.0.0.0` and auto-enables tunnel behavior when Tailscale is detected.

Risk:
This is acceptable for a personal trusted machine/tailnet, but it is too broad as a generic default. Tailnet membership or local-network exposure becomes equivalent to app trust.

Recommended fix:
- Make password/session auth mandatory by default for non-loopback access.
- Treat Tailscale bypass as explicit opt-in.
- Show effective network/auth mode at startup.

Validation:
- Access from loopback, LAN, and Tailscale addresses; confirm only intended modes bypass auth.

### SEC-005: Integrated terminal is a complete shell behind API auth

Severity: High
Status: Open

Evidence:
- `src/server/codexAppServerBridge.ts`: terminal websocket/session handlers.
- `src/server/terminalManager.ts`: process spawning and terminal lifecycle.

Risk:
Once an attacker has API/session access, terminal APIs provide direct shell capability.

Recommended fix:
- Gate terminal creation behind explicit capability checks.
- Add optional workspace-only command policy or disable terminal in shared deployments.
- Log terminal session creation with source IP/session metadata.

Validation:
- Confirm terminal APIs are unavailable when the terminal capability is disabled.

### SEC-006: Secrets are exposed or written without explicit restrictive permissions

Severity: Medium/High
Status: Open

Evidence:
- `src/server/codexAppServerBridge.ts`: Telegram config GET returns full `botToken`.
- `src/server/codexAppServerBridge.ts`: Telegram config writes do not appear to force `0600`.
- `src/server/skillsRoutes.ts`: skills sync token state writes do not appear to force `0600`.
- `src/server/accountRoutes.ts` has examples of account-related files being written with `0600`.

Risk:
Tokens can be exposed to any authenticated frontend code and may be stored with permissions inherited from process defaults.

Recommended fix:
- Return only masked tokens from read endpoints.
- Use `0600` for all token-bearing files.
- Add token redaction in logs and debug responses.

Validation:
- Read config endpoints and confirm secrets are masked.
- Check written token files with `stat` and confirm mode `600`.

### SEC-007: Supply-chain posture is weak because lockfiles are ignored

Severity: Medium/High
Status: Open

Evidence:
- `.gitignore` ignores `package-lock.json` and `pnpm-lock.yaml`.
- `pnpm audit --prod --json` failed because no `pnpm-lock.yaml` exists.

Risk:
Builds are not reproducible and dependency audit cannot run reliably. This is a poor base for team or long-lived development.

Recommended fix:
- Track the package-manager lockfile.
- Choose one package manager for the repo and document it.
- Add dependency audit to the release/security checklist.

Validation:
- Generate and commit the lockfile.
- Run `pnpm audit --prod` successfully.

### SEC-008: Embedded OpenRouter free-mode keys are reversible

Severity: Medium
Status: Open

Evidence:
- `src/server/freeMode.ts` contains encrypted-looking key material and a static `DECRYPT_KEY`.

Risk:
The embedded keys are extractable by anyone with source access. This should not be treated as secret storage.

Recommended fix:
- Treat these as public or rotate/remove them.
- Move real service credentials to server-side secret storage or user-provided configuration.

Validation:
- Confirm no production credential depends on client-visible or repo-visible reversible material.

### SEC-009: Local file editor loads Ace from a CDN

Severity: Medium
Status: Open

Evidence:
- `src/server/localBrowseUi.ts` loads Ace editor assets from a CDN.

Risk:
The editor runs in a privileged local app context. A CDN compromise or network injection can become privileged same-origin JavaScript.

Recommended fix:
- Bundle editor assets locally.
- Add Subresource Integrity if a CDN is still used.
- Prefer a strict Content Security Policy for local browse/editor pages.

Validation:
- Run the editor offline and confirm it still works from local assets.

### SEC-010: Composio installer uses curl-to-shell

Severity: Medium
Status: Open

Evidence:
- `src/server/codexAppServerBridge.ts`: `installComposioCli()` shells out through a remote install script pattern.

Risk:
Remote install scripts are difficult to verify and can change independently of this repo.

Recommended fix:
- Prefer pinned package-manager installs or checksum-verified artifacts.
- Show the exact command and require user confirmation before execution.

Validation:
- Verify installer path refuses to run without explicit confirmation and logs the exact source/version.

### SEC-011: Request body handling lacks a uniform size policy

Severity: Medium
Status: Open

Evidence:
- `src/server/codexAppServerBridge.ts` has manual body readers and upload handlers.
- `src/server/unifiedResponsesProxy.ts` buffers request/response bodies.
- `src/server/accountRoutes.ts` reads full request bodies manually.

Risk:
Large requests or upstream responses can cause memory pressure or denial of service.

Recommended fix:
- Centralize body parsing with explicit limits.
- Add per-route limits for JSON, file upload, and proxy paths.
- Stream large proxy responses where feasible.

Validation:
- Send oversized JSON/upload/proxy payloads and confirm predictable `413` or streaming behavior.

### SEC-012: Custom provider endpoint can fetch arbitrary base URLs

Severity: Medium
Status: Open

Evidence:
- `src/server/codexAppServerBridge.ts` accepts custom provider `baseUrl` and fetches models.
- `src/server/customEndpointProxy.ts` proxies custom endpoint traffic.

Risk:
Authenticated users can point the backend at arbitrary URLs, which can become SSRF-like behavior in shared deployments.

Recommended fix:
- Restrict custom endpoint usage to trusted local mode, or add allowlists/blocklists.
- Block private metadata/network ranges unless explicitly allowed.
- Log destination hostnames.

Validation:
- Attempt provider URLs against loopback, link-local metadata, and private ranges; confirm policy behavior.

### SEC-013: Firebase client config should be checked for restrictions

Severity: Medium/Low
Status: Open

Evidence:
- `src/composables/useGithubSkillsSync.ts` contains Firebase client configuration.

Risk:
Firebase API keys are often public client config, but security depends on project rules and domain restrictions outside this repo.

Recommended fix:
- Verify Firebase Auth/Firestore/Storage rules and allowed domains.
- Document why this client config is safe to publish.

Validation:
- Review Firebase console rules and restrictions.

### SEC-014: Mutating API routes lack clear CSRF/origin protection

Severity: Medium/Low
Status: Open

Evidence:
- `src/server/authMiddleware.ts` uses a session cookie with `SameSite=Lax`.
- No uniform Origin/CSRF check was identified for mutating `/codex-api/*` routes during static review.

Risk:
This may be acceptable for local-only usage, but shared/tunneled deployments should not rely only on cookie defaults.

Recommended fix:
- Add Origin/Host validation for mutating requests.
- Consider CSRF tokens for browser form-like flows.
- Keep API token or session checks consistent across websocket and HTTP paths.

Validation:
- Attempt cross-origin POSTs to mutating endpoints and confirm rejection.

### SEC-015: Legacy password-in-URL login path exists

Severity: Low/Medium
Status: Open

Evidence:
- `src/server/authMiddleware.ts` supports a `/password=<value>` style login path.
- Current tunnel URL builder appears not to emit this by default, but the route remains.

Risk:
Passwords in URLs can leak through browser history, logs, screenshots, and referrers.

Recommended fix:
- Remove the URL-password route or gate it behind explicit dev-only mode.
- Prefer POST-based login.

Validation:
- Confirm `/password=<value>` is disabled in normal mode.

## Suggested Adjustment Order

1. Runtime safety: fix `SEC-001` first so the default app-server runtime is not full-access/no-approval unless explicitly requested.
2. Origin isolation: fix `SEC-002` and `SEC-003` together because local browse and local edit share the same trust boundary.
3. Access boundary: tighten `SEC-004`, `SEC-005`, `SEC-014`, and `SEC-015`.
4. Secret and supply-chain hygiene: fix `SEC-006`, `SEC-007`, `SEC-008`, and `SEC-009`.
5. Feature-specific hardening: address `SEC-010`, `SEC-011`, `SEC-012`, and `SEC-013`.

## Current Baseline Notes

- This document is a living tracker, not a completed penetration test.
- The first audit was static only and should be followed by focused reproduction tests for the highest-risk paths.
- `pnpm audit --prod --json` could not run because the repo has no committed `pnpm-lock.yaml`.
