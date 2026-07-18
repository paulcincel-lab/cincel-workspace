type Props = {
  name: string;
  showName?: boolean;
};

export default function Avatar({ name, showName = true }: Props) {
  const initials = name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex items-center gap-3">

      <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
        {initials}
      </div>

      {showName ? (
        <span className="font-medium">
          {name}
        </span>
      ) : null}

    </div>
  );
}