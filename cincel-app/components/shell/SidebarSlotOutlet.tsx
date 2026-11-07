import { loadSidebarSlot, type SidebarSlot } from "@/lib/shell/sidebar-slots";
import type { NavSession } from "@/lib/ui/nav";

/**
 * Server outlet of one sidebar slot (redesign FE §21.1): runs the slot's
 * loader and renders its component with the data; nothing while the loader
 * returns null or fails.
 */
export type SidebarSlotOutletProps<T> = { slot: SidebarSlot<T>; session: NavSession };

export async function SidebarSlotOutlet<T>({ slot, session }: SidebarSlotOutletProps<T>) {
  const data = await loadSidebarSlot(slot, session);
  if (data === null) return null;
  const SlotComponent = slot.Component;
  return <SlotComponent data={data} />;
}
