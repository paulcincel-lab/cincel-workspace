import { Card, CardContent } from "@/components/ui/shadcn/card";

type Props = {
  title: string;
  value: string;
};

export default function KpiCard({ title, value }: Props) {
  return (
    <Card className="rounded-2xl shadow-sm [--card-spacing:--spacing(6)]">
      <CardContent>
        <p className="text-sm text-slate-500">{title}</p>
        <h2 className="mt-3 text-4xl font-bold">{value}</h2>
      </CardContent>
    </Card>
  );
}
