"use client";

import { useEffect, useMemo, useState } from "react";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import { teamMembers, type TeamAvailability, type TeamMember } from "@/lib/data/team";
import { presaleTasks } from "@/lib/data/presale";
import { disenoTasks } from "@/lib/data/diseno";
import { operativasTasks } from "@/lib/data/operativas";

type MemberDraft = {
  name: string;
  role: string;
  area: string;
  capacity: number;
  availability: TeamAvailability;
};

const emptyDraft: MemberDraft = {
  name: "",
  role: "",
  area: "",
  capacity: 8,
  availability: "Disponible",
};

const availabilityOptions: TeamAvailability[] = [
  "Disponible",
  "En campo",
  "Foco",
  "No disponible",
];

const TEAM_MEMBERS_STORAGE_KEY = "cincel.team.members.v1";

function availabilityBadgeColor(status: TeamAvailability): "yellow" | "green" | "blue" | "red" | "gray" | "purple" {
  if (status === "Disponible") return "green";
  if (status === "En campo") return "blue";
  if (status === "Foco") return "purple";
  return "red";
}

function loadBadgeColor(percent: number, isActive: boolean): "yellow" | "green" | "blue" | "red" | "gray" | "purple" {
  if (!isActive) return "gray";
  if (percent >= 100) return "red";
  if (percent >= 75) return "yellow";
  return "green";
}

function loadLabel(percent: number, isActive: boolean): string {
  if (!isActive) return "Inactivo";
  if (percent >= 100) return "Saturado";
  if (percent >= 75) return "Carga alta";
  return "Disponible";
}

export default function EquipoPage() {
  const [members, setMembers] = useState<TeamMember[]>(() => {
    if (typeof window === "undefined") {
      return teamMembers;
    }

    const stored = localStorage.getItem(TEAM_MEMBERS_STORAGE_KEY);

    if (!stored) {
      return teamMembers;
    }

    try {
      const parsed = JSON.parse(stored) as TeamMember[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      localStorage.removeItem(TEAM_MEMBERS_STORAGE_KEY);
    }

    return teamMembers;
  });
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<MemberDraft>(emptyDraft);
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("Todas");
  const [availabilityFilter, setAvailabilityFilter] = useState("Todas");

  useEffect(() => {
    localStorage.setItem(TEAM_MEMBERS_STORAGE_KEY, JSON.stringify(members));
  }, [members]);

  const allTasks = [...presaleTasks, ...disenoTasks, ...operativasTasks];
  const activeTasks = allTasks.filter((task) => !task.archived && task.status !== "Completado");

  const membersWithWorkload = useMemo(() => {
    return members.map((member) => {
      const assigned = activeTasks.filter((task) => task.manager === member.name).length;
      const support = activeTasks.filter((task) => task.support.includes(member.name)).length;
      const total = assigned + support;

      const projects = Array.from(
        new Set(
          activeTasks
            .filter((task) => task.manager === member.name || task.support.includes(member.name))
            .map((task) => task.project)
        )
      );

      const occupancy = Math.round((total / Math.max(member.capacity, 1)) * 100);

      return {
        ...member,
        assigned,
        support,
        total,
        projects,
        occupancy,
        loadLabel: loadLabel(occupancy, member.active),
      };
    });
  }, [members, activeTasks]);

  const areaOptions = useMemo(() => {
    const values = Array.from(new Set(membersWithWorkload.map((member) => member.area))).sort((a, b) =>
      a.localeCompare(b)
    );

    return ["Todas", ...values];
  }, [membersWithWorkload]);

  const filteredMembers = membersWithWorkload.filter((member) => {
    const searchValue = search.trim().toLowerCase();
    const matchesSearch =
      !searchValue ||
      member.name.toLowerCase().includes(searchValue) ||
      member.role.toLowerCase().includes(searchValue) ||
      member.area.toLowerCase().includes(searchValue);

    const matchesArea = areaFilter === "Todas" || member.area === areaFilter;
    const matchesAvailability =
      availabilityFilter === "Todas" || member.availability === availabilityFilter;

    return matchesSearch && matchesArea && matchesAvailability;
  });

  const activeVisibleMembers = filteredMembers.filter((member) => member.active);
  const inactiveVisibleMembers = filteredMembers.filter((member) => !member.active);

  const activeMembers = membersWithWorkload.filter((member) => member.active);

  const overloadedCount = activeMembers.filter((member) => member.occupancy >= 100).length;
  const availableCount = activeMembers.filter((member) => member.occupancy < 75).length;
  const inactiveCount = membersWithWorkload.filter((member) => !member.active).length;

  const openAddEditor = () => {
    setEditingId(null);
    setDraft(emptyDraft);
    setFormError("");
    setShowEditor(true);
  };

  const openEditEditor = (member: TeamMember) => {
    setEditingId(member.id);
    setDraft({
      name: member.name,
      role: member.role,
      area: member.area,
      capacity: member.capacity,
      availability: member.availability,
    });
    setFormError("");
    setShowEditor(true);
  };

  const saveMember = () => {
    const name = draft.name.trim();
    const role = draft.role.trim();
    const area = draft.area.trim();

    if (!name || !role || !area || draft.capacity < 1) {
      setFormError("Completa nombre, rol, area y una capacidad valida.");
      return;
    }

    const normalized = name.toLowerCase();
    const duplicated = members.some(
      (member) => member.name.toLowerCase() === normalized && member.id !== editingId
    );

    if (duplicated) {
      setFormError("Ya existe un colaborador con ese nombre.");
      return;
    }

    if (editingId === null) {
      const nextId = members.reduce((max, member) => Math.max(max, member.id), 0) + 1;
      const newMember: TeamMember = {
        id: nextId,
        name,
        role,
        area,
        capacity: draft.capacity,
        availability: draft.availability,
        active: true,
      };

      setMembers((current) => [...current, newMember]);
    } else {
      setMembers((current) =>
        current.map((member) =>
          member.id === editingId
            ? {
                ...member,
                name,
                role,
                area,
                capacity: draft.capacity,
                availability: draft.availability,
              }
            : member
        )
      );
    }

    setFormError("");
    setShowEditor(false);
  };

  const toggleMemberActive = (id: number) => {
    setMembers((current) =>
      current.map((member) => {
        if (member.id !== id) {
          return member;
        }

        const nextActive = !member.active;

        return {
          ...member,
          active: nextActive,
          availability: nextActive && member.availability === "No disponible"
            ? "Disponible"
            : !nextActive
              ? "No disponible"
              : member.availability,
        };
      })
    );
  };

  return (
    <main className="flex min-h-screen bg-slate-100">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <Header />

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-3xl font-bold">Equipo</h1>
                <p className="mt-1 text-slate-500">Avatares, capacidad y carga actual de colaboradores.</p>
              </div>

              <button
                type="button"
                onClick={openAddEditor}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                + Agregar colaborador
              </button>
            </div>
          </div>

          <div className="grid gap-4 border-b border-slate-200 p-6 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm text-slate-500">Activos</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{activeMembers.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm text-slate-500">Desactivados</p>
              <p className="mt-1 text-2xl font-bold text-slate-700">{inactiveCount}</p>
            </div>
            <div className="rounded-xl border border-red-100 bg-red-50/60 px-4 py-3">
              <p className="text-sm text-slate-500">Saturados</p>
              <p className="mt-1 text-2xl font-bold text-red-700">{overloadedCount}</p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
              <p className="text-sm text-slate-500">Disponibles</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{availableCount}</p>
            </div>
          </div>

          <div className="border-b border-slate-200 px-6 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar colaborador, rol o area..."
                className="w-72 rounded-xl border border-slate-200 px-4 py-2 text-sm"
              />

              <select
                value={areaFilter}
                onChange={(event) => setAreaFilter(event.target.value)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
              >
                {areaOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <select
                value={availabilityFilter}
                onChange={(event) => setAvailabilityFilter(event.target.value)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
              >
                <option value="Todas">Todas las disponibilidades</option>
                {availabilityOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto p-6">
            <table className="min-w-[1200px] w-full">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Colaborador</th>
                  <th className="px-4 py-3">Rol</th>
                  <th className="px-4 py-3">Area</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Disponibilidad</th>
                  <th className="px-4 py-3">Asignadas</th>
                  <th className="px-4 py-3">Soporte</th>
                  <th className="px-4 py-3">Carga</th>
                  <th className="px-4 py-3">Proyectos activos</th>
                  <th className="px-4 py-3">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {activeVisibleMembers.map((member) => (
                  <tr key={member.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <Avatar name={member.name} />
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">{member.role}</td>
                    <td className="px-4 py-3 text-sm">{member.area}</td>
                    <td className="px-4 py-3">
                      <Badge label={member.active ? "Activo" : "Inactivo"} color={member.active ? "blue" : "gray"} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={member.availability} color={availabilityBadgeColor(member.availability)} />
                    </td>
                    <td className="px-4 py-3 text-sm">{member.assigned}</td>
                    <td className="px-4 py-3 text-sm">{member.support}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Badge label={member.loadLabel} color={loadBadgeColor(member.occupancy, member.active)} />
                        <span className="text-xs">{member.occupancy}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {member.projects.length === 0 ? (
                        <span className="text-sm text-slate-400">Sin proyectos</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {member.projects.map((project) => (
                            <span key={`${member.id}-${project}`} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
                              {project}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEditEditor(member)}
                          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          Editar
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleMemberActive(member.id)}
                          className="rounded-lg border border-amber-200 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
                        >
                          Desactivar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {activeVisibleMembers.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-500">
                      No hay colaboradores activos con los filtros actuales.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-200 px-6 pb-6">
            <div className="mb-4 mt-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">Desactivados</h2>
              <span className="text-sm text-slate-500">{inactiveVisibleMembers.length} visibles</span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-[920px] w-full">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Colaborador</th>
                    <th className="px-4 py-3">Rol</th>
                    <th className="px-4 py-3">Area</th>
                    <th className="px-4 py-3">Disponibilidad</th>
                    <th className="px-4 py-3">Proyectos activos</th>
                    <th className="px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {inactiveVisibleMembers.map((member) => (
                    <tr key={member.id} className="border-b border-slate-100 bg-slate-50/60 text-slate-600">
                      <td className="px-4 py-3">
                        <Avatar name={member.name} />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">{member.role}</td>
                      <td className="px-4 py-3 text-sm">{member.area}</td>
                      <td className="px-4 py-3">
                        <Badge label={member.availability} color={availabilityBadgeColor(member.availability)} />
                      </td>
                      <td className="px-4 py-3">
                        {member.projects.length === 0 ? (
                          <span className="text-sm text-slate-400">Sin proyectos</span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {member.projects.map((project) => (
                              <span key={`${member.id}-inactive-${project}`} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
                                {project}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openEditEditor(member)}
                            className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-white"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleMemberActive(member.id)}
                            className="rounded-lg border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                          >
                            Reactivar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {inactiveVisibleMembers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                        No hay colaboradores desactivados con los filtros actuales.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {showEditor ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl">
              <div className="border-b p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">{editingId === null ? "Agregar colaborador" : "Editar colaborador"}</h2>
                  <button
                    type="button"
                    onClick={() => setShowEditor(false)}
                    className="text-xl text-slate-400 hover:text-slate-700"
                    aria-label="Cerrar"
                  >
                    x
                  </button>
                </div>
              </div>

              <div className="grid gap-4 p-6 md:grid-cols-2">
                {formError ? (
                  <div className="md:col-span-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {formError}
                  </div>
                ) : null}

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium">Nombre</label>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    className="w-full rounded-xl border px-4 py-2"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">Rol</label>
                  <input
                    type="text"
                    value={draft.role}
                    onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value }))}
                    className="w-full rounded-xl border px-4 py-2"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">Area</label>
                  <input
                    type="text"
                    value={draft.area}
                    onChange={(event) => setDraft((current) => ({ ...current, area: event.target.value }))}
                    className="w-full rounded-xl border px-4 py-2"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">Capacidad</label>
                  <input
                    type="number"
                    min={1}
                    value={draft.capacity}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      setDraft((current) => ({ ...current, capacity: Number.isNaN(parsed) ? 1 : parsed }));
                    }}
                    className="w-full rounded-xl border px-4 py-2"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">Disponibilidad</label>
                  <select
                    value={draft.availability}
                    onChange={(event) => setDraft((current) => ({ ...current, availability: event.target.value as TeamAvailability }))}
                    className="w-full rounded-xl border px-4 py-2"
                  >
                    {availabilityOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t p-6">
                <button
                  type="button"
                  onClick={() => {
                    setFormError("");
                    setShowEditor(false);
                  }}
                  className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={saveMember}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}