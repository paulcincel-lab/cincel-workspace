// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PeopleStack, ResponsableAvatar } from "@/components/widgets/PeopleStack";

import { AvatarCircle, PERSON_AVATAR_PX, PersonAvatar, UnassignedAvatar, personTone, staffPhotoUrl } from "./PersonAvatar";

const ID = "3f2b8a0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

describe("PersonAvatar", () => {
  it("falls back to initials on a token tone when there is no photo", () => {
    const { container } = render(<AvatarCircle id="s-1" name="Ana López" />);
    expect(container.querySelector("[data-slot=avatar-fallback]")?.textContent).toBe("AL");
    expect(container.querySelector("[data-slot=avatar-fallback]")?.className).toMatch(/bg-chart-\d\/15 text-chart-\d-ink/);
  });

  it("the tone is stable per id", () => {
    expect(personTone(ID)).toBe(personTone(ID));
  });

  it("builds the photo url only for a staff uuid", () => {
    expect(staffPhotoUrl(ID)).toBe(`/api/staff/${ID}/photo`);
    expect(staffPhotoUrl("0:Ana")).toBeUndefined();
    expect(staffPhotoUrl(null)).toBeUndefined();
  });

  it("sizes: xs 20, sm 24, md 36, lg 44", () => {
    expect(PERSON_AVATAR_PX).toEqual({ xs: 20, sm: 24, md: 36, lg: 44 });
    const { container } = render(<AvatarCircle name="Ana López" size="xs" />);
    expect(container.querySelector("[data-slot=avatar]")?.className).toContain("size-5");
  });

  it("shows the name next to the avatar, or only as tooltip and screen reader text", () => {
    const { container, rerender } = render(<PersonAvatar id="s-1" name="Ana López" />);
    expect(screen.getByText("Ana López").className).not.toContain("sr-only");
    rerender(<PersonAvatar id="s-1" name="Ana López" hideName />);
    expect(container.querySelector("[title='Ana López']")).toBeTruthy();
    expect(screen.getByText("Ana López").parentElement?.className).toContain("sr-only");
  });

  it("unassigned is a dashed round placeholder with the tooltip, text optional", () => {
    const { container, rerender } = render(<UnassignedAvatar />);
    expect(container.querySelector("[title='Sin asignar']")).toBeTruthy();
    expect(container.querySelector(".border-dashed")).toBeTruthy();
    expect(screen.getByText("Sin asignar").className).toContain("sr-only");
    rerender(<UnassignedAvatar showLabel />);
    expect(screen.getByText("Sin asignar").className).not.toContain("sr-only");
  });
});

describe("ResponsableAvatar and PeopleStack", () => {
  it("responsable with name, avatar only, and nobody", () => {
    const { container, rerender } = render(<ResponsableAvatar person={{ id: "s-1", name: "Ana López" }} />);
    expect(screen.getByText("Ana López")).toBeTruthy();
    rerender(<ResponsableAvatar person={{ id: "s-1", name: "Ana López" }} showName={false} />);
    expect(screen.getByText("Ana López").className).toContain("sr-only");
    rerender(<ResponsableAvatar person={null} showUnassignedText />);
    expect(container.querySelector("[data-slot=unassigned]")).toBeTruthy();
    expect(screen.getByText("Sin asignar")).toBeTruthy();
  });

  it("the stack overflows to +n and names everyone in the tooltip", () => {
    const people = ["Ana", "Bruno", "Carla", "Diego", "Elena"].map((name, i) => ({ id: `s-${i}`, name }));
    const { container } = render(<PeopleStack people={people} label="Apoyo" />);
    expect(container.querySelectorAll("[data-person-avatar]")).toHaveLength(3);
    expect(container.querySelector("[data-slot=avatar-group-count]")?.textContent).toBe("+2");
    expect(container.querySelector("[data-slot=people-stack]")?.getAttribute("title")).toBe("Ana, Bruno, Carla, Diego, Elena");
    expect(screen.getByText("Apoyo: Ana, Bruno, Carla, Diego, Elena")).toBeTruthy();
  });
});
