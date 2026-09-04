"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";

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

    queueMicrotask(() => {
      setProject(projectOptions[0] ?? "");
      setSelectedKeys(templateItems.map((item) => itemKey(item)));
    });
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
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="w-[760px] max-w-[760px] overflow-y-auto text-foreground">
        <SheetHeader>
          <SheetTitle className="text-foreground">Iniciar plantilla de proyecto</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 p-6">
          <div>
            <Label className="mb-2 block text-foreground">Nombre del proyecto</Label>
            {projectOptions.length === 0 ? (
              <p className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                No hay proyectos activos disponibles
              </p>
            ) : (
              <Select value={project} onValueChange={(v) => setProject(v as string)}>
                <SelectTrigger className="w-full text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projectOptions.map((projectOption) => (
                    <SelectItem key={projectOption} value={projectOption}>
                      {projectOption}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="block text-foreground">Descripciones iniciales</Label>
              <div className="flex items-center gap-4">
                <Button
                  variant="link"
                  onClick={() => setSelectedKeys(templateItems.map((item) => itemKey(item)))}
                  className="h-auto p-0 text-sm font-medium text-foreground hover:text-foreground/70"
                >
                  Seleccionar todas
                </Button>
                <Button
                  variant="link"
                  onClick={() => setSelectedKeys([])}
                  className="h-auto p-0 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  Borrar todas
                </Button>
              </div>
            </div>

            <div className="max-h-72 space-y-2 overflow-auto rounded-xl border border-border p-3">
              {groupedTemplateItems.map((group) => (
                <div key={group.phase} className="rounded-xl border border-border bg-muted/50 p-2">
                  <div className="border-b border-border px-2 pb-2 text-xs font-semibold uppercase tracking-[0.15em] text-foreground">
                    {group.phase}
                  </div>

                  <div className="mt-1 space-y-1">
                    {group.items.map((item) => {
                      const key = itemKey(item);
                      const checked = selectedKeys.includes(key);

                      return (
                        <label
                          key={key}
                          className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 hover:bg-accent"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleItem(item)}
                            className="mt-1"
                          />
                          <span className="text-sm text-foreground">{item.description}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClose} className="text-foreground">
            Cancelar
          </Button>

          <Button
            onClick={handleCreate}
            disabled={project.trim().length === 0 || selectedItems.length === 0 || projectOptions.length === 0}
          >
            Crear plantilla
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
