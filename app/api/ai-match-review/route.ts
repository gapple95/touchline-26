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
  metrics: { pressing: number; transition: number; spaceBehindRisk: number };
};
type Analysis = {
  provider: "gemini" | "local";
  headline: string;
  summary: string;
  insights: Array<{ title: string; detail: string; tone: Tone; tag: string }>;
};

const requestTimes = new Map<string, number>();
const tones: Tone[] = ["lime", "mint", "yellow", "orange"];
const allowedBlocks = new Set(["MID BLOCK", "HIGH BUILD", "HIGH PRESS", "LOW BLOCK"]);

function clamp(value: unknown, fallback = 50) {
  const number = Number(value);
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(number) ? number : fallback)));
}

function text(value: unknown, fallback: string, maximum = 150) {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, maximum);
  return normalized || fallback;
}

function readDecisions(value: unknown): Decision[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as Record<string, unknown>).decisions)) return [];
  return ((value as Record<string, unknown>).decisions as unknown[]).slice(0, 7).map((raw) => {
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
      metrics: { pressing: clamp(metrics.pressing), transition: clamp(metrics.transition), spaceBehindRisk: clamp(metrics.spaceBehindRisk) },
    };
  }).sort((a, b) => a.minute - b.minute);
}

function localAnalysis(decisions: Decision[]): Analysis {
  const usable = decisions.length ? decisions : [{ minute: 0, opponentFormation: "4-4-2", opponentBlock: "MID BLOCK", opponentPhase: "COMPACT", tacticName: "CONTROL", tacticFormation: "4-3-3", effectiveness: 50, metrics: { pressing: 50, transition: 50, spaceBehindRisk: 50 } }];
  const best = [...usable].sort((a, b) => b.effectiveness - a.effectiveness)[0];
  const weakest = [...usable].sort((a, b) => a.effectiveness - b.effectiveness)[0];
  const latest = usable[usable.length - 1];
  const average = Math.round(usable.reduce((sum, decision) => sum + decision.effectiveness, 0) / usable.length);
  const nextDetail = weakest.opponentBlock === "LOW BLOCK"
    ? "낮은 블록을 상대로는 폭을 넓힌 뒤 반대 전환과 박스 진입 타이밍을 함께 설계하세요."
    : weakest.opponentBlock === "HIGH PRESS"
      ? "높은 압박에는 첫 패스의 안전성보다 두 번째 전진 패스의 탈출 경로를 준비하세요."
      : "상대 블록 전환 시점에 압박 강도와 뒷공간 위험도를 함께 조정하세요.";
  return {
    provider: "local",
    headline: average >= 70 ? "상대 변화에 빠르게 반응한 경기 운영" : average >= 55 ? "균형은 유지했지만 보완 여지가 남은 운영" : "상대 블록 변화에 더 선명한 대응이 필요한 운영",
    summary: `${usable.length}개 구간의 전술 선택을 비교한 결과 평균 상성 점수는 ${average}점입니다. 가장 효과적이었던 선택과 취약 구간을 다음 경기 설계에 반영하세요.`,
    insights: [
      { title: "가장 잘 맞았던 대응", detail: `${best.minute}′ ${best.opponentFormation} ${best.opponentBlock}에 ${best.tacticName} ${best.tacticFormation}으로 대응해 ${best.effectiveness}점을 기록했습니다.`, tone: "lime", tag: `EFFECTIVENESS ${best.effectiveness}/100` },
      { title: "가장 어려웠던 구간", detail: `${weakest.minute}′ ${weakest.opponentPhase} 국면에서 선택의 상성은 ${weakest.effectiveness}점이었습니다. 압박과 전환의 연결을 다시 점검할 구간입니다.`, tone: "orange", tag: `EFFECTIVENESS ${weakest.effectiveness}/100` },
      { title: "다음 전술 보완", detail: nextDetail, tone: "mint", tag: `NEXT: ${weakest.opponentBlock}` },
    ],
  };
}

function responseText(payload: Record<string, unknown>) {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const candidate = candidates[0] as { content?: { parts?: Array<{ text?: string }> } } | undefined;
  return candidate?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
}

function normalize(raw: unknown, fallback: Analysis): Analysis {
  if (!raw || typeof raw !== "object") return fallback;
  const item = raw as Record<string, unknown>;
  const insightItems = Array.isArray(item.insights) ? item.insights : [];
  const insights = insightItems.slice(0, 3).map((entry, index) => {
    const value = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const candidateTone = text(value.tone, fallback.insights[index]?.tone ?? "lime", 10) as Tone;
    return { title: text(value.title, fallback.insights[index]?.title ?? "전술 인사이트", 36), detail: text(value.detail, fallback.insights[index]?.detail ?? "", 190), tone: tones.includes(candidateTone) ? candidateTone : fallback.insights[index]?.tone ?? "lime", tag: text(value.tag, fallback.insights[index]?.tag ?? "AI REVIEW", 34) };
  });
  return { provider: "gemini", headline: text(item.headline, fallback.headline, 70), summary: text(item.summary, fallback.summary, 240), insights: insights.length === 3 ? insights : fallback.insights };
}

export async function POST(request: Request) {
  const decisions = readDecisions(await request.json().catch(() => null));
  const fallback = localAnalysis(decisions);
  const clientKey = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "anonymous";
  const now = Date.now();
  if (now - (requestTimes.get(clientKey) ?? 0) < 5_000) return NextResponse.json({ analysis: fallback });
  requestTimes.set(clientKey, now);
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ analysis: fallback, fallbackReason: "Gemini 키가 없어 로컬 리뷰를 표시합니다." });

  const schema = { type: "OBJECT", properties: { headline: { type: "STRING" }, summary: { type: "STRING" }, insights: { type: "ARRAY", minItems: 3, maxItems: 3, items: { type: "OBJECT", properties: { title: { type: "STRING" }, detail: { type: "STRING" }, tone: { type: "STRING", enum: tones }, tag: { type: "STRING" } }, required: ["title", "detail", "tone", "tag"] } } }, required: ["headline", "summary", "insights"] };
  const instruction = "You are TOUCHLINE 26's Korean football match reviewer. Return only JSON matching the schema. Analyze only the supplied 15-minute tactical decisions and calculated effectiveness. Do not invent scores, players, match events, real results, injuries, or facts. Give exactly three concise, actionable insights: strongest response, weakest response, and next tactical focus.";
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite"}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: instruction }] }, contents: [{ role: "user", parts: [{ text: JSON.stringify({ decisions }) }] }], generationConfig: { response_mime_type: "application/json", response_schema: schema, max_output_tokens: 700 } }),
    });
    if (!response.ok) throw new Error(`Gemini returned ${response.status}`);
    return NextResponse.json({ analysis: normalize(JSON.parse(responseText(await response.json() as Record<string, unknown>)), fallback) });
  } catch {
    return NextResponse.json({ analysis: fallback, fallbackReason: "Gemini 응답을 받지 못해 로컬 리뷰를 표시합니다." });
  }
}
