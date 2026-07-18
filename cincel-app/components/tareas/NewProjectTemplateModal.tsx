"use client";

import { useEffect, useMemo, useState } from "react";

type TemplateItem = {
  phase: string;
  description: string;
};

type Props = {
  open: boolean;
  templateItems: TemplateItem[];
  projectOptions: string[];
  onClose: () => void;
  onCreate: (payload: { project: string; items: TemplateItem[] }) => void;
};

export default function NewProjectTemplateModal({
  open,
  templateItems,
  projectOptions,
  onClose,
  onCreate,
}: Props) {
  const itemKey = (item: TemplateItem) => `${item.phase}::${item.description}`;

  const [project, setProject] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>(
    () => templateItems.map((item) => itemKey(item))
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setProject(projectOptions[0] ?? "");
    setSelectedKeys(templateItems.map((item) => itemKey(item)));
  }, [open, projectOptions, templateItems]);

  const groupedTemplateItems = useMemo(() => {
    const groups: Array<{ phase: string; items: TemplateItem[] }> = [];

    templateItems.forEach((item) => {
      const existingGroup = groups.find((group) => group.phase === item.phase);

      if (existingGroup) {
        existingGroup.items.push(item);
        return;
      }

      groups.push({
        phase: item.phase,
        items: [item],
      });
    });

    return groups;
  }, [templateItems]);

  const selectedItems = useMemo(() => {
    return templateItems.filter((item) => selectedKeys.includes(itemKey(item)));
  }, [templateItems, selectedKeys]);

  if (!open) return null;

  const toggleItem = (item: TemplateItem) => {
    const key = itemKey(item);

    setSelectedKeys((current) => {
      if (current.includes(key)) {
        return current.filter((itemKeyValue) => itemKeyValue !== key);
      }

      return [...current, key];
    });
  };

  const handleCreate = () => {
    const trimmedProject = project.trim();

    if (!trimmedProject || selectedItems.length === 0) {
      return;
    }

    onCreate({
      project: trimmedProject,
      items: selectedItems,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[760px] rounded-2xl bg-white shadow-xl text-black">
        <div className="border-b p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-black">Iniciar plantilla de proyecto</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-xl text-black hover:text-slate-700"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="space-y-6 p-6">
          <div>
            <label className="mb-2 block font-medium text-black">Nombre del proyecto</label>
            <select
              value={project}
              onChange={(event) => setProject(event.target.value)}
              className="w-full rounded-xl border bg-white px-4 py-3 text-black"
            >
              {projectOptions.length === 0 ? (
                <option value="">No hay proyectos activos disponibles</option>
              ) : null}
              {projectOptions.map((projectOption) => (
                <option key={projectOption} value={projectOption}>
                  {projectOption}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block font-medium text-black">Descripciones iniciales</label>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setSelectedKeys(templateItems.map((item) => itemKey(item)))}
                  className="text-sm font-medium text-blue-700 hover:text-blue-800"
                >
                  Seleccionar todas
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedKeys([])}
                  className="text-sm font-medium text-slate-900 hover:text-black"
                >
                  Borrar todas
                </button>
              </div>
            </div>

            <div className="max-h-72 space-y-2 overflow-auto rounded-xl border border-slate-200 p-3">
              {groupedTemplateItems.map((group) => (
                <div key={group.phase} className="rounded-xl border border-slate-100 bg-white/80 p-2">
                  <div className="border-b border-slate-100 px-2 pb-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-800">
                    {group.phase}
                  </div>

                  <div className="mt-1 space-y-1">
                    {group.items.map((item) => {
                      const key = itemKey(item);
                      const checked = selectedKeys.includes(key);

                      return (
                        <label
                          key={key}
                          className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleItem(item)}
                            className="mt-1"
                          />
                          <span className="text-sm text-black">{item.description}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t p-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border px-5 py-3 text-black hover:bg-slate-50"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleCreate}
            disabled={project.trim().length === 0 || selectedItems.length === 0 || projectOptions.length === 0}
            className="rounded-xl bg-blue-600 px-5 py-3 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Crear plantilla
          </button>
        </div>
      </div>
    </div>
  );
}
