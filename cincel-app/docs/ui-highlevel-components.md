# Cincel Workspace UI Components Documentation

## Overview
This document provides a comprehensive catalog of all UI components used in the Cincel Workspace application. Components are organized by category and include purpose, props, and structure information.

**Technology Stack:**
- React 18+ with TypeScript
- Next.js 14+ (App Router)
- TailwindCSS for styling
- shadcn/ui for base primitives
- @tanstack/react-table for data tables

---

## 1. Layout Components

### 1.1 Header
**File:** `components/layout/Header.tsx`

**Purpose:** Main application header with logo, navigation links, user menu, and authentication controls.

**Key Features:**
- Responsive header with user profile dropdown
- Development mode menu (environment-specific)
- Profile photo management
- Sign-out functionality
- External links (Instagram, website, email)

**Props:**
- `variant`: `"default" | "profile"` (optional)

**Key Dependencies:**
- `Avatar` component for user display
- `getCurrentAuthenticatedUser()` and `logout()` from auth-service
- Profile photo persistence (localStorage)

---

### 1.2 Sidebar
**File:** `components/layout/Sidebar.tsx`

**Purpose:** Navigation sidebar for switching between main application sections.

**Key Features:**
- Section-based navigation (Dashboard, Projects, Tasks, Team, Resources, Settings)
- Active route highlighting
- Responsive collapse/expand behavior
- Permission-based menu items

**Main Navigation Routes:**
- Dashboard (`/`)
- Projects (`/proyectos`)
- Tasks/Presales (`/tareas`)
- Team (`/equipo`)
- Resources (`/recursos`)
- Settings (`/configuracion`)

---

## 2. Data Display Components

### 2.1 DataTable
**File:** `components/ui/DataTable.tsx`

**Purpose:** Shared, reusable table component for displaying and managing record lists across the application.

**Key Features:**
- Sticky header for horizontal scrolling
- Sortable columns with visual indicators
- Optional built-in global search filter
- Empty/loading states with customizable messages
- Row click handlers and custom row styling
- Flexible column definitions via @tanstack/react-table

**Props:**
```typescript
type DataTableProps<T> = {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  getRowId?: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  emptyMessage?: string;
  isLoading?: boolean;
  loadingMessage?: string;
  initialSorting?: SortingState;
  searchPlaceholder?: string;
  tableClassName?: string;
  wrapperClassName?: string;
};
```

**Usage Locations:**
- `ProjectsTable` (Projects listing)
- `PresaleTable` (Task presales)
- `TasksTable` (Dashboard tasks)
- `ProjectTasks` (Project-specific tasks)

---

### 2.2 Avatar
**File:** `components/ui/Avatar.tsx`

**Purpose:** Display user/team member profile pictures with fallback initials.

**Key Features:**
- Circular avatar with initials as fallback
- Optional name display beside avatar
- Image support with alt text
- Consistent sizing (36px)
- Blue background with white text for initials

**Props:**
```typescript
type Props = {
  name: string;
  showName?: boolean;
  imageSrc?: string;
  imageAlt?: string;
};
```

**Color Scheme:**
- Background: `bg-blue-600`
- Text: `text-white`
- Size: `w-9 h-9` (36px)

---

### 2.3 Badge
**File:** `components/ui/Badge.tsx`

**Purpose:** Display status labels or category tags with semantic color coding.

**Key Features:**
- Six color options for semantic meaning
- Rounded pill shape
- Consistent sizing and padding
- Used for status indicators, categories, and labels

**Props:**
```typescript
type Props = {
  label: string;
  color: "yellow" | "green" | "blue" | "red" | "gray" | "purple";
};
```

**Color Mappings:**
- `yellow`: `bg-yellow-100 text-yellow-800`
- `green`: `bg-green-100 text-green-800`
- `blue`: `bg-blue-100 text-blue-800`
- `red`: `bg-red-100 text-red-800`
- `gray`: `bg-slate-100 text-slate-700`
- `purple`: `bg-purple-100 text-purple-800`

**Common Usages:**
- Task status (Pending, In Progress, Done, On Hold)
- Project phase (Inicial, En Proceso, Finalizado)
- Team member roles
- Priority levels

---

## 3. Form & Input Components

### 3.1 TeamMultiSelect
**File:** `components/ui/TeamMultiSelect.tsx`

**Purpose:** Multi-select dropdown for choosing team members as support/collaborators.

**Key Features:**
- Multiple selection with checkboxes
- Search/filter capability
- Selected items display as tags
- Remove selected items individually
- Dropdown toggle interface

**Common Props:**
- List of available team members
- Selected items array
- onChange handler

**Usage:**
- Selecting support team in task creation
- Assigning collaborators to projects

---

### 3.2 InlineEditableField
**File:** `components/ui/InlineEditableField.tsx`

**Purpose:** Allow inline editing of table/card fields without modal navigation.

**Key Features:**
- Click-to-edit interaction
- Inline save/cancel
- Configurable input types
- Fallback display text
- Validation support

**Common Uses:**
- Editing project names in tables
- Quick status updates
- Notes or descriptions

---

### 3.3 EditableCell
**File:** `components/proveedores/EditableCell.tsx`

**Purpose:** Individual table cell editor for inline field updates.

**Key Features:**
- Inline text/select editing
- Type-aware rendering
- Direct value updates
- Minimal UI disruption

**Context:** Used in Suppliers (Proveedores) table

---

### 3.4 PillDropdown
**File:** `components/proveedores/PillDropdown.tsx`

**Purpose:** Dropdown selector styled as pills/badges for categorical choices.

**Common Uses:**
- Status selection
- Category filtering
- Quick toggles

---

## 4. Card Components

### 4.1 KpiCard
**File:** `components/dashboard/KpiCard.tsx`

**Purpose:** Display key performance indicator metrics on dashboard.

**Key Features:**
- Title + large value display
- Consistent card styling
- White background with border
- Shadow for elevation

**Props:**
```typescript
type Props = {
  title: string;
  value: string;
};
```

**Design:**
- Background: White
- Border: `border-slate-200`
- Title: Muted slate text (sm)
- Value: Large bold text (text-4xl)
- Container: Rounded, with box-shadow

**Examples:**
- Active Projects count
- Tasks due this week
- Team utilization %

---

### 4.2 ProjectCard
**File:** `components/proyectos/ProjectCard.tsx`

**Purpose:** Display project summary with progress visualization.

**Key Features:**
- Project name and client
- Status badge (Active/Inactive)
- Phase display
- Progress bar visualization
- Click-to-navigate link

**Props:**
```typescript
type Props = {
  project: {
    id: number;
    name: string;
    client: { name: string };
    manager: string;
    phase: string;
    progress: number;
    status: string;
  };
};
```

**Design:**
- White card with slate border
- Green badge for active, gray for inactive
- Blue progress bar (`bg-blue-600`)
- Hover shadow effect
- Links to `/proyectos/{id}`

---

### 4.3 ProjectModuleCard
**File:** `components/proyectos/ProjectModuleCard.tsx`

**Purpose:** Display individual project modules/phases within a project.

**Key Features:**
- Module name and status
- Associated tasks count
- Expandable task list (optional)
- Visual phase indicator

---

## 5. Modal & Drawer Components

### 5.1 DialogOverlay
**File:** `components/ui/DialogOverlay.tsx`

**Purpose:** Accessible dialog/modal wrapper providing focus management and keyboard navigation.

**Key Features:**
- ARIA modal semantics (`role="dialog"`, `aria-modal="true"`)
- Escape key closes dialog
- Focus trap while open
- Focus return to trigger element on close
- Tab key cycles through focusable elements
- Customizable styling via className

**Props:**
```typescript
type Props = {
  label: string; // For aria-label
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
};
```

**Accessibility Features:**
- Focus management
- Keyboard navigation (Tab, Shift+Tab, Escape)
- ARIA labels and attributes
- Proper dialog semantics

---

### 5.2 NewTaskModal
**File:** `components/tareas/NewTaskModal.tsx`

**Purpose:** Modal for creating new tasks with full form.

**Key Features:**
- Multi-field form (project, phase, description, manager, support team, status, notes, dates)
- Team multi-select for support
- Date pickers for commitment and review dates
- Save/cancel actions
- Uses `DialogOverlay` for accessibility

**Form Fields:**
- `project`: Select from available projects
- `phase`: Select from phases (Inicial, En Proceso, etc.)
- `description`: Text input for task description
- `manager`: Select responsible team member
- `support`: Multi-select team members
- `status`: Select task status (Pendiente, En Proceso, Done, On Hold)
- `notes`: Initial notes/description
- `commitmentDate`: Date picker
- `reviewDate`: Date picker

**Dialog Dimensions:**
- Width: `w-[700px]`
- Modal with overlay
- Rounded corners and shadow

---

### 5.3 TaskDrawer
**File:** `components/tareas/TaskDrawer.tsx`

**Purpose:** Side drawer panel for viewing and editing task details with history/notes.

**Key Features:**
- Right-side drawer panel (560px wide)
- Task overview section (summary grid)
- Chronological history/notes display
- Add new note/follow-up functionality
- Sort history by date
- Accessible with DialogOverlay

**Sections:**
1. **Header:** Task description, project, phase, status badges
2. **Summary Grid:** Responsible, Team, Commitment Date, Review Date, Status
3. **Seguimiento (Follow-up):** Chronological notes with date and author
4. **Add Note:** Textarea for new follow-up notes

**Design:**
- Full height right drawer
- `w-[560px]`
- White background
- Scrollable content area
- Border separators between sections

---

### 5.4 NewProjectTemplateModal
**File:** `components/tareas/NewProjectTemplateModal.tsx`

**Purpose:** Modal for selecting and creating project templates with pre-configured tasks.

---

### 5.5 CoordinatorProjectsModal
**File:** `components/equipo/CoordinatorProjectsModal.tsx`

**Purpose:** View and manage projects assigned to a team coordinator.

**Key Features:**
- List of coordinator's projects
- Assign/remove projects
- Save changes

---

### 5.6 MemberProfileModal
**File:** `components/equipo/MemberProfileModal.tsx`

**Purpose:** Display team member profile information.

**Key Features:**
- Member details (name, role, contact, availability)
- Profile picture
- Project assignments

---

### 5.7 MemberEditorDrawer
**File:** `components/equipo/MemberEditorDrawer.tsx`

**Purpose:** Side drawer for editing team member details.

**Key Features:**
- Editable profile fields
- Role assignment
- Project associations
- Photo upload

---

### 5.8 ProjectNotesModal
**File:** `components/proyectos/ProjectNotesModal.tsx`

**Purpose:** Modal for viewing and adding project notes/comments.

---

### 5.9 ProjectCreateModal
**File:** `components/proyectos/ProjectCreateModal.tsx`

**Purpose:** Modal for creating new projects.

**Form Fields:**
- Project name
- Client selection
- Manager assignment
- Initial phase
- Start/end dates
- Budget (optional)
- Description/notes

---

## 6. Feature-Specific Components

### 6.1 Dashboard Components

#### 6.1.1 InteractiveDashboard
**File:** `components/dashboard/InteractiveDashboard.tsx`

**Purpose:** Main dashboard view combining multiple data displays and filters.

**Key Features:**
- Task overview (Presale, Diseño, Operativas)
- Project overview with secondary coordinator support
- Calendar integration
- Date range filtering (7d, 30d, 90d)
- Permission-based data scoping
- Data fetching from repositories

**Sections:**
- KPI Cards (overview metrics)
- Project Cards (active projects)
- Calendar (upcoming dates)
- Task tables (by workflow type)

---

#### 6.1.2 KpiCard
**File:** `components/dashboard/KpiCard.tsx`

**Purpose:** Display single KPI metric (see Card Components section)

---

#### 6.1.3 ProjectsOverview
**File:** `components/dashboard/ProjectsOverview.tsx`

**Purpose:** Display grid of active projects.

---

#### 6.1.4 TasksToday
**File:** `components/dashboard/TasksToday.tsx`

**Purpose:** Show tasks due today or in immediate timeline.

---

#### 6.1.5 TasksTable
**File:** `components/dashboard/TasksTable.tsx`

**Purpose:** Tabular display of tasks with sorting/filtering.

**Uses:** `DataTable` component with task-specific columns

---

#### 6.1.6 AgendaToday
**File:** `components/dashboard/AgendaToday.tsx`

**Purpose:** Display calendar view of today's agenda.

---

#### 6.1.7 DirectorSummary
**File:** `components/dashboard/DirectorSummary.tsx`

**Purpose:** Executive summary for directors/managers.

**Key Displays:**
- Team utilization
- Project risk indicators
- Upcoming milestones
- Overdue items

---

### 6.2 Calendar Components

#### 6.2.1 UnifiedCalendar
**File:** `components/calendario/UnifiedCalendar.tsx`

**Purpose:** Calendar view integrating all tasks and project milestones.

**Key Features:**
- Month/week view toggle
- Color-coded by workflow type
- Click to view day details
- Drag-and-drop for rescheduling (optional)
- Integration with task data

---

#### 6.2.2 CalendarWorkspace
**File:** `components/calendario/CalendarWorkspace.tsx`

**Purpose:** Full calendar workspace with sidebar filters and legends.

---

### 6.3 Projects Components

#### 6.3.1 ProjectsTable
**File:** `components/proyectos/ProjectsTable.tsx`

**Purpose:** List all projects with filtering and sorting.

**Uses:** `DataTable` with project-specific columns

**Columns:**
- Project name
- Client
- Manager
- Phase
- Status
- Progress bar
- Actions

---

#### 6.3.2 ProjectHeader
**File:** `components/proyectos/ProjectHeader.tsx`

**Purpose:** Header section for individual project page.

**Displays:**
- Project name
- Client
- Status badge
- Manager info
- Quick actions (Edit, Archive, etc.)

---

#### 6.3.3 ProjectModules
**File:** `components/proyectos/ProjectModules.tsx`

**Purpose:** Display all modules/phases of a project.

**Key Features:**
- Module cards in grid
- Phase-based organization
- Expandable task lists

---

#### 6.3.4 ProjectActivity
**File:** `components/proyectos/ProjectActivity.tsx`

**Purpose:** Activity feed/timeline for project changes and notes.

**Displays:**
- Chronological activity log
- User actions
- Status changes
- Note history

---

### 6.4 Tasks Components

#### 6.4.1 PresaleTable
**File:** `components/tareas/PresaleTable.tsx`

**Purpose:** Display presale/opportunity tasks with editing capabilities.

**Uses:** `DataTable` with presale-specific columns

**Columns:**
- Description
- Project
- Phase
- Manager/Responsible
- Support team (Equipo)
- Commitment (Compromiso)
- Review Date (Seguimiento)
- Status

**Features:**
- Inline editing for certain fields
- Bulk status updates
- Export capability
- Filter by status/manager

---

#### 6.4.2 PresaleRow
**File:** `components/tareas/PresaleRow.tsx`

**Purpose:** Individual row component for presale table.

**Features:**
- Click to open TaskDrawer
- Status display
- Quick actions

---

#### 6.4.3 TaskRow
**File:** `components/tasks/TaskRow.tsx`

**Purpose:** Individual task row for other task tables.

---

#### 6.4.4 TaskStatusBadge
**File:** `components/tasks/TaskStatusBadge.tsx`

**Purpose:** Colored badge for task status.

**Status Colors:**
- Pendiente (yellow)
- En Proceso (blue)
- Done (green)
- On Hold (gray/red)

---

#### 6.4.5 ProjectTasks
**File:** `components/tasks/ProjectTasks.tsx`

**Purpose:** Display all tasks for a specific project.

---

### 6.5 Team (Equipo) Components

#### 6.5.1 Team Table
**Purpose:** List all team members with roles and project assignments.

**Columns:**
- Name (with Avatar)
- Role
- Projects assigned
- Availability
- Actions

**Features:**
- Member profile modal
- Edit capability via drawer
- Assign to projects

---

### 6.6 Suppliers (Proveedores) Components

#### 6.6.1 Suppliers Table
**Purpose:** Manage supplier/vendor information.

**Columns:**
- Name
- Category
- Contact
- Rating (via StarRating)
- Status
- Actions

**Features:**
- Inline editing (EditableCell)
- Rating system (StarRating)
- Quick status toggles (PillDropdown)

---

#### 6.6.2 StarRating
**File:** `components/proveedores/StarRating.tsx`

**Purpose:** Display and collect star ratings (1-5).

**Key Features:**
- Visual star display
- Click to rate
- Hover preview
- Typically 1-5 scale

---

### 6.7 Resources (Recursos) Components

#### 6.7.1 ResourcesWorkspace
**File:** `components/recursos/ResourcesWorkspace.tsx`

**Purpose:** Main resources/documents management interface.

**Key Features:**
- File/document browser
- Upload capability
- Categorization by project/type
- Search/filter

---

#### 6.7.2 ResourcesWorkspaceServer
**File:** `components/recursos/ResourcesWorkspaceServer.tsx`

**Purpose:** Server-side data fetching for resources.

---

#### 6.7.3 DrivePickerDialog
**File:** `components/recursos/DrivePickerDialog.tsx`

**Purpose:** Dialog for selecting files from external drives (Google Drive, etc.).

**Features:**
- Browse external folders
- Select files
- Multi-select
- Preview

---

### 6.8 Settings/Configuration Components

#### 6.8.1 GeneralSettingsWorkspace
**File:** `components/configuracion/GeneralSettingsWorkspace.tsx`

**Purpose:** General application settings interface.

**Settings:**
- Organization info
- Default values
- Notification preferences
- Work hours/calendar

---

#### 6.8.2 PermissionsWorkspace
**File:** `components/configuracion/PermissionsWorkspace.tsx`

**Purpose:** Manage role-based permissions.

**Features:**
- View roles
- Assign permissions
- User role management

---

### 6.9 Assistant (Asistente) Components

#### 6.9.1 AssistantChat
**File:** `components/asistente/AssistantChat.tsx`

**Purpose:** Chat interface for AI assistant.

**Key Features:**
- Message display
- Input field
- Typing indicators
- Message history

---

#### 6.9.2 AssistantCardMessage
**File:** `components/asistente/AssistantCardMessage.tsx`

**Purpose:** Display assistant message with card layout.

---

#### 6.9.3 AssistantChartMessage
**File:** `components/asistente/AssistantChartMessage.tsx`

**Purpose:** Display chart/visualization in assistant response.

---

#### 6.9.4 AssistantListMessage
**File:** `components/asistente/AssistantListMessage.tsx`

**Purpose:** Display list data in assistant response.

---

#### 6.9.5 AssistantStatGridMessage
**File:** `components/asistente/AssistantStatGridMessage.tsx`

**Purpose:** Display statistics grid in assistant response.

---

## 7. Authentication Components

### 7.1 SessionHydrator
**File:** `components/auth/SessionHydrator.tsx`

**Purpose:** Server component for loading authentication session on app startup.

**Features:**
- User session initialization
- Auth state setup
- Permission loading

---

### 7.2 AppRouteGuard
**File:** `components/auth/AppRouteGuard.tsx`

**Purpose:** Protect routes based on authentication and permissions.

**Key Features:**
- Route protection
- Permission checking
- Redirect to login if unauthorized
- Role-based access control

---

## 8. Provider Components

### 8.1 QueryProvider
**File:** `components/providers/QueryProvider.tsx`

**Purpose:** Setup React Query context for data fetching.

**Key Features:**
- Query client configuration
- Cache management
- Stale time and GC settings

---

## 9. shadcn/ui Components

### 9.1 Card Primitives
**File:** `components/ui/shadcn/card.tsx`

**Purpose:** Base card component with composable sub-components.

**Sub-components:**
- `Card`: Main container
- `CardHeader`: Header section
- `CardTitle`: Card title
- `CardDescription`: Card description/subtitle
- `CardAction`: Action buttons area
- `CardContent`: Main content area
- `CardFooter`: Footer section

**Design System:**
- Rounded corners
- Subtle border and shadow
- Customizable spacing via CSS variables
- Responsive sizing options

---

### 9.2 Avatar Primitives
**File:** `components/ui/shadcn/avatar.tsx`

**Purpose:** Base avatar component from shadcn.

---

### 9.3 Badge Primitives
**File:** `components/ui/shadcn/badge.tsx`

**Purpose:** Base badge component from shadcn.

---

### 9.4 Separator
**File:** `components/ui/shadcn/separator.tsx`

**Purpose:** Visual separator line component.

---

## 10. Other UI Components

### 10.1 GroupSection
**File:** `components/ui/GroupSection.tsx`

**Purpose:** Group related form fields or content sections.

**Key Features:**
- Visual grouping
- Title/heading
- Padding/spacing
- Border separation

---

### 10.2 ExportMenu
**File:** `components/ui/ExportMenu.tsx`

**Purpose:** Menu for exporting table data in multiple formats.

**Export Formats:**
- CSV
- Excel (.xlsx)
- PDF (optional)

**Integration:**
- Works with DataTable
- Triggered via toolbar button
- File download handled

---

## Design System & Styling Conventions

### Colors
**Primary Colors:**
- Blue: `bg-blue-600` (actions, highlights)
- Slate: `bg-slate-*` (neutral backgrounds)
- Green: `bg-green-*` (success, active)
- Yellow: `bg-yellow-*` (warning)
- Red: `bg-red-*` (error, danger)
- Purple: `bg-purple-*` (special categories)

### Spacing
- Card padding: `p-6`
- Section spacing: `space-y-6`
- Gap between items: `gap-3` or `gap-4`

### Borders & Shadows
- Border: `border-slate-200`
- Rounded: `rounded-2xl` (cards), `rounded-xl` (sections), `rounded-lg` (inputs)
- Shadow: `shadow-sm` (default), `shadow-lg` (hover/emphasis)

### Typography
- Headings: `font-bold text-xl` to `text-4xl`
- Body: `text-sm` to `text-base`
- Labels: `text-xs uppercase tracking-wide`
- Muted text: `text-slate-500`

### Responsive Behavior
- Mobile-first approach
- Flexible grids and flexbox
- Sticky headers for tables
- Scrollable content areas

---

## Component Hierarchy & Composition

```
App (Root)
├── Header
├── Sidebar
├── Main Content Area
│   ├── Dashboard
│   │   ├── KpiCard (x4)
│   │   ├── ProjectsOverview
│   │   │   └── ProjectCard (x n)
│   │   ├── TasksToday
│   │   │   └── DataTable
│   │   ├── UnifiedCalendar
│   │   └── TasksTable
│   │       └── DataTable
│   ├── Projects
│   │   ├── ProjectsTable
│   │   │   └── DataTable
│   │   ├── ProjectHeader
│   │   ├── ProjectModules
│   │   │   └── ProjectModuleCard (x n)
│   │   └── ProjectActivity
│   ├── Tasks
│   │   ├── PresaleTable
│   │   │   └── DataTable
│   │   ├── (TaskDrawer)
│   │   └── (NewTaskModal)
│   ├── Team
│   │   ├── TeamTable
│   │   │   └── Avatar
│   │   ├── (MemberProfileModal)
│   │   └── (MemberEditorDrawer)
│   ├── Resources
│   │   ├── ResourcesWorkspace
│   │   └── (DrivePickerDialog)
│   └── Settings
│       ├── GeneralSettingsWorkspace
│       └── PermissionsWorkspace
└── Footer (optional)

Modals/Drawers (Overlay Layer)
├── DialogOverlay (wrapper)
│   ├── NewTaskModal
│   ├── NewProjectTemplateModal
│   ├── TaskDrawer
│   ├── MemberEditorDrawer
│   ├── ProjectNotesModal
│   └── [other dialogs]
└── ExportMenu
```

---

## State Management Patterns

### Client-Side State
- React `useState` for component-level state
- React Query for server state caching
- localStorage for persistence (user preferences, theme)
- Browser state repository for cross-component communication

### Server-Side Data
- Server Actions for mutations
- Repositories for data access
- Drizzle ORM for database queries
- Session-based permissions

### Data Flow
1. Server Action triggered → Validate permissions → Mutate database
2. React Query re-fetches affected data
3. Component updates via new data
4. localStorage updated if needed

---

## Accessibility Principles

- **ARIA Labels:** Modal dialogs have proper `aria-label` and `aria-modal`
- **Focus Management:** Drawers and modals trap focus and return focus to trigger
- **Keyboard Navigation:** Escape closes modals, Tab cycles through focusable elements
- **Semantic HTML:** Use `role`, `aria-*` attributes appropriately
- **Color Contrast:** Sufficient contrast for text on backgrounds
- **Alternative Text:** Images have alt text
- **Form Labels:** Inputs have associated labels

---

## Performance Considerations

- **Code Splitting:** Components lazy-loaded via Next.js dynamic imports
- **Memoization:** Prevent unnecessary re-renders with useMemo/useCallback
- **DataTable:** Virtual scrolling for large lists (via @tanstack/react-table)
- **Image Optimization:** Next.js Image component for pictures
- **Bundle Size:** shadcn components tree-shakeable

---

## Common Component Patterns

### Modal Pattern
```tsx
1. Use DialogOverlay as wrapper for accessibility
2. Manage `open` state in parent
3. Pass triggerRef for focus return
4. Handle Escape key via DialogOverlay
5. Call onClose on success/cancel
```

### Table Pattern
```tsx
1. Define ColumnDef array for columns
2. Prepare data array (filtered/sorted)
3. Pass to DataTable component
4. Configure onRowClick for detail view
5. Use rowClassName for conditional styling
```

### Form Pattern
```tsx
1. Use refs for form fields
2. Manage state with useState
3. Validate before save
4. Call onSave callback on submit
5. Show success/error feedback
```

### Card Pattern
```tsx
1. Use Card primitives (CardHeader, CardContent, etc.)
2. Include CardTitle for heading
3. Add CardAction for buttons
4. Keep content concise
5. Use shadow for elevation
```

---

## Related Files & Resources

- **Type Definitions:** `lib/types/` (Task, Project, TeamMember, etc.)
- **Auth & Permissions:** `lib/auth/` (auth-service, permissions, roles)
- **Data Access:** `lib/repositories/` (project-repository, task-actions, etc.)
- **Styling Utilities:** `lib/utils/` (cn utility, date formatting, export)
- **Tailwind Config:** `tailwind.config.ts` (theme, colors, plugins)

---

## Quick Reference: Component Imports

```tsx
// Layout
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";

// Data Display
import { DataTable } from "@/components/ui/DataTable";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";

// Forms
import TeamMultiSelect from "@/components/ui/TeamMultiSelect";
import DialogOverlay from "@/components/ui/DialogOverlay";

// Modals
import NewTaskModal from "@/components/tareas/NewTaskModal";
import TaskDrawer from "@/components/tareas/TaskDrawer";

// Cards
import KpiCard from "@/components/dashboard/KpiCard";
import ProjectCard from "@/components/proyectos/ProjectCard";

// shadcn/ui
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/shadcn/card";
import { Avatar as ShadcnAvatar } from "@/components/ui/shadcn/avatar";
import { Badge as ShadcnBadge } from "@/components/ui/shadcn/badge";
```

---

## Last Updated
September 2, 2026

## Document Maintainers
- UI/Component documentation
- Sync with AGENTS.md guidelines
- Update when new components are added
