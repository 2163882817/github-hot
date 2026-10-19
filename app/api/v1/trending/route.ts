import { getDatabasePool } from "../../../../lib/db";
import { readTrending } from "../../../../lib/trending-read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const result = await readTrending(getDatabasePool(), request.url);
    return Response.json(result.body, {
      status: result.status,
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    return Response.json({ error: "SERVICE_UNAVAILABLE" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
