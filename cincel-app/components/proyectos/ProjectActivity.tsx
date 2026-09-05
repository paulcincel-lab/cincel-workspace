export default function ProjectActivity() {
  const activities = [
    {
      id: 1,
      user: "Juanma",
      action: "Terminó",
      item: "Plano Planta Baja",
      time: "Hace 15 minutos",
    },
    {
      id: 2,
      user: "Alejandro",
      action: "Subió",
      item: "Reporte fotográfico #18",
      time: "Hace 2 horas",
    },
    {
      id: 3,
      user: "Paul",
      action: "Creó",
      item: "Minuta de reunión",
      time: "Hace 5 horas",
    },
    {
      id: 4,
      user: "Rafa",
      action: "Asignó",
      item: "5 tareas nuevas",
      time: "Ayer",
    },
  ];

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm mt-8">

      <div className="p-6 border-b border-border">

        <h2 className="text-2xl font-bold">
          Actividad reciente
        </h2>

      </div>

      <div>

        {activities.map((activity) => (

          <div
            key={activity.id}
            className="p-6 border-b last:border-b-0 border-border"
          >

            <p className="font-semibold">

              {activity.user}

              <span className="font-normal text-muted-foreground">

                {" "}

                {activity.action}

              </span>

            </p>

            <p className="mt-1">

              {activity.item}

            </p>

            <p className="text-sm text-muted-foreground mt-2">

              {activity.time}

            </p>

          </div>

        ))}

      </div>

    </div>
  );
}