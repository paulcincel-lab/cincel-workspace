# Cincel Workspace Component Usage Guide

A practical guide for developers on how to use, compose, and extend UI components in Cincel Workspace.

---

## Table of Contents
1. [Component Selection Guide](#component-selection-guide)
2. [Common Patterns](#common-patterns)
3. [Layout & Composition](#layout--composition)
4. [Form Handling](#form-handling)
5. [Data Display](#data-display)
6. [Modals & Drawers](#modals--drawers)
7. [Styling & Customization](#styling--customization)
8. [Accessibility](#accessibility)
9. [Performance Tips](#performance-tips)
10. [Code Examples](#code-examples)

---

## Component Selection Guide

### "I need to display data in a table..."
→ **Use: `DataTable`**

```tsx
import { DataTable } from "@/components/ui/DataTable";
import type { ColumnDef } from "@tanstack/react-table";

type Task = { id: number; description: string; status: string };
const columns: ColumnDef<Task>[] = [
  {
    accessorKey: "description",
    header: "Descripción",
  },
  {
    accessorKey: "status",
    header: "Estado",
  },
];

export default function TasksList({ tasks }: { tasks: Task[] }) {
  const handleRowClick = (task: Task) => {
    // Navigate or open drawer
  };

  return (
    <DataTable
      columns={columns}
      data={tasks}
      onRowClick={handleRowClick}
      searchPlaceholder="Buscar tareas..."
      emptyMessage="No hay tareas disponibles"
    />
  );
}
```

**When to use:**
- Displaying lists of records (projects, tasks, team members)
- Need sorting/filtering
- Many rows (100+)
- Want consistent look across pages

**Avoid when:**
- Very few items (< 5)
- Need custom layout (use cards instead)
- Simple static list (use `<ul>` or `<div>`)

---

### "I need to show a modal or side drawer..."
→ **Use: `DialogOverlay` wrapper**

```tsx
"use client";
import { useRef, useState } from "react";
import DialogOverlay from "@/components/ui/DialogOverlay";

export default function MyModal() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={triggerRef} onClick={() => setOpen(true)}>
        Open Modal
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <DialogOverlay
            label="My Modal Title"
            onClose={() => setOpen(false)}
            triggerRef={triggerRef}
            className="bg-white rounded-2xl w-[600px] p-6 shadow-xl"
          >
            <div>
              <h2>Modal Content</h2>
              {/* Content here */}
            </div>
          </DialogOverlay>
        </div>
      )}
    </>
  );
}
```

**When to use:**
- Form submission (create/edit)
- Confirmations
- Detailed view
- Focused interaction
- Multi-step workflows

**Modal vs Drawer:**
- Modal: Centered, `w-[600px]` to `w-[700px]`
- Drawer: Side panel, `w-[560px]`, `fixed inset-0 ... justify-end`

---

### "I need to display a user/team member..."
→ **Use: `Avatar`**

```tsx
import Avatar from "@/components/ui/Avatar";

export default function UserProfile() {
  return (
    <Avatar
      name="María García"
      imageSrc="/photos/maria.jpg"
      showName={true}
    />
  );
}
```

**Props:**
- `name` (required): Display name
- `showName` (default: true): Show name beside avatar
- `imageSrc` (optional): Image URL (falls back to initials)
- `imageAlt` (optional): Alt text for image

**Styling:**
- Size: 36px (w-9 h-9)
- Shape: Circular
- Color: Blue background (bg-blue-600)
- Initials: Uppercase, first letter of each word

---

### "I need status badges or tags..."
→ **Use: `Badge`**

```tsx
import Badge from "@/components/ui/Badge";

export default function TaskStatus() {
  return (
    <div className="flex gap-2">
      <Badge label="Pendiente" color="yellow" />
      <Badge label="En Proceso" color="blue" />
      <Badge label="Completado" color="green" />
      <Badge label="En Riesgo" color="red" />
    </div>
  );
}
```

**Color Meanings:**
- `yellow`: Pending, awaiting
- `blue`: In progress, active
- `green`: Complete, success
- `red`: Error, overdue, on hold
- `purple`: Special/custom category
- `gray`: Inactive, archived

---

### "I need to select multiple team members..."
→ **Use: `TeamMultiSelect`**

```tsx
import TeamMultiSelect from "@/components/ui/TeamMultiSelect";
import { useState } from "react";

export default function TaskForm() {
  const [support, setSupport] = useState<string[]>([]);

  return (
    <TeamMultiSelect
      teamMembers={["María", "Carlos", "Ana", "Luis"]}
      selected={support}
      onChange={setSupport}
      placeholder="Seleccionar equipo de apoyo"
    />
  );
}
```

---

### "I need to show KPI metrics on dashboard..."
→ **Use: `KpiCard`**

```tsx
import KpiCard from "@/components/dashboard/KpiCard";

export default function DashboardOverview() {
  return (
    <div className="grid grid-cols-4 gap-4">
      <KpiCard title="Proyectos Activos" value="12" />
      <KpiCard title="Tareas Esta Semana" value="28" />
      <KpiCard title="Equipo Disponible" value="8/12" />
      <KpiCard title="Riesgo" value="2" />
    </div>
  );
}
```

**Design:**
- Title: Small, muted text
- Value: Large, bold (text-4xl)
- Padding: 24px
- Border: Subtle slate border
- Shadow: Light shadow

---

### "I need to show a project card with progress..."
→ **Use: `ProjectCard`**

```tsx
import ProjectCard from "@/components/proyectos/ProjectCard";

type Project = {
  id: number;
  name: string;
  client: { name: string };
  manager: string;
  phase: string;
  progress: number;
  status: string;
};

export default function ProjectsGrid({ projects }: { projects: Project[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
```

---

## Common Patterns

### Pattern 1: List with Drawer Detail

```tsx
"use client";
import { useState, useRef } from "react";
import { DataTable } from "@/components/ui/DataTable";
import TaskDrawer from "@/components/tareas/TaskDrawer";

type Task = {
  id: number;
  description: string;
  status: string;
};

export default function TasksPage({ tasks }: { tasks: Task[] }) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const columns = [
    { accessorKey: "description", header: "Descripción" },
    { accessorKey: "status", header: "Estado" },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={tasks}
        onRowClick={(task) => setSelectedTask(task as Task)}
      />

      {selectedTask && (
        <TaskDrawer
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onSave={(updated) => {
            // Handle update
            setSelectedTask(null);
          }}
          triggerRef={triggerRef}
          teamMembers={["Team"]}
        />
      )}
    </>
  );
}
```

---

### Pattern 2: Form Modal with Validation

```tsx
"use client";
import { useRef, useState } from "react";
import DialogOverlay from "@/components/ui/DialogOverlay";
import TeamMultiSelect from "@/components/ui/TeamMultiSelect";

type NewTaskForm = {
  description: string;
  manager: string;
  support: string[];
  status: string;
  commitmentDate: string;
};

export default function NewTaskModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (form: NewTaskForm) => void;
}) {
  const [form, setForm] = useState<NewTaskForm>({
    description: "",
    manager: "",
    support: [],
    status: "Pendiente",
    commitmentDate: "",
  });

  const triggerRef = useRef<HTMLButtonElement>(null);

  if (!open) return null;

  const handleSave = () => {
    if (!form.description.trim()) {
      alert("Descripción es requerida");
      return;
    }
    onSave(form);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <DialogOverlay
        label="Nueva Tarea"
        onClose={onClose}
        triggerRef={triggerRef}
        className="bg-white rounded-2xl w-[700px] p-6 shadow-xl"
      >
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold mb-2">
              Descripción *
            </label>
            <input
              type="text"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="Descripción de la tarea"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              Responsable *
            </label>
            <select
              value={form.manager}
              onChange={(e) => setForm({ ...form, manager: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            >
              <option value="">Seleccionar...</option>
              <option value="María">María García</option>
              <option value="Carlos">Carlos López</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              Equipo de Apoyo
            </label>
            <TeamMultiSelect
              teamMembers={["María", "Carlos", "Ana"]}
              selected={form.support}
              onChange={(support) => setForm({ ...form, support })}
            />
          </div>

          <div className="flex gap-3 justify-end border-t pt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white"
            >
              Guardar
            </button>
          </div>
        </div>
      </DialogOverlay>
    </div>
  );
}
```

---

### Pattern 3: Filtered Table with KPIs

```tsx
"use client";
import { useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import KpiCard from "@/components/dashboard/KpiCard";
import Badge from "@/components/ui/Badge";

type Task = {
  id: number;
  description: string;
  status: "Pendiente" | "En Proceso" | "Done";
  priority: "High" | "Medium" | "Low";
};

export default function TasksDashboard({ tasks }: { tasks: Task[] }) {
  const [statusFilter, setStatusFilter] = useState<string>("");

  const filteredTasks = statusFilter
    ? tasks.filter((t) => t.status === statusFilter)
    : tasks;

  const stats = {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === "Pendiente").length,
    inProgress: tasks.filter((t) => t.status === "En Proceso").length,
    done: tasks.filter((t) => t.status === "Done").length,
  };

  const columns = [
    { accessorKey: "description", header: "Descripción" },
    {
      accessorKey: "status",
      header: "Estado",
      cell: (info: any) => {
        const status = info.getValue();
        const color =
          status === "Pendiente"
            ? "yellow"
            : status === "En Proceso"
              ? "blue"
              : "green";
        return <Badge label={status} color={color} />;
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard title="Total" value={String(stats.total)} />
        <KpiCard title="Pendientes" value={String(stats.pending)} />
        <KpiCard title="En Proceso" value={String(stats.inProgress)} />
        <KpiCard title="Completadas" value={String(stats.done)} />
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <button
          onClick={() => setStatusFilter("")}
          className={`px-4 py-2 rounded-lg ${
            !statusFilter
              ? "bg-blue-600 text-white"
              : "bg-slate-100 text-slate-700"
          }`}
        >
          Todas
        </button>
        <button
          onClick={() => setStatusFilter("Pendiente")}
          className={`px-4 py-2 rounded-lg ${
            statusFilter === "Pendiente"
              ? "bg-yellow-600 text-white"
              : "bg-slate-100 text-slate-700"
          }`}
        >
          Pendientes
        </button>
        {/* More filters... */}
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredTasks}
        emptyMessage="No hay tareas con los filtros seleccionados"
      />
    </div>
  );
}
```

---

## Layout & Composition

### Main Content Area Structure

```tsx
export default function PageLayout() {
  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <Header />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-50">
          <div className="max-w-7xl mx-auto">
            {/* Page sections */}
            <PageContent />
          </div>
        </main>
      </div>
    </div>
  );
}
```

---

### Card Grid Layouts

```tsx
// 2-column grid (common for projects, teams)
<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
  {items.map((item) => (
    <Card key={item.id}>{item}</Card>
  ))}
</div>

// 3-column grid (project modules, resources)
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {items.map((item) => (
    <Card key={item.id}>{item}</Card>
  ))}
</div>

// 4-column grid (KPI cards)
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  {items.map((item) => (
    <KpiCard key={item.id} title={item.title} value={item.value} />
  ))}
</div>
```

---

### Section Containers

```tsx
// Page section with title
<div className="space-y-6">
  <div>
    <h1 className="text-3xl font-bold text-slate-900">Page Title</h1>
    <p className="text-slate-500 mt-1">Description or subtitle</p>
  </div>

  {/* Content */}
  <DataTable columns={columns} data={data} />
</div>
```

---

## Form Handling

### Standard Form Pattern

```tsx
"use client";
import { useRef, useState } from "react";

type FormData = {
  name: string;
  email: string;
  role: string;
};

export default function UserForm() {
  const [form, setForm] = useState<FormData>({
    name: "",
    email: "",
    role: "",
  });

  const [errors, setErrors] = useState<Partial<FormData>>({});

  const handleChange = (field: keyof FormData, value: string) => {
    setForm({ ...form, [field]: value });
    // Clear error for this field
    setErrors({ ...errors, [field]: undefined });
  };

  const validate = (): boolean => {
    const newErrors: Partial<FormData> = {};
    if (!form.name.trim()) newErrors.name = "Name is required";
    if (!form.email.trim()) newErrors.email = "Email is required";
    if (!form.role) newErrors.role = "Role is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      // Call server action or API
      await updateUser(form);
      alert("Saved successfully");
    } catch (error) {
      alert("Error saving");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold mb-1">Name *</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => handleChange("name", e.target.value)}
          className={`w-full px-3 py-2 border rounded-lg ${
            errors.name ? "border-red-500" : "border-slate-300"
          }`}
        />
        {errors.name && (
          <p className="text-red-600 text-xs mt-1">{errors.name}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1">Email *</label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => handleChange("email", e.target.value)}
          className={`w-full px-3 py-2 border rounded-lg ${
            errors.email ? "border-red-500" : "border-slate-300"
          }`}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1">Role *</label>
        <select
          value={form.role}
          onChange={(e) => handleChange("role", e.target.value)}
          className={`w-full px-3 py-2 border rounded-lg ${
            errors.role ? "border-red-500" : "border-slate-300"
          }`}
        >
          <option value="">Select role...</option>
          <option value="admin">Admin</option>
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>

      <div className="flex gap-3 justify-end pt-4">
        <button className="px-4 py-2 rounded-lg border border-slate-300">
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white"
        >
          Save
        </button>
      </div>
    </div>
  );
}
```

---

## Data Display

### Table with Custom Columns

```tsx
import { DataTable } from "@/components/ui/DataTable";
import { ColumnDef } from "@tanstack/react-table";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";

type Task = {
  id: number;
  description: string;
  manager: string;
  status: string;
  dueDate: string;
};

const columns: ColumnDef<Task>[] = [
  {
    accessorKey: "description",
    header: "Task",
    cell: (info) => (
      <div>
        <p className="font-medium">{info.getValue()}</p>
      </div>
    ),
  },
  {
    accessorKey: "manager",
    header: "Assigned To",
    cell: (info) => <Avatar name={info.getValue() as string} showName />,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: (info) => {
      const status = info.getValue() as string;
      const color =
        status === "Pending"
          ? "yellow"
          : status === "In Progress"
            ? "blue"
            : "green";
      return <Badge label={status} color={color} />;
    },
  },
  {
    accessorKey: "dueDate",
    header: "Due",
    cell: (info) => <span>{info.getValue()}</span>,
  },
];

export default function TasksList({ tasks }: { tasks: Task[] }) {
  return (
    <DataTable
      columns={columns}
      data={tasks}
      searchPlaceholder="Search tasks..."
    />
  );
}
```

---

## Modals & Drawers

### Modal Overlay Structure

```tsx
{open && (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
    <DialogOverlay
      label="Modal Title"
      onClose={onClose}
      triggerRef={triggerRef}
      className="bg-white rounded-2xl w-[600px] shadow-xl text-black"
    >
      <div className="p-6 border-b">
        <h2 className="text-2xl font-bold">Title</h2>
      </div>
      <div className="p-6 space-y-6">
        {/* Content */}
      </div>
      <div className="p-6 border-t flex gap-3 justify-end">
        <button onClick={onClose}>Cancel</button>
        <button onClick={handleSave}>Save</button>
      </div>
    </DialogOverlay>
  </div>
)}
```

### Drawer Overlay Structure

```tsx
{open && (
  <div className="fixed inset-0 bg-black/40 flex justify-end z-50">
    <DialogOverlay
      label="Drawer Title"
      onClose={onClose}
      triggerRef={triggerRef}
      className="w-[560px] h-full bg-white overflow-y-auto shadow-xl"
    >
      <div className="border-b p-6">
        <h2 className="text-2xl font-bold">Title</h2>
        <button onClick={onClose} className="absolute top-6 right-6 text-2xl">
          ✕
        </button>
      </div>
      <div className="p-6 space-y-6">
        {/* Scrollable content */}
      </div>
    </DialogOverlay>
  </div>
)}
```

---

## Styling & Customization

### Color Palette
```css
/* Primary */
primary: #2563eb (bg-blue-600)

/* Semantic */
success: #16a34a (bg-green-600)
warning: #eab308 (bg-yellow-400)
error: #dc2626 (bg-red-600)
info: #7c3aed (bg-purple-600)

/* Neutral */
bg-slate-50  /* Light backgrounds */
bg-slate-100 /* Cards, sections */
bg-slate-200 /* Borders */
text-slate-700 /* Primary text */
text-slate-500 /* Secondary text */
```

### Rounded Corners Convention
```
rounded-2xl  → Cards, modals, large containers
rounded-xl   → Sections, form groups
rounded-lg   → Inputs, buttons, badges
rounded-full → Avatars, circular elements
```

### Spacing Convention
```
p-6    → Card padding
p-4    → Section padding
p-3    → Form field padding
gap-4  → Between major sections
gap-2  → Between minor elements
space-y-6 → Vertical stacking
```

### Shadow Convention
```
shadow-sm    → Default (cards, inputs)
shadow-lg    → Hover states, emphasis
shadow-xl    → Modals, drawers
```

---

## Accessibility

### Focus Management in Dialogs

```tsx
// DialogOverlay handles this automatically:
// 1. Focuses first focusable element on open
// 2. Traps Tab key within dialog
// 3. Returns focus to trigger on close

// You just need to:
const triggerRef = useRef<HTMLButtonElement>(null);
<DialogOverlay triggerRef={triggerRef} onClose={onClose}>
  {/* Content */}
</DialogOverlay>
```

### ARIA Labels

```tsx
// For interactive elements
<button aria-label="Close modal" onClick={onClose}>
  ✕
</button>

// For form fields
<label htmlFor="project-select">Project</label>
<select id="project-select">
  {/* options */}
</select>

// For screen readers
<span aria-hidden="true">→</span>
```

### Keyboard Navigation

```
Escape   → Close modal/drawer
Tab      → Move to next focusable element
Shift+Tab → Move to previous focusable element
Enter    → Activate button/submit form
Space    → Toggle checkbox/button
```

---

## Performance Tips

### 1. Memoize Column Definitions

```tsx
const columns = useMemo(() => [
  {
    accessorKey: "name",
    header: "Name",
  },
  // ... more columns
], []);

// Use in DataTable
<DataTable columns={columns} data={data} />
```

### 2. Debounce Search Input

```tsx
const [searchTerm, setSearchTerm] = useState("");

const debouncedSearch = useMemo(() => {
  return debounce((term: string) => {
    // Perform search
  }, 300);
}, []);

const handleSearch = (value: string) => {
  setSearchTerm(value);
  debouncedSearch(value);
};
```

### 3. Use Pagination for Large Lists

```tsx
// For tables with 1000+ rows, implement pagination
const itemsPerPage = 50;
const totalPages = Math.ceil(data.length / itemsPerPage);
const currentPageData = data.slice(
  currentPage * itemsPerPage,
  (currentPage + 1) * itemsPerPage
);

<DataTable columns={columns} data={currentPageData} />
```

### 4. Virtual Scrolling (Future)

```tsx
// For very large tables (10000+ rows)
// Consider implementing virtual scrolling via @tanstack/react-virtual
```

---

## Code Examples

### Example 1: Complete Task Management Page

```tsx
"use client";
import { useState, useRef } from "react";
import { DataTable } from "@/components/ui/DataTable";
import TaskDrawer from "@/components/tareas/TaskDrawer";
import NewTaskModal from "@/components/tareas/NewTaskModal";
import KpiCard from "@/components/dashboard/KpiCard";
import Badge from "@/components/ui/Badge";

export default function TasksPage() {
  const [tasks, setTasks] = useState([
    // ... tasks data
  ]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const newBtnRef = useRef<HTMLButtonElement>(null);

  const stats = {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === "Pendiente").length,
    inProgress: tasks.filter((t) => t.status === "En Proceso").length,
  };

  const columns = [
    { accessorKey: "description", header: "Descripción" },
    {
      accessorKey: "status",
      header: "Estado",
      cell: (info: any) => (
        <Badge
          label={info.getValue()}
          color={
            info.getValue() === "Pendiente"
              ? "yellow"
              : "blue"
          }
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard title="Total" value={String(stats.total)} />
        <KpiCard title="Pendientes" value={String(stats.pending)} />
        <KpiCard title="En Proceso" value={String(stats.inProgress)} />
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Tareas</h2>
        <button
          ref={newBtnRef}
          onClick={() => setShowNewModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Nueva Tarea
        </button>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={tasks}
        onRowClick={(task) => setSelectedTask(task)}
        searchPlaceholder="Buscar tareas..."
      />

      {/* Drawer */}
      {selectedTask && (
        <TaskDrawer
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onSave={(updated) => {
            setTasks(tasks.map((t) => (t.id === updated.id ? updated : t)));
            setSelectedTask(null);
          }}
          teamMembers={["Team"]}
        />
      )}

      {/* New Task Modal */}
      <NewTaskModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        onSave={(form) => {
          // Create task
          setShowNewModal(false);
        }}
        projects={["Project 1", "Project 2"]}
        teamMembers={["Team"]}
        phaseOptions={["Inicial", "En Proceso"]}
        triggerRef={newBtnRef}
      />
    </div>
  );
}
```

---

### Example 2: Team Members Display

```tsx
"use client";
import { DataTable } from "@/components/ui/DataTable";
import Avatar from "@/components/ui/Avatar";
import { ColumnDef } from "@tanstack/react-table";

type TeamMember = {
  id: number;
  name: string;
  role: string;
  email: string;
  avatar?: string;
  availability: string;
};

export default function TeamPage({ members }: { members: TeamMember[] }) {
  const columns: ColumnDef<TeamMember>[] = [
    {
      accessorKey: "name",
      header: "Member",
      cell: (info) => (
        <Avatar
          name={info.getValue() as string}
          imageSrc={info.row.original.avatar}
          showName
        />
      ),
    },
    {
      accessorKey: "role",
      header: "Role",
    },
    {
      accessorKey: "email",
      header: "Email",
    },
    {
      accessorKey: "availability",
      header: "Availability",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Equipo</h1>
      </div>
      <DataTable
        columns={columns}
        data={members}
        searchPlaceholder="Buscar miembros..."
      />
    </div>
  );
}
```

---

### Example 3: Projects Overview Dashboard

```tsx
import KpiCard from "@/components/dashboard/KpiCard";
import ProjectCard from "@/components/proyectos/ProjectCard";
import { fetchProjects } from "@/lib/repositories/projects-repository";

export default async function ProjectsDashboard() {
  const projects = await fetchProjects();

  const stats = {
    total: projects.length,
    active: projects.filter((p) => p.status === "Activo").length,
    atRisk: projects.filter((p) => p.phase === "En Riesgo").length,
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard title="Total Projects" value={String(stats.total)} />
        <KpiCard title="Active" value={String(stats.active)} />
        <KpiCard title="At Risk" value={String(stats.atRisk)} />
      </div>

      {/* Projects Grid */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Active Projects</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects
            .filter((p) => p.status === "Activo")
            .map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
        </div>
      </div>
    </div>
  );
}
```

---

## Troubleshooting

### Modal doesn't close on Escape
- Ensure `DialogOverlay` is wrapping the content
- Check that `onClose` handler is properly set

### Focus not returning after closing modal
- Pass `triggerRef` to `DialogOverlay`
- Ensure trigger element is a valid focusable element (button, link, input)

### Table not sorting
- Check that `accessorKey` matches data property name
- Ensure column definition includes sortable: true (default)

### Avatar showing as initials instead of image
- Verify `imageSrc` URL is correct
- Check CORS if loading from external domain
- Use `unoptimized` prop if using Next.js Image component

### Badge color not displaying
- Ensure `color` prop matches: "yellow" | "green" | "blue" | "red" | "gray" | "purple"
- Check TailwindCSS color config includes all badge colors

---

## Best Practices Checklist

- [ ] Use `DataTable` for list displays (not hand-rolled `<table>`)
- [ ] Wrap modals/drawers with `DialogOverlay` for accessibility
- [ ] Pass `triggerRef` to dialogs for focus management
- [ ] Use semantic `color` values for badges (yellow=pending, blue=progress, etc.)
- [ ] Validate forms before submission
- [ ] Handle loading/error states
- [ ] Use server components where possible
- [ ] Memoize column definitions for tables
- [ ] Keep modals width < 700px, drawers at 560px
- [ ] Add empty state messages to tables
- [ ] Test keyboard navigation (Tab, Escape)
- [ ] Provide alt text for images
- [ ] Use responsive grid layouts
- [ ] Follow spacing conventions (p-6, gap-4)
- [ ] Use existing components before creating new ones

---

## Quick Reference

| Need | Component | File |
|------|-----------|------|
| Table | DataTable | `components/ui/DataTable.tsx` |
| Modal/Drawer | DialogOverlay | `components/ui/DialogOverlay.tsx` |
| User | Avatar | `components/ui/Avatar.tsx` |
| Status | Badge | `components/ui/Badge.tsx` |
| Multi-select | TeamMultiSelect | `components/ui/TeamMultiSelect.tsx` |
| Metric | KpiCard | `components/dashboard/KpiCard.tsx` |
| Project | ProjectCard | `components/proyectos/ProjectCard.tsx` |
| New Task | NewTaskModal | `components/tareas/NewTaskModal.tsx` |
| Task Detail | TaskDrawer | `components/tareas/TaskDrawer.tsx` |

---

**Last Updated:** September 2, 2026
**Maintainer:** UI/Component Team
