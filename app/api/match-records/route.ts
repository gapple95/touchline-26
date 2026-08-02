import { desc, eq } from "drizzle-orm";
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

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected record storage error";
  if (message.includes("no such table")) return "기록 저장소를 준비 중입니다. 잠시 후 다시 시도해 주세요.";
  return message;
}

export async function GET() {
  try {
    const records = await (await getDb())
      .select({
        id: matchRecords.id,
        nickname: matchRecords.nickname,
        fixtureLabel: matchRecords.fixtureLabel,
        score: matchRecords.score,
        managerArchetype: matchRecords.managerArchetype,
        managerConfidence: matchRecords.managerConfidence,
        managerBadges: matchRecords.managerBadges,
        createdAt: matchRecords.createdAt,
      })
      .from(matchRecords)
      .where(eq(matchRecords.isPublic, true))
      .orderBy(desc(matchRecords.score), desc(matchRecords.createdAt), desc(matchRecords.id))
      .limit(10);
    return Response.json({ records: records.map((record) => ({ ...record, badges: JSON.parse(record.managerBadges) as string[] })) });
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
    return Response.json({ record: { ...record, badges } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
