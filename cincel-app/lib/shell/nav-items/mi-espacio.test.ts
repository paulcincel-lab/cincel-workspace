import { beforeEach, describe, expect, it, vi } from "vitest";

const flags = vi.hoisted(() => ({
  mySpace: {} as Record<string, boolean>,
  notifications: {} as Record<string, boolean>,
}));
vi.mock("@/lib/actions/my-space-actions.flags", () => ({ IMPLEMENTED: flags.mySpace }));
vi.mock("@/lib/actions/notifications-actions.flags", () => ({ IMPLEMENTED: flags.notifications }));

// The badge moved to `qk.shell.badges()`: the nav item must read neither.
const actions = vi.hoisted(() => ({ fetchNotificationsAction: vi.fn() }));
vi.mock("@/lib/actions/notifications-actions", () => actions);
const mySpace = vi.hoisted(() => ({ fetchRemindersAction: vi.fn() }));
vi.mock("@/lib/actions/my-space-actions", () => mySpace);

import type { NavSession } from "@/lib/ui/nav";

import { miEspacioNavItem } from "./mi-espacio";

const SESSION: NavSession = { staffId: "s1", name: "Paul", role: "Diseño", isAdmin: false, photoUrl: null };

function setFlags(on: boolean) {
  Object.assign(flags.mySpace, {
    fetchNotesAction: on,
    fetchChecklistsAction: on,
    fetchRemindersAction: on,
  });
  Object.assign(flags.notifications, { fetchNotificationsAction: on });
}

beforeEach(() => {
  vi.clearAllMocks();
  setFlags(true);
});

describe("Mi espacio nav item", () => {
  it("returns the item with no badge and no badge read once the actions are implemented", async () => {
    const item = await miEspacioNavItem.resolve(SESSION);
    expect(item).toMatchObject({ key: "mi-espacio", label: "Mi espacio", href: "/mi-espacio" });
    expect(item?.badge).toBeUndefined();
    expect(actions.fetchNotificationsAction).not.toHaveBeenCalled();
    expect(mySpace.fetchRemindersAction).not.toHaveBeenCalled();
  });

  it("stays hidden while any page read is a stub", async () => {
    for (const key of ["fetchNotesAction", "fetchChecklistsAction", "fetchRemindersAction"]) {
      setFlags(true);
      flags.mySpace[key] = false;
      expect(await miEspacioNavItem.resolve(SESSION)).toBeNull();
    }
    setFlags(true);
    flags.notifications.fetchNotificationsAction = false;
    expect(await miEspacioNavItem.resolve(SESSION)).toBeNull();
  });
});
