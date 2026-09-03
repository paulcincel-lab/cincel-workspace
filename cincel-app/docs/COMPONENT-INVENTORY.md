# Cincel Workspace - Complete Component Inventory

> **Last verified:** September 2, 2026. Corrected against the alphabetical index below (59 rows, counted directly — see [DOCS issue #176](https://github.com/paulcincel-lab/cincel-workspace/issues/176) for the full defect list this fixed).

## Summary Statistics
- **Total Components:** 59
- **Category Breakdown** (counts are illustrative groupings for navigation — several components legitimately appear in more than one category, e.g. ProjectCard is both a Card and a Projects component, so this list will not sum to 59):
  - Layout: 2
  - Data Display: 8
  - Form & Input: 4
  - Cards: 3
  - Modals & Drawers: 10
  - Dashboard: 7
  - Calendar: 2
  - Projects: 4
  - Tasks: 5
  - Team/Equipo: 2
  - Suppliers: 3
  - Resources: 3
  - Settings: 2
  - Assistant: 6
  - Auth: 2
  - Providers: 1
  - shadcn/ui: 4

## Known Issues (tracked in [#176](https://github.com/paulcincel-lab/cincel-workspace/issues/176))
- **Task components split across two folders**: `components/tasks/` (TaskRow, TaskStatusBadge, ProjectTasks) and `components/tareas/` (PresaleTable, PresaleRow, TaskDrawer, NewTaskModal, NewProjectTemplateModal) do the same job for the same feature. Not merged in this pass — tracked as cleanup work, not a silent rename.
- **Consolidation status**: see [`SHADCN-CONSOLIDATION-GUIDE.md`](./SHADCN-CONSOLIDATION-GUIDE.md) and the corrected scope below — Phases 7 and 8 (table adoption, shadcn init) are done; Phases 9-11 (primitives, overlays, form controls) are planned in `docs/phases/`.

---

## Component Index (Alphabetical)

| # | Component | File Path | Category | Purpose |
|---|-----------|-----------|----------|---------|
| 1 | AgendaToday | `components/dashboard/AgendaToday.tsx` | Dashboard | Display calendar view of today's agenda |
| 2 | AppRouteGuard | `components/auth/AppRouteGuard.tsx` | Auth | Route protection with permission checks |
| 3 | AssistantCardMessage | `components/asistente/AssistantCardMessage.tsx` | Assistant | Display assistant message with card layout |
| 4 | AssistantChat | `components/asistente/AssistantChat.tsx` | Assistant | Main chat interface for AI assistant |
| 5 | AssistantChartMessage | `components/asistente/AssistantChartMessage.tsx` | Assistant | Display chart/visualization in response |
| 6 | AssistantListMessage | `components/asistente/AssistantListMessage.tsx` | Assistant | Display list data in response |
| 7 | AssistantStatGridMessage | `components/asistente/AssistantStatGridMessage.tsx` | Assistant | Display statistics grid in response |
| 8 | Avatar | `components/ui/Avatar.tsx` | Data Display | User profile picture with initials fallback |
| 9 | Avatar (shadcn) | `components/ui/shadcn/avatar.tsx` | shadcn/ui | Base avatar primitive |
| 10 | Badge | `components/ui/Badge.tsx` | Data Display | Status label with color coding |
| 11 | Badge (shadcn) | `components/ui/shadcn/badge.tsx` | shadcn/ui | Base badge primitive |
| 12 | CalendarWorkspace | `components/calendario/CalendarWorkspace.tsx` | Calendar | Full calendar with filters and legends |
| 13 | Card (shadcn) | `components/ui/shadcn/card.tsx` | shadcn/ui | Composable card container |
| 14 | CoordinatorProjectsModal | `components/equipo/CoordinatorProjectsModal.tsx` | Modals & Drawers | View/manage projects for coordinator |
| 15 | DataTable | `components/ui/DataTable.tsx` | Data Display | Reusable table with sorting, search, pagination |
| 16 | DialogOverlay | `components/ui/DialogOverlay.tsx` | Modals & Drawers | Accessible modal/drawer wrapper |
| 17 | DirectorSummary | `components/dashboard/DirectorSummary.tsx` | Dashboard | Executive summary for managers |
| 18 | DrivePickerDialog | `components/recursos/DrivePickerDialog.tsx` | Modals & Drawers | File selection dialog for external drives |
| 19 | EditableCell | `components/proveedores/EditableCell.tsx` | Form & Input | Inline table cell editor |
| 20 | ExportMenu | `components/ui/ExportMenu.tsx` | Data Display | Export table data (CSV, Excel, PDF) |
| 21 | GeneralSettingsWorkspace | `components/configuracion/GeneralSettingsWorkspace.tsx` | Settings | App settings interface |
| 22 | GroupSection | `components/ui/GroupSection.tsx` | Data Display | Grouped content container |
| 23 | Header | `components/layout/Header.tsx` | Layout | Main app header with nav and user menu |
| 24 | InlineEditableField | `components/ui/InlineEditableField.tsx` | Form & Input | Click-to-edit inline field |
| 25 | InteractiveDashboard | `components/dashboard/InteractiveDashboard.tsx` | Dashboard | Main dashboard with KPIs, projects, tasks, calendar |
| 26 | KpiCard | `components/dashboard/KpiCard.tsx` | Cards | Display KPI metric (title + large value) |
| 27 | MemberEditorDrawer | `components/equipo/MemberEditorDrawer.tsx` | Modals & Drawers | Side drawer for editing team member details |
| 28 | MemberProfileModal | `components/equipo/MemberProfileModal.tsx` | Modals & Drawers | Modal for viewing member profile |
| 29 | NewProjectTemplateModal | `components/tareas/NewProjectTemplateModal.tsx` | Modals & Drawers | Select and create project templates |
| 30 | NewTaskModal | `components/tareas/NewTaskModal.tsx` | Modals & Drawers | Modal for creating new tasks |
| 31 | PermissionsWorkspace | `components/configuracion/PermissionsWorkspace.tsx` | Settings | Manage role-based permissions |
| 32 | PillDropdown | `components/proveedores/PillDropdown.tsx` | Form & Input | Dropdown styled as pills/badges |
| 33 | PresaleRow | `components/tareas/PresaleRow.tsx` | Tasks | Individual row for presale table |
| 34 | PresaleTable | `components/tareas/PresaleTable.tsx` | Tasks | Table for presale/opportunity tasks |
| 35 | ProjectActivity | `components/proyectos/ProjectActivity.tsx` | Projects | Activity feed/timeline for project |
| 36 | ProjectCard | `components/proyectos/ProjectCard.tsx` | Cards | Display project summary with progress |
| 37 | ProjectCreateModal | `components/proyectos/ProjectCreateModal.tsx` | Modals & Drawers | Modal for creating new projects |
| 38 | ProjectHeader | `components/proyectos/ProjectHeader.tsx` | Projects | Header section for project page |
| 39 | ProjectModuleCard | `components/proyectos/ProjectModuleCard.tsx` | Cards | Display project module/phase |
| 40 | ProjectModules | `components/proyectos/ProjectModules.tsx` | Projects | Display all project modules |
| 41 | ProjectNotesModal | `components/proyectos/ProjectNotesModal.tsx` | Modals & Drawers | Modal for project notes/comments |
| 42 | ProjectsOverview | `components/dashboard/ProjectsOverview.tsx` | Dashboard | Grid of active projects |
| 43 | ProjectsTable | `components/proyectos/ProjectsTable.tsx` | Projects | Tabular list of all projects |
| 44 | ProjectTasks | `components/tasks/ProjectTasks.tsx` | Tasks | Display all tasks for a project |
| 45 | QueryProvider | `components/providers/QueryProvider.tsx` | Providers | React Query context setup |
| 46 | ResourcesWorkspace | `components/recursos/ResourcesWorkspace.tsx` | Resources | Main resources/documents management |
| 47 | ResourcesWorkspaceServer | `components/recursos/ResourcesWorkspaceServer.tsx` | Resources | Server-side data fetching for resources |
| 48 | Separator (shadcn) | `components/ui/shadcn/separator.tsx` | shadcn/ui | Visual separator line |
| 49 | SessionHydrator | `components/auth/SessionHydrator.tsx` | Auth | Load auth session on app startup |
| 50 | Sidebar | `components/layout/Sidebar.tsx` | Layout | Navigation sidebar |
| 51 | StarRating | `components/proveedores/StarRating.tsx` | Suppliers | 1-5 star rating display/input |
| 52 | TaskDrawer | `components/tareas/TaskDrawer.tsx` | Modals & Drawers | Side drawer for task details and history |
| 53 | TaskRow | `components/tasks/TaskRow.tsx` | Tasks | Individual row for task table |
| 54 | TaskStatusBadge | `components/tasks/TaskStatusBadge.tsx` | Tasks | Colored badge for task status |
| 55 | TasksTable | `components/dashboard/TasksTable.tsx` | Dashboard | Tabular display of tasks |
| 56 | TasksToday | `components/dashboard/TasksToday.tsx` | Dashboard | Show tasks due today/immediately |
| 57 | TeamMultiSelect | `components/ui/TeamMultiSelect.tsx` | Form & Input | Multi-select dropdown for team members |
| 58 | tone.ts | `components/asistente/tone.ts` | Assistant | Tone/style utilities for assistant |
| 59 | UnifiedCalendar | `components/calendario/UnifiedCalendar.tsx` | Calendar | Calendar integrating tasks and milestones |

---

## Components by Category

### Layout (2)
- Header
- Sidebar

### Data Display (8)
- Avatar
- Badge
- DataTable
- ExportMenu
- GroupSection
- Separator (shadcn)
- Avatar (shadcn)
- Badge (shadcn)

### Form & Input (4)
- TeamMultiSelect
- InlineEditableField
- EditableCell
- PillDropdown

(DialogOverlay is listed under Modals & Drawers, not here — it's an overlay wrapper, not a form input.)

### Cards (3)
- KpiCard
- ProjectCard
- ProjectModuleCard

### Modals & Drawers (10)
- DialogOverlay (wrapper)
- NewTaskModal
- TaskDrawer
- NewProjectTemplateModal
- CoordinatorProjectsModal
- MemberProfileModal
- MemberEditorDrawer
- ProjectNotesModal
- ProjectCreateModal
- DrivePickerDialog

**Consolidation status:** `DialogOverlay` and all 9 consumers migrate to shadcn `Dialog`/`Sheet` in [Phase 10: Overlay Consolidation](../docs/phases/phase-10-overlay-consolidation.md) — modals and drawers move together in one phase so `DialogOverlay` can be fully deleted, not split across phases.

### Dashboard (7)
- InteractiveDashboard (main)
- KpiCard
- ProjectsOverview
- TasksToday
- TasksTable
- AgendaToday
- DirectorSummary

### Calendar (2)
- UnifiedCalendar
- CalendarWorkspace

### Projects (4, +1 shared with Cards)
- ProjectsTable
- ProjectHeader
- ProjectModules
- ProjectActivity
- (ProjectCard — listed under Cards above; shown here for feature-area completeness)

### Tasks (5)
- PresaleTable
- PresaleRow
- ProjectTasks
- TaskRow
- TaskStatusBadge

### Team/Equipo (2, +1 shared with Modals & Drawers)
- MemberProfileModal
- MemberEditorDrawer
- CoordinatorProjectsModal (also listed under Modals & Drawers)

### Suppliers/Proveedores (3)
- StarRating
- EditableCell
- PillDropdown

### Resources/Recursos (3)
- ResourcesWorkspace
- ResourcesWorkspaceServer
- DrivePickerDialog

### Settings/Configuración (2)
- GeneralSettingsWorkspace
- PermissionsWorkspace

### Assistant/Asistente (6)
- AssistantChat
- AssistantCardMessage
- AssistantChartMessage
- AssistantListMessage
- AssistantStatGridMessage
- tone.ts (utility)

### Authentication (2)
- SessionHydrator
- AppRouteGuard

### Providers (1)
- QueryProvider

### shadcn/ui Primitives (4)
- Card (+ CardHeader, CardTitle, CardContent, CardFooter, CardDescription, CardAction)
- Avatar
- Badge
- Separator

---

## Component Dependencies Map

### Most Used Components
1. **DataTable** - Used in: PresaleTable, ProjectsTable, TasksTable, ProjectTasks, dashboard tables
2. **DialogOverlay** - Used in: All modals and drawers
3. **Avatar** - Used in: Header, team lists, task assignments
4. **Badge** - Used in: Status displays, tags, categories
5. **Card components** - Used in: Dashboard, project displays

### Component Composition Chains
```
Header
  └── Avatar
      └── User Menu

Sidebar
  └── Navigation Links

InteractiveDashboard
  ├── KpiCard (x4)
  ├── ProjectsOverview
  │   └── ProjectCard (with progress bar)
  ├── TasksTable
  │   └── DataTable
  ├── UnifiedCalendar
  └── TasksToday

PresaleTable
  ├── DataTable
  │   ├── Badge (status)
  │   ├── Avatar (manager)
  │   └── TeamMultiSelect (support)
  └── PresaleRow

TaskDrawer
  ├── DialogOverlay
  ├── Avatar (manager)
  ├── Badge (status, project, phase)
  └── History display

NewTaskModal
  ├── DialogOverlay
  ├── Form fields
  ├── TeamMultiSelect
  └── Date pickers
```

---

## Data Flow Patterns

### Task Workflow
```
PresaleTable (display)
  ↓ (click row)
TaskDrawer (detail + edit)
  ↓ (add note)
onSave(task)
  ↓ (server action)
Database update
  ↓ (revalidate)
PresaleTable refreshes
```

### Project Creation
```
Button trigger
  ↓
ProjectCreateModal (form)
  ↓ (submit)
onSave(projectData)
  ↓ (server action)
Database insert
  ↓ (redirect)
ProjectHeader / ProjectsTable
```

### Dashboard Updates
```
InteractiveDashboard mounts
  ↓
fetchProjects() + fetchActivities()
  ↓ (cache)
React Query store
  ↓ (render)
KpiCard + ProjectsOverview + TasksTable
  ↓ (date filter change)
Filtered data re-computed
  ↓ (UI updates)
Charts and tables refresh
```

---

## Color System Usage

### By Component Type
| Color | Used In | Semantic Meaning |
|-------|---------|------------------|
| Blue (bg-blue-600) | Avatar bg, Primary actions, Progress bar | Primary action, Active state |
| Green (bg-green-*) | Status badge, Active projects | Success, Complete, Active |
| Yellow (bg-yellow-*) | Status badge, Warnings | Pending, Warning |
| Red (bg-red-*) | Status badge, Errors | Error, Overdue, On Hold |
| Slate/Gray (bg-slate-*) | Card bg, Borders, Disabled | Neutral, Inactive |
| Purple (bg-purple-*) | Category badge | Special, Custom category |

### Badge Color Mappings
- **Pendiente** → Yellow
- **En Proceso** → Blue
- **Done** → Green
- **On Hold** → Red/Gray
- **Activo** → Green
- **Inactivo** → Slate

---

## Component Props Summary

### Common Props Across Components
```typescript
// Modal/Drawer Props
{
  open?: boolean;
  onClose: () => void;
  onSave?: (data: any) => void;
  triggerRef?: React.RefObject<HTMLElement>;
}

// Table Props
{
  columns: ColumnDef<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  searchPlaceholder?: string;
  emptyMessage?: string;
}

// Card Props
{
  title: string;
  value?: string;
  className?: string;
}

// Status Props
{
  status: string;
  color?: ColorOption;
}

// User/Avatar Props
{
  name: string;
  imageSrc?: string;
  showName?: boolean;
}
```

---

## Accessibility Features

### Components with A11y Support
- **DialogOverlay**: Focus trap, keyboard navigation (Tab, Escape)
- **DataTable**: Sortable headers, keyboard accessible
- **Avatar**: Alt text support for images
- **Badge**: Semantic color for meaning
- **Forms**: Label associations, input focus management

### ARIA Attributes Used
- `role="dialog"` - Modal/Drawer components
- `aria-modal="true"` - Modals
- `aria-label` - Descriptive labels
- `aria-hidden="true"` - Icon decorations
- `tabindex` - Focus management

---

## Performance Characteristics

### Lightweight Components (< 2KB)
- Avatar
- Badge
- KpiCard
- TaskStatusBadge
- StarRating
- PillDropdown

### Medium Components (2-5KB)
- ProjectCard
- ExportMenu
- GroupSection
- EditableCell
- InlineEditableField

### Larger Components (5-15KB)
- DataTable
- DialogOverlay
- NewTaskModal
- TaskDrawer
- PresaleTable

### Complex Components (15KB+)
- InteractiveDashboard
- ProjectsTable
- PresaleTable
- CalendarWorkspace
- UnifiedCalendar

---

## Reusability Index

### Highly Reusable (5+ uses)
- **DataTable** (6+ locations)
- **DialogOverlay** (9+ locations)
- **Avatar** (4+ locations)
- **Badge** (8+ locations)
- **KpiCard** (3+ locations)

### Moderately Reusable (2-4 uses)
- **EditableCell** (Multiple suppliers rows)
- **ProjectCard** (Multiple project views)
- **TaskStatusBadge** (Multiple task tables)

### Single-Use/Specific
- **AssistantChat** (Assistant section only)
- **CalendarWorkspace** (Calendar section only)
- **ResourcesWorkspace** (Resources section only)

---

## File Size Analysis

### Component Library Size Summary
```
✓ Core UI Components: ~45KB
  - DataTable: ~8KB
  - Modals/Drawers: ~12KB
  - Cards: ~6KB
  - Forms: ~8KB
  - Utilities: ~11KB

✓ Feature Components: ~65KB
  - Dashboard: ~15KB
  - Projects: ~12KB
  - Tasks: ~15KB
  - Calendar: ~12KB
  - Others: ~11KB

✓ shadcn/ui Primitives: ~15KB
  - Card, Avatar, Badge, Separator

Total: ~125KB (unminified)
       ~35KB (minified + gzipped)
```

---

## Testing Coverage

### Components with Test Files
- DataTable (DataTable.test.tsx)

### Components Recommended for Testing
- DialogOverlay (focus management, keyboard nav)
- DataTable (sorting, filtering, search)
- NewTaskModal (form validation)
- TaskDrawer (data persistence)
- PresaleTable (row operations)

---

## Consolidation Roadmap (Corrected Scope)

Supersedes the phase numbering in `SHADCN-CONSOLIDATION-GUIDE.md` (that doc's "55+ components, Phases 1-6" estimate predates verifying against shipped work — see [issue #176](https://github.com/paulcincel-lab/cincel-workspace/issues/176)). Actual status as of this pass:

| Status | Count | Components |
|---|---|---|
| ✅ Already shadcn (done via Phase 7 & 8) | 6 | DataTable (built on TanStack Table, adopted app-wide in Phase 7), Card/CardHeader/CardTitle/CardContent/CardFooter, Separator (Phase 8 install) |
| ⚠️ Keep custom (no shadcn equivalent / out of scope) | 9 | StarRating, DrivePickerDialog's internal file picker, CalendarWorkspace, UnifiedCalendar, AssistantChat, AssistantCardMessage, AssistantChartMessage, AssistantListMessage, AssistantStatGridMessage |
| 🔧 Planned — Phase 9 (Primitive Consolidation) | 8 | Avatar, Badge, TaskStatusBadge, InlineEditableField, EditableCell, KpiCard, ProjectCard, ProjectModuleCard, GroupSection |
| 🔧 Planned — Phase 10 (Overlay Consolidation) | 10 | DialogOverlay + its 9 consumers (NewTaskModal, NewProjectTemplateModal, ProjectCreateModal, ProjectNotesModal, MemberProfileModal, CoordinatorProjectsModal, DrivePickerDialog wrapper, TaskDrawer, MemberEditorDrawer) |
| 🔧 Planned — Phase 11 (Form Controls) | 2 | TeamMultiSelect, PillDropdown |

**Total in active consolidation scope: 20 components** (not the original guide's "55+"). See `docs/phases/phase-9-primitive-consolidation.md`, `phase-10-overlay-consolidation.md`, `phase-11-form-controls-consolidation.md` for full deliverables, and GitHub milestones "Phase 9/10/11" for tracked issues.

---

## Future Component Needs

### Potential New Components
- **Notification/Toast** - For success/error messages
- **Pagination** - Explicit pagination controls
- **DateRangePicker** - Date range selection
- **ColorPicker** - Color selection (if needed)
- **CodeEditor** - If custom code input required
- **FileUpload** - Drag-and-drop file handling

### Component Enhancements
- **DataTable**: Virtual scrolling for 1000+ rows
- **DialogOverlay**: Animation transitions
- **Avatar**: Image upload functionality
- **Calendar**: Recurring events support
- **AssistantChat**: Real-time streaming

---

## Documentation & Quick Links

- **Full Component Docs**: `docs/ui-highlevel-components.md`
- **Type Definitions**: `lib/types/`
- **Style Guide**: `tailwind.config.ts`
- **Design System**: Follow AGENTS.md principles
- **Component Status**: Maintained and actively used in production

---

## Version & Maintenance

- **Last Updated**: September 2, 2026
- **Maintained By**: UI/Component Team
- **Review Cycle**: Quarterly or when major changes occur
- **Archive Date**: Keep this document in sync with actual codebase

---

## Quick Component Selector

**Need a table?** → Use `DataTable`
**Need a modal/drawer?** → Wrap with `DialogOverlay`
**Need a card display?** → Use `KpiCard`, `ProjectCard`, or shadcn `Card`
**Need user display?** → Use `Avatar`
**Need status indicator?** → Use `Badge` or `TaskStatusBadge`
**Need form input?** → Use `TeamMultiSelect`, `EditableCell`, or HTML input
**Need team selection?** → Use `TeamMultiSelect`
**Need to export data?** → Use `ExportMenu` with `DataTable`
**Need dialog focus management?** → Use `DialogOverlay`

---

## Quick Stats
- **Total Lines of Code (components)**: ~15,000+
- **Total Components**: 59 (including shadcn primitives)
- **Most Complex**: InteractiveDashboard, PresaleTable
- **Most Reused**: DataTable, DialogOverlay
- **Latest Technology**: React 18, Next.js 14, TailwindCSS 3.x
