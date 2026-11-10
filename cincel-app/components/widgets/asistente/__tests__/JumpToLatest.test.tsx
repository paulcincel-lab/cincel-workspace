// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { JumpToLatest } from "@/components/widgets/asistente/JumpToLatest";

afterEach(cleanup);

describe("JumpToLatest", () => {
  it("singular and plural badge", () => {
    const { rerender } = render(<JumpToLatest visible newCount={1} onJump={() => {}} />);
    expect(screen.getByRole("button", { name: /Bajar al último mensaje/ }).textContent).toContain("1 nuevo");
    expect(screen.queryByText("1 nuevos")).toBeNull();

    rerender(<JumpToLatest visible newCount={3} onJump={() => {}} />);
    expect(screen.getByText("3 nuevos")).toBeTruthy();

    rerender(<JumpToLatest visible newCount={0} onJump={() => {}} />);
    expect(screen.getByRole("button", { name: "Bajar al último mensaje" })).toBeTruthy();
    expect(screen.queryByText(/nuevo/)).toBeNull();
  });

  it("hidden at the bottom", () => {
    render(<JumpToLatest visible={false} newCount={2} onJump={() => {}} />);
    expect(screen.queryByRole("button", { name: /Bajar al último mensaje/ })).toBeNull();
  });

  it("calls onJump on click", () => {
    const onJump = vi.fn();
    render(<JumpToLatest visible newCount={0} onJump={onJump} />);
    fireEvent.click(screen.getByRole("button", { name: "Bajar al último mensaje" }));
    expect(onJump).toHaveBeenCalledTimes(1);
  });
});
