import { NextResponse } from "next/server";

type Side = "home" | "away";
type Snapshot = { minute: number; formation: string; players: Array<{ name: string; role: string; x: number; y: number }> };
type Insight = { minute: number; headline: string; observation: string };
type Analysis = Record<Side, Insight[]>;

const requestTimes = new Map<string, number>();

function cleanText(value: unknown, fallback: string, maximum: number) {
  if (typeof value !== "string") return fallback;
  const text = value.replace(/\s+/g, " ").trim().slice(0, maximum);
  return text || fallback;
}

function readSnapshots(value: unknown): Record<Side, Snapshot[]> | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const readSide = (side: Side): Snapshot[] => !Array.isArray(source[side]) ? [] : source[side].slice(0, 7).map((raw) => {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const shape = Array.isArray(item.shape) ? item.shape : [];
    return {
      minute: Math.max(0, Math.min(90, Math.round(Number(item.minute) || 0))),
      formation: cleanText(item.formation, "CUSTOM", 20),
      players: shape.slice(0, 11).map((point) => {
        const player = point && typeof point === "object" ? point as Record<string, unknown> : {};
        return {
          name: cleanText(player.name, "선수", 32), role: cleanText(player.role, "CM", 10),
          x: Math.max(0, Math.min(100, Number(player.x) || 50)), y: Math.max(0, Math.min(100, Number(player.y) || 50)),
        };
      }),
    };
  }).sort((left, right) => left.minute - right.minute);
  const snapshots = { home: readSide("home"), away: readSide("away") };
  return snapshots.home.length && snapshots.away.length ? snapshots : null;
}

function localInsight(snapshot: Snapshot): Insight {
  const roles = snapshot.players.map((player) => player.role);
  const attackers = roles.filter((role) => ["ST", "LW", "RW", "AM", "FW"].includes(role)).length;
  const defenders = roles.filter((role) => ["GK", "CB", "LB", "RB", "LWB", "RWB"].includes(role)).length;
  const headline = attackers >= 3 ? "전방 숫자로 폭과 침투를 준비" : defenders >= 5 ? "후방 숫자로 공간을 먼저 보호" : "중앙 균형을 유지한 배치";
  const observation = `${snapshot.minute}분 배치에서 ${snapshot.formation} 구조를 유지합니다. 전방 ${attackers}명·수비 ${defenders}명의 위치를 기준으로 다음 전술 판단에 활용할 수 있습니다.`;
  return { minute: snapshot.minute, headline, observation };
}

function fallbackAnalysis(snapshots: Record<Side, Snapshot[]>): Analysis {
  return { home: snapshots.home.map(localInsight), away: snapshots.away.map(localInsight) };
}

function responseText(payload: Record<string, unknown>) {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const candidate = candidates[0] as { content?: { parts?: Array<{ text?: string }> } } | undefined;
  return candidate?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
}

function normalize(raw: unknown, fallback: Analysis): Analysis {
  if (!raw || typeof raw !== "object") return fallback;
  const source = raw as Record<string, unknown>;
  const readSide = (side: Side) => fallback[side].map((base) => {
    const entries = Array.isArray(source[side]) ? source[side] : [];
    const candidate = entries.find((entry) => entry && typeof entry === "object" && Number((entry as Record<string, unknown>).minute) === base.minute) as Record<string, unknown> | undefined;
    return candidate ? { minute: base.minute, headline: cleanText(candidate.headline, base.headline, 48), observation: cleanText(candidate.observation, base.observation, 160) } : base;
  });
  return { home: readSide("home"), away: readSide("away") };
}

export async function POST(request: Request) {
  const snapshots = readSnapshots(await request.json().catch(() => null));
  if (!snapshots) return NextResponse.json({ error: "Invalid custom fixture snapshots." }, { status: 400 });
  const fallback = fallbackAnalysis(snapshots);
  const clientKey = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "anonymous";
  const now = Date.now();
  if (now - (requestTimes.get(clientKey) ?? 0) < 5_000) return NextResponse.json({ analysis: fallback, provider: "local" });
  requestTimes.set(clientKey, now);
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ analysis: fallback, provider: "local" });

  const item = { type: "OBJECT", properties: { minute: { type: "INTEGER" }, headline: { type: "STRING" }, observation: { type: "STRING" } }, required: ["minute", "headline", "observation"] };
  const schema = { type: "OBJECT", properties: { home: { type: "ARRAY", items: item }, away: { type: "ARRAY", items: item } }, required: ["home", "away"] };
  const instruction = "You are TOUCHLINE 26's Korean football tactical observer. Return only JSON matching the schema. Analyze only each supplied custom pitch snapshot: minute, formation, and player names/roles/coordinates. For every supplied minute, write a concise Korean headline (max 24 Korean characters) and observation (max 85 Korean characters) explaining the visible tactical shape. Do not invent events, scores, player abilities, real-world data, or facts. Avoid generic phrases such as 'the creator entered this position'.";
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite"}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: instruction }] }, contents: [{ role: "user", parts: [{ text: JSON.stringify(snapshots) }] }], generationConfig: { response_mime_type: "application/json", response_schema: schema, max_output_tokens: 1400 } }),
    });
    if (!response.ok) throw new Error(`Gemini returned ${response.status}`);
    return NextResponse.json({ analysis: normalize(JSON.parse(responseText(await response.json() as Record<string, unknown>)), fallback), provider: "gemini" });
  } catch {
    return NextResponse.json({ analysis: fallback, provider: "local" });
  }
}
