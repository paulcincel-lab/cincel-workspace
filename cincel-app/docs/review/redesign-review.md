VERDICT: APPROVED

> **Round 5 (2026-11-07):** B20 and the round-4 non-blocking items (R4-1, R4-2) are fixed in both specs. No blocking issues remain.
>
> - **B20 (flags in `"use server"` files): fixed.**
>   - `IMPLEMENTED` now lives in plain sibling modules `lib/actions/<domain>-actions.flags.ts` (no `"use server"`). Backend §7 intro, §9.10, §10.1, §15 and §21, and frontend §20 Rules 1 and 3 and §21.1, all say so.
>   - Phase 1 creates every flags file, and the phase that owns an actions file owns and flips its flags file.
>   - `available(ctx)` and UI entry points import the flags module, never the actions module.
>   - A Vitest check asserts one key per exported action, no extra keys, and that `"use server"` files export only async functions. That check also catches this mistake if it comes back.
> - **R4-1 (Rule wording): fixed.** I diffed the two phase sections after removing backticks and § references:
>   - frontend Rules 1 and 3 are now character-for-character the backend text;
>   - the Phase 1 row is identical except for the frontend's "(BE)" cross-reference markers;
>   - the Phase 2 and Phase 6 rows, the shared-files line and the hidden-dependency line differ only in wording ("the", "company links form" vs "fields already in the schema"). The same files sit in the same phases.
> - **R4-2 (producer runner): fixed.** Frontend §21.1 now runs the daily producers only in `daily-digest`, as backend §13 does.
> - **Independence of phases 2–8:** unchanged from round 4. Every cross-phase call lands on a Phase 1 module that is fully implemented or flag-gated, and no later phase imports or edits another later phase's file.
>
> **Open non-blocking items to carry into implementation (no re-review needed):**
> - **CI (round-1 NB 26).** The repo-root workflow `.github/workflows/cincel-app-build.yml` still breaks the standing rules: `ubuntu-latest` jobs, no `timeout-minutes`, a Playwright job, and buildx. Track it as its own infra issue. Neither redesign spec adds to it.
> - **Phase table wording.** When the plan is turned into issues, use the backend §21 text as the single source for the phase descriptions, since the frontend rows 2 and 6 paraphrase it.
> - **Release-time coordination.** The migration "second to merge regenerates" rule and the single-Toaster rule depend on whoever merges second following the Project Flow addendum. Check both on the merge PR.
>
> The round-1 to round-4 reviews follow unchanged.

---
---

VERDICT (round 4): CHANGES NEEDED

> **Round 4 (2026-11-07):** B18, B19 (a–c) and R3-1 to R3-3 are applied in both specs. One new blocker came from the B19c mechanism itself (B20); it is a few lines of spec.
>
> - **B18 (OS-dark override): fixed in both specs** (backend §8.2, frontend §4.1/§14.1).
>   - Flag-on `<html>` always carries `data-theme="light"|"dark"`. The server sets it for explicit modes, and the head script sets it in system mode.
>   - The block uses `html:root[data-theme="light"|"dark"]` (specificity 0,2,1). I checked it against `app/globals.css`: it beats `:root` and `.dark` (0,1,0), and `:root[data-theme="dark"]` and the `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` rule (0,2,0), regardless of stylesheet order. With `data-theme="light"` the media rule no longer matches.
>   - `.dark` is kept in sync for Tailwind's `dark:` variant.
>   - The Playwright check (dark scheme emulated, three modes plus flag-off) is in backend §16 and frontend §17.
> - **B19a (schema fields): fixed.** `instagramUrl`/`contactEmail` and their defaults land in Phase 1. Phase 6 keeps the General UI and the save/restore switch in `app-settings-actions.ts`.
> - **B19b (two owners of `preferences-actions.ts`): fixed.**
>   - `preferences-actions.ts` now has a single owner (Phase 1, fully implemented).
>   - `org-appearance-actions.ts` holds the Phase 1 reader and the Phase 6 save/reset.
>   - Phase 2 keeps only the banner and avatar-menu UI. The Phase 1 `EstiloSwitch` and the Phase 6 Apariencia page now call a real action.
> - **B19c (who flips tool availability): fixed in design, but see B20.** Each actions module has `IMPLEMENTED` flags that its owning phase flips, and both `available(ctx)` and UI entry points read them. Phase 7 no longer edits on another phase's behalf.
> - **R3-1 (digest time): fixed.** 07:30 everywhere, including `schedule_digest` (backend §10.3).
> - **R3-2 (producer file): fixed.** The registry `lib/cron/daily-producers/index.ts` and a stub `vencimiento.ts` are in Phase 1, Phase 3 implements the producer, and the registry is in the frontend §21.1 table.
> - **R3-3 (photo routes): fixed.** The photo routes and `removeMyPhotoAction` are fully implemented in Phase 1, so the Inicio (Phase 3) and Perfil (Phase 6) buttons work whenever those phases land.
> - **Phase tables:** both specs list the same 9 phases with the same ownership, and every file, flag, helper and cron job is in the same phase on both sides. But the text is no longer verbatim:
>   - the backend Phase 1 row is reordered;
>   - Rule 1 differs: the backend says "the UI hides an entry point while its `IMPLEMENTED` flag is false (or its read action reports…)", while the frontend says entry points "may read these flags instead of probing read stubs".
>
>   Copy the backend wording into the frontend so the rule is binding on both sides (NB R4-1).
> - **Phase 2–8 independence:** I re-walked every cross-phase call. Each one now lands on a Phase 1 module that is fully implemented or flag-gated:
>   - `notify`, the templates, the three read helpers and the photo routes;
>   - user preferences and the org-appearance reader;
>   - the schema fields, `daily-producers` and the cron registry;
>   - `IMPLEMENTED` flags and `cutto-links`;
>   - the shell slots.
>
>   No later phase imports or edits another later phase's file. Once B20 is fixed, there is no remaining sequencing.
>
> **New blocking issue (round 4)**
>
> 20. **`IMPLEMENTED` can't be exported from the actions modules: `next build` rejects it.**
>     - Every `lib/actions/*-actions.ts` starts with `"use server"` (for example `tasks-actions.ts:1`, `app-settings-actions.ts:1`).
>     - Next 16 allows only async functions as exports of a `"use server"` module (`node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-validate.js`: "Only async functions are allowed to be exported…").
>     - Backend §9.10/§10.1 and frontend §20 Rule 1 put `export const IMPLEMENTED = { … } as const` in each actions module. Phase 1 would fail the build, and the B19c mechanism can't ship as written.
>
> **New non-blocking items (round 4):**
>
> - **R4-1. Rule 1 wording.** Make frontend §20 Rule 1 and Rule 3 verbatim copies of backend §21: the UI *hides* entry points while the flag is false. Do the same for the Phase 1 row order.
> - **R4-2. Producer runner.** Frontend §21.1 says the daily producers are "run by `daily-digest` and `notifications-deliver`"; backend §13 runs them only in `daily-digest`. Use the backend text: they run once a day, in the digest window.
>
> ### Recommended edits (round 4)
>
> **Issue #20:** Move the flags out of the `"use server"` files.
> **Edit in:** backend §9.10/§10.1/§15/§21 Rule 1 and Rule 3, and frontend §20 Rule 1 and Rule 3/§21.1 (same text)
> ```
> IMPLEMENTED flags live next to each actions module in a plain (non-"use server") file: lib/actions/<domain>-actions.flags.ts exporting `export const IMPLEMENTED = { <actionName>: false, … } as const`. Phase 1 creates every flags file; the phase that owns <domain>-actions.ts owns and flips its flags file. Assistant tools (available(ctx)) and UI entry points import the flags file, never the actions module, for availability. A Vitest check asserts every action exported by <domain>-actions.ts has a key in its flags file.
> ```
>
> The round-1 to round-3 reviews follow unchanged.

---
---

VERDICT (round 3): CHANGES NEEDED

> **Round 3 (2026-11-07):** B16, B17 and all ten R2 items are fixed in both specs. The two phase tables are identical: comparing the frontend §20 and backend §21 rows, Rules 1–3, the cron names, the single-owner list and the hidden-dependency list after removing cross-references and backticks, the only differences are articles ("the", "or" vs "/"). The Project Flow specs now carry the "Coordination with the UI/UX redesign" addendum (`project-flow/backend.md:1260`, `frontend.md:1263`).
>
> Two new blockers remain:
> - **B18:** the B17 fix keeps today's `globals.css`, and its OS-dark rule overrides the new theme for flag-on users.
> - **B19:** three cross-phase couplings survive in the canonical plan itself.
>
> - **B16 (phase plan and ownership): fixed, except for B19.**
>   - Phase 1 now holds the shared pieces: every new file as a stub, the 62 action stubs, `notify()` plus `notifications-deliver`/`daily-digest`, every email template, and the three read helpers (`week-hours`, `approved-absences`, `reminders-for-day`).
>   - Each shared file has one owner, and there are exactly five cron jobs with one name each.
>   - The round-2 dependencies are gone:
>     - vacations → `notify`/template, now in Phase 1;
>     - Phase 4 ↔ Phase 6 hours/vacations, now Phase 1 helpers;
>     - Inicio → reminders, now a helper;
>     - palette → clock-in, gated on `fetchMyTodayAction().enabled`;
>     - chat route, photo, search and `tasks-actions` owners are now single.
>   - `vencimiento` is a Phase 3 producer file under `lib/notifications/daily-producers/`, run by the Phase 1 `daily-digest` job.
> - **B17 (flag-off look): fixed as asked.**
>   - With the flag off, the layout renders today's pipeline: `primary-color`, today's `globals.css` and the `ThemeToggle` `data-theme`.
>   - `globals.css` stays unchanged until Phase 9, guarded by a snapshot test.
>   - The appearance block renders only for flag-on users, with `:root` and `.dark, :root[data-theme="dark"]` selectors.
>   - See B18 for the cascade problem this creates.
> - **R2-1 (guards): fixed.** One `layout.tsx` per `(admin)/<segment>`, each calling `requirePageCapability`, with `notFound()` on failure in both specs.
> - **R2-2 (segment rules): fixed.** The segment table in frontend §8 and backend §12.2 matches, nav visibility uses the same capability, and General save/restore switches to `canManageGeneralSettings` in Phase 6.
> - **R2-3 (approval summary): fixed.** `lib/assistant/tool-summaries.ts` is client-safe, and `ConfirmationCard` renders from the approval part's `toolName` + `input`.
> - **R2-4 (message key): fixed.** `assistant_messages` has PK `(thread_id, id)`, with an ownership check before the upsert.
> - **R2-5 (`render_timeline`): fixed.** Both specs use `{ title?; items: AgendaItem[] }`.
> - **R2-6 (vacation settings): fixed.** "Días de vacaciones" is in Mis vacaciones in both specs.
> - **R2-7 (guard test): fixed.** `EstiloSwitch` and `StyleProvider` are allow-listed.
> - **R2-8 (`LOW_CONTRAST` format): fixed.** Both specs use `<pair> <mode> <ratio>[, …]`.
> - **R2-9 (Project Flow): fixed.** The addendum is in the Project Flow specs.
> - **R2-10 (contrast coverage): fixed.** Azul light `destructive` is now `#d81844`, and I recomputed all 24 pairs (with `destructive/background` added) for the 6 combos. Every pair passes and matches backend §5.5: `destructive/background` 4.61 / 7.02 / 4.97 / 7.49 / 4.86 / 5.09, and `destructive/card` 5.08 / 6.22 / 5.41 / 6.91 / 5.30 / 4.61.
>
> **New blocking issues (round 3)**
>
> 18. **Flag-on users whose OS is in dark mode get today's Grafito dark tokens instead of their theme, even when they chose light mode.**
>     - The kept `app/globals.css` has `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { …Grafito dark… } }` (lines 150–151), with specificity (0,2,0).
>     - The flag-on block uses `:root{light}` (0,1,0) and `.dark{dark}` (0,1,0), and the flag-on `<html>` carries `data-theme-id` and the `.dark` class but never `data-theme` (frontend §4.1, backend §8.2).
>     - So on an OS-dark machine, the media rule beats both blocks:
>       - in `mode = "light"` the page renders Grafito dark tokens;
>       - in `dark`/`system` it renders Grafito dark, not the org theme's dark values.
>     - The explicit `.dark` vs globals `.dark` tie also depends on stylesheet order, which nothing fixes.
>     - Backend acceptance 2 ("no flash in light, dark or system mode") and frontend acceptance 3 fail for every OS-dark user.
> 19. **Three cross-phase couplings remain in the canonical plan.**
>     - **(a) Compile dependency Phase 2 → Phase 6.** The avatar menu (Phase 2) reads `general_settings.company.instagramUrl` / `contactEmail`. Those fields are added to `lib/settings/general-settings-schema.ts`, whose type is inferred from the zod schema and owned by Phase 6. So Phase 2 doesn't type-check until Phase 6 merges.
>     - **(b) One file, two owners.** `lib/actions/preferences-actions.ts` is implemented by Phase 2 (user preferences) and by Phase 6 (org save/reset), which breaks Rule 1's "exclusively". On top of that, Phase 6's Apariencia page and the Phase 1 `EstiloSwitch` call `updateMyPreferencesAction`, and with no read flag to hide them they throw `NOT_IMPLEMENTED` until Phase 2.
>     - **(c) Rule 3 has no owner who can flip it.** Backend §10.1 says "each domain file flips `available` when its phase lands", but all 65 tool domain files belong to Phase 7. So when Phase 4 or Phase 5 lands after Phase 7, someone has to edit a Phase 7 file. Otherwise the tools stay unavailable forever, or Phase 7 has to wait for the others.
>
> **New non-blocking items (round 3):**
>
> - **R3-1. Digest time.** `schedule_digest` (backend §10.3) still says "the digest hour stays org-wide 08:00", while the `daily-digest` job now runs at 07:30 (§9.3, §13). Pick one.
> - **R3-2. Missing file and registry.** Rule 1 says Phase 1 creates every new file, but `lib/notifications/daily-producers/vencimiento.ts` (added by Phase 3) isn't listed in the Phase 1 row. Also, frontend §21.1's extension-point table lacks the `daily-producers` registry. List the stub file and the registry.
> - **R3-3. Photo upload before Phase 2.** The upload buttons (Inicio in Phase 3, Perfil in Phase 6) post to `/api/staff/me/photo`, which stays a Phase 1 stub until Phase 2, with no read flag to hide the camera button. Either state that the route stub returns 501 and that the buttons hide on a `photoUploadAvailable` flag from the layout, or accept the error toast until Phase 2.
>
> ### Recommended edits (round 3)
>
> **Issue #18:** The flag-on appearance must win over the kept globals.
> **Edit in:** backend §8.2 "Root layout" bullet and frontend §4.1 (same text)
> ```
> Flag on: <html> always carries data-theme="light" | "dark" (the server sets it for explicit modes; for mode "system" the head script sets it from matchMedia before first paint and on change) together with the .dark class. The appearance block uses
>   html:root[data-theme="light"] { …light vars… }
>   html:root[data-theme="dark"]  { …dark vars… }
> (specificity 0,2,1), which beats every globals.css rule (.dark 0,1,0; :root[data-theme="dark"] and the prefers-color-scheme :root:not([data-theme="light"]) 0,2,0) regardless of stylesheet order. A Playwright check runs a flag-on user with colorScheme "dark" emulated in light, dark and system modes and asserts --background equals the resolved theme's value.
> ```
>
> **Issue #19:** Remove the last three couplings.
> **Edit in:** the canonical table (frontend §20, backend §21), plus backend §10.1
> ```
> Phase 1 also owns: the general-settings-schema.ts company fields (instagramUrl, contactEmail; types only, no UI), and the full implementation of fetchMyPreferencesAction / updateMyPreferencesAction (the SSR cookie contract lives in Phase 1). Phase 2 keeps the opt-in banner and avatar menu UI; Phase 6 owns org save/reset, which moves to lib/actions/org-appearance-actions.ts (one file, one owner).
> Rule 3 mechanics: every Phase 1 action stub file exports `export const IMPLEMENTED = false`; the owning phase sets it to true in its own file. defineTool's available(ctx) reads the IMPLEMENTED flag of its backing action module, so Phase 7 never edits on another phase's behalf and no later phase edits a Phase 7 file.
> ```
>
> The round-1 and round-2 reviews follow unchanged.

---
---

VERDICT (round 2): CHANGES NEEDED

> **Round 2 (2026-11-07):** 14 of the 15 round-1 blockers are fixed in both specs. Each fix was re-read in place: backend "Review round 1 fixes" and §21, frontend "Review round 1 fixes" and §20. Frontend §7 and backend §7 now list the same 62 actions, with the same inputs, outputs and error codes.
>
> **B5 is only partly fixed.** Both specs now have an ownership section, but the two phase plans disagree, and several later phases still need code from other later phases. Two new blockers came out of the round-1 edits (B16, B17).
>
> - **B1 (contrast): fixed.**
>   - I recomputed every pair from the backend §5.1/§5.2 values with the WCAG formula (rgba composited over the pair's background; tints mixed in oklab at 14 % light / 22 % dark over `card`). All 6 theme × mode combos pass all 23 pairs, and my numbers match the backend §5.5 table to two decimals.
>   - The closest cases: Grafito dark `destructive`/`card` 4.61, Azul light `chart-3-ink`/tint 4.61, Azul light `muted-foreground`/`background` 4.63, `border-strong`/`card` 3.05–3.10, `chart-3`/`card` 3.06–3.09.
>   - There is one pair list (`lib/ui/contrast.ts`), and frontend §14 now references backend §5 instead of repeating the values.
> - **B2 (SSR appearance): fixed.**
>   - `cssVars` is `{ light, dark }`, and the server renders a `<style id="appearance">` with `:root` and `.dark` blocks.
>   - The server sets `.dark` for explicit dark mode. For system mode, a blocking head script sets it.
>   - Token values are never set as inline styles, and both specs describe the cookie as the same JSON.
>   - "Next page load" wording is used in both specs.
> - **B3 (flag and route group): fixed.**
>   - The `(staff)` layout branches on the flag.
>   - With the flag off, restyled pages render `LegacyFrame`.
>   - Users opt in from the banner or the user menu, with no admin page involved.
>   - The kill switch (`redesignAvailable`) is enforced in `resolveAppearance` and in the action (`DISABLED`).
>   - See B17 for what the flag-off pages still lose.
> - **B4 (admin settings guard): fixed in intent**, with server guards and four named capabilities, and Dirección reaches `/ajustes/horario`. Two mechanics need wording (NB R2-1 and R2-2).
> - **B5 (phase plan and ownership): partly fixed. Superseded by B16.**
> - **B6 (migrations): fixed.** One migration generated in Phase 1, never renumbered by hand, and whichever feature merges second regenerates on top (backend §4, frontend §20.3). The same rule isn't in the Project Flow spec yet (NB R2-9).
> - **B7 (Project Flow dependencies): fixed.**
>   - `lib/tramos/compat.ts` is the only place that touches tramo, fase and admin concepts.
>   - `AreaBadge` is used as `TramoBadge` until Project Flow renames it.
>   - Fase, Espacio and Puesto UI renders only when the data exists.
>   - There is one `Toaster`, in the root layout.
>   - The `?project` deep link is kept as `project` + `iniciar=1`.
> - **B8 (admin-only data): fixed.**
>   - Backend §9.7 filters every aggregate, search and the five assistant read tools through `canSeeAdminData`. `nextDelivery` excludes admin tasks.
>   - The Resumen "Cliente y contactos" rule is the same in frontend §3.5/§8 and backend §9.7.
>   - A db test covers it (backend §16).
> - **B9 (assistant approvals): fixed.**
>   - Confirm tools use native `needsApproval` and `addToolApprovalResponse`, and the model receives the result or the denial.
>   - `assistant_actions` is now an audit table only.
>   - The client generates the thread id, the server loads the history, and the client sends only the new message or the approvals.
>   - The legacy thread is imported without a model call.
>   - Contract details remain in NB R2-3 to R2-5.
> - **B10 (notifications): fixed.** Every notification now gets a row, with `in_app`, `email_status`, `digest`, `digested_at` and `deliver_after`, plus a delivery check constraint. The jobs `deliver-notifications` and `daily-digest` send the email and digest items. The Bandeja lists in-app rows only.
> - **B11 (Cutto): fixed.**
>   - Links come from `NEXT_PUBLIC_CUTTO_BASE_URL` in the client-safe `cutto-links.ts`.
>   - `cutto-api.server.ts` is server-only.
>   - `personChatUrl(email)` takes an email.
>   - The Cutto tools are left out of the registry by default.
>   - Cutto stays link-only, with no UI inside Cincel.
> - **B12 (vacations): fixed.** The absence kind is shown only to the owner and to deciders; everyone else sees `"ausencia"`. Deciders are Administrador and Dirección in both specs. There is a "Solicitudes del equipo" screen and one pair of entitlement actions. Where the entitlement settings live differs (NB R2-6).
> - **B13 (style rule): fixed.**
>   - `ListPage` takes a widget spec (`table`, `cards`, `people` or `board`) instead of per-style markup.
>   - `StyleView` lives only in `components/widgets`.
>   - Tablero is now a library widget (`TaskBoardWidget`).
>   - `KpiDatum.visibleIn` covers "Completadas · semana".
>   - One false positive remains in the guard test (NB R2-7).
> - **B14 (cron lock): fixed.** The `cron_leases` table uses an `UPDATE … WHERE locked_until < now()` lease with an owner field, so it works on any pooled connection and expires on its own.
> - **B15 (Gmail disconnect): fixed.**
>   - `disconnectGmailAction` is in both §7s, and `gmail_accounts` has a `disconnected_at` column.
>   - Disconnecting deletes the cached threads and leaves the shared Google token alone.
>   - The UI copy and the Google permissions link are specified.
> - **Round-1 non-blocking items:** all 27 have a resolution row in both specs, and each reads correctly in place:
>   - the photo route (2 MB, canvas re-encode, server metadata strip);
>   - fonts;
>   - untrusted content with dynamic approval;
>   - context ids resolved through viewer-scoped reads;
>   - draft update with `draftId`;
>   - the sandboxed iframe;
>   - the Internal consent screen;
>   - search urls and `?contacto=`;
>   - real capability names;
>   - `TodayStatus.requiredFrom`/`hoursPerDay`;
>   - search-param sheets;
>   - the time-tracking lock and the `dayEnd` close;
>   - CSV escaping;
>   - the rollback note;
>   - `numeric` with `mode: "number"`;
>   - the error-copy signature;
>   - visibility of linked ids;
>   - no private text in history;
>   - Annex scope;
>   - Cutto meeting links;
>   - PageHeader edited in place;
>   - revalidation;
>   - the `mis-vacaciones` documents.
>
> **New blocking issues (round 2)**
>
> 16. **The two phase plans disagree, and several later phases still depend on other later phases (B5 residual).** Frontend §20 has P1–P9. Backend §21.2 has Phase 1 plus five later phases with different cuts. Each file must have one owner, but these files have two:
>     - **Chat route and `assistant-actions.ts`:** backend Phase 1 (§21.1) vs frontend P7 (§20.3).
>     - **Profile photo routes:** backend Phase 1 vs frontend P2.
>     - **`search-actions.ts`:** backend "Proyectos, Personas y Biblioteca" vs frontend P2.
>     - **`lib/actions/tasks-actions.ts` notify hooks:** backend "Inicio y Tareas" vs frontend P5.
>     - **`lib/settings/general-settings-schema.ts`:** backend "Proyectos…" vs frontend P6.
>     - **The auto-close cron job is named `auto-close` (backend) but `auto-close-jornadas` (frontend).** Frontend P6 doesn't list `missing-clock-in`, and frontend P5 doesn't list `due-notifications`.
>
>     Even within one plan, cross-phase dependencies remain, because these services live in a later phase but are called from others:
>     - **`notify()`** (`lib/notifications/notify.ts`) belongs to Mi espacio (backend §21.2, frontend P5). It is called by P4 (`requestVacationAction` / `decideVacationAction`, backend §7.8), P6 (the `auto-close` and `missing-clock-in` jobs, backend §8.7/§9.5) and the task hooks.
>     - **Hours vs vacations is a cycle.** P4 needs the time-tracking week-hours rules (`fetchPeopleOverviewAction.weekHours`, `fetchPersonaDetailAction.weekHours`; backend §7.11 says "same rules as §8.7", which is `lib/time-tracking/report.ts` in P6). P6's report target subtracts approved vacations from `lib/vacations` (P4). So P4 and P6 need each other.
>     - **Mi día needs reminders.** P3's `InicioData.myDay` includes "the caller's reminders" (backend §7.10) through `lib/my-space` (P5).
>     - **The email template is in the wrong phase.** `decideVacationAction` (P4) sends `vacaciones-decision`, a template owned by "Ajustes y Control de horario" (backend §21.2).
>     - **The palette needs clock-in.** `CommandPalette` "Registrar entrada" (P2) calls `clockInAction` (P6).
>
>     None of these blocks permanently, but each forces one phase to wait for another, which brief decision 15 forbids.
> 17. **Phase 1 changes how every flag-off user's screens look, which goes against the purpose of the flag.**
>     - **Every page gets the org theme.** Both specs render the org appearance `<style>` from the root layout for every request (backend §8.2, frontend §4.1), with no flag check. The seed picks Azul unless `appearance.primary_color` exists (backend §4).
>     - **The static fallback changes too.** The `globals.css` fallback "equals Azul" (backend §5.3, frontend §14.1); today it is the Grafito values (`app/globals.css:30,38`).
>     - **Result:** the moment Phase 1 deploys, legacy screens of users who never opted in turn gray-blue with a light sidebar. Frontend acceptance 2 ("with the flag off, the old screens render unchanged") and 17 fail, and so does the brief's per-user rollout.
>     - **Legacy dark mode breaks.** The legacy `ThemeToggle` (kept until P9, frontend §20.3) sets `data-theme="dark"`, but the new block has only `.dark{…}` selectors.
>
> **New non-blocking items (round 2):**
>
> - **R2-1. A single `(admin)/layout.tsx` can't call `requireCapability(segment)`.** App Router layouts don't receive the name of a static child segment, so one guard for all segments isn't implementable as written (backend §12.2, frontend §8/§12).
>   - Put one `layout.tsx` (or a page-level guard) in each `(admin)/<segment>/` folder, each calling `requireCapability("<segment>")`.
>   - Pick one failure behavior: frontend uses `notFound()`, backend uses `redirect("/inicio?error=forbidden")`. Frontend acceptance 18 expects 404.
> - **R2-2. Admin rules per segment differ between the specs.**
>   - `general`: frontend §8 says Administrador; backend uses `canManageGeneralSettings`, which also includes Dirección (today's rule).
>   - `estatus`: backend uses `canManageTaskStatuses`, and `tramos` uses `canManageWorkflows`. Both include Dirección (`canManageCompanyStructureByRole`, `lib/auth/permissions.ts:748-749`), while frontend says Administrador.
>   - Make frontend §8 and `AjustesNav` use the backend capability per segment. Otherwise Dirección passes the server guard but has no nav entry.
>   - `saveGeneralSettingsAction` and `restoreGeneralSettingsAction` today call `canManageAppearance` (`lib/actions/app-settings-actions.ts:38,52`). Name them in backend §12.1 as the call sites to switch to `canManageGeneralSettings`, or Dirección silently loses General when `canManageAppearance` becomes admin-only.
> - **R2-3. Where the approval summary comes from isn't specified.** AI SDK approval parts carry the tool call id, input and approval id, not a summary.
>   - Frontend says the summary is "sent as part of the approval request metadata"; backend says ConfirmationCard is "fed by the tool-call part … `summarize(input)`".
>   - Specify one mechanism: the route writes a `data-approval-summary` part `{ toolCallId, summary }` through the UI message stream writer, or `summarize` is an isomorphic per-tool function the client imports. Name it in both §7.
> - **R2-4. `assistant_messages.id` is a global text PK taken from the client's UIMessage id.**
>   - A client chooses that id, so it can collide with another user's message. An insert would fail; an upsert would overwrite another thread's message.
>   - Use PK `(thread_id, id)`, or have the server assign ids, and say "insert, never upsert" in backend §8.10.
> - **R2-5. The `render_timeline` args differ.** Frontend `RenderTimelineArgs = { items: AgendaItem[] }` (fields `id`, `title`, `start`…); backend §10.3 has `{ label, start, end?, tramoKey?, status?, tone? }`. Use `AgendaItem` in the backend zod schema, since it is the shape the widget renders.
> - **R2-6. The vacation settings location differs.**
>   - Frontend §3.7 / RD-18 puts "Días de vacaciones" in Mis vacaciones, so Dirección can reach it.
>   - Backend Annex C.2 C1 and §12.1 say "Ajustes › General". Backend §21.2 gives the section to the Ajustes phase, and `saveVacationSettingsAction` revalidates `/ajustes/general`.
>   - Align them on Mis vacaciones (P4): revalidate `/biblioteca/vacaciones` and remove the General mentions.
> - **R2-7. Guard-test false positive.** "Branches on the presentation style (`style ===`, `useStyle().style` in a conditional)" outside `components/widgets/` also matches `EstiloSwitch` (`aria-checked={style === option}`) and `StyleProvider`. Allow-list `components/shell/{EstiloSwitch,StyleProvider}.tsx` by path.
> - **R2-8. The `LOW_CONTRAST` detail format differs.** Frontend §14.6 says `<pair> <ratio>[; …]`; frontend §7.2 and backend §7.1/§8.2 say `<pair> <mode> <ratio>[, …]`. Fix §14.6.
> - **R2-9. Project Flow spec not updated.** The migration rule ("second to merge regenerates") and "one Toaster in the root layout" bind Project Flow, but `docs/specs/project-flow/*` doesn't mention them. Add one line to Project Flow backend §4 and frontend §10 so its implementers see it.
> - **R2-10. Contrast coverage gap.** `destructive` on `background` is 4.26 in Azul light. It isn't in the pair list, so overdue dates outside cards fail. Either keep overdue text on cards only (the current frames), or add `destructive/background` and darken Azul light `destructive` (for example `#d61f45`).
>
> ### Recommended edits (round 2)
>
> **Issue #16:** One phase table, with cross-cutting services in Phase 1.
> **Edit in:** frontend §20.1/§20.3 and backend §21.1/§21.2 (paste the same table into both and delete the other cut)
> ```
> P1 Contracts & foundation adds (besides the current list):
> - lib/notifications/notify.ts (notify(): row insert per §8.3) and the notifications repository insert; the Mi espacio phase owns only the Bandeja reads, preferences UI and the delivery jobs.
> - Read helpers over P1 tables, fully implemented: lib/time-tracking/hours.ts weekHoursFor(staffIds, weekStart) (the §8.7 day/lunch rules), lib/vacations/absences.ts approvedAbsences(staffIds, from, to), lib/my-space/reminders-read.ts remindersForDay(staffId, day).
> - lib/email/templates/{recordatorio,resumen-diario,vacaciones-decision}.ts.
> - Every §7 action file with its final exported signatures; bodies not yet implemented throw Error("NOT_IMPLEMENTED"), and the owning phase replaces the body only.
> Owners (single list, both specs): chat route + assistant-actions.ts → P7; photo routes + profile-photo-actions.ts → P1 (the shell avatar needs them); search-actions.ts + lib/search → P2; tasks-actions.ts notify hooks → P5; general-settings-schema.ts + app-settings-actions.ts → P6; vacations-actions.ts + vacation settings UI → P4; cron jobs: reminders, deliver-notifications, daily-digest, due-notifications, gmail-sync → P5; auto-close, missing-clock-in → P6 (one name each, backend §13).
> Rule: a later phase may import only P1 modules and its own files; the guard is a lint rule (no-restricted-imports per phase folder) or a review checklist item.
> ```
>
> **Issue #17:** Flag-off pages keep today's look.
> **Edit in:** backend §8.2 "Root layout" bullet and frontend §4.1 "SSR first"
> ```
> When the resolved redesignEnabled is false, the root layout renders the legacy appearance exactly as today: no <style id="appearance">, the existing <style id="primary-color"> from appearance.primary_color, and the html data-theme attribute that ThemeToggle uses. The new block, `.dark` handling and the system-mode script apply only when redesignEnabled is true (and on the portal, which follows the org theme by brief default).
> app/globals.css keeps today's Grafito values (plus the round-1 Grafito fixes) and its `.dark, :root[data-theme="dark"]` selectors until the Cleanup phase; the Azul fallback replaces it in P9. The drift test checks globals.css against THEME_PRESETS.grafito until then.
> Frontend acceptance 2 adds: "a user with the flag off sees the same colors before and after Phase 1 deploys (visual snapshot of /dashboard)".
> ```
>
> The round-1 review follows unchanged.

---
---

VERDICT (round 1): CHANGES NEEDED

> Senior review of `docs/specs/redesign/frontend.md` and `docs/specs/redesign/backend.md`, checked against the brief (`docs/specs/source/redesign-spec.md`), the approved Project Flow specs (`docs/specs/project-flow/*`) and the code on `docs/redesign-plan` (2026-11-07).
>
> Action by action, the frontend §7 and backend §7 contracts mostly line up. All five frontend Annex C items are adopted in backend Annex C.1. The blocking issues are in five areas:
> - **Preset theme values:** they fail both specs' own contrast gate.
> - **SSR appearance and the rollout flag:** these mechanics are undefined, or wrong as written.
> - **Phase plan and migrations:** there is no phase plan and no file ownership, and the migration "rebase" will skip migrations.
> - **Project Flow:** there are hidden dependencies on it, and its admin-only data leaks through the new aggregates.
> - **Smaller contract gaps:** assistant confirmations, notification storage, Cutto env, vacations privacy, the cron lock and Gmail disconnect.
>
> Most fixes are a few lines of spec.

---

## Blocking Issues

1. **The preset tokens fail the contrast gate both specs define. Publishing is blocked from the first click, and the "every preset passes" test fails.**
   - I computed the ratios with the WCAG formula from backend §8.2, using the oklab tint mix of FE §14.5. These pairs fail:
     - Azul **dark** `primary-foreground #ffffff` on `primary #3b82f6` = **3.68** (the same for `sidebar-primary`). Both specs check this pair.
     - Grafito dark `destructive #e0574a` on `card #1e1e1e` = **4.47**. Both specs check it.
     - Azul light `muted-foreground #64748b` on `background #f1f4f9` = **4.32**. Only backend §8.2 checks it.
     - `chart-N` on `card` is below 3:1 in Azul light (chart-3 2.15, chart-4 2.43, chart-5 2.54), Cálido light (chart-3 2.36) and Grafito light (chart-3 2.82, chart-4 2.17). Both specs make chart-N vs card ≥ 3 a hard rule.
   - The default organization theme (Azul) can't be published as seeded. The test of frontend §14.6 and backend §16 fails. Brief acceptance 8 fails.
   - The Grafito drift guard (backend §16: "Grafito equals globals.css") means the Grafito values can't change unless `globals.css` changes too.
   - **Two implementations with two pair lists.** Frontend `lib/ui/contrast.ts` checks 8 pair groups. Backend `checkContrast` in `lib/ui/appearance-css.ts` checks 10 (adding `muted-foreground/background` and `secondary-foreground/secondary`). As a result the editor can enable "Publicar para todos", and then the server rejects the save with `LOW_CONTRAST`.

2. **The SSR appearance contract is inconsistent and produces the flash it is meant to prevent.**
   - `ResolvedAppearance.cssVars`:
     - Frontend §14.1 says "every `--{token}` for the **active mode**".
     - Backend §8.1 step 6 says the vars are for "both light and dark; the client picks by mode". That doesn't fit a flat `Record<string,string>`.
     - With `mode = "system"` the server can't know the active mode.
   - Frontend §4.1: `AppearanceProvider` "writes `cssVars` on `document.documentElement.style`". Inline custom properties beat the server `<style>` blocks, including the `.dark` block and the `prefers-color-scheme` mirror that backend §8.2 emits. So an OS switch to dark is ignored after hydration.
   - **The cookie contents disagree.**
     - Frontend §2.3/§4.1: the root layout reads the redesign flag and "the same variables" from `cincel-appearance`.
     - Backend §8.2: the cookie holds "`mode` + a hash of the vars", and no flag.
   - **The dark mechanism is unspecified.** Tailwind's `dark:` variant is `@custom-variant dark (&:is(.dark *))` (`app/globals.css:5`). Today's toggle sets `data-theme`, not `.dark` (`components/layout/ThemeToggle.tsx:18`). Frontend §14.1 toggles `.dark` only on the client. So for `system` (the default mode), every `dark:` utility in the shadcn primitives flashes until hydration.

3. **The rollout flag and the route-group move don't work as written.**
   - **Non-admins can't opt in.** Frontend §2.3: with the flag off, new routes redirect to their old equivalents, and the banner links to `/ajustes/apariencia`. That page redirects to `/configuracion/...`, which `AppRouteGuard` restricts to Administrador (`components/auth/AppRouteGuard.tsx:36,57-58`), so the user lands on `/dashboard`. The only toggle (`redesignEnabled`) lives on that page, so only admins can opt in. Brief rollout default (per user) and frontend acceptance 3 fail.
   - **The route-group move.** Frontend §5 moves "all staff pages" into `app/(staff)/` with `AppShell` in the layout. But `app/proyectos/*`, `app/asistente` and every redirected route can't exist both in `app/x` and `app/(staff)/x`: Next rejects two pages for one URL. So the move happens once, and from then on:
     - The `(staff)` layout must render `AppShell` only when the flag is on.
     - Every page shared by both worlds (`/proyectos/[id]/*`, `/asistente`, and the old pages while the flag is off) must keep its old `Sidebar` + `Header` markup in the off branch.
     - Otherwise the result is a double sidebar (flag on, page not yet restyled) or no sidebar (flag off).
     - Neither spec says this, and "pages remove their own Sidebar/Header imports in the phase that restyles them" breaks the flag-off path.
   - **The kill switch.** `NEXT_PUBLIC_REDESIGN_AVAILABLE=false` (frontend §11) only hides the switch on the client. Backend `resolveAppearance` and `updateMyPreferencesAction` ignore it, so users who already opted in stay in the new shell.

4. **Moving `/configuracion/*` to `/ajustes/*` drops the only access check on the admin settings pages.**
   - The admin gate for `general`, `permisos`, `estatus`, `workflows`, `areas` and `google` is the client prefix check `CONFIG_ROUTE_PREFIX` in `AppRouteGuard`. Those pages have no server-side check (`app/configuracion/{general,permisos,estatus,workflows,areas}/page.tsx`); only `importar-monday` redirects on the server.
   - `/ajustes/*` mixes personal pages (perfil, apariencia, notificaciones, integraciones) with admin pages.
     - If the guard isn't updated, any staff member can open `/ajustes/permisos`, `/ajustes/general` and `/ajustes/estatus`.
     - If `/ajustes` replaces the prefix, nobody but admins can open Perfil or Apariencia.
   - Neither spec mentions `AppRouteGuard`.
   - **Dirección can't reach its pages.** `canManageAppearance` includes Dirección (`lib/auth/permissions.ts:1376-1384`), and Q4 lets Dirección see the hours report. But `AjustesNav` renders the Organización group "only for Administrador" (frontend §8), so Dirección can't reach `/ajustes/tema` or `/ajustes/horario`.

5. **There is no phase plan and no file ownership, so "one contracts phase, then fully parallel phases" (brief decision 15) can't be planned from these specs.**
   - Backend §0.2 item 10 says only that "data model, types and action signatures merge first". Neither spec lists what phase 0 contains or which phase owns which file.
   - **Shared files** that many phases would touch, each a guaranteed merge conflict or a hidden sequence:
     - `app/(staff)/layout.tsx` and the route-group move (Blocking #3);
     - `components/shell/Sidebar.tsx` (badges, `TimeClock`, nav);
     - `lib/ui/nav.ts`;
     - `app/layout.tsx` (appearance styles, `Toaster`, `lang`);
     - `AppRouteGuard`;
     - `lib/errors.ts`;
     - `lib/auth/permissions.ts` (the four new helpers);
     - `lib/types/core.ts`;
     - `lib/db/schema/{_schema,index}.ts`;
     - `lib/assistant/tools.ts` + `prompt.ts` + chat route (every tool group);
     - `lib/actions/tasks-actions.ts` (notify hooks, which Project Flow also rewrites);
     - `lib/cron/jobs.ts`.
   - **The widget library has no phase.** `components/widgets/*` and `components/patterns/*` are consumed by every page phase, and brief §4 lists only shell components in the contracts phase. If widgets are built in a page phase, every other page phase waits on it.
   - **Shared widget types are defined twice.**
     - Frontend §4.10.1 defines `KpiDatum`, `PersonDatum`, `EntityCard`… in `components/widgets/types.ts`, with UI fields (`PersonDatum.actions: ReactNode`, `EntityCard.icon/badges/footer`).
     - Backend Annex C.2 · C7 defines the same names in `lib/types/widgets.ts` without them, and says the frontend file re-exports them.
     - The frontend spec never accepts C7. Two exported `PersonDatum` types with different fields won't compile as a re-export.

6. **The migration "renumber at merge" plan will silently skip migrations on deploy.**
   - drizzle-orm's migrator applies a migration only when its journal `when` is greater than the last applied `created_at` (`node_modules/drizzle-orm/pg-core/dialect.js:59-62`). It doesn't go by file name or order.
   - Project Flow (0023–0025) and this feature are built in parallel. If redesign 0026+ is generated later and deployed first, Project Flow's 0023–0025, generated earlier, will **never run** on that database, with no error.
   - The reverse order skips the redesign migrations.
   - Both branches also fork `meta/*_snapshot.json` from the same 0022 parent (`prevId`). Renaming files fixes neither the timestamps nor the snapshot chain.
   - Backend §4 and D11 only say "renumbered (re-based) at merge time".

7. **Hidden dependencies on Project Flow have no fallback, so either the redesign waits for Project Flow or it breaks when Project Flow lands.**
   - The brief's Q2 default promises "no blocking", but these redesign contracts use Project Flow artefacts that don't exist on `main`:
     - `TramoBadge` (today `components/v2/status/AreaBadge.tsx`, props `{name,colorSlot}`);
     - `tramoColorVar` (today `areaColorVar` in `lib/areas/area-color.ts`; `lib/dashboard/donut-groups.ts`, which backend §8.0.2 extends, imports it, and Project Flow renames `projectsByArea` there);
     - fases and espacios (TaskSheet "Fase, Espacio", NewTaskDialog fase list, Proyecto · Tareas "grouped by fase");
     - `puesto` (`PersonDatum.puesto`; the positions tables are Project Flow's);
     - `canSeeAdminData`;
     - `fetchTramosNavAction`;
     - the `/configuracion/tramos` and `/configuracion/puestos` pages that `/ajustes/tramos|puestos` "move".
   - **Both features mount a `Toaster`.** Project Flow mounts `<Toaster />` in `app/layout.tsx` (Project Flow frontend §10/§12), and this feature mounts it in `AppShell` (frontend §3.1). With both, every staff toast renders twice.
   - **Both features rewrite the Sidebar.** Project Flow §3.16 edits `components/layout/Sidebar.tsx`, while this feature replaces it.
   - **The start deep link is lost.** Project Flow's `?project=` deep link on `/actividades/[tramo]` opens `StartTramoSheet`. The redirect to `/tareas?vista=lista&tramo=…` drops it (`TareasQuery` has `proyecto`, not `project`), so the ficha's "Iniciar tramo" link stops working once the flag is on.

8. **Project Flow's admin-only data (client linkage, admin tasks) leaks through the new aggregates.** Backend §9.7 applies `canSeeAdminData` to search only. Once Project Flow lands, these reads return admin-only data to non-admins:
   - Proyecto · Resumen "Cliente y contactos" (frontend §3.5), shown to every viewer. Project Flow makes the client admin-only.
   - `PersonaDetail.tasks`, `InicioData.attention` and `InicioData.myDay`: assigned and due tasks, which include `kind = 'admin'` tasks.
   - `PortfolioRow.nextDelivery.title`: "next open task by commitment date", which can be an admin task.
   - The assistant read tools `get_task`, `list_my_tasks`, `get_project` and `team_workload_summary`.
   - The search `proyecto` subtitle is fine. The same family of leak was Blocking #2 of the Project Flow review.

9. **The assistant confirmation contract doesn't match, and the model never learns what happened.**
   - **`render_confirmation` shape:** frontend §4.9 `RenderConfirmationArgs = AssistantActionProposal`; backend §10.3 `render_confirmation` is `{ proposalId: uuid }`.
   - **What a confirm tool returns:** frontend §3.9/§7.10 says "returns an `AssistantActionProposal`"; backend §8.10 says `{ proposal: AssistantActionProposal }`.
   - **No feedback to the model.** After `confirmAssistantActionAction` runs, nothing feeds the result back into the conversation. On the next turn the model either still thinks the action is pending, or (with `stepCountIs(5)` still looping, backend §10.1) has already told the user "listo". "The model is instructed to stop and wait" is a prompt, not a mechanism.
   - **AI SDK v7 has native tool approval.** `ai@7.0.84` ships `needsApproval`, `tool-approval-request` parts and `addToolApprovalResponse` / `lastAssistantMessageIsCompleteWithApprovalResponses`. Using them is the "reuse first" answer and solves the feedback loop. The specs build a parallel mechanism without saying why.
   - **Thread id handshake:**
     - Backend returns a new thread id only in the `X-Assistant-Thread` response header. `useChat` with `DefaultChatTransport` (`components/asistente/AssistantChat.tsx:102-103`) doesn't expose response headers, and frontend §3.9 never says how it learns the id ("Pantalla completa → `/asistente?thread=id`" needs it).
     - **The localStorage import:** backend §4.7 imports the old thread "through `fetchAssistantThreadsAction` + chat route", and posting old messages to the chat route runs the model.
   - **`render_timeline` items:** frontend has `{ label, start, end?, tramoKey?, status? }`, backend has `{ label, start, end?, tone? }`.

10. **Notifications have a data model gap: deferred emails and digest-only kinds have nothing to read.**
    - Backend §8.3: a row is inserted only when `inApp` is true. Email inside quiet hours "is left for the next tick" (job `deferred-email`), and digest kinds "are included in the daily digest" (which reads unread rows).
    - **Nothing to read.** For a kind set to `inApp: false, email: true` (inside quiet hours) or `inApp: false, digest: true`, no row exists, so the deferred email and the digest entry are lost.
    - **No pending marker.** Even when a row exists, `notifications` has no column that says "email pending". `emailed_at is null` is also true for every in-app-only row, so the job can't tell "deferred" from "not wanted" without re-reading preferences, which may have changed.
    - Backend acceptance 5 ("quiet hours (email deferred)") can't be met.

11. **The Cutto links contract disagrees on env vars and mixes client and server code in one module.**
    - Frontend §11 uses `NEXT_PUBLIC_CUTTO_BASE_URL` (the links are built in client components: Sidebar, PersonCard, EventDetailPopover). Backend §11.2/§14 reads `CUTTO_BASE_URL` (server-only, `undefined` in the browser), in the same `lib/integrations/cutto.ts` that holds the API client and reads `CUTTO_API_TOKEN`.
    - Either the client bundle gets wrong links on any non-default host, or a client component imports the API client module.
    - `personChatUrl(staffId)` is built as `/dm/<staffEmail>` (backend §11.2), which a pure link builder can't produce from an id.
    - The link-only rule itself is respected on both sides: no Cutto UI, and the 15 tools are disabled without `CUTTO_API_URL`.

12. **Vacations expose health data to all staff, and the approver rule differs between the specs.**
    - **The absence `kind` leaks.** `fetchTeamAbsencesAction` is "session (names and dates only)" in frontend §8, but its output includes `kind` (frontend §7.9, backend §7.8). So every staff member sees which colleagues are off for `enfermedad`. Health data is sensitive personal data. Only the requester, approvers and hours-viewers should see the kind.
    - **The approver rule.** Backend `canDecideVacations` = Administrador or role in {Dirección, Jefe de Taller, Jefe de Construcción} (§12), and `requestVacationAction` notifies them. Frontend §3.7/§8 shows "Solicitudes por aprobar" only to Administrador and Dirección. So Jefe de Taller and Jefe de Construcción get notified but have no screen to decide from.

13. **The reuse rule contradicts the `ListPage` contract, so frontend acceptance 15 can't pass.**
    - Acceptance 15 says the guard test fails when any file outside `components/widgets/` and `StyleView.tsx` references `StyleView` or branches on style.
    - **`ListPage` breaks it.** `ListPage` lives in `components/patterns/` and "renders … `StyleView`", and its contract takes `views: { visual; esencial; analitico }` from the page (frontend §4.11). Tareas tablero (Visual `BoardView`, Esencial/Analítico `RecordTable`) and Proyectos (`EntityCardGrid` / `RecordTable`) pass per-style markup at page level through it (frontend §4.10.2).
    - **`KpiDatum` breaks it too.** It has no per-style visibility, but Inicio shows "Completadas · semana" only in Analítico (frontend §3.2). So the page must filter on style.
    - Either the guard test or the composition contract has to change.

14. **The cron advisory lock leaks on the pooled connection, and once it leaks, ticks stop running.**
    - Backend §13: `pg_try_advisory_lock(...)` and then an unlock "in `finally`". That is a **session-level** lock. `db` is a postgres-js pool with `max: 10` (`lib/db/client.ts:17-22`), so the lock and the unlock can run on different connections.
    - The unlock then returns false, and the lock stays held by an idle pooled connection. Every later tick sees "not acquired" and returns `204`.
    - Reminders, auto-close and Gmail sync stop with no error, until that connection is recycled. That breaks brief acceptance 5 ("reminders fire within one minute").

15. **Gmail "Desconectar" has no action on either side.**
    - Frontend §3.8 Integraciones shows "Desconectar". There is no `disconnectGmailAction` in frontend §7.7 or backend §7.6.
    - Backend §11.1 says "Disconnect = existing 'revoke' path removes the scope". No such path exists: there is no revoke call anywhere in `lib/google` or `app/api/auth/google`.
    - Revoking the Google token also revokes the `drive`/`calendar` grants that are stored in the same `google_oauth_accounts` row. So "removing the gmail scope" needs a defined behavior.

---

## Non-Blocking Issues

1. **The photo upload limit runs into the Server Action body limit.**
   - `uploadMyPhotoAction(FormData)` takes files up to 1 MB. But Next's default `serverActions.bodySizeLimit` is 1 MB, and `next.config.ts` doesn't raise it.
   - A 0.95 MB photo plus multipart overhead is rejected before the action runs, with an opaque error instead of `TOO_LARGE`. Set `experimental.serverActions.bodySizeLimit: "2mb"`, or upload through a route handler.
   - **EXIF location.** Phone photos carry GPS EXIF. They are served to every staff member, which goes against the spirit of "location never stored". `sharp` isn't a dependency, so re-encode on the client through `<canvas>` before upload (that drops EXIF), and keep the server magic-byte check (`file-type` is already a dependency).
2. **"Published changes reach all users on next navigation" (frontend acceptance 5, brief §6.4) isn't how App Router layouts behave.**
   - Shared layouts aren't re-rendered on client navigation. `revalidatePath("/", "layout")` only refreshes the caller's router cache.
   - Either reword it to "on next page load", or carry `appearance.version` in a payload the client already polls (the Bandeja poll, the `TimeClock` re-sync) and call `router.refresh()` when it changes.
   - The same staleness hits the sidebar badges (`unreadCount`, overdue) built in `(staff)/layout.tsx`.
3. **Fonts.** `next/font` declarations are static module-level calls, so Inter and DM Sans can't be "loaded only when selected" (frontend §14.3). Declare all three in `app/layout.tsx` with `preload: false` for the two non-defaults, and switch `--font-sans` between the three `variable`s.
4. **Prompt injection through Gmail and documents.**
   - `summarize_email_thread`, `search_email` and document context put third-party text in front of the model.
   - These write tools don't require confirmation: `update_task_status`, `add_checklist_item`, `link_email_to_project` (writes project history), `create_note`, `mark_notifications_read` and `clock_in`.
   - Require confirmation for any write in a turn that has read external content, or mark the tool results as untrusted in the system prompt and add that rule.
5. **`AssistantContext` ids come from the client.** Backend §8.10 puts "the project/task/person name and id" into the system prompt. So resolve each id through the viewer-scoped reads (`fetchProjectAction`, `fetchTaskAction`) and drop it when the viewer can't see it. Otherwise a crafted `projectId` reveals a project name.
6. **The chat route trusts client history.** With server-side threads, load the history from `assistant_messages` and accept only the new user message (plus approval responses). Today the route takes the full `messages[]` from the client (`app/api/asistente/chat/route.ts:34`), so forged tool results would be persisted and replayed.
7. **Gmail drafts pile up.** "A new token is obtained by re-saving the draft", and `createGmailDraftAction` creates a new Gmail draft every time. Add `drafts.update` (or delete the previous `draftId`) so editing a reply doesn't fill the user's Drafts folder.
8. **Gmail HTML.** Render the sanitized body in an `<iframe sandbox srcdoc>`, not inline, so the email's CSS can't restyle the app. `sanitize-html` is already a dependency.
9. **Gmail restricted scopes.** `gmail.readonly` is a restricted scope. The OAuth consent screen must be **Internal** (Workspace), or Google requires a security assessment. Add this to `docs/google-workspace-admin-checklist.md`.
10. **Search contract details.**
    - The `nota` url is `/mi-espacio?nota=<id>` (backend §8.9), but the frontend route is `/mi-espacio/notas/[id]` (frontend §2.1).
    - The contact url `/personas/clientes?c=<id>` uses a `c` param that frontend §3.6 doesn't handle.
    - Both sides produce the "Acciones" group: backend returns `accion` results, and frontend §3.12 renders a static group. Pick one.
11. **Capability names don't exist.**
    - Backend uses `team.canViewCollaborators` (§7.11, §7.12, `get_person`). The real field is `canViewTeam` (`lib/auth/permissions.ts:74`), which frontend §2.1 uses.
    - Portal `canInvite` (`invite_client_to_portal`) is really `manageAccess`.
    - `canViewTeamHours` says "role 'Dirección'". The existing pattern is `user.access === "Dirección"` (`canViewSensitiveStaffData`).
12. **`TimeClock` props.** It needs `requiredFrom` and `hoursPerDay` (frontend §4.1), but `AppShellProps.today` is only a `TodayStatus`. Add both to `TodayStatus` so the layout makes one call.
13. **Deep-link sheets.** `/tareas/[id]` and `/mi-espacio/notas/[id]` "open over the current view, back closes". That needs intercepting routes (`(staff)/tareas/@sheet/(.)[id]`) or a `?tarea=` param. A plain page unmounts the board. Say which.
14. **Time-tracking edge cases.**
    - `pause`/`resume` append to `pauses` jsonb without a row lock, so two tabs can double-append. Use `select … for update` on the open entry.
    - When `autoCloseAt` is null, an entry left open yesterday is never closed (backend §8.7 computes `workDate autoCloseAt`), and today's state reads `on`. Close it at `dayEnd` of its `workDate`.
    - `saveTimeTrackingSettingsAction` doesn't validate `requiredFrom` ≥ tomorrow (only the frontend does). Moving it into the past retroactively turns trial days into payroll days.
15. **The CSV export** (`/api/horario/export`) must escape cells that start with `=`, `+`, `-` or `@` (formula injection in Excel).
16. **Rollback of `general_settings`.** The schema is `.strict()` (`lib/settings/general-settings-schema.ts:38,46,50`). Once `instagramUrl`/`contactEmail` are stored, the previous image can't parse the row and General settings break on rollback. Write this down as a known rollback effect, or store the links under a new key.
17. **`user_preferences.text_size numeric`.** Drizzle returns `numeric` as a string. Use `numeric(..., { mode: "number" })` or a `smallint text_size_x2`. Also, `idx_notes_body_trgm` serves no query: every notes search is owner-filtered, so `(staff_id)` plus ILIKE is enough. Check that the generated SQL wraps the expression in parentheses before the opclass if you keep it.
18. **Error copy.**
    - `RATE_LIMITED` is also thrown by search and photo upload (backend §12), but its only copy is Gmail-specific. Add context copy for those.
    - `FORBIDDEN` from `cancelVacationRequestAction` on a started request reads "No tienes permiso". Use a specific code (`STARTED`).
    - The brief and backend say `actionErrorText(code)`, while frontend and Project Flow say `actionErrorText(err, context)`. State the one signature and the context keys (`search`, `cutto`, plus the Project Flow ones).
19. **Linked ids aren't checked for visibility.** `createNoteAction`, `createChecklistAction` and `createReminderAction` validate `projectId`/`taskId` only as "known". Validate them as visible to the caller.
20. **Assistant audit and private data.** Backend §9.9 writes `"<summary> (vía asistente)"` to `history_events` for note, reminder and time_entry writes. For owner-only entities, either write nothing or a summary without the content, so private text doesn't land in a shared table.
21. **Backend Annex C.2 items have no frontend consumer:**
    - C2 (vacation allowances): no screen sets them, so everyone stays at 12 days;
    - C3 (attachments route);
    - C4 (`calendar.events` grant): there's no "Conectar calendario" target;
    - C5 (`parametric_costs`): no editor;
    - C6 (`fetchMyWeekHoursAction`): Perfil shows no hours.

    Mark each as in scope with a frontend owner, or out of scope.
22. **Cutto meeting links.** No field says an event "has a Cutto meeting" (`AgendaItem.meetingUrl` has no producer while Cutto is link-only). So "Abrir en Cutto" in `EventDetailPopover` is either never shown or always shown. Say which: until Q1 is answered, show it only for events that carry a stored Cutto URL.
23. **`PageHeader` location.** Frontend §4.2 adds `components/shell/PageHeader.tsx` that "extends" the v2 one. Acceptance 16 says "extends" means changing the existing file. Edit `components/v2/layout/PageHeader.tsx` (8 importers) in place and re-export it from `components/shell`.
24. **Revalidation drift.**
    - `updateMyPreferencesAction`: frontend says no revalidation, backend says `/` + layout. Revalidating the layout on every text-size slider step re-renders the tree, so debounce it, or follow the frontend.
    - `uploadMyPhotoAction` paths also differ between the specs.
25. **The Mis vacaciones section.** The existing `resource_links` rows with section `mis-vacaciones` disappear behind the redirect to `/biblioteca/vacaciones`. Show them on that page or migrate them.
26. **CI (pre-existing, carried from the Project Flow review NB 18).** `.github/workflows/cincel-app-build.yml` still runs jobs on `ubuntu-latest` (lines 24, 48, 94, 156), has no `timeout-minutes`, runs a Playwright job (line 139), and uses `docker/setup-buildx-action` (line 239). Neither spec adds to it, and both correctly keep e2e local. Track it as its own infra issue. Until then, `tests/e2e/{equipo,directorio,recursos,tablero-columns,actividades-general,apariencia,calendario}.spec.ts` keep testing the old routes, so they stay green only while the org flag is off.
27. **Small notes.**
    - `/api` is already outside `middleware.ts`'s checks (`middleware.ts:33-38`), so the "cron allowlist" edit is a no-op.
    - Next 16 renames `middleware.ts` to `proxy.ts`. Don't touch it in this feature.
    - Prefer that host cron call the app on the Docker network, not the public URL.

---

## API Contract Diff

```
✅ fetchMyPreferencesAction                         — both specs, UserPreferences (textSize union)
⚠️  updateMyPreferencesAction                        — errors aligned (INVALID, OVERRIDE_DISABLED); revalidate FE none | BE `/` layout (NB 24); cookie contents differ (Blocking #2)
✅ fetchOrgAppearanceAction                         — both specs
⚠️  saveOrgAppearanceAction                          — errors aligned; LOW_CONTRAST pair lists differ FE §14.6 | BE §8.2, presets fail (Blocking #1)
✅ resetOrgAppearanceAction(base)                   — both specs; BE keeps styleDefault/allowUserOverride/redesignDefault
❌ ResolvedAppearance.cssVars                       — FE: active mode only | BE: both modes in a flat record (Blocking #2)
✅ uploadMyPhotoAction (TOO_LARGE, INVALID_TYPE)    — both specs; ⚠️ 1 MB vs Server Action body limit (NB 1)
✅ removeMyPhotoAction / GET /api/staff/[id]/photo  — both specs (401/404/304, ETag)
⚠️  searchWorkspaceAction (INVALID)                  — aligned; BE adds RATE_LIMITED (no FE copy); `nota` url and `?c=` mismatch (NB 10)
✅ fetchNotificationsAction                         — both specs; BE adds INVALID (generic copy)
✅ markNotificationsReadAction                      — both specs
✅ fetch/updateNotificationPreferencesAction        — both specs; ❌ storage can't honor email-only/digest-only (Blocking #10)
✅ fetchNotesAction / createNoteAction              — both specs (FE title required, BE optional: harmless)
✅ updateNoteAction / archiveNoteAction             — both specs; BE adds INVALID
✅ fetch/create/archiveChecklistAction              — both specs
✅ add/toggle/reorderChecklistItemsAction           — both specs; BE adds NOT_FOUND/FORBIDDEN/INVALID
✅ fetchRemindersAction / parseReminderTextAction   — both specs
✅ createReminderAction (INVALID, PAST_TIME)        — both specs
✅ snoozeReminderAction / cancelReminderAction      — both specs; BE adds NOT_FOUND/FORBIDDEN
✅ fetchGmailStatusAction                           — both specs
✅ fetchGmailThreadsAction (NOT_CONNECTED, SCOPE_MISSING) — both specs
⚠️  fetchGmailThreadAction                           — FE says GmailMessage/GmailAttachment are "defined in BE §6"; BE only inlines them in §7.6: name them in lib/types/redesign.ts
✅ syncGmailAction (NOT_CONNECTED, RATE_LIMITED)    — both specs
⚠️  linkGmailThreadToProjectAction                   — BE adds FORBIDDEN and a project-history comment with the subject (visible to project viewers; say so in the UI)
✅ createGmailDraftAction → { draftId, confirmToken, expiresAt } — FE Annex C1 accepted (BE C.1 FE1); ⚠️ re-save duplicates drafts (NB 7)
✅ sendGmailDraftAction (CONFIRM_REQUIRED, EXPIRED, NOT_CONNECTED) — both specs
✅ createTaskFromGmailThreadAction                  — both specs; BE adds NOT_FOUND/FORBIDDEN/NOT_CONNECTED
✅ GET /api/auth/google/start?grant=gmail           — both specs (alias of scope=)
❌ Gmail "Desconectar"                              — FE: button | BE: MISSING (no action, no revoke path) (Blocking #15)
✅ fetch/saveTimeTrackingSettingsAction             — both specs (FORBIDDEN, INVALID)
⚠️  fetchMyTodayAction → TodayStatus                 — aligned; lacks requiredFrom/hoursPerDay the TimeClock needs (NB 12)
✅ clockInAction (DISABLED, ALREADY_ON)             — both specs, source union identical
✅ pause/resume/clockOutAction (NOT_ON)             — both specs
✅ fetchTeamHoursAction (FORBIDDEN)                 — both specs; BE adds INVALID (Monday)
⚠️  GET /api/horario/export                          — FE "admin" | BE hours-viewer (Admin + Dirección); columns ⊇ Q3; formula escaping (NB 15)
✅ fetchMyVacationsAction                           — both specs
✅ requestVacationAction (INVALID, OVERLAP)         — both specs
✅ cancelVacationRequestAction                      — both specs
❌ decideVacationAction                             — FE: Admin/Dirección | BE: + Jefe de Taller, Jefe de Construcción (Blocking #12)
❌ fetchTeamAbsencesAction                          — returns `kind` (enfermedad) to all staff (Blocking #12)
✅ fetchInicioAction → InicioData                   — BE §7.10 fields = FE §7.9 list; ⚠️ attention/myDay need the admin filter (Blocking #8)
⚠️  fetchPersonaDetailAction (NOT_FOUND)             — auth FE team.canViewTeam | BE team.canViewCollaborators (doesn't exist) (NB 11); tasks need the admin filter (Blocking #8)
✅ fetchProjectsPortfolioAction → PortfolioRow[]    — FE Annex C3 accepted, fields identical; ⚠️ nextDelivery admin filter (Blocking #8)
✅ fetchPeopleOverviewAction → PeopleOverviewRow[]  — FE Annex C4 accepted, fields identical (BE adds "or self" for weekHours)
✅ general_settings.company links                   — FE Annex C5 accepted (instagramUrl, contactEmail, website); ⚠️ strict-schema rollback (NB 16)
✅ TokenName chart-1-ink … chart-5-ink              — FE Annex C2 accepted
✅ fetchAssistantThreadsAction / fetchAssistantThreadAction / deleteAssistantThreadAction — both specs
✅ confirmAssistantActionAction (EXPIRED, NOT_FOUND, FORBIDDEN) / cancelAssistantActionAction — both specs
❌ confirm tool output                              — FE: AssistantActionProposal | BE: { proposal: AssistantActionProposal } (Blocking #9)
❌ render_confirmation args                         — FE: AssistantActionProposal | BE: { proposalId } (Blocking #9)
❌ POST /api/asistente/chat thread id               — BE: X-Assistant-Thread header | FE: not read anywhere (Blocking #9)
⚠️  render_timeline args                             — FE { tramoKey?, status? } | BE { tone? } (Blocking #9)
⚠️  render_table args                                — FE rows allow null | BE string|number only
❌ localStorage thread import                       — FE: "imported once" | BE: via chat route (runs the model) (Blocking #9)
✅ POST /api/cron/tick (Bearer CRON_SECRET)         — both specs; ❌ lock leak (Blocking #14)
❌ Cutto base URL env                               — FE NEXT_PUBLIC_CUTTO_BASE_URL | BE CUTTO_BASE_URL (Blocking #11)
⚠️  NEXT_PUBLIC_REDESIGN_AVAILABLE                   — FE only; not enforced by the BE resolver (Blocking #3)
⚠️  actionErrorText signature                        — FE/Project Flow (err, context) | brief/BE (code) (NB 18)
⚠️  NOT_IMPLEMENTED (BE stubs)                       — no FE copy; generic fallback is fine while stubs exist
BE Annex C.2:
⚠️  C2 set/fetchVacationAllowancesAction            — no FE screen (NB 21)
⚠️  C3 GET /api/gmail/attachments/…                 — FE silent; reading pane lists attachments (NB 21)
⚠️  C4 ?grant=calendar_events                       — no FE entry point (NB 21)
⚠️  C5 parametric_costs + saveParametricCostsAction — no FE editor (NB 21)
⚠️  C6 fetchMyWeekHoursAction                       — no FE consumer (NB 21)
❌ C7 lib/types/widgets.ts                          — FE §4.10.1 defines the same names in components/widgets/types.ts with UI fields; not accepted by FE (Blocking #5)
✅ C8 InicioData / PersonaDetail from C7 shapes     — consistent with FE §7.9
✅ C9 generic helpers                               — BE-internal
```

---

## Data Model Review

```
✅ user_preferences          — core.table, staff PK cascade, checks (text size, quiet pair); ⚠️ numeric returns string (NB 17)
✅ staff_photos              — mime + size checks, sha256 ETag; ⚠️ EXIF not stripped (NB 1)
❌ notifications             — no row when inApp=false, no email-pending marker; deferred email and digest lose items (Blocking #10)
✅ notification_preferences  — (staff_id, kind) PK
✅ notes                     — soft delete, not-empty check, live index; ⚠️ trigram GIN unused (NB 17)
✅ checklists / checklist_items — soft delete on parent, text check, (checklist_id, sort_order) index
✅ reminders                 — channels check, open-due partial index, task/project set null (+ partial FK indexes per §3.13)
✅ gmail_accounts / gmail_threads — (staff_id, id) PK, tokens stay encrypted in google_oauth_accounts (token-crypto.ts)
✅ time_entries              — one-open partial unique, order + closed_by checks, never deleted; ⚠️ pause race / null autoCloseAt (NB 14)
✅ vacation_requests / vacation_allowances — range/days checks, decided_by set null + index
✅ assistant_threads / assistant_messages / assistant_actions — owner FKs, open-proposal index, actions kept for audit
✅ cron_runs                 — (job, window_key) PK for idempotent windows
✅ app_settings keys         — appearance.theme (one versioned key, D1), time_tracking, vacations; ⚠️ general_settings strict rollback (NB 16)
✅ history_entity            — ADD VALUE IF NOT EXISTS ×4, not used in the same tx: safe in the migrator transaction
❌ migrations 0026–0032      — renumber-at-merge breaks drizzle's `when` ordering and snapshot chain vs Project Flow 0023–0025 (Blocking #6)
✅ naming                    — no collision with existing tables (task_checklist_items stays separate); core.enum / core.table / stamps / soft used throughout
```

---

## Frontend Architecture Notes

- **No stores or query cache.** The feature loads data in RSCs, keeps local state and refetches, which matches the app. `QueryProvider` exists in `app/layout.tsx` but this feature doesn't use it. That's fine; just don't add new consumers.
- **The widget library is the right shape and covers almost everything.** The per-style matrices of §3 map onto the 9 widgets plus `RecordTable`. Two gaps:
  - the `ListPage`/guard contradiction (Blocking #13);
  - some Analítico tables (Cronograma holgura and duración, Archivos storage by type) don't fit `ProgressListWidget`. They should use `RecordTable` directly, and §4.10.2 should say so.
- **The reuse ledger is credible**, with every "extends" target checked:
  - `KpiRow`/`KpiTile`, `StatusBadge`, `PhaseStepper`, `CapacityRing`, `LoadBar`, `PersonAvatar`;
  - `DataTable`, `RowActionsMenu`, `BulkActionBar`;
  - `ExportMenu`, `HistoryEventList`;
  - `TaskDrawer`, `NewTaskModal`;
  - `UnifiedCalendar`, `CalendarFeedDialog`;
  - `ProjectSectionNav`, `PrimaryColorPicker`, `AssistantChat` and the four assistant message components.

  The exceptions are `PageHeader` (NB 23) and the `StatusChip` adapter: `StatusBadge` takes `{label, token}`, not a `TaskStatusRef`.
- **shadcn here is the base-ui flavour** (`@base-ui/react` in `package.json`). `toggle-group`, `slider`, `calendar` and `sonner` must be added with the same CLI style, so the primitives stay consistent.
- **Accessibility, hydration and the required prompt.**
  - The a11y plan (axe per page and per theme) is good.
  - The required `ClockInPrompt` blocks the whole app until clock-in. If `clockInAction` fails (for example `DISABLED` right after an admin turns the feature off), the user is stuck. Allow dismissal on any error other than `ALREADY_ON`.
  - `StyleView` calls only one render prop, so switching style after hydration is cheap. The SSR style comes from the cookie and DB, so there's no mismatch. Keep `?estilo=` server-read so it doesn't hydrate differently.

## Backend Architecture Notes

- **The three generic helpers are the right call:** metrics, owner-scoped CRUD and the cron registry. The owner-scoped helper puts the Mi espacio privacy rule in one place with one shared test suite.
- **Mi espacio privacy.** Owner-only is enforced by a session-sourced `staffId` argument, and no admin bypass exists. Gmail tokens stay in `google_oauth_accounts` and are encrypted (`lib/google/token-crypto.ts`). The confirm token for UI sends is mostly a UI-intent token: the real guard against unconfirmed sends is that the assistant only reaches `sendDraft` through a proposal. That's acceptable.
- **`after()` for `notify`** keeps the action latency flat. Failures log JSON with `trace_id`, which follows the observability rule. There are no new services, and the host cron is the only new runtime piece.
- **Tool calls go through Server Actions.** Calling them from the chat route works (they are plain async functions), and their `revalidatePath` calls are harmless there. `confirmAssistantActionAction` re-checks capability at confirm time, which is correct.
- **Builders and `server-only`.** `lib/metrics/widgets.ts` claims to be isomorphic. Its bases (`donut-groups.ts`, `calendar-service.ts`) import nothing `server-only` today. Keep it that way, and add a test that imports it in a jsdom environment.
- **Backend §19 "None in the contract surface" is not accurate.** See the ❌ rows above. Update §18/§19 after the fixes.

---

## Recommended Edits

**Issue #1:** Presets fail the contrast gate, and the specs have two contrast implementations.
**Edit in:** `docs/specs/redesign/frontend.md` → §14.2 table, and `docs/specs/redesign/backend.md` → §5.1 table (same values in both)
**Change:**
```
| primary (Azul dark)                    | #2563eb  (was #3b82f6; white text 5.17:1) |
| sidebar-primary (Azul dark)            | #2563eb  (was #3b82f6) |
| muted-foreground (Azul light)          | #5b6b82  (was #64748b; 4.92:1 on background) |
| destructive (Grafito dark)             | #e6675a  (was #e0574a; 5.12:1 on card) — also change app/globals.css .dark block so the drift guard holds |
```
**Edit in:** `docs/specs/redesign/frontend.md` → §14.6, and `docs/specs/redesign/backend.md` → §8.2 `checkContrast` (replace both pair lists with this text)
```
One module, lib/ui/contrast.ts (isomorphic, no server-only), exports CONTRAST_PAIRS and checkContrast(tokens). ThemeEditor and saveOrgAppearanceAction both call it; backend §8.2 imports it instead of re-implementing.
Blocking pairs (≥ 4.5:1, light and dark): foreground/background, card-foreground/card, muted-foreground/card, muted-foreground/background, primary-foreground/primary, secondary-foreground/secondary, sidebar-foreground/sidebar, sidebar-primary-foreground/sidebar-primary, destructive/card, chart-N-ink on its tint.
Warning pairs (≥ 3:1, shown in the editor, never block publishing — the brief blocks only text pairs): ring/background, chart-N/card.
The presets test asserts every blocking pair passes for all six theme/mode combinations.
```

**Issue #2:** The SSR appearance contract.
**Edit in:** both specs → frontend §7.1 / backend §6 `ResolvedAppearance`, frontend §4.1 bullets, backend §8.2 bullet 2
**Change:**
```ts
export type ResolvedAppearance = {
  theme: ThemeId; mode: ColorMode; style: PresentationStyle; density: Density; textSize: TextSize;
  cssVars: { shared: Record<string, string>; light: Record<string, string>; dark: Record<string, string> };
};
```
```
The root layout emits one <style id="appearance">: `:root{shared+light}`, `:root.dark{dark}`, and `@media (prefers-color-scheme: dark){ :root:not(.light){dark} }`. AppearanceProvider never writes variables inline; it only replaces the text of that <style> element (after a preference or org change) and toggles `.dark` / `.light` on <html>.
Mode: light → class "light"; dark → class "dark" (both rendered by the server from the cookie); system → no class from the server, plus a blocking inline script in <head> that adds "dark" when matchMedia("(prefers-color-scheme: dark)") matches, so Tailwind's `dark:` variant (`&:is(.dark *)`) applies before first paint. `data-theme` and ThemeToggle are removed.
Cookie `cincel-appearance` (signed with SESSION_SECRET, 1 year): { mode, redesign: boolean }. It is a hint for first paint only; the layout always resolves vars from the DB (getResolvedAppearance, React.cache).
```

**Issue #3:** Flag rollout and route-group mechanics.
**Edit in:** `docs/specs/redesign/frontend.md` → §2.3 (replace the bullets) and §5 last paragraph
**Change:**
```
- Flag = resolveAppearance(...).redesignEnabled && process.env.NEXT_PUBLIC_REDESIGN_AVAILABLE !== "false" (the backend resolver applies the same env check, so the kill switch also forces opted-in users back to the old shell).
- Opting in: the /dashboard banner button "Probar el nuevo diseño" calls updateMyPreferencesAction({ redesignEnabled: true }) and navigates to /inicio. /ajustes/apariencia is reachable for every staff member in both states (old shell when off), so a user can always turn it back off.
- Route group: the contracts phase moves every staff page into app/(staff)/ in one mechanical commit. (staff)/layout.tsx renders <AppShell> when the flag is on and only {children} when it is off. Every page keeps its old Sidebar/Header markup inside `{!redesign && …}` (a <LegacyChrome> wrapper from components/layout) until the cleanup phase; a page phase replaces only the flag-on branch.
- Redirect stubs and the flag-on/off branch read the flag on the server (getResolvedAppearance), never from the client.
```

**Issue #4:** `/ajustes/*` access.
**Edit in:** `docs/specs/redesign/frontend.md` → §8, new bullets after the table
**Change:**
```
- AppRouteGuard (components/auth/AppRouteGuard.tsx) replaces the `/configuracion` prefix rule with an explicit list ADMIN_SETTINGS_ROUTES = ["/ajustes/general","/ajustes/tramos","/ajustes/puestos","/ajustes/estatus","/ajustes/permisos","/ajustes/monday","/ajustes/google"] (Administrador only). /ajustes/tema requires canManageAppearance; /ajustes/horario requires canManageTimeTracking for the settings and canViewTeamHours for the report (Dirección sees only the report). Personal pages (perfil, apariencia, notificaciones, integraciones) need only a session.
- Every admin /ajustes page also checks on the server (redirect("/inicio") when not allowed), as importar-monday does today; the client guard is no longer the only gate.
- AjustesNav renders each Organización entry by its own rule above (Dirección sees "Tema y estilo" and "Control de horario").
```

**Issue #5:** Phase plan and file ownership.
**Edit in:** both specs → new section "Delivery phases" (identical text)
**Change:**
```
Phase 0 — Contracts (one PR, merges first; everything below depends only on it):
- All migrations 0026–0032 and lib/db/schema/* changes; lib/types/{redesign,widgets}.ts; lib/validation/redesign.ts.
- Every action file of §7 with final signatures; unimplemented bodies throw Error("NOT_IMPLEMENTED").
- lib/errors.ts actionErrorText with every code of FE §9; lib/auth/permissions.ts new helpers; lib/ui/{preferences,themes,contrast,tints,nav}.ts; lib/cron/{registry,tick,lock}.ts + empty lib/cron/jobs.ts; lib/integrations/cutto-links.ts.
- The app/(staff) move + flag-aware layout (Issue #3), AppShell, Sidebar (with badge and TimeClock slots rendering null until their phases fill them), AppRouteGuard update, app/layout.tsx appearance block, Toaster, AppearanceProvider, StyleProvider/StyleView/EstiloSwitch, PageHeader, Empty/Error/LoadingSkeleton.
- components/widgets/* and components/patterns/* with all three styles and their tests (every page phase consumes them).
Then fully parallel phases: Theming & Ajustes · Inicio · Tareas · Proyectos · Personas · Biblioteca & Vacaciones · Mi espacio & notifications · Gmail · Control de horario · Assistant runtime & tools · Portal · Search · Cleanup (last).
Ownership rule: only Phase 0 edits the shared files above; a later phase that needs a change there edits only its own registration line (lib/cron/jobs.ts import, a nav badge provider, a tool group file under lib/assistant/tools/).
Widget types: lib/types/widgets.ts is the only definition of the serializable shapes; components/widgets/types.ts re-exports them and defines UI extensions under distinct names (PersonDatumView = PersonDatum & { actions?: ReactNode }; EntityCard = EntityCardData & { icon?; badges?; footer? }).
```

**Issue #6:** Migration ordering vs Project Flow.
**Edit in:** `docs/specs/redesign/backend.md` → §4 first paragraph and D11
**Change:**
```
drizzle-orm's migrator applies a migration only when its journal `when` is greater than the last applied one, so file renaming is not enough. Rule: whichever feature merges second deletes its generated migrations, journal entries and snapshots, rebases on main, and runs `drizzle-kit generate` again (then re-applies its hand edits), so its `when` values and snapshot `prevId` chain follow the other feature's. Neither feature is deployed with migrations generated before the other's merge. A test asserts that journal `when` values are strictly increasing and every snapshot's prevId equals the previous snapshot's id.
```
**Edit in:** `docs/specs/project-flow/backend.md` → §4 (same paragraph, so both teams follow it).

**Issue #7:** Project Flow dependencies.
**Edit in:** `docs/specs/redesign/frontend.md` → new §3.0 "Project Flow presence"; and backend §0.2 item 9
**Change:**
```
| Artefact | Project Flow merged | Not merged (fallback, Phase 0 provides) |
|---|---|---|
| TramoBadge / tramoColorVar | components/v2/status/TramoBadge, lib/tramos/tramo-color.ts | re-export AreaBadge / areaColorVar under the new names from components/widgets (one-line adapters, deleted when PF lands) |
| Fases / espacios (TaskSheet, NewTaskDialog, Proyecto · Tareas) | phase/space fields and grouping | fields hidden; Proyecto · Tareas groups by tramo |
| Puesto (PersonDatum.puesto) | staff_positions | null (row shows access role nowhere) |
| canSeeAdminData + admin task filter | PF helper | no admin tasks exist; filter is a no-op |
| /ajustes/tramos, /ajustes/puestos | re-export PF pages | render the existing workflows / areas pages |
| Toaster | mounted once in app/layout.tsx (PF); AppShell does NOT mount another | Phase 0 mounts it in app/layout.tsx |
| Sidebar | PF edits components/layout/Sidebar.tsx (old shell); the new shell's tramo list comes from fetchTramosNavAction when present, else fetchWorkflowsAction | — |
Redirect /actividades/[tramo]?project=<id> → /tareas?vista=lista&tramo=<tramo>&iniciar=<id>; Tareas opens StartTramoSheet for <id> when `iniciar` is set and PF is present.
```

**Issue #8:** Admin-only data in the new aggregates.
**Edit in:** `docs/specs/redesign/backend.md` → §9.7 (rename to "Admin-only data") and §7.10–§7.12
**Change:**
```
Every new aggregate applies Project Flow's ViewerScope (canSeeAdminData) when present: fetchInicioAction (attention, myDay, kpis), fetchPersonaDetailAction.tasks and stats, fetchPeopleOverviewAction counts, fetchProjectsPortfolioAction.nextDelivery, searchWorkspaceAction, and the assistant read tools get_task, list_my_tasks, get_project, team_workload_summary exclude kind='admin' tasks and client fields for non-admins. A db test seeds one admin task and one client and asserts none of these return them to a non-admin.
```
**Edit in:** `docs/specs/redesign/frontend.md` → §3.5 Resumen
**Change:** "Cliente y contactos" → "Contactos (cliente visible solo para administradores, Project Flow §12)".

**Issue #9:** The assistant confirmation contract.
**Edit in:** both specs → frontend §3.9 "Confirmations" / §4.9 / §7.10, backend §8.10 / §10.3 (same text)
**Change:**
```
Confirm tools use AI SDK v7 native approval: defineTool sets `needsApproval: true`; the stream emits a `tool-approval-request` part, which the client renders as ConfirmationCard (render_confirmation is not a model-callable tool and is removed from the catalog). Before streaming the approval request, the server inserts the assistant_actions row (status proposed, expiresAt now + 10 min) and attaches { actionId, summary, expiresAt } as the part's metadata (= AssistantActionProposal).
Confirm/Cancel call addToolApprovalResponse({ id, approved }) and the chat resumes (sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses). On approval the server re-checks capability and expiry against the assistant_actions row, runs the tool, stores status done|failed, and the model sees the real result. confirmAssistantActionAction / cancelAssistantActionAction remain only for proposals listed in the history panel after a reload.
Thread id: the client generates the thread id (useChat({ id })) and sends it as `threadId`; the server upserts the thread. No response header.
History: the server loads prior messages from assistant_messages and accepts only the new user message and approval responses from the body.
Import: importAssistantThreadAction(messages: UIMessage[]) → { threadId } (owner, max 200 messages, no model call) imports cincel.asistente.thread.v1 once.
render_timeline items: { label; start; end?; tramoKey?; tone?: "default" | "warning" | "critical" }.
```

**Issue #10:** Notification storage for email-only and digest-only kinds.
**Edit in:** `docs/specs/redesign/backend.md` → §3.5 `notifications` and §8.3
**Change:**
```ts
inApp: boolean("in_app").notNull().default(true),            // false = email/digest-only row, hidden from Bandeja
emailState: text("email_state"),                               // null = no email; 'pending' | 'sent' | 'digest' | 'failed'
emailDueAt: timestamp("email_due_at", { withTimezone: true }), // quietTo when deferred
// check: email_state in ('pending','sent','digest','failed') or null
// index("idx_notifications_email_due").on(t.emailDueAt).where(sql`${t.emailState} = 'pending'`)
```
```
notify() always inserts one row per recipient (dedupe as today), with in_app from preferences, email_state 'pending' (email_due_at = now or quietTo) or 'digest' or null. deferred-email sends rows with email_state='pending' and email_due_at <= now, then sets 'sent'. The digest reads email_state='digest' rows of the last 24 h. Bandeja and unreadCount filter in_app = true.
```

**Issue #11:** Cutto links module and env.
**Edit in:** both specs → frontend §4.9 / §11, backend §11.2 / §14
**Change:**
```
lib/integrations/cutto-links.ts (isomorphic): channelUrl(projectId), meetingUrl(meetingId), personChatUrl(email) built from NEXT_PUBLIC_CUTTO_BASE_URL (default https://cutto.cloudketer.dev). Callers pass the staff email (already in Staff DTOs).
lib/integrations/cutto-client.ts ("server-only"): CuttoClient API methods, CUTTO_API_URL / CUTTO_API_TOKEN; LinkOnlyCuttoClient throws DISABLED.
CUTTO_BASE_URL is removed; one variable, NEXT_PUBLIC_CUTTO_BASE_URL, in both env tables.
```

**Issue #12:** Vacation privacy and approvers.
**Edit in:** both specs → frontend §7.9 / §8, backend §7.8 / §12
**Change:**
```
fetchTeamAbsencesAction returns { staffId; name; from; to; kind: VacationRequest["kind"] | "ausencia"; status } — kind is the real value only for the caller's own rows and for vacation-approvers / hours-viewers; everyone else gets "ausencia". Pendiente rows only for approvers.
canDecideVacations = Administrador or access "Dirección" (FE §8 rule). Jefe de Taller / Jefe de Construcción are not approvers in this feature.
```

**Issue #13:** The reuse guard vs `ListPage`.
**Edit in:** `docs/specs/redesign/frontend.md` → §4.11 `ListPage` row, §4.10.1 `KpiDatum`, §18 item 15
**Change:**
```
ListPage: { header; filters?; tabs?; body: ReactNode; empty? } — no per-style slots. Pages pass one widget (EntityCardGrid already renders RecordTable in Analítico).
Tareas · Tablero is the single allowed page-level switch: components/tareas/BoardView.tsx (Visual board) vs RecordTable, listed in the guard test allowlist with StyleView.tsx.
KpiDatum gains `styles?: PresentationStyle[]` (default all); KpiWidget filters by it ("Completadas · semana" = ["analitico"]). Same for DistributionSegment/ProgressItem only if needed later.
Acceptance 15 allowlist: components/widgets/**, components/shell/StyleView.tsx, components/tareas/BoardView.tsx.
```

**Issue #14:** The cron lock.
**Edit in:** `docs/specs/redesign/backend.md` → §13 "Lock" bullet
**Change:**
```
Lock: runTick reserves one connection (`const conn = await sql.reserve()`), runs `select pg_try_advisory_lock(hashtext('cincel.cron.tick'))` and later `pg_advisory_unlock` on that same connection in `finally`, then `conn.release()`. Jobs use the normal pool. If the lock is not acquired → 204. A db test runs two ticks concurrently and then a third, asserting the third acquires the lock.
```

**Issue #15:** Gmail disconnect.
**Edit in:** both specs → frontend §7.7, backend §7.6 and §11.1
**Change:**
```
| disconnectGmailAction() | — | void / NOT_CONNECTED | owner | deletes gmail_accounts and gmail_threads rows of the caller and removes the two gmail scopes from google_oauth_accounts.scope; the Google token is NOT revoked (it also carries drive/calendar grants). Copy in Integraciones: "Cincel deja de leer tu correo. Para quitar el permiso en Google, revísalo en myaccount.google.com/permissions." | `/mi-espacio`, `/ajustes/integraciones` |
```
