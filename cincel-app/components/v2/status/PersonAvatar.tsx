import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/shadcn/avatar";
import { getPersonInitials } from "@/components/ui/TeamMultiSelect";
import { cn } from "@/lib/utils";

interface PersonAvatarProps {
  name: string;
  subtitle?: string;
  imageSrc?: string;
  size?: "sm" | "md";
  className?: string;
  /** Precomputed initials (e.g. from a widget data shape); defaults to `getPersonInitials(name)`. */
  initials?: string;
  /** Avatar only: the name stays available to screen readers and as a tooltip. */
  hideName?: boolean;
}

/**
 * Table-row person cell — avatar + name (+ optional subtitle, e.g. email).
 * Uses `--primary` for the initials fallback instead of AppAvatar's
 * hardcoded `bg-blue-600`, matching the monochrome token system.
 */
export function PersonAvatar({
  name,
  subtitle,
  imageSrc,
  size = "sm",
  className,
  initials,
  hideName = false,
}: PersonAvatarProps) {
  return (
    <div className={cn("flex items-center gap-2", className)} title={hideName ? name : undefined}>
      <Avatar className={size === "sm" ? "size-6" : "size-9"}>
        {imageSrc ? <AvatarImage src={imageSrc} alt={`Foto de ${name}`} /> : null}
        <AvatarFallback
          className={cn(
            "bg-primary font-bold text-primary-foreground",
            size === "sm" ? "text-[10px]" : "text-sm"
          )}
        >
          {hideName ? (
            <span aria-hidden="true">{initials ?? getPersonInitials(name)}</span>
          ) : (
            initials ?? getPersonInitials(name)
          )}
        </AvatarFallback>
      </Avatar>
      <span className={hideName ? "sr-only" : undefined}>
        <div className="font-medium">{name}</div>
        {subtitle ? <div className="text-[10.5px] text-muted-foreground">{subtitle}</div> : null}
      </span>
    </div>
  );
}
