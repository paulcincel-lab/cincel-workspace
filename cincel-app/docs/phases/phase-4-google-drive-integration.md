# Phase 4: Google Drive Browse and Pick

## Goal
Replace paste-a-URL in the Recursos workspace and project drive links with a live Drive folder browser + file picker, rendering rich metadata cards. Uses a Google service account (no per-user OAuth).

## Deliverables

### Backend
- [ ] `lib/google/client.ts` (new) -- `getDriveClient()` returns `null` when unconfigured; JWT auth from service-account env vars (`GOOGLE_SA_CLIENT_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`, `GOOGLE_SA_SUBJECT`)
- [ ] `lib/google/drive-repository.ts` (new) -- `listFolder(folderId)`, `getFileMeta(fileId)`, `searchFiles(query, folderId?)`. Returns normalized `{ id, name, mimeType, iconLink, thumbnailLink, webViewLink, modifiedTime, isFolder }`
- [ ] `lib/google/drive-url.ts` (new) -- move existing ID-extraction regexes from `components/recursos/ResourcesWorkspace.tsx` (`getDriveId`) here and share
- [ ] `app/api/google/drive/list/route.ts` -- session -> 401, capability check -> 403, `503` when `getDriveClient()` is null
- [ ] `app/api/google/drive/file/[id]/route.ts` -- same auth-gating pattern as `app/api/team/sensitive/[id]/route.ts`
- [ ] Drizzle migration: extend `core.resource_links` and `core.project_drive_links` with nullable `google_file_id`, `file_name`, `mime_type`, `icon_link`, `thumbnail_link`, `web_view_link`, `synced_at`. Pasted `url` stays as fallback.

### Frontend
- [ ] `components/recursos/DrivePickerDialog.tsx` (new) -- folder tree left, file list right, breadcrumb, search box; on pick stores `google_file_id` + cached metadata. Follow existing dialog/drawer patterns.
- [ ] `components/recursos/ResourcesWorkspace.tsx` add modal integration (~lines 1102-1148): "Elegir de Drive" button opening picker; keep manual URL entry as advanced fallback
- [ ] Replace bare `<a>`/iframe list items with metadata card (icon, name, modified date, "Abrir en Drive"). Keep existing `getDrivePreviewUrl` iframe preview panel.
- [ ] `app/proyectos/[id]/ficha/page.tsx` (~lines 427-470): 4 `<input type="url">` doc fields gain the same picker
- [ ] `next.config.ts` -- add CSP `frame-src`/`img-src` allowlist for `docs.google.com`, `drive.google.com`, `*.googleusercontent.com`

### Infrastructure
- [ ] Dependencies: `googleapis` (or `google-auth-library` + REST via fetch)
- [ ] `.env.example` + compose `env_file`: add `GOOGLE_SA_CLIENT_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`, `GOOGLE_SA_SUBJECT`, `GOOGLE_DRIVE_ROOT_FOLDER_ID` (all server-only, no `NEXT_PUBLIC_`)

## Done Definition
- With SA env vars set: open picker, browse configured root folder, pick a file -> card shows real name/icon/modified date -> "Abrir en Drive" opens `webViewLink`
- Without SA env vars: picker button hidden, manual URL entry still works (graceful degradation)
- Resource links and project drive links store `google_file_id` + metadata in Postgres
- API routes return 401 without session, 403 without capability, 503 when Drive unconfigured
- CSP headers allow Google Drive iframes and images

## Parallel work
- BE: `lib/google/*` + API routes can run alongside FE: `DrivePickerDialog.tsx` (mock API responses initially)
- FE: Recursos integration and project ficha integration are independent and can be parallelized
- This entire phase can run in parallel with Phase 5 (both depend only on Phase 2)

## Phase dependencies
- Requires: Phase 2 (Drizzle repositories for resource_links/project_drive_links, Server Actions, session via getSession())

## Complexity
- Backend: M
- Frontend: L
- Infra: S

## Risks
- Google service account domain-wide delegation setup is external to code -- needs workspace admin to configure
- Rate limits on Drive API may need caching/debounce for folder browsing
- Large folder listings may need pagination in the picker UI
