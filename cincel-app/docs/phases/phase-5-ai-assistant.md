# Phase 5: AI Assistant with Generative UI

## Goal
A dedicated `/asistente` page with streaming chat that can render charts from tool calls, scoped to Cincel's operational data. Ported from the sibling project `masisa-proveedores`.

## Deliverables

### Backend
- [ ] `lib/assistant/provider.ts` (new) -- `createOpenAI({ baseURL: LLM_BASE_URL, apiKey: LLM_API_KEY }).chat(LLM_MODEL)`, env read at request time, server-only
- [ ] `lib/assistant/prompt.ts` (new) -- Spanish system prompt scoped to Cincel: projects at risk, team saturation, deliveries due this week, client attention, stalled phases
- [ ] `lib/assistant/tools.ts` (new) -- read-only `tool()` wrappers calling Phase 2 Drizzle repositories (not raw SQL): `list_projects` (filter by status/stage/risk), `list_activities_due` (date window, member), `team_workload_summary`, `render_chart` (`bar`|`line`, `{label,value}[]`, no-op execute returning `{ ok: true }`). Whitelist selected columns; cap result counts.
- [ ] `app/api/asistente/chat/route.ts` -- POST, `getSession()` -> 401, `streamText({ model, system, messages: await convertToModelMessages(messages), tools, stopWhen: stepCountIs(5) })`, `return result.toUIMessageStreamResponse()`
- [ ] Tests: `route.test.ts` (401 without session; exact tool set passed to streamText), `tools.test.ts` (zod range validation, column whitelist)

### Frontend
- [ ] `components/asistente/AssistantChat.tsx` (`"use client"`) -- `useChat({ transport: new DefaultChatTransport({ api: "/api/asistente/chat" }) })`, local input state, `status`-driven button ("Pensando..."/"Respondiendo..."/"Enviar"), auto-scroll, empty-state example chips, render `message.parts` (text -> markdown bubble; `part.type === "tool-render_chart"` + `state === "output-available"` -> `<AssistantChartMessage>`)
- [ ] `components/asistente/AssistantChartMessage.tsx` -- `recharts` `ResponsiveContainer` in existing card style; adapt masisa's `hsl(var(--*))` tokens to cincel's Tailwind v4 theme tokens
- [ ] `app/asistente/page.tsx` -- server component, `getSession()` guard, renders `<AssistantChat />`
- [ ] `components/layout/Sidebar.tsx` -- add `{ label: "Asistente", href: "/asistente" }` entry (respect permissions if capability gate wanted)

### Infrastructure
- [ ] Dependencies: `ai`, `@ai-sdk/react`, `@ai-sdk/openai` (v5 UIMessage API), `react-markdown`, `remark-gfm`, `recharts`, `zod`
- [ ] `.env.example` + compose `env_file`: add `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` (server-only)

## Done Definition
- With `LLM_*` env set: open `/asistente`, ask "que entregas vencen esta semana?" -> assistant calls a tool and streams an answer; ask for a comparison -> a recharts chart renders inline
- Without `LLM_*` env: route returns clear 503-style error surfaced as a toast in the UI
- Sidebar shows "Asistente" link for authenticated users
- 401 returned when accessing chat route without session
- Tool calls only use Drizzle repositories (no raw SQL)
- `npm run test:unit` green (route + tools tests)

## Parallel work
- BE: provider.ts + prompt.ts + tools.ts can all be built simultaneously
- FE: AssistantChat.tsx and AssistantChartMessage.tsx can be built in parallel with BE tools
- This entire phase can run in parallel with Phase 4 (both depend only on Phase 2)

## Phase dependencies
- Requires: Phase 2 (Drizzle repositories for project/activity/team data, getSession() for auth)
- Reference: `/home/diva/git/masisa-proveedores` (source for port: `src/lib/assistant/*`, `src/app/api/assistant/chat/route.ts`, `src/components/AssistantChat.tsx`, `src/components/AssistantChartMessage.tsx`)

## Complexity
- Backend: M
- Frontend: M
- Infra: S

## Risks
- AI SDK v5 UIMessage API may have breaking changes vs the masisa-proveedores version -- verify compatible versions
- `render_chart` tool pattern (no-op execute, UI reads `part.input`) depends on specific AI SDK behavior -- test thoroughly
- LLM provider compatibility (OpenAI-compatible endpoint) may need tuning for tool calling support
- Recharts theme token adaptation from masisa's CSS custom properties to cincel's Tailwind v4 tokens needs manual mapping
