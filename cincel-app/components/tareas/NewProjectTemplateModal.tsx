"use client";

import { useMemo, useState } from "react";

type TemplateItem = {
  phase: string;
  description: string;
};

type Props = {
  open: boolean;
  templateItems: TemplateItem[];
  onClose: () => void;
  onCreate: (payload: { project: string; items: TemplateItem[] }) => void;
};

export default function NewProjectTemplateModal({
  open,
  templateItems,
  onClose,
  onCreate,
}: Props) {
  const itemKey = (item: TemplateItem) => `${item.phase}::${item.description}`;

  const [project, setProject] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>(
    () => templateItems.map((item) => itemKey(item))
  );

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
      <div className="w-[760px] rounded-2xl bg-white shadow-xl">
        <div className="border-b p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Iniciar plantilla de proyecto</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-xl text-slate-500 hover:text-black"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="space-y-6 p-6">
          <div>
            <label className="mb-2 block font-medium">Nombre del proyecto</label>
            <input
              type="text"
              value={project}
              onChange={(event) => setProject(event.target.value)}
              placeholder="Ej. Casa Valle"
              className="w-full rounded-xl border px-4 py-3"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block font-medium">Descripciones iniciales</label>
              <button
                type="button"
                onClick={() => setSelectedKeys(templateItems.map((item) => itemKey(item)))}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Seleccionar todas
              </button>
            </div>

            <div className="max-h-72 space-y-2 overflow-auto rounded-xl border border-slate-200 p-3">
              {groupedTemplateItems.map((group) => (
                <div key={group.phase} className="rounded-xl border border-slate-100 bg-white/80 p-2">
                  <div className="border-b border-slate-100 px-2 pb-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
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
                          <span className="text-sm text-slate-700">{item.description}</span>
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
            className="rounded-xl border px-5 py-3 hover:bg-slate-50"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleCreate}
            disabled={project.trim().length === 0 || selectedItems.length === 0}
            className="rounded-xl bg-blue-600 px-5 py-3 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Crear plantilla
          </button>
        </div>
      </div>
    </div>
  );
}
