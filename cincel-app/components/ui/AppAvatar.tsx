import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/shadcn/avatar";

type Props = {
  name: string;
  showName?: boolean;
  imageSrc?: string;
  imageAlt?: string;
};

export default function AppAvatar({ name, showName = true, imageSrc = "", imageAlt }: Props) {
  const initials = name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-9">
        {imageSrc ? <AvatarImage src={imageSrc} alt={imageAlt || `Foto de ${name}`} /> : null}
        <AvatarFallback className="bg-blue-600 text-sm font-bold text-white">
          {initials}
        </AvatarFallback>
      </Avatar>

      {showName ? <span className="font-medium">{name}</span> : null}
    </div>
  );
}
