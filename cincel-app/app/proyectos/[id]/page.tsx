import { notFound } from "next/navigation";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

import ProjectHeader from "@/components/proyectos/ProjectHeader";
import ProjectModules from "@/components/proyectos/ProjectModules";
import ProjectActivity from "@/components/proyectos/ProjectActivity";

import { projects } from "@/lib/data/projects";

type Props = {
  params: {
    id: string;
  };
};

export default function ProjectDetailPage({ params }: Props) {
  const project = projects.find(
    (p) => p.id === Number(params.id)
  );

  if (!project) {
    notFound();
  }

  return (
    <main className="flex min-h-screen bg-slate-100">
      <Sidebar />

      <section className="flex-1 p-10 overflow-y-auto">
        <Header />

        <ProjectHeader
          name={project.name}
          client={project.client.name}
          manager={project.manager}
          phase={project.phase}
          progress={project.progress}
          status={project.status}
        />

        <ProjectModules />

        <ProjectActivity />

      </section>
    </main>
  );
}