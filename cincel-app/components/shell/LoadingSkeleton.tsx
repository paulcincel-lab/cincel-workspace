/**
 * Loading skeleton per page shape (redesign FE §4.2).
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export type LoadingSkeletonProps = {
  variant: "kpis" | "cards" | "list" | "table" | "board" | "calendar";
  rows?: number;
};

export function LoadingSkeleton(props: LoadingSkeletonProps) {
  void props;
  return null;
}
