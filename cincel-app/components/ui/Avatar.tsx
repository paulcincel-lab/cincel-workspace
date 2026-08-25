import Image from "next/image";

type Props = {
  name: string;
  showName?: boolean;
  imageSrc?: string;
  imageAlt?: string;
};

export default function Avatar({ name, showName = true, imageSrc = "", imageAlt }: Props) {
  const initials = name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex items-center gap-3">

      <div className="relative w-9 h-9 overflow-hidden rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt={imageAlt || `Foto de ${name}`}
            width={36}
            height={36}
            unoptimized
            className="h-9 w-9 object-cover"
          />
        ) : (
          initials
        )}
      </div>

      {showName ? (
        <span className="font-medium">
          {name}
        </span>
      ) : null}

    </div>
  );
}