const agenda = [
  {
    time: "09:00",
    title: "Reunión con cliente Platzi",
  },
  {
    time: "11:30",
    title: "Revisión Proyecto Ensenada",
  },
  {
    time: "16:00",
    title: "Junta interna de diseño",
  },
];

export default function AgendaToday() {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">

      <h2 className="text-xl font-semibold text-slate-900 mb-6">
        Agenda de hoy
      </h2>

      <div className="space-y-5">

        {agenda.map((item) => (
          <div
            key={`${item.time}-${item.title}`}
            className="flex items-center gap-4"
          >

            <div className="font-semibold text-blue-600 w-16">
              {item.time}
            </div>

            <div className="text-slate-700">
              {item.title}
            </div>

          </div>
        ))}

      </div>

    </section>
  );
}