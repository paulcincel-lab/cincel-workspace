# Component Quick Reference Card

A one-page guide for developers to quickly find and use components.

---

## Core UI Components

### 📊 DataTable
**Use:** Display lists of records with sorting, filtering, and search

```tsx
import { DataTable } from "@/components/ui/DataTable";

<DataTable
  columns={[
    { accessorKey: "name", header: "Name" },
    { accessorKey: "status", header: "Status" }
  ]}
  data={records}
  onRowClick={(row) => openDetail(row)}
  searchPlaceholder="Search..."
  emptyMessage="No records found"
/>
```

**Key Props:**
- `columns`: ColumnDef array
- `data`: Data array
- `onRowClick?`: Row click handler
- `searchPlaceholder?`: Enable search
- `emptyMessage?`: Custom empty text
- `tableClassName?`: Extra table styles
- `wrapperClassName?`: Extra wrapper styles

---

### 🎯 DialogOverlay
**Use:** Wrap modals/drawers for accessibility

```tsx
<div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
  <DialogOverlay
    label="Modal Title"
    onClose={() => setOpen(false)}
    triggerRef={triggerRef}
    className="bg-white rounded-2xl w-[600px]"
  >
    {/* Content */}
  </DialogOverlay>
</div>
```

**Key Props:**
- `label`: ARIA label (required)
- `onClose`: Close handler (required)
- `triggerRef?`: Element for focus return
- `className?`: Custom styles

**Features:**
- Escape key closes
- Focus trap
- Tab cycles through focusable elements

---

### 👤 Avatar
**Use:** Display user profile pictures with initials fallback

```tsx
<Avatar name="María García" imageSrc="/photo.jpg" showName={true} />
```

**Key Props:**
- `name`: User name (required)
- `showName?`: Show name label (default: true)
- `imageSrc?`: Image URL
- `imageAlt?`: Alt text

**Styling:**
- Size: 36px (w-9 h-9)
- Shape: Circular
- Bg: Blue (bg-blue-600)

---

### 🏷️ Badge
**Use:** Status indicators and tags

```tsx
<Badge label="Pendiente" color="yellow" />
<Badge label="En Proceso" color="blue" />
<Badge label="Completado" color="green" />
```

**Key Props:**
- `label`: Text (required)
- `color`: "yellow" | "blue" | "green" | "red" | "gray" | "purple"

**Color Meanings:**
| Color | Meaning |
|-------|---------|
| yellow | Pending, Awaiting |
| blue | In Progress, Active |
| green | Complete, Success |
| red | Error, Overdue, On Hold |
| purple | Special, Custom |
| gray | Inactive, Archived |

---

### 📋 TeamMultiSelect
**Use:** Select multiple team members

```tsx
<TeamMultiSelect
  teamMembers={["María", "Carlos", "Ana"]}
  selected={selectedMembers}
  onChange={setSelectedMembers}
  placeholder="Select team..."
/>
```

**Key Props:**
- `teamMembers`: Array of names
- `selected`: Selected names array
- `onChange`: Update handler
- `placeholder?`: Placeholder text

---

### 📊 KpiCard
**Use:** Display metric with title and value

```tsx
<KpiCard title="Active Projects" value="12" />
```

**Key Props:**
- `title`: Label (required)
- `value`: Large number (required)

**Styling:**
- Title: Small, muted text
- Value: Large bold (text-4xl)
- Card: White, slate border, shadow

---

### 🎴 ProjectCard
**Use:** Display project overview

```tsx
<ProjectCard
  project={{
    id: 1,
    name: "Casa Nueva",
    client: { name: "García & Co" },
    manager: "María",
    phase: "Construcción",
    progress: 65,
    status: "Activo"
  }}
/>
```

**Features:**
- Client name
- Status badge
- Progress bar
- Clickable link to detail

---

### 📝 InlineEditableField
**Use:** Click-to-edit field in table/card

```tsx
<InlineEditableField
  value={fieldValue}
  onChange={setFieldValue}
  onSave={handleSave}
/>
```

---

## Modal & Drawer Components

### ➕ NewTaskModal
**Use:** Create new task

```tsx
<NewTaskModal
  open={showModal}
  onClose={() => setShowModal(false)}
  onSave={(form) => handleCreateTask(form)}
  projects={["Project 1", "Project 2"]}
  teamMembers={["María", "Carlos"]}
  phaseOptions={["Inicial", "En Proceso"]}
  triggerRef={buttonRef}
/>
```

**Form Fields:**
- description (required)
- project
- phase
- manager
- support (multi-select)
- status
- notes
- commitmentDate
- reviewDate

---

### 📖 TaskDrawer
**Use:** View/edit task details with history

```tsx
<TaskDrawer
  task={selectedTask}
  onClose={() => setSelectedTask(null)}
  onSave={(updated) => updateTask(updated)}
  teamMembers={teamList}
  triggerRef={rowRef}
/>
```

**Sections:**
- Task header
- Summary grid
- History/notes
- Add new note input

---

### 🏢 ProjectCreateModal
**Use:** Create new project

```tsx
<ProjectCreateModal
  open={showModal}
  onClose={() => setShowModal(false)}
  onSave={(project) => handleCreate(project)}
  clients={clientList}
  teamMembers={teamList}
  triggerRef={buttonRef}
/>
```

---

### 👥 MemberProfileModal
**Use:** View team member details

```tsx
<MemberProfileModal
  member={selectedMember}
  onClose={() => setSelectedMember(null)}
/>
```

---

### ✏️ MemberEditorDrawer
**Use:** Edit team member details

```tsx
<MemberEditorDrawer
  member={selectedMember}
  onClose={() => setSelectedMember(null)}
  onSave={(updated) => updateMember(updated)}
  projects={projectList}
  triggerRef={editRef}
/>
```

---

## Feature-Specific Components

### 📊 PresaleTable
**Use:** Display presale tasks

```tsx
<PresaleTable
  tasks={tasks}
  onRowClick={(task) => openDetail(task)}
  onStatusChange={(task, newStatus) => updateTask(task, newStatus)}
/>
```

**Columns:**
- Description
- Project
- Phase
- Manager
- Equipo (Team)
- Compromiso (Commitment Date)
- Seguimiento (Review Date)
- Status

---

### 📅 UnifiedCalendar
**Use:** Calendar view of all tasks and milestones

```tsx
<UnifiedCalendar
  events={tasks}
  onDateSelect={(date) => showDayView(date)}
  onTaskClick={(task) => openDetail(task)}
/>
```

---

### 📈 InteractiveDashboard
**Use:** Main dashboard with KPIs, projects, tasks, calendar

```tsx
<InteractiveDashboard
  user={currentUser}
  dateRange={filterRange}
/>
```

**Displays:**
- KPI cards
- Active projects
- Today's tasks
- Calendar
- Task tables by type

---

### 🗂️ ProjectsTable
**Use:** List all projects

```tsx
<ProjectsTable
  projects={projects}
  onRowClick={(project) => navigate(`/proyectos/${project.id}`)}
/>
```

---

### 📄 ResourcesWorkspace
**Use:** Manage documents and files

```tsx
<ResourcesWorkspace
  projectId={currentProjectId}
/>
```

---

## Form Components

### 🔽 PillDropdown
**Use:** Select from options styled as pills

```tsx
<PillDropdown
  options={["Draft", "Published", "Archived"]}
  value={selectedStatus}
  onChange={setSelectedStatus}
/>
```

---

### ⭐ StarRating
**Use:** 5-star rating input

```tsx
<StarRating
  value={rating}
  onChange={setRating}
  readOnly={false}
/>
```

---

### 📋 EditableCell
**Use:** Inline cell editor in table

```tsx
<EditableCell
  value={cellValue}
  onChange={setCellValue}
  type="text" | "select"
  options={selectOptions}
/>
```

---

## Layout Components

### 🏠 Header
**Use:** Top navigation bar

```tsx
<Header variant="default" | "profile" />
```

**Features:**
- Logo
- User menu
- Logout button
- Development menu (dev mode)

---

### 📑 Sidebar
**Use:** Left navigation sidebar

```tsx
<Sidebar />
```

**Navigation:**
- Dashboard
- Projects
- Tasks
- Team
- Resources
- Settings

---

### 📦 GroupSection
**Use:** Group form fields or content

```tsx
<GroupSection title="Personal Info">
  {/* Content */}
</GroupSection>
```

---

### 📤 ExportMenu
**Use:** Export table data

```tsx
<ExportMenu
  data={tableData}
  columns={columns}
  formats={["csv", "xlsx", "pdf"]}
/>
```

---

## Auth Components

### 🔐 SessionHydrator
**Use:** Load user session on app startup

```tsx
<SessionHydrator>
  <AppRouteGuard>
    <YourContent />
  </AppRouteGuard>
</SessionHydrator>
```

---

### 🛡️ AppRouteGuard
**Use:** Protect routes with permissions

```tsx
<AppRouteGuard requiredRole="editor">
  <ProtectedContent />
</AppRouteGuard>
```

---

## shadcn/ui Primitives

### 📦 Card
**Use:** Card container with sub-components

```tsx
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/shadcn/card";

<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>
    Content here
  </CardContent>
</Card>
```

**Sub-components:**
- Card
- CardHeader
- CardTitle
- CardDescription
- CardContent
- CardFooter
- CardAction

---

### 👤 Avatar (shadcn)
**Use:** Base avatar primitive

```tsx
import { Avatar } from "@/components/ui/shadcn/avatar";

<Avatar>
  <AvatarImage src="..." />
  <AvatarFallback>AB</AvatarFallback>
</Avatar>
```

---

### 🏷️ Badge (shadcn)
**Use:** Base badge primitive

```tsx
import { Badge } from "@/components/ui/shadcn/badge";

<Badge>Label</Badge>
```

---

### — Separator
**Use:** Visual separator line

```tsx
import { Separator } from "@/components/ui/shadcn/separator";

<Separator className="my-4" />
```

---

## Common Props & Patterns

### Modal/Drawer Pattern
```tsx
const [open, setOpen] = useState(false);
const triggerRef = useRef<HTMLButtonElement>(null);

<button ref={triggerRef} onClick={() => setOpen(true)}>
  Open
</button>

{open && (
  <div className="fixed inset-0 bg-black/40 flex ... z-50">
    <DialogOverlay
      label="Title"
      onClose={() => setOpen(false)}
      triggerRef={triggerRef}
      className="bg-white rounded-2xl w-[600px]"
    >
      {/* Content */}
    </DialogOverlay>
  </div>
)}
```

### Form Pattern
```tsx
const [form, setForm] = useState({ field: "" });

<input
  value={form.field}
  onChange={(e) => setForm({ ...form, field: e.target.value })}
/>
```

### Table Pattern
```tsx
const columns: ColumnDef[] = [
  { accessorKey: "name", header: "Name" },
];

<DataTable columns={columns} data={data} />
```

---

## Color System Quick Reference

### Badge Colors
| Color | Use Case | Badge |
|-------|----------|-------|
| yellow | Pending | `<Badge color="yellow" />` |
| blue | In Progress | `<Badge color="blue" />` |
| green | Complete | `<Badge color="green" />` |
| red | Error/Overdue | `<Badge color="red" />` |
| purple | Special | `<Badge color="purple" />` |
| gray | Inactive | `<Badge color="gray" />` |

### Tailwind Colors
```
Primary:    bg-blue-600, text-blue-600
Success:    bg-green-600, text-green-600
Warning:    bg-yellow-500, text-yellow-600
Error:      bg-red-600, text-red-600
Info:       bg-purple-600, text-purple-600
Neutral:    bg-slate-*, text-slate-*
```

---

## Spacing Convention

```css
p-6      /* Card padding */
p-4      /* Section padding */
p-3      /* Field padding */
gap-6    /* Large spacing */
gap-4    /* Medium spacing */
gap-2    /* Small spacing */
space-y-6 /* Vertical stacking */
```

---

## Border & Shadow Convention

```css
border-slate-200      /* Card/element borders */
rounded-2xl           /* Cards, modals */
rounded-xl            /* Sections */
rounded-lg            /* Inputs, buttons */
rounded-full          /* Avatars */
shadow-sm             /* Default */
shadow-lg             /* Hover/emphasis */
shadow-xl             /* Modals, drawers */
```

---

## Responsive Breakpoints

```css
grid-cols-1           /* Mobile */
md:grid-cols-2        /* Tablet */
lg:grid-cols-3        /* Desktop */
lg:grid-cols-4        /* Wide */
```

---

## Keyboard Shortcuts in Components

| Key | Component | Action |
|-----|-----------|--------|
| Escape | Modal/Drawer | Close |
| Tab | Any | Next focusable |
| Shift+Tab | Any | Previous focusable |
| Enter | Button/Form | Submit |
| Space | Checkbox/Button | Toggle |

---

## File Import Quick Reference

```tsx
// Layout
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";

// Tables & Display
import { DataTable } from "@/components/ui/DataTable";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";

// Forms
import TeamMultiSelect from "@/components/ui/TeamMultiSelect";
import InlineEditableField from "@/components/ui/InlineEditableField";
import DialogOverlay from "@/components/ui/DialogOverlay";

// Modals/Drawers
import NewTaskModal from "@/components/tareas/NewTaskModal";
import TaskDrawer from "@/components/tareas/TaskDrawer";
import NewProjectTemplateModal from "@/components/tareas/NewProjectTemplateModal";
import ProjectCreateModal from "@/components/proyectos/ProjectCreateModal";
import MemberProfileModal from "@/components/equipo/MemberProfileModal";
import MemberEditorDrawer from "@/components/equipo/MemberEditorDrawer";

// Cards & Display
import KpiCard from "@/components/dashboard/KpiCard";
import ProjectCard from "@/components/proyectos/ProjectCard";

// Dashboard
import InteractiveDashboard from "@/components/dashboard/InteractiveDashboard";
import ProjectsOverview from "@/components/dashboard/ProjectsOverview";
import TasksTable from "@/components/dashboard/TasksTable";

// Calendar
import UnifiedCalendar from "@/components/calendario/UnifiedCalendar";

// Tables
import PresaleTable from "@/components/tareas/PresaleTable";
import ProjectsTable from "@/components/proyectos/ProjectsTable";

// Other
import GroupSection from "@/components/ui/GroupSection";
import ExportMenu from "@/components/ui/ExportMenu";
import StarRating from "@/components/proveedores/StarRating";

// shadcn/ui
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/shadcn/card";
import { Separator } from "@/components/ui/shadcn/separator";
```

---

## Common Mistakes & Solutions

| Issue | Solution |
|-------|----------|
| Modal doesn't close on Escape | Wrap with `DialogOverlay` |
| Focus not returning after close | Pass `triggerRef` to `DialogOverlay` |
| Table not sorting | Check `accessorKey` matches data property |
| Avatar showing as initials | Verify `imageSrc` URL is correct |
| Badge color not showing | Use correct color: "yellow", "blue", etc. |
| Form not validating | Add validation before `onSave` |
| Modal behind content | Set `z-50` on overlay container |

---

## Performance Tips

1. **Memoize columns**: `useMemo` for `ColumnDef[]`
2. **Debounce search**: Wait 300ms before filtering
3. **Lazy load images**: Use `<Image>` component
4. **Pagination**: Implement for 1000+ rows
5. **Virtual scrolling**: Consider for 10000+ rows

---

## Accessibility Checklist

- [ ] Modals use `DialogOverlay`
- [ ] Forms have associated labels
- [ ] Buttons have aria-labels if needed
- [ ] Colors aren't the only indicator
- [ ] Keyboard navigation works (Tab, Escape, Enter)
- [ ] Images have alt text
- [ ] Focus is visible
- [ ] Focus is managed in modals

---

## Resources

- **Full Docs:** `/docs/ui-highlevel-components.md`
- **Component Inventory:** `/docs/COMPONENT-INVENTORY.md`
- **Usage Guide:** `/docs/COMPONENT-USAGE-GUIDE.md`
- **Type Definitions:** `/lib/types/`
- **Tailwind Config:** `/tailwind.config.ts`

---

**Print this page for quick reference!**

Last Updated: September 2, 2026
