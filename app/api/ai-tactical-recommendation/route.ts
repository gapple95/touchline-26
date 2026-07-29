import { NextResponse } from "next/server";
import { createLocalTacticalRecommendation, normalizeTacticalRecommendation } from "@/lib/domain/tactical-ai.js";

const requestTimes = new Map<string, number>();
const MIN_REQUEST_INTERVAL_MS = 5_000;

function readContext(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const context = value as Record<string, unknown>;
  const prompt = typeof context.prompt === "string" ? context.prompt.replace(/\s+/g, " ").trim().slice(0, 420) : "";
  const tactics = Array.isArray(context.tactics) ? context.tactics.slice(0, 12) : [];
  const lineup = Array.isArray(context.lineup) ? context.lineup.slice(0, 11) : [];
  if (!prompt || tactics.length === 0 || lineup.length === 0) return null;
  return {
    prompt,
    minute: Number.isFinite(Number(context.minute)) ? Math.max(0, Math.min(130, Number(context.minute))) : 70,
    activeTacticId: typeof context.activeTacticId === "string" ? context.activeTacticId.slice(0, 40) : "control",
    tactics: tactics.map((tactic) => {
      const item = tactic as Record<string, unknown>;
      return { id: String(item.id ?? "").slice(0, 40), name: String(item.name ?? "").slice(0, 40), formation: String(item.formation ?? "").slice(0, 24), intent: String(item.intent ?? "").slice(0, 80) };
    }).filter((tactic) => tactic.id),
    lineup: lineup.map((player) => {
      const item = player as Record<string, unknown>;
      return { id: String(item.id ?? "").slice(0, 60), name: String(item.name ?? "").slice(0, 48), position: String(item.position ?? "").slice(0, 12), role: String(item.role ?? "").slice(0, 48), stamina: Number(item.stamina) || 50 };
    }).filter((player) => player.id),
    liveMetrics: context.liveMetrics && typeof context.liveMetrics === "object" ? context.liveMetrics : {},
  };
}

function recommendationSchema(context: NonNullable<ReturnType<typeof readContext>>) {
  const tacticIds = context.tactics.map((tactic) => tactic.id);
  const playerIds = context.lineup.map((player) => player.id);
  const score = { type: "INTEGER", minimum: 0, maximum: 100 };
  const playerInstruction = {
    type: "OBJECT",
    properties: { playerId: { type: "STRING", enum: playerIds }, aggression: score, takeOn: score, passingFrequency: score, forwardRuns: score, defensiveWorkRate: score, runDirection: { type: "STRING", enum: ["FORWARD", "BACKWARD", "HOLD"] } },
    required: ["playerId", "aggression", "takeOn", "passingFrequency", "forwardRuns", "defensiveWorkRate", "runDirection"],
  };
  return {
    type: "OBJECT",
    properties: {
      recommendedTacticId: { type: "STRING", enum: tacticIds }, confidence: score, summary: { type: "STRING" }, reasons: { type: "ARRAY", items: { type: "STRING" }, minItems: 2, maxItems: 3 }, caution: { type: "STRING" },
      teamInstructions: { type: "OBJECT", properties: { aggression: score, takeOn: score, passingFrequency: score }, required: ["aggression", "takeOn", "passingFrequency"] },
      playerInstructions: { type: "ARRAY", items: playerInstruction, maxItems: 4 },
      passLinks: { type: "ARRAY", items: { type: "OBJECT", properties: { fromPlayerId: { type: "STRING", enum: playerIds }, toPlayerId: { type: "STRING", enum: playerIds }, intensity: score }, required: ["fromPlayerId", "toPlayerId", "intensity"] }, maxItems: 4 },
    },
    required: ["recommendedTacticId", "confidence", "summary", "reasons", "caution", "teamInstructions", "playerInstructions", "passLinks"],
  };
}

function responseText(payload: Record<string, unknown>) {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const candidate = candidates[0] as { content?: { parts?: Array<{ text?: string }> } } | undefined;
  return candidate?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const context = readContext(body);
  if (!context) return NextResponse.json({ error: "Invalid tactical request." }, { status: 400 });

  const fallback = createLocalTacticalRecommendation(context);
  const clientKey = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "anonymous";
  const now = Date.now();
  if (now - (requestTimes.get(clientKey) ?? 0) < MIN_REQUEST_INTERVAL_MS) {
    return NextResponse.json({ recommendation: fallback, fallbackReason: "요청 간격을 조정했습니다." });
  }
  requestTimes.set(clientKey, now);

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ recommendation: fallback, fallbackReason: "AI 키가 설정되지 않아 로컬 전술 코치를 사용했습니다." });

  const systemInstruction = "You are TOUCHLINE 26's Korean football tactical coach. Return only a tactical recommendation matching the JSON schema. Use only supplied tactics and players. Do not invent players, match events, statistics, injuries, or scores. Keep Korean summary, reasons, and caution concise. The recommendation is advisory: optimize for the user's stated intent and the supplied live metrics.";
  const userPrompt = JSON.stringify({ request: context.prompt, minute: context.minute, activeTacticId: context.activeTacticId, tactics: context.tactics, lineup: context.lineup, liveMetrics: context.liveMetrics });

  try {
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite"}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: { response_mime_type: "application/json", response_schema: recommendationSchema(context), max_output_tokens: 700 },
      }),
    });
    if (!geminiResponse.ok) throw new Error(`Gemini returned ${geminiResponse.status}`);
    const payload = await geminiResponse.json() as Record<string, unknown>;
    const raw = JSON.parse(responseText(payload));
    return NextResponse.json({ recommendation: normalizeTacticalRecommendation(raw, context) });
  } catch {
    return NextResponse.json({ recommendation: fallback, fallbackReason: "AI 응답을 받지 못해 로컬 전술 코치로 전환했습니다." });
  }
}
