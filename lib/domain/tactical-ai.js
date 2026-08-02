const TACTIC_PROFILES = {
  control: { aggression: 52, takeOn: 38, passingFrequency: 84, forwardRuns: 48, defensiveWorkRate: 62 },
  press: { aggression: 86, takeOn: 61, passingFrequency: 58, forwardRuns: 76, defensiveWorkRate: 78 },
  chase: { aggression: 92, takeOn: 82, passingFrequency: 49, forwardRuns: 89, defensiveWorkRate: 56 },
  lock: { aggression: 34, takeOn: 28, passingFrequency: 76, forwardRuns: 33, defensiveWorkRate: 88 },
};

const TACTIC_COPY = {
  control: { summary: "중앙 점유와 안전한 패스 연결로 경기의 리듬을 다시 잡습니다.", caution: "전진 속도가 낮아 박스 진입 횟수가 줄 수 있습니다." },
  press: { summary: "전방 압박과 빠른 전환으로 상대의 첫 패스를 흔듭니다.", caution: "압박이 벗겨지면 수비 라인 뒤 공간이 열릴 수 있습니다." },
  chase: { summary: "전방 숫자와 침투를 늘려 득점 장면을 빠르게 만듭니다.", caution: "공격 가담이 커질수록 전환 수비와 체력 부담이 증가합니다." },
  lock: { summary: "수비 블록과 중앙 보호를 우선해 리드 또는 균형을 지킵니다.", caution: "공을 오래 소유하지 못하면 공격 기회가 줄어들 수 있습니다." },
};

function clamp(value, fallback = 50) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function cleanText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const text = value.replace(/\s+/g, " ").trim();
  return text.slice(0, 260) || fallback;
}

function chooseTactic(prompt, allowedIds) {
  const safePrompt = prompt.toLowerCase();
  let tacticId = "control";
  if (/(리드|잠그|수비|지키|안정)/.test(safePrompt)) tacticId = /(역습|득점|빠르)/.test(safePrompt) ? "press" : "lock";
  if (/(득점|추격|올인|공격 숫자)/.test(safePrompt)) tacticId = "chase";
  if (/(압박|탈환|전방)/.test(safePrompt)) tacticId = "press";
  if (/(점유|안정|통제)/.test(safePrompt)) tacticId = "control";
  return allowedIds.includes(tacticId) ? tacticId : allowedIds[0] ?? "control";
}

function defaultPlayerInstruction(playerId, profile) {
  return {
    playerId,
    aggression: profile.aggression,
    takeOn: profile.takeOn,
    passingFrequency: profile.passingFrequency,
    forwardRuns: profile.forwardRuns,
    defensiveWorkRate: profile.defensiveWorkRate,
    runDirection: profile.forwardRuns >= 70 ? "FORWARD" : profile.defensiveWorkRate >= 75 ? "BACKWARD" : "HOLD",
  };
}

function fieldCoordinate(value, fallback) {
  return Math.max(3, Math.min(97, clamp(value, fallback)));
}

function createPositionChanges(prompt, lineup, profile) {
  const text = String(prompt ?? "").toLowerCase();
  const isLeft = /(왼쪽|좌측|left)/.test(text);
  const isRight = /(오른쪽|우측|right)/.test(text);
  const isCounter = /(역습|빠른 전환|전환|counter)/.test(text);
  const isDefensive = /(지키|수비|잠그|리드)/.test(text);
  const changes = [];
  const add = (matcher, x, y) => {
    const player = lineup.find((item) => matcher.test(item.position));
    if (player && !changes.some((change) => change.playerId === player.id)) changes.push({ playerId: player.id, x, y });
  };

  if (isLeft) add(/^(LB|LW|LM)$/, isDefensive ? 30 : 57, 16);
  if (isRight) add(/^(RB|RW|RM)$/, isDefensive ? 30 : 57, 84);
  if (isCounter) {
    add(/^(ST|FW|CF)$/, 74, 50);
    add(/^(AM|CM|DM)$/, 50, isLeft ? 33 : isRight ? 67 : 50);
  }
  if (isDefensive) {
    add(/^(CB|LCB|RCB)$/, 28, 50);
    add(/^(DM)$/, 38, 50);
  }
  if (changes.length === 0) {
    add(/^(ST|FW|CF)$/, profile.forwardRuns >= 70 ? 70 : 58, 50);
    add(/^(AM|CM|DM)$/, 50, 50);
  }
  return changes.slice(0, 4).map((change) => ({ ...change, x: fieldCoordinate(change.x, 50), y: fieldCoordinate(change.y, 50) }));
}

/**
 * Deterministic fallback for missing/limited AI access. The returned shape is
 * intentionally the same as the Gemini recommendation contract.
 */
export function createLocalTacticalRecommendation(context) {
  const prompt = cleanText(context?.prompt, "현재 경기 상황에 맞는 전술을 추천해줘.");
  const tactics = Array.isArray(context?.tactics) ? context.tactics : [];
  const allowedIds = tactics.map((tactic) => tactic.id).filter((id) => typeof id === "string");
  const recommendedTacticId = chooseTactic(prompt, allowedIds);
  const profile = TACTIC_PROFILES[recommendedTacticId] ?? TACTIC_PROFILES.control;
  const copy = TACTIC_COPY[recommendedTacticId] ?? TACTIC_COPY.control;
  const lineup = Array.isArray(context?.lineup) ? context.lineup : [];
  const forward = lineup.find((player) => /^(ST|FW|CF)$/.test(player.position)) ?? lineup.at(-1);
  const passer = lineup.find((player) => /^(AM|CM|RW|LW)$/.test(player.position)) ?? lineup[0];
  const playerInstructions = forward ? [defaultPlayerInstruction(forward.id, profile)] : [];
  const playerPositions = createPositionChanges(prompt, lineup, profile);
  const passLinks = passer && forward && passer.id !== forward.id
    ? [{ fromPlayerId: passer.id, toPlayerId: forward.id, intensity: clamp(profile.passingFrequency + 10) }]
    : [];

  return {
    provider: "local",
    recommendedTacticId,
    confidence: 72,
    summary: copy.summary,
    reasons: ["입력한 경기 의도와 현재 전술 지표를 함께 반영했습니다.", "적용 전 보드에서 선수 지침과 패스 연결을 다시 확인할 수 있습니다."],
    caution: copy.caution,
    teamInstructions: {
      aggression: profile.aggression,
      takeOn: profile.takeOn,
      passingFrequency: profile.passingFrequency,
    },
    playerPositions,
    playerInstructions,
    passLinks,
  };
}

export function normalizeTacticalRecommendation(candidate, context) {
  const fallback = createLocalTacticalRecommendation(context);
  if (!candidate || typeof candidate !== "object") return fallback;
  const tactics = Array.isArray(context?.tactics) ? context.tactics : [];
  const allowedTacticIds = tactics.map((tactic) => tactic.id).filter((id) => typeof id === "string");
  const playerIds = new Set((Array.isArray(context?.lineup) ? context.lineup : []).map((player) => player.id));
  const recommendedTacticId = allowedTacticIds.includes(candidate.recommendedTacticId)
    ? candidate.recommendedTacticId
    : fallback.recommendedTacticId;
  const profile = TACTIC_PROFILES[recommendedTacticId] ?? TACTIC_PROFILES.control;
  const team = candidate.teamInstructions && typeof candidate.teamInstructions === "object" ? candidate.teamInstructions : {};
  const playerInstructions = Array.isArray(candidate.playerInstructions) ? candidate.playerInstructions : [];
  const playerPositions = Array.isArray(candidate.playerPositions) ? candidate.playerPositions : [];
  const passLinks = Array.isArray(candidate.passLinks) ? candidate.passLinks : [];

  return {
    provider: "gemini",
    recommendedTacticId,
    confidence: clamp(candidate.confidence, fallback.confidence),
    summary: cleanText(candidate.summary, fallback.summary),
    reasons: (Array.isArray(candidate.reasons) ? candidate.reasons : fallback.reasons)
      .map((reason) => cleanText(reason))
      .filter(Boolean)
      .slice(0, 3),
    caution: cleanText(candidate.caution, fallback.caution),
    teamInstructions: {
      aggression: clamp(team.aggression, profile.aggression),
      takeOn: clamp(team.takeOn, profile.takeOn),
      passingFrequency: clamp(team.passingFrequency, profile.passingFrequency),
    },
    playerPositions: playerPositions
      .filter((position) => position && playerIds.has(position.playerId))
      .slice(0, 6)
      .map((position) => ({ playerId: position.playerId, x: fieldCoordinate(position.x, 50), y: fieldCoordinate(position.y, 50) })),
    playerInstructions: playerInstructions
      .filter((instruction) => instruction && playerIds.has(instruction.playerId))
      .slice(0, 4)
      .map((instruction) => ({
        playerId: instruction.playerId,
        aggression: clamp(instruction.aggression, profile.aggression),
        takeOn: clamp(instruction.takeOn, profile.takeOn),
        passingFrequency: clamp(instruction.passingFrequency, profile.passingFrequency),
        forwardRuns: clamp(instruction.forwardRuns, profile.forwardRuns),
        defensiveWorkRate: clamp(instruction.defensiveWorkRate, profile.defensiveWorkRate),
        runDirection: ["FORWARD", "BACKWARD", "HOLD"].includes(instruction.runDirection) ? instruction.runDirection : "HOLD",
      })),
    passLinks: passLinks
      .filter((link) => link && playerIds.has(link.fromPlayerId) && playerIds.has(link.toPlayerId) && link.fromPlayerId !== link.toPlayerId)
      .slice(0, 4)
      .map((link) => ({ fromPlayerId: link.fromPlayerId, toPlayerId: link.toPlayerId, intensity: clamp(link.intensity, 50) })),
  };
}
