import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { matchRecords } from "@/db/schema";

type TimelineEntry = {
  minute: number;
  opponentFormation: string;
  opponentBlock: string;
  opponentPhase: string;
  tacticName: string;
  tacticFormation: string;
  metrics: Record<string, number>;
};

function cleanText(value: unknown, maximum: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maximum);
}

function score(value: unknown) {
  const number = Number(value);
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(number) ? number : 0)));
}

function managedTeam(value: unknown) {
  const team = cleanText(value, 8);
  return team === "home" || team === "away" ? team : "";
}

function parseBadges(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((badge): badge is string => typeof badge === "string") : [];
  } catch {
    return [];
  }
}

function normaliseTimeline(value: unknown): TimelineEntry[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 7).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const minute = Number(item.minute);
    if (!Number.isFinite(minute) || minute < 0 || minute > 90) return [];
    const rawMetrics = item.metrics && typeof item.metrics === "object" ? item.metrics as Record<string, unknown> : {};
    const metrics = Object.fromEntries(["attack", "defence", "centre", "transition", "fatigue", "pressing", "progression", "spaceBehindRisk"]
      .map((key) => [key, score(rawMetrics[key])])) as Record<string, number>;
    return [{
      minute: Math.round(minute),
      opponentFormation: cleanText(item.opponentFormation, 32),
      opponentBlock: cleanText(item.opponentBlock, 32),
      opponentPhase: cleanText(item.opponentPhase, 48),
      tacticName: cleanText(item.tacticName, 48),
      tacticFormation: cleanText(item.tacticFormation, 24),
      metrics,
    }];
  });
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected record storage error";
  if (message.includes("no such table")) return "기록 저장소를 준비 중입니다. 잠시 후 다시 시도해 주세요.";
  return message;
}

const recordColumns = {
  id: matchRecords.id,
  nickname: matchRecords.nickname,
  fixtureId: matchRecords.fixtureId,
  fixtureLabel: matchRecords.fixtureLabel,
  managedTeam: matchRecords.managedTeam,
  score: matchRecords.score,
  isPublic: matchRecords.isPublic,
  managerArchetype: matchRecords.managerArchetype,
  managerConfidence: matchRecords.managerConfidence,
  managerBadges: matchRecords.managerBadges,
  tacticTimeline: matchRecords.tacticTimeline,
  createdAt: matchRecords.createdAt,
};

function ranked<T extends { score: number }>(records: T[]) {
  let lastScore: number | null = null;
  let rank = 0;
  return records.map((record, index) => {
    if (record.score !== lastScore) rank = index + 1;
    lastScore = record.score;
    return { ...record, rank };
  });
}

function safelyPresentTimeline(value: string) {
  try { return normaliseTimeline(JSON.parse(value || "[]")); } catch { return []; }
}

function presentRecordSafe(record: typeof matchRecords.$inferSelect) {
  const { managerBadges, managerSummary: _managerSummary, tacticTimeline, ...visible } = record;
  return { ...visible, badges: parseBadges(managerBadges), timeline: safelyPresentTimeline(tacticTimeline) };
}

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const params = new URL(request.url).searchParams;
    const nickname = cleanText(params.get("nickname"), 16);
    const fixtureId = cleanText(params.get("fixtureId"), 64);
    const team = managedTeam(params.get("managedTeam"));
    const conditions = [eq(matchRecords.isPublic, true)];
    if (fixtureId) conditions.push(eq(matchRecords.fixtureId, fixtureId));
    if (team) conditions.push(eq(matchRecords.managedTeam, team));

    const records = await db.select(recordColumns).from(matchRecords)
      .where(and(...conditions))
      .orderBy(desc(matchRecords.score), desc(matchRecords.createdAt), desc(matchRecords.id))
      .limit(10);
    const rankedRecords = ranked(records).map((record) => ({ ...record, badges: parseBadges(record.managerBadges), timeline: safelyPresentTimeline(record.tacticTimeline) }));

    if (nickname.length < 2) return Response.json({ records: rankedRecords });

    const profileConditions = [eq(matchRecords.nickname, nickname)];
    if (fixtureId) profileConditions.push(eq(matchRecords.fixtureId, fixtureId));
    if (team) profileConditions.push(eq(matchRecords.managedTeam, team));
    const profile = await db.select().from(matchRecords).where(and(...profileConditions))
      .orderBy(desc(matchRecords.createdAt), desc(matchRecords.id)).limit(50);

    const profileRecords = await Promise.all(profile.map(async (record) => {
      if (!record.isPublic) return { ...presentRecordSafe(record), rank: null };
      const sameScope = await db.select({ id: matchRecords.id, score: matchRecords.score }).from(matchRecords)
        .where(and(eq(matchRecords.isPublic, true), eq(matchRecords.fixtureId, record.fixtureId), eq(matchRecords.managedTeam, record.managedTeam)))
        .orderBy(desc(matchRecords.score), desc(matchRecords.createdAt), desc(matchRecords.id));
      const rank = ranked(sameScope).find((candidate) => candidate.id === record.id)?.rank ?? null;
      return { ...presentRecordSafe(record), rank };
    }));

    return Response.json({ records: rankedRecords, profileRecords });
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
    const team = managedTeam(body?.managedTeam);
    const manager = body?.manager && typeof body.manager === "object" ? body.manager as Record<string, unknown> : {};
    const badges = Array.isArray(manager.badges) ? manager.badges.map((badge) => cleanText(badge, 28)).filter(Boolean).slice(0, 4) : [];
    const timeline = normaliseTimeline(body?.tacticTimeline);
    if (nickname.length < 2 || !fixtureId || !fixtureLabel || !team) return Response.json({ error: "닉네임과 경기·선택 팀 정보가 필요합니다." }, { status: 400 });

    const [record] = await (await getDb()).insert(matchRecords).values({
      nickname,
      fixtureId,
      fixtureLabel,
      managedTeam: team,
      score: score(body?.score),
      isPublic: body?.isPublic === true,
      managerArchetype: cleanText(manager.archetype, 48) || "BALANCED OPERATOR",
      managerConfidence: score(manager.confidence),
      managerBadges: JSON.stringify(badges),
      managerSummary: cleanText(manager.summary, 240),
      tacticTimeline: JSON.stringify(timeline),
    }).returning();
    return Response.json({ record: presentRecordSafe(record) }, { status: 201 });
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
