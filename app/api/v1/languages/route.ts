import { getDatabasePool } from "../../../../lib/db";
import { readLanguageCatalog } from "../../../../lib/language-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const catalog = await readLanguageCatalog(getDatabasePool());
    if (!catalog) return Response.json({ error: "LANGUAGE_CATALOG_UNAVAILABLE" }, {
      status: 503, headers: { "Cache-Control": "no-store" }
    });
    return Response.json(catalog, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "SERVICE_UNAVAILABLE" }, {
      status: 503, headers: { "Cache-Control": "no-store" }
    });
  }
}
