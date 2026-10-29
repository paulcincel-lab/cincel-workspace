# Client Portal Phase 2: Files + Uploads

## Goal
Invited clients browse, download and preview files from their project's `02 Cliente` folder through the service account, and send files to `03 Del cliente`, with every operation ancestry-checked and logged.

## Deliverables

### Backend
- [ ] `lib/portal/drive-guard.ts` `assertInsideClientFolder` (depth 10, parent cache 60 s), mandatory on every list/download/preview/upload (BE §B.4.6)
- [ ] `GET /api/portal/projects/[pid]/files?folder=` → `PortalFolderDTO` or `{ pending: true }`; drop shortcuts; Google-native → `deliveredAs: "pdf"`; 60 s LRU; never Drive links/owners/permissions (BE §B.4.4)
- [ ] `GET …/files/[fileId]/download` and `…/preview` (PDF, JPEG, PNG, WebP, GIF only, else 415): export Google-native to PDF (422 `export_too_large`), stream other files, RFC 6266 filename, `no-store`, `nosniff`, `portal_file_events` (BE §B.4.5)
- [ ] CSP per review NB 1: `download` and image previews `sandbox; default-src 'none'`; PDF previews `default-src 'none'; object-src 'self'` without `sandbox`. Verify **Ver** on PDFs manually in Chrome, Safari and Firefox
- [ ] `POST /api/portal/projects/[pid]/uploads`: 409 when folder not ready, `Content-Length` precheck, `busboy` streaming, extension + magic-byte checks (`file-type`, `cfb`, DWG `AC10`, DXF text rule), 413 past 50 MB, resumable upload into `drive_inbound_folder_id` with `YYYY-MM-DD · {cliente} · {nombre}` (America/Mexico_City), `portal_file_events`, notify manager + coordinator (fallback Administradores) via `after()` (BE §B.4.7)
- [ ] `GET /api/portal/projects/[pid]/uploads` → own uploads only (BE §B.4.7)
- [ ] Tests: ancestry (root, nested, other project, trashed, depth), filename sanitizing, upload type sniffing, 01 Interno / other-project IDs → 404 (BE §10, §B.8 #3–7)

### Frontend
- [ ] **Archivos** tab with `PortalFileBrowser`: breadcrumbs, stacked list below `sm`, **Descargar**, **Ver** (PDF/images only), "PDF" `Badge` for Google-native, `pending` and `export_too_large` states, `fetch` + `AbortController` on folder change (FE §3.3, §8)
- [ ] **Enviar archivos** tab with `PortalUploader`: drop zone + `accept` allowlist, per-file `XMLHttpRequest` progress (`role="progressbar"`), per-file 413/415/409 errors, **Mis envíos** list (FE §3.3, §9)
- [ ] Staff Clientes page: hint `Alert` + **Abrir carpeta del cliente en Drive**; Actividad card fed by real events (FE §2.4)
- [ ] Vitest: uploader allowlist, size check, progress states (FE §10)

### Infrastructure
- [ ] `deploy/nginx/cincel-app.conf`: dedicated `location ~ ^/api/portal/projects/[^/]+/uploads$` with `client_max_body_size 55m`, `proxy_request_buffering off`, `proxy_read_timeout 300s` (BE §B.4.7)
- [ ] Confirm the Keter route accepts ≥ 55 MB on that path (open question 1); if not, switch to the two-step resumable upload described in BE §B.4.7 before this phase closes
- [ ] Local Playwright run (not CI): invite → code from Mailpit → see one project → download → upload → revoke → 404; results recorded on the issue (FE §10)

## Done Definition
- A file staff put in Project A's `02 Cliente` shows in the client's list within 60 s; `01 Interno` files never do (§B.8 #3)
- File IDs from `01 Interno` or another project return 404 on list, download and preview (§B.8 #4)
- A Google Doc downloads as PDF; one over 10 MB shows the friendly message (§B.8 #5)
- **Ver** renders PDFs in Chrome, Safari and Firefox and images inline
- A client upload lands in `03 Del cliente` with the prefix; manager and coordinator get the email; the event is logged (§B.8 #6)
- A 60 MB upload and a renamed `.exe` are rejected (§B.8 #7)
- Download and upload work at 360 px

## Parallel work
- BE: drive guard + list/download/preview alongside BE: upload pipeline (separate routes)
- FE: `PortalFileBrowser` and `PortalUploader` alongside BE using the FE §7.2 contract
- Infra: nginx / Keter body-size decision early, since it can change the upload design

## Phase dependencies
- Requires: Client Portal Phase 1 (portal sessions, `requireProjectAccess`, `portal_file_events`, email, Clientes page)
- Requires: Staff SSO Phase 3 (`lib/google/drive-admin.ts`, project folder IDs and `drive_folder_status`)

## Complexity
- Backend: L
- Frontend: M
- Infra: S

## Risks
- Keter body-size limit may force the two-step upload (open question 1)
- Browser PDF viewers and CSP interaction; needs manual cross-browser check
- Streaming large files through Next.js route handlers under the 300 s proxy timeout
