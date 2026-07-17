import ProjectModuleCard from "./ProjectModuleCard";

export default function ProjectModules() {
  return (

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mt-8">

      <ProjectModuleCard
        title="Tareas"
        icon="📋"
        total={12}
        subtitle="Tareas del proyecto"
      />

      <ProjectModuleCard
        title="Equipo"
        icon="👷"
        total={4}
        subtitle="Colaboradores"
      />

      <ProjectModuleCard
        title="Documentos"
        icon="📄"
        total={35}
        subtitle="Archivos"
      />

      <ProjectModuleCard
        title="Calendario"
        icon="📅"
        total={5}
        subtitle="Eventos"
      />

      <ProjectModuleCard
        title="Proveedores"
        icon="🚚"
        total={18}
        subtitle="Contratistas"
      />

      <ProjectModuleCard
        title="Minutas"
        icon="📝"
        total={7}
        subtitle="Reuniones"
      />

      <ProjectModuleCard
        title="Fotografías"
        icon="📷"
        total={243}
        subtitle="Fotos"
      />

      <ProjectModuleCard
        title="Recursos"
        icon="💰"
        total={12}
        subtitle="Materiales"
      />

    </div>

  );
}