import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { readLanguageCatalog } from "../lib/language-catalog";
import { parseLanguageDirectory, refreshLanguageDirectoryWithFallback } from "../worker/language-directory";
import type { QueryDatabase } from "../lib/trending-read";

const fixture = new URL("./fixtures/trending/daily-all.html", import.meta.url);
const at = "2026-10-19T08:00:00.000Z";

test("extracts verified GitHub language slugs and labels from the real menu fixture", async () => {
  const languages = parseLanguageDirectory(await readFile(fixture, "utf8"));
  assert.deepEqual(languages[0], { slug: "all", label: "全部语言" });
  assert.deepEqual(languages.find(({ slug }) => slug === "typescript"), { slug: "typescript", label: "TypeScript" });
  assert.ok(languages.length > 100);
  assert.equal(new Set(languages.map(({ slug }) => slug)).size, languages.length);
  assert.throws(() => parseLanguageDirectory("<html></html>"), /missing or incomplete/);
});

test("successful refresh stores one atomic directory document", async () => {
  const html = await readFile(fixture, "utf8");
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const database: QueryDatabase = {
    async query(sql, values) { calls.push({ sql, values }); return { rows: [] }; }
  };
  const result = await refreshLanguageDirectoryWithFallback({
    database,
    now: () => Date.parse(at),
    fetchImpl: async (url) => {
      assert.equal(String(url), "https://github.com/trending?since=daily");
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
  });
  assert.equal(result?.collectedAt, at);
  assert.ok(result!.languages.length > 100);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /ON CONFLICT \(id\)/);
  assert.equal(JSON.parse(String(calls[0].values?.[0])).length, result?.languages.length);
});

test("failed refresh serves the last saved directory without overwriting it", async () => {
  const languages = parseLanguageDirectory(await readFile(fixture, "utf8"));
  const calls: string[] = [];
  const database: QueryDatabase = {
    async query(sql) {
      calls.push(sql);
      if (sql.startsWith("SELECT languages")) return { rows: [{ languages, collected_at: new Date(at) }] };
      throw new Error("Unexpected database write");
    }
  };
  const catalog = await refreshLanguageDirectoryWithFallback({
    database,
    fetchImpl: async () => new Response("Unavailable", { status: 503 })
  });
  assert.equal(catalog?.collectedAt, at);
  assert.equal(catalog?.languages.length, languages.length);
  assert.equal(calls.length, 1);
  assert.deepEqual(await readLanguageCatalog(database), catalog);
});

test("malformed menu never replaces the saved directory", async () => {
  const calls: string[] = [];
  const database: QueryDatabase = {
    async query(sql) { calls.push(sql); return { rows: [] }; }
  };
  const catalog = await refreshLanguageDirectoryWithFallback({
    database,
    fetchImpl: async () => new Response("<html></html>", { headers: { "content-type": "text/html" } })
  });
  assert.equal(catalog, null);
  assert.deepEqual(calls, ["SELECT languages, collected_at FROM language_catalog WHERE id = true"]);
});
