"use client";

import { useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;

  onSave: (task: {
    description: string;
    manager: string;
    status: string;
    notes: string;
    commitmentDate: string;
    reviewDate: string;
  }) => void;
};

export default function NewTaskModal({
  open,
  onClose,
  onSave,
}: Props) {

  const [description, setDescription] = useState("");
  const [manager, setManager] = useState("Juanma");
  const [status, setStatus] = useState("Pendiente");
  const [notes, setNotes] = useState("");

  const [commitmentDate, setCommitmentDate] = useState("");
  const [reviewDate, setReviewDate] = useState("");

  if (!open) return null;

  function handleSave() {

    if (!description.trim()) return;

    onSave({
      description,
      manager,
      status,
      notes,
      commitmentDate,
      reviewDate,
    });

    setDescription("");
    setManager("Juanma");
    setStatus("Pendiente");
    setNotes("");
    setCommitmentDate("");
    setReviewDate("");

    onClose();
  }

  return (

    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">

      <div className="bg-white rounded-2xl w-[700px] shadow-xl">

        {/* Encabezado */}

        <div className="p-6 border-b">

          <div className="flex justify-between items-center">

            <h2 className="text-2xl font-bold">
              Nueva tarea
            </h2>

            <button
              onClick={onClose}
              className="text-slate-500 hover:text-black text-xl"
            >
              ✕
            </button>

          </div>

        </div>

        {/* Contenido */}

        <div className="p-6 space-y-6">

          <div>

            <label className="block mb-2 font-medium">
              Descripción
            </label>

            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe la tarea..."
              className="w-full border rounded-xl px-4 py-3"
            />

          </div>

          <div className="grid grid-cols-2 gap-5">

            <div>

              <label className="block mb-2 font-medium">
                Responsable
              </label>

              <select
                value={manager}
                onChange={(e) => setManager(e.target.value)}
                className="w-full border rounded-xl px-4 py-3"
              >
                <option>Paul</option>
                <option>Juanma</option>
                <option>Rafa</option>
                <option>Aaron</option>
                <option>Gabriel</option>
                <option>Alejandro</option>
                <option>Rodrigo</option>
              </select>

            </div>

            <div>

              <label className="block mb-2 font-medium">
                Estado
              </label>

              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full border rounded-xl px-4 py-3"
              >
                <option>Pendiente</option>
                <option>En proceso</option>
                <option>Completado</option>
                <option>Bloqueado</option>
              </select>

            </div>

          </div>

          <div>

            <label className="block mb-2 font-medium">
              Seguimiento
            </label>

            <textarea
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Escribe el seguimiento inicial..."
              className="w-full border rounded-xl p-4"
            />

          </div>

          <div className="grid grid-cols-2 gap-5">

            <div>

              <label className="block mb-2 font-medium">
                Fecha compromiso
              </label>

              <input
                type="date"
                value={commitmentDate}
                onChange={(e) =>
                  setCommitmentDate(e.target.value)
                }
                className="w-full border rounded-xl px-4 py-3"
              />

            </div>

            <div>

              <label className="block mb-2 font-medium">
                Próxima revisión
              </label>

              <input
                type="date"
                value={reviewDate}
                onChange={(e) =>
                  setReviewDate(e.target.value)
                }
                className="w-full border rounded-xl px-4 py-3"
              />

            </div>

          </div>

        </div>

        {/* Botones */}

        <div className="p-6 border-t flex justify-end gap-3">

          <button
            onClick={onClose}
            className="border px-5 py-3 rounded-xl hover:bg-slate-50"
          >
            Cancelar
          </button>

          <button
            onClick={handleSave}
            className="bg-blue-600 text-white px-5 py-3 rounded-xl hover:bg-blue-700"
          >
            Guardar
          </button>

        </div>

      </div>

    </div>

  );
}