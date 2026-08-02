import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { managerTactics } from "@/db/schema";

type LayoutPoint = { x: number; y: number };

function cleanText(value: unknown, maximum: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maximum);
}

function normaliseLayout(value: unknown): LayoutPoint[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 11).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const point = item as Record<string, unknown>;
    const x = Number(point.x);
    const y = Number(point.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    return [{ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }];
  });
}

function normaliseTactic(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const tactic = value as Record<string, unknown>;
  const id = cleanText(tactic.id, 64);
  const name = cleanText(tactic.name, 18);
  if (!id.startsWith("custom-") || !name) return null;
  const serialised = JSON.stringify({ ...tactic, id, name, libraryId: undefined });
  if (serialised.length > 24_000) return null;
  return { id, name, serialised };
}

function parseEntry(record: typeof managerTactics.$inferSelect) {
  try {
    const tactic = normaliseTactic(JSON.parse(record.tacticJson));
    const layout = normaliseLayout(JSON.parse(record.layoutJson));
    return tactic && layout.length ? { id: record.id, tactic: JSON.parse(tactic.serialised), layout } : null;
  } catch {
    return null;
  }
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected tactic storage error";
  if (message.includes("no such table")) return "개인 전술 라이브러리를 준비 중입니다. 잠시 후 다시 시도해 주세요.";
  return message;
}

export async function GET(request: Request) {
  try {
    const nickname = cleanText(new URL(request.url).searchParams.get("nickname"), 16);
    if (nickname.length < 2) return Response.json({ tactics: [] });
    const records = await (await getDb()).select().from(managerTactics)
      .where(eq(managerTactics.nickname, nickname))
      .orderBy(desc(managerTactics.updatedAt), desc(managerTactics.id))
      .limit(30);
    return Response.json({ tactics: records.flatMap((record) => {
      const entry = parseEntry(record);
      return entry ? [entry] : [];
    }) });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const nickname = cleanText(body?.nickname, 16);
    const tactic = normaliseTactic(body?.tactic);
    const layout = normaliseLayout(body?.layout);
    const libraryId = Number(body?.libraryId);
    if (nickname.length < 2 || !tactic || !layout.length) return Response.json({ error: "닉네임과 전술 정보를 확인할 수 없습니다." }, { status: 400 });
    const db = await getDb();
    const existing = Number.isInteger(libraryId) && libraryId > 0
      ? await db.select().from(managerTactics).where(and(eq(managerTactics.id, libraryId), eq(managerTactics.nickname, nickname))).limit(1)
      : await db.select().from(managerTactics).where(and(eq(managerTactics.nickname, nickname), eq(managerTactics.tacticName, tactic.name))).limit(1);
    const payload = { tacticName: tactic.name, tacticJson: tactic.serialised, layoutJson: JSON.stringify(layout), updatedAt: new Date().toISOString() };
    const [record] = existing.length
      ? await db.update(managerTactics).set(payload).where(eq(managerTactics.id, existing[0].id)).returning()
      : await db.insert(managerTactics).values({ nickname, ...payload }).returning();
    const entry = parseEntry(record);
    if (!entry) throw new Error("Saved tactic was invalid");
    return Response.json({ tactic: entry });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
