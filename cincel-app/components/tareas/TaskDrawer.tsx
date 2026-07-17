"use client";

import { useEffect, useState } from "react";
import type {
  Task,
  TaskChecklistItem,
} from "@/lib/types/task";

type Props = {
  task: Task | null;
  onClose: () => void;
  onSave: (task: Task) => void;
};

export default function TaskDrawer({
  task,
  onClose,
  onSave,
}: Props) {

  const [form, setForm] = useState<Task | null>(null);

  const [newChecklist, setNewChecklist] =
    useState("");

  useEffect(() => {
    setForm(task);
  }, [task]);

  if (!form) return null;

  function updateField(
    field: keyof Task,
    value: any
  ) {
    setForm({
      ...form,
      [field]: value,
    });
  }

  function toggleChecklist(id: number) {

    updateField(
      "checklist",
      form.checklist.map((item) =>
        item.id === id
          ? {
              ...item,
              completed: !item.completed,
            }
          : item
      )
    );

  }

  function addChecklist() {

    if (!newChecklist.trim()) return;

    const newItem: TaskChecklistItem = {
      id: Date.now(),
      title: newChecklist,
      completed: false,
    };

    updateField(
      "checklist",
      [...form.checklist, newItem]
    );

    setNewChecklist("");

  }

  return (

    <div className="fixed inset-0 bg-black/40 flex justify-end z-50">

      <div className="w-[560px] h-full bg-white overflow-y-auto shadow-xl">

        {/* HEADER */}

        <div className="p-6 border-b flex justify-between items-center">

          <h2 className="text-2xl font-bold">
            Tarea
          </h2>

          <button
            onClick={onClose}
            className="text-2xl"
          >
            ✕

          </button>

        </div>

        {/* BODY */}

        <div className="p-6 space-y-6">

          <div>

            <label className="font-semibold">

              Descripción

            </label>

            <input
              className="mt-2 w-full border rounded-xl p-3"
              value={form.description}
              onChange={(e)=>
                updateField(
                  "description",
                  e.target.value
                )
              }
            />

          </div>

          <div>

            <label className="font-semibold">

              Seguimiento

            </label>

            <textarea
              rows={5}
              className="mt-2 w-full border rounded-xl p-3"
              value={form.notes}
              onChange={(e)=>
                updateField(
                  "notes",
                  e.target.value
                )
              }
            />

          </div>

          <div>

            <label className="font-semibold">

              Checklist

            </label>

            <div className="mt-3 space-y-2">

              {form.checklist.map((item)=>(
                <label
                  key={item.id}
                  className="flex gap-3 items-center"
                >

                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={()=>
                      toggleChecklist(item.id)
                    }
                  />

                  {item.title}

                </label>
              ))}

            </div>

            <div className="flex gap-2 mt-4">

              <input
                className="flex-1 border rounded-xl p-3"
                placeholder="Nuevo elemento..."
                value={newChecklist}
                onChange={(e)=>
                  setNewChecklist(e.target.value)
                }
              />

              <button
                onClick={addChecklist}
                className="bg-blue-600 text-white px-4 rounded-xl"
              >

                Agregar

              </button>

            </div>

          </div>

          <div className="grid grid-cols-2 gap-4">

            <div>

              <label className="font-semibold">

                Compromiso

              </label>

              <input
                type="date"
                className="mt-2 w-full border rounded-xl p-3"
                value={form.commitmentDate}
                onChange={(e)=>
                  updateField(
                    "commitmentDate",
                    e.target.value
                  )
                }
              />

            </div>

            <div>

              <label className="font-semibold">

                Próxima revisión

              </label>

              <input
                type="date"
                className="mt-2 w-full border rounded-xl p-3"
                value={form.reviewDate}
                onChange={(e)=>
                  updateField(
                    "reviewDate",
                    e.target.value
                  )
                }
              />

            </div>

          </div>

        </div>

        {/* FOOTER */}

        <div className="border-t p-6 flex justify-end gap-3">

          <button
            onClick={onClose}
            className="border rounded-xl px-5 py-3"
          >

            Cancelar

          </button>

          <button
            onClick={() => onSave(form)}
            className="bg-blue-600 text-white rounded-xl px-5 py-3"
          >

            Guardar cambios

          </button>

        </div>

      </div>

    </div>

  );

}