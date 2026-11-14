import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/shadcn/avatar";
import { getPersonInitials } from "@/components/ui/TeamMultiSelect";
import { cn } from "@/lib/utils";

export type PersonAvatarSize = "xs" | "sm" | "md" | "lg";

/** Pixel size of each avatar size: xs 20, sm 24, md 36, lg 44. */
export const PERSON_AVATAR_PX: Record<PersonAvatarSize, number> = { xs: 20, sm: 24, md: 36, lg: 44 };

const SIZE_CLASS: Record<PersonAvatarSize, string> = {
  xs: "size-5",
  sm: "size-6",
  md: "size-9",
  lg: "size-11",
};

const TEXT_CLASS: Record<PersonAvatarSize, string> = {
  xs: "text-[8px]",
  sm: "text-[10px]",
  md: "text-sm",
  lg: "text-sm",
};

/** Token tint + ink pairs (the chart palette's contrast pairs, light and dark). */
const TONES = [
  "bg-chart-1/15 text-chart-1-ink",
  "bg-chart-2/15 text-chart-2-ink",
  "bg-chart-3/15 text-chart-3-ink",
  "bg-chart-4/15 text-chart-4-ink",
  "bg-chart-5/15 text-chart-5-ink",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A stable tone per person: the same id (or name) always maps to the same pair. */
export function personTone(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return TONES[hash % TONES.length];
}

/** The profile photo URL of a staff member, or undefined when the id is not a staff uuid. */
export function staffPhotoUrl(id: string | null | undefined): string | undefined {
  return id && UUID.test(id) ? `/api/staff/${id}/photo` : undefined;
}

/** The only people avatar: round, profile photo when there is one, else initials on a stable token tone. */
export function AvatarCircle({
  id,
  name,
  imageSrc,
  initials,
  size = "sm",
  className,
  decorative = false,
}: {
  id?: string | null;
  name: string;
  imageSrc?: string;
  initials?: string;
  size?: PersonAvatarSize;
  className?: string;
  /** The name is read elsewhere (a sibling label or a group): hide the avatar from screen readers. */
  decorative?: boolean;
}) {
  const src = imageSrc ?? staffPhotoUrl(id);
  const px = PERSON_AVATAR_PX[size];
  const text = initials ?? getPersonInitials(name);
  return (
    <Avatar data-person-avatar="" aria-hidden={decorative ? "true" : undefined} className={cn(SIZE_CLASS[size], className)}>
      {src ? (
        <AvatarImage src={src} alt={decorative ? "" : `Foto de ${name}`} width={px} height={px} loading="lazy" />
      ) : null}
      <AvatarFallback className={cn("font-semibold", personTone(id ?? name), TEXT_CLASS[size])}>{text}</AvatarFallback>
    </Avatar>
  );
}

/** The dashed round "nobody assigned" placeholder. */
export function UnassignedAvatar({
  size = "sm",
  label = "Sin asignar",
  showLabel = false,
  className,
}: {
  size?: PersonAvatarSize;
  label?: string;
  /** Show the text next to the placeholder (Analítico keeps it: the column is the only signal). */
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <span data-slot="unassigned" title={label} className={cn("inline-flex items-center gap-2 align-middle", className)}>
      <span
        aria-hidden="true"
        className={cn("shrink-0 rounded-full border border-dashed border-muted-foreground/60", SIZE_CLASS[size])}
      />
      <span className={showLabel ? "text-muted-foreground" : "sr-only"}>{label}</span>
    </span>
  );
}

interface PersonAvatarProps {
  /** Staff id: the profile photo and the stable tone come from it. */
  id?: string | null;
  name: string;
  subtitle?: string;
  imageSrc?: string;
  /** Precomputed initials (e.g. `PersonDatum.initials`); derived from `name` when omitted. */
  initials?: string;
  /** Turns the name into a link. */
  href?: string;
  size?: PersonAvatarSize;
  className?: string;
  /** Avatar only: the name stays available to screen readers and as a tooltip. */
  hideName?: boolean;
}

/** A person: round avatar (photo or initials) with the name next to it, or avatar only with a tooltip. */
export function PersonAvatar({
  id,
  name,
  subtitle,
  imageSrc,
  initials,
  href,
  size = "sm",
  className,
  hideName = false,
}: PersonAvatarProps) {
  return (
    <div
      className={cn("flex items-center", size === "lg" ? "gap-3" : "gap-2", className)}
      title={hideName ? name : undefined}
    >
      <AvatarCircle id={id} name={name} imageSrc={imageSrc} initials={initials} size={size} decorative={hideName} />
      <span className={cn("min-w-0", hideName && "sr-only")}>
        <div className="truncate font-medium">
          {href ? (
            <a href={href} className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {name}
            </a>
          ) : (
            name
          )}
        </div>
        {subtitle ? (
          <div className={cn("text-muted-foreground", size === "lg" ? "text-xs" : "text-[10.5px]")}>{subtitle}</div>
        ) : null}
      </span>
    </div>
  );
}
