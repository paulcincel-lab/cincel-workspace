"use client";

import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";
import { EventDetailCard } from "@/components/widgets/calendario/EventDetailCard";
import { EventDetailDrawer } from "@/components/widgets/calendario/EventDetailDrawer";
import { EventDetailSheet } from "@/components/widgets/calendario/EventDetailSheet";

import { useCalendarioDetail } from "./use-calendario-detail";

/** Mounts the detail of `?evento=` in the format of the active Estilo: floating card, bottom sheet or right drawer (FE §5). */
export function EventDetailHost() {
  const detail = useCalendarioDetail();
  if (!detail?.item) return null;
  const { item, actions, close, meeting, task } = detail;
  return (
    <PageStyleLayout
      visual={() => <EventDetailCard item={item} detail={meeting} task={task} actions={actions} onClose={close} />}
      esencial={() => <EventDetailSheet item={item} detail={meeting} task={task} actions={actions} onClose={close} />}
      analitico={() => <EventDetailDrawer item={item} detail={meeting} task={task} actions={actions} onClose={close} />}
    />
  );
}
