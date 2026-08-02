import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { matchRecords } from "@/db/schema";

function cleanText(value: unknown, maximum: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maximum);
}

function score(value: unknown) {
  const number = Number(value);
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(number) ? number : 0)));
}

function parseBadges(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((badge): badge is string => typeof badge === "string") : [];
  } catch {
    return [];
  }
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected record storage error";
  if (message.includes("no such table")) return "기록 저장소를 준비 중입니다. 잠시 뒤 다시 시도해 주세요.";
  return message;
}

const recordColumns = {
  id: matchRecords.id,
  nickname: matchRecords.nickname,
  fixtureId: matchRecords.fixtureId,
  fixtureLabel: matchRecords.fixtureLabel,
  score: matchRecords.score,
  isPublic: matchRecords.isPublic,
  managerArchetype: matchRecords.managerArchetype,
  managerConfidence: matchRecords.managerConfidence,
  managerBadges: matchRecords.managerBadges,
  createdAt: matchRecords.createdAt,
};

function presentRecord(record: typeof matchRecords.$inferSelect) {
  const { managerBadges, managerSummary: _managerSummary, ...visible } = record;
  return { ...visible, badges: parseBadges(managerBadges) };
}

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const nickname = cleanText(new URL(request.url).searchParams.get("nickname"), 16);
    const records = await db
      .select(recordColumns)
      .from(matchRecords)
      .where(eq(matchRecords.isPublic, true))
      .orderBy(desc(matchRecords.score), desc(matchRecords.createdAt), desc(matchRecords.id))
      .limit(10);

    if (nickname.length < 2) return Response.json({ records: records.map((record) => ({ ...record, badges: parseBadges(record.managerBadges) })) });

    const profile = await db
      .select()
      .from(matchRecords)
      .where(eq(matchRecords.nickname, nickname))
      .orderBy(desc(matchRecords.createdAt), desc(matchRecords.id))
      .limit(50);

    const profileRecords = await Promise.all(profile.map(async (record) => {
      if (!record.isPublic) return { ...presentRecord(record), rank: null };
      const fixtureRecords = await db
        .select({ id: matchRecords.id })
        .from(matchRecords)
        .where(and(eq(matchRecords.isPublic, true), eq(matchRecords.fixtureId, record.fixtureId)))
        .orderBy(desc(matchRecords.score), desc(matchRecords.createdAt), desc(matchRecords.id));
      return { ...presentRecord(record), rank: fixtureRecords.findIndex((candidate) => candidate.id === record.id) + 1 };
    }));

    return Response.json({ records: records.map((record) => ({ ...record, badges: parseBadges(record.managerBadges) })), profileRecords });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const nickname = cleanText(body?.nickname, 16);
    const fixtureId = cleanText(body?.fixtureId, 64);
    const fixtureLabel = cleanText(body?.fixtureLabel, 80);
    const manager = body?.manager && typeof body.manager === "object" ? body.manager as Record<string, unknown> : {};
    const badges = Array.isArray(manager.badges) ? manager.badges.map((badge) => cleanText(badge, 28)).filter(Boolean).slice(0, 4) : [];
    if (nickname.length < 2 || !fixtureId || !fixtureLabel) return Response.json({ error: "닉네임과 경기 정보가 필요합니다." }, { status: 400 });

    const [record] = await (await getDb()).insert(matchRecords).values({
      nickname,
      fixtureId,
      fixtureLabel,
      score: score(body?.score),
      isPublic: body?.isPublic === true,
      managerArchetype: cleanText(manager.archetype, 48) || "BALANCED OPERATOR",
      managerConfidence: score(manager.confidence),
      managerBadges: JSON.stringify(badges),
      managerSummary: cleanText(manager.summary, 240),
    }).returning();
    return Response.json({ record: presentRecord(record) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const nickname = cleanText(body?.nickname, 16);
    const id = Number(body?.id);
    if (nickname.length < 2 || !Number.isInteger(id) || id < 1) return Response.json({ error: "삭제할 기록을 확인할 수 없습니다." }, { status: 400 });

    const deleted = await (await getDb()).delete(matchRecords)
      .where(and(eq(matchRecords.id, id), eq(matchRecords.nickname, nickname)))
      .returning({ id: matchRecords.id });
    if (!deleted.length) return Response.json({ error: "삭제할 기록을 찾지 못했습니다." }, { status: 404 });
    return Response.json({ deletedId: deleted[0].id });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
