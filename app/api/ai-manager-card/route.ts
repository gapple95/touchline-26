import { NextResponse } from "next/server";

type Tone = "lime" | "mint" | "yellow" | "orange";
type Decision = {
  minute: number;
  opponentFormation: string;
  opponentBlock: string;
  opponentPhase: string;
  tacticName: string;
  tacticFormation: string;
  effectiveness: number;
  metrics: Record<string, number>;
};
type Analysis = {
  provider: "gemini" | "local";
  archetype: string;
  summary: string;
  confidence: number;
  traits: Array<{ label: string; value: number; tone: Tone }>;
  badges: string[];
  evidence: Array<{ minute: string; title: string; detail: string }>;
  coachingFocus: string;
};

const requestTimes = new Map<string, number>();
const MIN_REQUEST_INTERVAL_MS = 5_000;
const tones: Tone[] = ["lime", "mint", "yellow", "orange"];
const allowedBlocks = new Set(["MID BLOCK", "HIGH BUILD", "HIGH PRESS", "LOW BLOCK"]);

function clamp(value: unknown, fallback = 50) {
  const number = Number(value);
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(number) ? number : fallback)));
}

function text(value: unknown, fallback: string, maximum = 100) {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, maximum);
  return normalized || fallback;
}

function average(values: number[], fallback = 50) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : fallback;
}

function readDecisions(value: unknown): Decision[] {
  if (!value || typeof value !== "object") return [];
  const body = value as Record<string, unknown>;
  if (!Array.isArray(body.decisions)) return [];
  return body.decisions.slice(0, 7).map((raw) => {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const metrics = item.metrics && typeof item.metrics === "object" ? item.metrics as Record<string, unknown> : {};
    const block = text(item.opponentBlock, "MID BLOCK", 20).toUpperCase();
    return {
      minute: Math.max(0, Math.min(90, Math.round(Number(item.minute) || 0))),
      opponentFormation: text(item.opponentFormation, "4-4-2", 20),
      opponentBlock: allowedBlocks.has(block) ? block : "MID BLOCK",
      opponentPhase: text(item.opponentPhase, "COMPACT", 28),
      tacticName: text(item.tacticName, "CONTROL", 36),
      tacticFormation: text(item.tacticFormation, "4-3-3", 20),
      effectiveness: clamp(item.effectiveness),
      metrics: {
        pressing: clamp(metrics.pressing),
        transition: clamp(metrics.transition),
        spaceBehindRisk: clamp(metrics.spaceBehindRisk),
        attack: clamp(metrics.attack),
        defence: clamp(metrics.defence),
      },
    };
  }).sort((a, b) => a.minute - b.minute);
}

function localAnalysis(decisions: Decision[]): Analysis {
  const usable = decisions.length ? decisions : [{
    minute: 0, opponentFormation: "4-4-2", opponentBlock: "MID BLOCK", opponentPhase: "COMPACT", tacticName: "CONTROL", tacticFormation: "4-3-3", effectiveness: 50,
    metrics: { pressing: 50, transition: 50, spaceBehindRisk: 50, attack: 50, defence: 50 },
  }];
  const press = average(usable.map((decision) => decision.metrics.pressing));
  const transition = average(usable.map((decision) => decision.metrics.transition));
  const risk = average(usable.map((decision) => decision.metrics.spaceBehindRisk));
  const effectiveness = average(usable.map((decision) => decision.effectiveness));
  const defence = average(usable.map((decision) => decision.metrics.defence));
  const uniqueTactics = new Set(usable.map((decision) => decision.tacticName)).size;
  const archetype = press >= 70 ? "PRESSING ARCHITECT" : transition >= 68 ? "TRANSITION HUNTER" : defence >= 68 ? "CONTROL BUILDER" : "BALANCED OPERATOR";
  const best = [...usable].sort((a, b) => b.effectiveness - a.effectiveness)[0];
  const weakest = [...usable].sort((a, b) => a.effectiveness - b.effectiveness)[0];
  const latest = usable[usable.length - 1];
  const focus = weakest.opponentBlock === "HIGH PRESS"
    ? "높은 압박 구간에서는 짧은 패스만 고집하지 말고, 탈압박 이후의 두 번째 전진 패스를 함께 설계하세요."
    : weakest.opponentBlock === "LOW BLOCK"
      ? "낮은 블록 구간에서는 박스 밖 순환과 반대 전환을 늘려, 측면 우위를 실제 슈팅 기회로 연결하세요."
      : "상대 블록이 바뀌는 순간을 기준으로 압박 강도와 뒷공간 위험도를 함께 조정하세요.";
  return {
    provider: "local",
    archetype,
    summary: `${uniqueTactics}개의 전술을 상황에 맞춰 선택했고, 평균 상성 점수는 ${effectiveness}점입니다. ${press >= 65 ? "압박으로 주도권을 만들려는" : "블록의 균형을 유지하려는"} 감독 성향이 뚜렷합니다.`,
    confidence: clamp(52 + usable.length * 5 + Math.abs(effectiveness - 50) / 2),
    traits: [
      { label: "압박 성향", value: press, tone: "lime" },
      { label: "전환 설계", value: transition, tone: "mint" },
      { label: "위험 관리", value: 100 - risk, tone: "orange" },
      { label: "상성 대응", value: effectiveness, tone: "yellow" },
    ],
    badges: [archetype, `${uniqueTactics} TACTICS`, `AVG ${effectiveness}`, "MATCHUP-DRIVEN"],
    evidence: [
      { minute: `${best.minute}'`, title: "최고 상성", detail: `${best.opponentFormation} ${best.opponentBlock}을 상대로 ${best.tacticName} 전술이 ${best.effectiveness}점을 기록했습니다.` },
      { minute: `${weakest.minute}'`, title: "보완 구간", detail: `${weakest.opponentBlock} 상황에서는 뒷공간 위험과 전환 설계를 다시 점검할 필요가 있습니다.` },
      { minute: `${latest.minute}'`, title: "마지막 선택", detail: `${latest.tacticName} ${latest.tacticFormation}으로 ${latest.opponentPhase} 국면에 대응했습니다.` },
    ],
    coachingFocus: focus,
  };
}

function responseText(payload: Record<string, unknown>) {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const candidate = candidates[0] as { content?: { parts?: Array<{ text?: string }> } } | undefined;
  return candidate?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
}

function schema() {
  const score = { type: "INTEGER", minimum: 0, maximum: 100 };
  return {
    type: "OBJECT",
    properties: {
      archetype: { type: "STRING" }, summary: { type: "STRING" }, confidence: score,
      traits: { type: "ARRAY", minItems: 3, maxItems: 4, items: { type: "OBJECT", properties: { label: { type: "STRING" }, value: score, tone: { type: "STRING", enum: tones } }, required: ["label", "value", "tone"] } },
      badges: { type: "ARRAY", minItems: 3, maxItems: 4, items: { type: "STRING" } },
      evidence: { type: "ARRAY", minItems: 2, maxItems: 3, items: { type: "OBJECT", properties: { minute: { type: "STRING" }, title: { type: "STRING" }, detail: { type: "STRING" } }, required: ["minute", "title", "detail"] } },
      coachingFocus: { type: "STRING" },
    },
    required: ["archetype", "summary", "confidence", "traits", "badges", "evidence", "coachingFocus"],
  };
}

function normalizeAnalysis(raw: unknown, fallback: Analysis): Analysis {
  if (!raw || typeof raw !== "object") return fallback;
  const item = raw as Record<string, unknown>;
  const rawTraits = Array.isArray(item.traits) ? item.traits : [];
  const traits = rawTraits.slice(0, 4).map((trait, index) => {
    const value = trait && typeof trait === "object" ? trait as Record<string, unknown> : {};
    const tone = text(value.tone, fallback.traits[index]?.tone ?? "lime", 10) as Tone;
    return { label: text(value.label, fallback.traits[index]?.label ?? "전술 성향", 18), value: clamp(value.value), tone: tones.includes(tone) ? tone : fallback.traits[index]?.tone ?? "lime" };
  });
  const rawEvidence = Array.isArray(item.evidence) ? item.evidence : [];
  const evidence = rawEvidence.slice(0, 3).map((entry, index) => {
    const value = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    return { minute: text(value.minute, fallback.evidence[index]?.minute ?? "-", 8), title: text(value.title, fallback.evidence[index]?.title ?? "전술 근거", 28), detail: text(value.detail, fallback.evidence[index]?.detail ?? "", 150) };
  });
  const badges = Array.isArray(item.badges) ? item.badges.map((badge) => text(badge, "", 28)).filter(Boolean).slice(0, 4) : [];
  return {
    provider: "gemini",
    archetype: text(item.archetype, fallback.archetype, 48),
    summary: text(item.summary, fallback.summary, 220),
    confidence: clamp(item.confidence, fallback.confidence),
    traits: traits.length >= 3 ? traits : fallback.traits,
    badges: badges.length >= 3 ? badges : fallback.badges,
    evidence: evidence.length >= 2 ? evidence : fallback.evidence,
    coachingFocus: text(item.coachingFocus, fallback.coachingFocus, 200),
  };
}

export async function POST(request: Request) {
  const decisions = readDecisions(await request.json().catch(() => null));
  const fallback = localAnalysis(decisions);
  const clientKey = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "anonymous";
  const now = Date.now();
  if (now - (requestTimes.get(clientKey) ?? 0) < MIN_REQUEST_INTERVAL_MS) return NextResponse.json({ analysis: fallback, fallbackReason: "요청 간격을 조정했습니다." });
  requestTimes.set(clientKey, now);

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ analysis: fallback, fallbackReason: "Gemini 키가 없어 로컬 분석을 표시합니다." });

  const instruction = "You are TOUCHLINE 26's manager-profile analyst. Return only JSON matching the schema, written in concise Korean except short English archetype/badges. Analyze only the supplied 15-minute tactical decisions and their calculated matchup effectiveness. Do not invent scores, players, match events, or real-world facts. Make evidence cite only the supplied minute, tactic, opponent block, phase, and effectiveness. Traits must be tactical and actionable.";
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite"}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instruction }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify({ decisions }) }] }],
        generationConfig: { response_mime_type: "application/json", response_schema: schema(), max_output_tokens: 750 },
      }),
    });
    if (!response.ok) throw new Error(`Gemini returned ${response.status}`);
    const raw = JSON.parse(responseText(await response.json() as Record<string, unknown>));
    return NextResponse.json({ analysis: normalizeAnalysis(raw, fallback) });
  } catch {
    return NextResponse.json({ analysis: fallback, fallbackReason: "Gemini 응답을 받지 못해 로컬 분석으로 전환했습니다." });
  }
}
