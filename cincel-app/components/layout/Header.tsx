"use client";

import { useMemo } from "react";

import Avatar from "@/components/ui/Avatar";

export default function Header() {
  const todayLabel = useMemo(() => {
    const now = new Date();

    const formatted = new Intl.DateTimeFormat("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(now);

    return formatted
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }, []);

  return (
    <header className="mb-10">

      <div className="flex items-center gap-4">
        <Avatar name="Paul" showName={false} />

        <h1 className="text-xl font-bold text-slate-900">
          Bienvenido, Paul
        </h1>
      </div>

      <p className="mt-2 text-slate-800">
        {todayLabel}
      </p>

    </header>
  );
}