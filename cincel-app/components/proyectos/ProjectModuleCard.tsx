import Link from "next/link";

type Props = {
  title: string;
  icon: string;
  total: number;
  subtitle: string;
  href?: string;
};

export default function ProjectModuleCard({
  title,
  icon,
  total,
  subtitle,
  href = "#",
}: Props) {
  return (
    <Link href={href}>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hover:shadow-lg transition cursor-pointer h-full">

        <div className="text-3xl">
          {icon}
        </div>

        <h3 className="mt-4 text-xl font-bold">
          {title}
        </h3>

        <p className="text-4xl font-bold mt-5">
          {total}
        </p>

        <p className="text-slate-500 mt-2">
          {subtitle}
        </p>

      </div>
    </Link>
  );
}