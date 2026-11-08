// Liveness check for the deploy platform. Answers without a session, since
// the proxy lets every /api route through.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" });
}
