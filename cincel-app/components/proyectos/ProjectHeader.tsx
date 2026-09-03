import AppAvatar from "@/components/ui/AppAvatar";

type Props = {
  name: string;
  client: string;
  manager: string;
  coordinator: string;
  phase: string;
  progress: number;
  status: string;
};

export default function ProjectHeader({
  name,
  client,
  manager,
  coordinator,
  phase,
  progress,
  status,
}: Props) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">

      <div className="flex justify-between items-start">

        <div>

          <h1 className="text-4xl font-bold">
            {name}
          </h1>

          <p className="text-slate-500 mt-2">
            {client}
          </p>

        </div>

        <span
          className={`rounded-full px-4 py-2 font-medium ${
            status === "Activo"
              ? "bg-green-100 text-green-700"
              : "bg-slate-100 text-slate-700"
          }`}
        >
          {status}
        </span>

      </div>

      <div className="mt-8 grid grid-cols-4 gap-8">

        <div>

          <p className="text-sm text-slate-500">
            Fase
          </p>

          <p className="font-semibold mt-1">
            {phase}
          </p>

        </div>

        <div>

          <p className="text-sm text-slate-500">
            Responsable
          </p>

          <div className="flex items-center gap-3 mt-2">

            <AppAvatar
              name={manager}
            />

          </div>

        </div>

        <div>

          <p className="text-sm text-slate-500">
            Encargado
          </p>

          <div className="flex items-center gap-3 mt-2">

            <AppAvatar
              name={coordinator}
            />

          </div>

        </div>

        <div>

          <p className="text-sm text-slate-500">
            Avance
          </p>

          <div className="mt-3">

            <div className="h-3 bg-slate-200 rounded-full">

              <div
                className="h-3 rounded-full bg-blue-600"
                style={{
                  width: `${progress}%`,
                }}
              />

            </div>

            <p className="mt-2 font-semibold">
              {progress}%
            </p>

          </div>

        </div>

      </div>

    </div>
  );
}