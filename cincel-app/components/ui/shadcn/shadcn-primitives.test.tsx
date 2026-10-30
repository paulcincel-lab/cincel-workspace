import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { Button } from "./button";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { Label } from "./label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { Line, LineChart } from "recharts";
import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltipContent,
  type ChartConfig,
} from "./chart";

// happy-dom has no layout, so ResponsiveContainer measures 0×0 and renders
// nothing. Pass children straight through so the chart parts can be tested.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
  };
});

describe("Button", () => {
  it("renders each variant without crashing and fires onClick", () => {
    const onClick = vi.fn();
    const variants = [
      "default",
      "secondary",
      "outline",
      "ghost",
      "destructive",
      "link",
    ] as const;

    for (const variant of variants) {
      const { unmount } = render(
        <Button variant={variant} onClick={onClick}>
          {variant}
        </Button>,
      );
      fireEvent.click(screen.getByText(variant));
      unmount();
    }

    expect(onClick).toHaveBeenCalledTimes(variants.length);
  });

  it("respects disabled state", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>,
    );
    fireEvent.click(screen.getByText("Disabled"));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Input", () => {
  it("renders and calls onChange", () => {
    const onChange = vi.fn();
    render(<Input placeholder="Nombre" onChange={onChange} />);
    const input = screen.getByPlaceholderText("Nombre");
    fireEvent.change(input, { target: { value: "hola" } });
    expect(onChange).toHaveBeenCalled();
  });
});

describe("Textarea", () => {
  it("renders and calls onChange", () => {
    const onChange = vi.fn();
    render(<Textarea placeholder="Notas" onChange={onChange} />);
    const textarea = screen.getByPlaceholderText("Notas");
    fireEvent.change(textarea, { target: { value: "nota" } });
    expect(onChange).toHaveBeenCalled();
  });
});

describe("Label", () => {
  it("renders with htmlFor", () => {
    render(<Label htmlFor="field-id">Campo</Label>);
    const label = screen.getByText("Campo");
    expect(label.getAttribute("for")).toBe("field-id");
  });
});

describe("Select", () => {
  it("renders trigger with placeholder", () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Elige una opción" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Opción A</SelectItem>
          <SelectItem value="b">Opción B</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(screen.getByText("Elige una opción")).toBeTruthy();
  });

  it("opens popup and selects an item, firing onValueChange", async () => {
    const onValueChange = vi.fn();
    render(
      <Select onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Elige una opción" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Opción A</SelectItem>
          <SelectItem value="b">Opción B</SelectItem>
        </SelectContent>
      </Select>,
    );

    fireEvent.click(screen.getByText("Elige una opción"));
    const option = await screen.findByText("Opción A");
    fireEvent.click(option);
    expect(onValueChange).toHaveBeenCalledWith("a", expect.anything());
  });
});

describe("Chart", () => {
  const config = {
    planned: { label: "Planeado", color: "var(--chart-1)" },
    actual: { label: "Real", color: "var(--chart-2)" },
  } satisfies ChartConfig;

  it("ChartContainer exposes config colors as --color-* variables", () => {
    const { container } = render(
      <ChartContainer id="test" config={config}>
        <LineChart data={[{ x: "a", planned: 1, actual: 2 }]}>
          <Line dataKey="planned" />
        </LineChart>
      </ChartContainer>,
    );
    const root = container.querySelector('[data-slot="chart"]');
    expect(root?.getAttribute("data-chart")).toBe("chart-test");
    const css = container.querySelector("style")?.innerHTML ?? "";
    expect(css).toContain("--color-planned: var(--chart-1);");
    expect(css).toContain("--color-actual: var(--chart-2);");
  });

  it("ChartTooltipContent renders config labels and values", () => {
    render(
      <ChartContainer config={config}>
        <ChartTooltipContent
          active
          label="Semana 1"
          payload={[
            {
              graphicalItemId: "planned",
              dataKey: "planned",
              name: "planned",
              value: 3,
              color: "var(--chart-1)",
              payload: {},
            },
            {
              graphicalItemId: "actual",
              dataKey: "actual",
              name: "actual",
              value: 5,
              color: "var(--chart-2)",
              payload: {},
            },
          ]}
        />
      </ChartContainer>,
    );
    expect(screen.getByText("Semana 1")).toBeTruthy();
    expect(screen.getByText("Planeado")).toBeTruthy();
    expect(screen.getByText("Real")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
  });

  it("ChartLegendContent renders one entry per series", () => {
    render(
      <ChartContainer config={config}>
        <ChartLegendContent
          payload={[
            { dataKey: "planned", value: "planned", color: "var(--chart-1)" },
            { dataKey: "actual", value: "actual", color: "var(--chart-2)" },
          ]}
        />
      </ChartContainer>,
    );
    expect(screen.getByText("Planeado")).toBeTruthy();
    expect(screen.getByText("Real")).toBeTruthy();
  });

  it("chart parts throw outside ChartContainer", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(<ChartLegendContent payload={[{ value: "x", dataKey: "x" }]} />),
    ).toThrow(/ChartContainer/);
    spy.mockRestore();
  });
});
