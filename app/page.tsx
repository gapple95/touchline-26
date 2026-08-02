"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, FormEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { PITCH_LANES, PITCH_PHASES, resolvePitchPosition } from "@/lib/domain/pitch-zones.js";
import { deriveLiveTacticalMetrics } from "@/lib/domain/live-tactical-metrics.js";
import { createLocalTacticalRecommendation } from "@/lib/domain/tactical-ai.js";
import type { DetailedTacticInstructions, KitPalette, PlayerRelationshipType, PlayerTacticalInstruction, TeamKit, WideFinalAction } from "@/lib/domain/football";

type View = "fixture" | "team" | "match" | "review" | "manager" | "duel";
type TacticId = string;
type Tone = "lime" | "orange" | "mint" | "yellow";

type Player = {
  id: string;
  name: string;
  number: number;
  position: string;
  role: string;
  stamina: number;
};

type MatchFixture = {
  id: string;
  tournament: string;
  stage: string;
  date: string;
  home: { code: string; name: string };
  away: { code: string; name: string };
  availableManagerTeams: Array<"home" | "away">;
  availability: "READY" | "SOON";
  dataScope: string;
};

type Slot = { x: number; y: number; role: string };
type FormationSlot = Pick<Slot, "x" | "y">;
type DragPayload = { origin: "pitch" | "bench"; index: number; anchorOffsetX: number; anchorOffsetY: number };
type DragAnchor = Pick<DragPayload, "anchorOffsetX" | "anchorOffsetY">;

type Tactic = {
  id: TacticId;
  name: string;
  formation: string;
  intent: string;
  tone: Tone;
  metrics: {
    attack: number;
    defence: number;
    centre: number;
    transition: number;
    fatigue: number;
  };
  summary: string;
  risk: string;
  details: DetailedTacticInstructions;
};

type ConfirmedTacticSnapshot = {
  lineup: Player[];
  bench: Player[];
  slots: Slot[];
  details: DetailedTacticInstructions;
};

type PendingPassDraft = {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  intensity: number;
};

type OpponentShapePoint = { x: number; y: number; role: string };
type OpponentTacticalSnapshot = {
  minute: number;
  formation: string;
  phase: string;
  block: string;
  headline: string;
  observation: string;
  responseTacticId: TacticId;
  responseInstruction: string;
  shape: OpponentShapePoint[];
};

type LiveTacticalMetrics = ReturnType<typeof deriveLiveTacticalMetrics>;

type AiTacticalRecommendation = {
  provider: "gemini" | "local";
  recommendedTacticId: TacticId;
  confidence: number;
  summary: string;
  reasons: string[];
  caution: string;
  teamInstructions: Pick<DetailedTacticInstructions, "aggression" | "takeOn" | "passingFrequency">;
  playerInstructions: Array<Pick<PlayerTacticalInstruction, "playerId" | "aggression" | "takeOn" | "passingFrequency" | "forwardRuns" | "defensiveWorkRate" | "runDirection">>;
  passLinks: Array<{ fromPlayerId: string; toPlayerId: string; intensity: number }>;
};

const relationshipLabels: Record<PlayerRelationshipType, string> = {
  COMBINATION: "짧은 연계",
  OVERLAP: "오버랩",
  COVER: "커버",
  SUPPLY: "패스 공급",
  SWITCH: "위치 스위칭",
};

const wideActionLabels: Record<WideFinalAction, string> = {
  BYLINE_DRIBBLE: "코너까지 돌파",
  EARLY_CROSS: "빠른 크로스",
  CUTBACK: "컷백 연결",
  RECYCLE: "뒤로 돌려 점유",
};

const instructionSliders: Array<{ key: "aggression" | "takeOn" | "passingFrequency"; label: string; low: string; high: string }> = [
  { key: "aggression", label: "적극성", low: "신중", high: "과감" },
  { key: "takeOn", label: "1대1 돌파", low: "자제", high: "자주" },
  { key: "passingFrequency", label: "패스 활용", low: "직접 전진", high: "많이 연결" },
];

const playerInstructionSliders: Array<{ key: "aggression" | "takeOn" | "passingFrequency" | "forwardRuns" | "defensiveWorkRate"; label: string; low: string; high: string }> = [
  ...instructionSliders,
  { key: "forwardRuns", label: "전진 움직임", low: "위치 유지", high: "침투 우선" },
  { key: "defensiveWorkRate", label: "수비 가담", low: "공격 대기", high: "깊게 가담" },
];

const opponentTacticalSnapshots: OpponentTacticalSnapshot[] = [
  { minute: 0, formation: "4-3-3", phase: "초기 빌드업", block: "MID BLOCK", headline: "중앙 3명으로 첫 패스 경로를 확보", observation: "양 풀백은 높이를 나눠 가져가고, 중앙 미드필더가 1차 전진 패스를 받습니다.", responseTacticId: "control", responseInstruction: "중앙 숫자를 맞추고 이강인의 전진 패스로 측면 전환을 노립니다.", shape: [{ x: 89, y: 50, role: "GK" }, { x: 78, y: 82, role: "RB" }, { x: 74, y: 62, role: "RCB" }, { x: 74, y: 38, role: "LCB" }, { x: 78, y: 18, role: "LB" }, { x: 61, y: 50, role: "DM" }, { x: 57, y: 70, role: "RCM" }, { x: 57, y: 30, role: "LCM" }, { x: 40, y: 82, role: "RW" }, { x: 36, y: 50, role: "ST" }, { x: 40, y: 18, role: "LW" }] },
  { minute: 15, formation: "4-3-3", phase: "우측 과부하", block: "HIGH BUILD", headline: "오른쪽 하프스페이스에서 3대2를 만듦", observation: "우측 윙·풀백·중앙 미드필더가 같은 채널로 모이며 반대편 윙은 넓게 유지합니다.", responseTacticId: "press", responseInstruction: "상대 오른쪽 첫 터치를 압박하고, 탈취 후 손흥민 쪽 반대 전환을 빠르게 실행합니다.", shape: [{ x: 90, y: 50, role: "GK" }, { x: 76, y: 86, role: "RB" }, { x: 75, y: 64, role: "RCB" }, { x: 76, y: 38, role: "LCB" }, { x: 80, y: 15, role: "LB" }, { x: 61, y: 58, role: "DM" }, { x: 53, y: 78, role: "RCM" }, { x: 58, y: 33, role: "LCM" }, { x: 37, y: 88, role: "RW" }, { x: 34, y: 54, role: "ST" }, { x: 38, y: 15, role: "LW" }] },
  { minute: 30, formation: "4-1-4-1", phase: "중앙 회수", block: "MID BLOCK", headline: "중앙 5명을 세워 두 번째 공을 회수", observation: "공을 잃으면 윙이 내려와 미드필드 4선을 만들고, 앵커가 센터백 앞을 보호합니다.", responseTacticId: "control", responseInstruction: "짧은 연계보다 양쪽 풀백 뒤 공간으로 한 번에 보내며 블록의 폭을 벌립니다.", shape: [{ x: 89, y: 50, role: "GK" }, { x: 77, y: 82, role: "RB" }, { x: 75, y: 62, role: "RCB" }, { x: 75, y: 38, role: "LCB" }, { x: 77, y: 18, role: "LB" }, { x: 62, y: 50, role: "DM" }, { x: 52, y: 82, role: "RM" }, { x: 53, y: 62, role: "RCM" }, { x: 53, y: 38, role: "LCM" }, { x: 52, y: 18, role: "LM" }, { x: 34, y: 50, role: "ST" }] },
  { minute: 45, formation: "4-2-3-1", phase: "하프타임 조정", block: "MID BLOCK", headline: "더블 볼란치로 중앙 전환을 차단", observation: "2명의 수비형 미드필더가 전방 압박 뒤의 공간을 닫고, 2선은 대기합니다.", responseTacticId: "chase", responseInstruction: "윙백을 올려 넓게 고정하고, 중앙에서 막히면 즉시 측면 1대1을 만듭니다.", shape: [{ x: 89, y: 50, role: "GK" }, { x: 77, y: 82, role: "RB" }, { x: 75, y: 62, role: "RCB" }, { x: 75, y: 38, role: "LCB" }, { x: 77, y: 18, role: "LB" }, { x: 62, y: 62, role: "DM" }, { x: 62, y: 38, role: "DM" }, { x: 49, y: 82, role: "RW" }, { x: 48, y: 50, role: "AM" }, { x: 49, y: 18, role: "LW" }, { x: 32, y: 50, role: "ST" }] },
  { minute: 60, formation: "4-4-2", phase: "전방 압박", block: "HIGH PRESS", headline: "투톱이 센터백의 다음 패스를 제한", observation: "전방 두 명이 빌드업을 가르고, 미드필드 라인이 높게 따라붙는 형태입니다.", responseTacticId: "lock", responseInstruction: "수비 라인을 과하게 올리지 않고, 압박을 넘기면 전방 한 명에게 바로 연결합니다.", shape: [{ x: 89, y: 50, role: "GK" }, { x: 77, y: 82, role: "RB" }, { x: 74, y: 62, role: "RCB" }, { x: 74, y: 38, role: "LCB" }, { x: 77, y: 18, role: "LB" }, { x: 57, y: 82, role: "RM" }, { x: 56, y: 61, role: "CM" }, { x: 56, y: 39, role: "CM" }, { x: 57, y: 18, role: "LM" }, { x: 36, y: 63, role: "ST" }, { x: 36, y: 37, role: "ST" }] },
  { minute: 75, formation: "5-4-1", phase: "전환 수비", block: "LOW BLOCK", headline: "박스 앞 5명으로 깊이를 보호", observation: "윙백이 수비 라인에 합류하고, 4명의 미드필더가 박스 앞 공간을 먼저 닫습니다.", responseTacticId: "chase", responseInstruction: "박스 밖에서만 돌지 말고, 좌우 코너 채널을 다르게 설정해 컷백과 빠른 크로스를 섞습니다.", shape: [{ x: 90, y: 50, role: "GK" }, { x: 79, y: 88, role: "RWB" }, { x: 77, y: 68, role: "RCB" }, { x: 77, y: 50, role: "CB" }, { x: 77, y: 32, role: "LCB" }, { x: 79, y: 12, role: "LWB" }, { x: 59, y: 82, role: "RM" }, { x: 59, y: 61, role: "CM" }, { x: 59, y: 39, role: "CM" }, { x: 59, y: 18, role: "LM" }, { x: 38, y: 50, role: "ST" }] },
  { minute: 90, formation: "5-4-1", phase: "막판 대응", block: "LOW BLOCK", headline: "한 번의 전환만 남긴 채 박스 보호", observation: "수비 블록은 낮게 유지하고, 공격 전환은 최전방 한 명과 넓은 윙 채널로 제한합니다.", responseTacticId: "chase", responseInstruction: "후방 리스크를 감수하되, 두 번째 볼을 공격 진영에서 회수하도록 적극성을 높입니다.", shape: [{ x: 91, y: 50, role: "GK" }, { x: 80, y: 88, role: "RWB" }, { x: 78, y: 68, role: "RCB" }, { x: 78, y: 50, role: "CB" }, { x: 78, y: 32, role: "LCB" }, { x: 80, y: 12, role: "LWB" }, { x: 61, y: 82, role: "RM" }, { x: 61, y: 61, role: "CM" }, { x: 61, y: 39, role: "CM" }, { x: 61, y: 18, role: "LM" }, { x: 41, y: 50, role: "ST" }] },
];

function cloneTacticDetails(details: DetailedTacticInstructions): DetailedTacticInstructions {
  return {
    ...details,
    wideActions: { ...details.wideActions },
    relationships: details.relationships.map((relationship) => ({ ...relationship })),
    playerInstructions: details.playerInstructions.map((instruction) => ({
      ...instruction,
      passTargets: instruction.passTargets.map((pass) => ({ ...pass })),
    })),
  };
}

function tacticNameKey(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

function mergeAiRecommendationIntoDetails(details: DetailedTacticInstructions, recommendation: AiTacticalRecommendation, lineup: Player[]): DetailedTacticInstructions {
  const next = cloneTacticDetails(details);
  const allowedPlayerIds = new Set(lineup.map((player) => player.id));
  const byPlayerId = new Map(next.playerInstructions.map((instruction) => [instruction.playerId, instruction]));
  const inheritedInstruction = (playerId: string): PlayerTacticalInstruction => ({
    playerId,
    aggression: next.aggression,
    takeOn: next.takeOn,
    passingFrequency: next.passingFrequency,
    forwardRuns: 50,
    defensiveWorkRate: 50,
    runDirection: "HOLD",
    passTargets: [],
  });

  for (const instruction of recommendation.playerInstructions) {
    if (!allowedPlayerIds.has(instruction.playerId)) continue;
    const current = byPlayerId.get(instruction.playerId) ?? inheritedInstruction(instruction.playerId);
    byPlayerId.set(instruction.playerId, { ...current, ...instruction, passTargets: current.passTargets.map((pass) => ({ ...pass })) });
  }
  for (const link of recommendation.passLinks) {
    if (!allowedPlayerIds.has(link.fromPlayerId) || !allowedPlayerIds.has(link.toPlayerId) || link.fromPlayerId === link.toPlayerId) continue;
    const current = byPlayerId.get(link.fromPlayerId) ?? inheritedInstruction(link.fromPlayerId);
    const withoutTarget = current.passTargets.filter((pass) => pass.toPlayerId !== link.toPlayerId);
    byPlayerId.set(link.fromPlayerId, {
      ...current,
      passTargets: [...withoutTarget, { id: `ai-${link.fromPlayerId}-${link.toPlayerId}`, toPlayerId: link.toPlayerId, intensity: link.intensity }],
    });
  }

  return { ...next, ...recommendation.teamInstructions, playerInstructions: Array.from(byPlayerId.values()) };
}

function cloneTacticSnapshot(snapshot: ConfirmedTacticSnapshot): ConfirmedTacticSnapshot {
  return {
    lineup: snapshot.lineup.map((player) => ({ ...player })),
    bench: snapshot.bench.map((player) => ({ ...player })),
    slots: snapshot.slots.map((slot) => ({ ...slot })),
    details: cloneTacticDetails(snapshot.details),
  };
}

function tacticSnapshotSignature(snapshot: ConfirmedTacticSnapshot) {
  return JSON.stringify({
    lineup: snapshot.lineup.map((player) => player.id),
    bench: snapshot.bench.map((player) => player.id),
    slots: snapshot.slots,
    details: snapshot.details,
  });
}

function connectionStyle(from: FormationSlot, to: FormationSlot): CSSProperties {
  const dx = to.x - from.x;
  const projectedDy = (to.y - from.y) / (105 / 68);
  const length = Math.hypot(dx, projectedDy);
  const angle = Math.atan2(projectedDy, dx) * 180 / Math.PI;
  return { left: `${from.x}%`, top: `${from.y}%`, width: `${length}%`, transform: `rotate(${angle}deg)` };
}

function arrowConnectionStyle(from: FormationSlot, to: FormationSlot): CSSProperties {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 10) return connectionStyle(from, to);
  const insetRatio = Math.min(.22, 4.5 / distance);
  return connectionStyle(
    { x: from.x + dx * insetRatio, y: from.y + dy * insetRatio },
    { x: to.x - dx * insetRatio, y: to.y - dy * insetRatio },
  );
}

function relationshipConnectionStyle(from: FormationSlot, to: FormationSlot, verticalOffset = -7): CSSProperties {
  const dx = to.x - from.x;
  const projectedDy = (to.y - from.y) / (105 / 68);
  const length = Math.hypot(dx, projectedDy);
  const angle = Math.atan2(projectedDy, dx) * 180 / Math.PI;
  return { left: `${from.x}%`, top: `${from.y}%`, width: `${length}%`, transform: `translateY(${verticalOffset}px) rotate(${angle}deg)` };
}

type KitCssVariables = CSSProperties & {
  "--kit-shirt": string;
  "--kit-number": string;
  "--kit-outline": string;
};

const defaultTeamKit: TeamKit = {
  teamId: "KOR",
  competitionId: "FIFA-WC-2026",
  variant: "DEFAULT",
  source: "TOUCHLINE_FALLBACK",
  outfield: { shirt: "#d8ff50", number: "#10231a", outline: "#ffffff" },
  goalkeeper: { shirt: "#ffc857", number: "#10231a", outline: "#ffffff" },
};

function kitCssVariables(palette: KitPalette): KitCssVariables {
  return {
    "--kit-shirt": palette.shirt,
    "--kit-number": palette.number,
    "--kit-outline": palette.outline,
  };
}

const players: Player[] = [
  { id: "kim-seunggyu", name: "김승규", number: 1, position: "GK", role: "스위퍼 키퍼", stamina: 88 },
  { id: "kim-munhwan", name: "김문환", number: 15, position: "RB", role: "오버래핑 풀백", stamina: 91 },
  { id: "kwon-kyungwon", name: "권경원", number: 20, position: "CB", role: "커버 센터백", stamina: 86 },
  { id: "kim-younggwon", name: "김영권", number: 19, position: "CB", role: "빌드업 센터백", stamina: 82 },
  { id: "kim-jinsu", name: "김진수", number: 3, position: "LB", role: "공격형 풀백", stamina: 79 },
  { id: "jung-wooyoung", name: "정우영", number: 5, position: "DM", role: "앵커", stamina: 76 },
  { id: "hwang-inbeom", name: "황인범", number: 6, position: "CM", role: "박스 투 박스", stamina: 84 },
  { id: "lee-jaesung", name: "이재성", number: 10, position: "AM", role: "프레싱 플레이메이커", stamina: 80 },
  { id: "son-heungmin", name: "손흥민", number: 7, position: "LW", role: "채널 러너", stamina: 78 },
  { id: "lee-kangin", name: "이강인", number: 18, position: "RW", role: "와이드 플레이메이커", stamina: 89 },
  { id: "cho-guesung", name: "조규성", number: 9, position: "ST", role: "프레싱 포워드", stamina: 83 },
  { id: "hwang-heechang", name: "황희찬", number: 11, position: "FW", role: "인사이드 포워드", stamina: 93 },
  { id: "paik-seungho", name: "백승호", number: 8, position: "CM", role: "레지스타", stamina: 90 },
  { id: "hong-chul", name: "홍철", number: 14, position: "LB", role: "와이드 풀백", stamina: 87 },
];

const matchFixtures: MatchFixture[] = [
  {
    id: "kor-por-2022",
    tournament: "FIFA WORLD CUP QATAR 2022",
    stage: "GROUP H",
    date: "2022.12.02",
    home: { code: "KOR", name: "대한민국" },
    away: { code: "POR", name: "포르투갈" },
    availableManagerTeams: ["home"],
    availability: "READY",
    dataScope: "공식 경기 정보 · 선발 11명 · 교체 출전 선수",
  },
  {
    id: "kor-uru-2022",
    tournament: "FIFA WORLD CUP QATAR 2022",
    stage: "GROUP H",
    date: "2022.11.24",
    home: { code: "URU", name: "우루과이" },
    away: { code: "KOR", name: "대한민국" },
    availableManagerTeams: ["away"],
    availability: "SOON",
    dataScope: "명단 데이터 연결 예정",
  },
  {
    id: "kor-gha-2022",
    tournament: "FIFA WORLD CUP QATAR 2022",
    stage: "GROUP H",
    date: "2022.11.28",
    home: { code: "KOR", name: "대한민국" },
    away: { code: "GHA", name: "가나" },
    availableManagerTeams: ["home"],
    availability: "SOON",
    dataScope: "명단 데이터 연결 예정",
  },
];

const initialTactics: Tactic[] = [
  {
    id: "control",
    name: "CONTROL",
    formation: "4-2-3-1",
    intent: "경기 통제",
    tone: "lime",
    metrics: { attack: 64, defence: 82, centre: 86, transition: 66, fatigue: 41 },
    summary: "중앙 수적 우위와 안정적인 3+2 빌드업",
    risk: "낮은 템포로 박스 진입 횟수가 줄어들 수 있음",
    details: {
      aggression: 52, takeOn: 38, passingFrequency: 84, wideFinalAction: "CUTBACK", wideActions: { left: "CUTBACK", right: "CUTBACK" },
      relationships: [{ id: "control-supply", fromPlayerId: "lee-kangin", toPlayerId: "cho-guesung", type: "SUPPLY" }],
      playerInstructions: [],
    },
  },
  {
    id: "press",
    name: "PRESS",
    formation: "4-3-3",
    intent: "전방 압박",
    tone: "mint",
    metrics: { attack: 79, defence: 68, centre: 72, transition: 86, fatigue: 78 },
    summary: "센터백을 압박하고 첫 패스를 측면으로 유도",
    risk: "압박이 풀리면 수비 라인 뒤 공간이 커짐",
    details: {
      aggression: 86, takeOn: 61, passingFrequency: 58, wideFinalAction: "EARLY_CROSS", wideActions: { left: "EARLY_CROSS", right: "EARLY_CROSS" },
      relationships: [{ id: "press-cover", fromPlayerId: "jung-wooyoung", toPlayerId: "kim-jinsu", type: "COVER" }],
      playerInstructions: [],
    },
  },
  {
    id: "chase",
    name: "CHASE",
    formation: "3-4-3",
    intent: "득점 추격",
    tone: "orange",
    metrics: { attack: 88, defence: 54, centre: 61, transition: 90, fatigue: 92 },
    summary: "전방 5명을 확보하고 반대편 채널을 즉시 공략",
    risk: "양쪽 윙백 전진 시 전환 수비가 크게 약화됨",
    details: {
      aggression: 92, takeOn: 82, passingFrequency: 49, wideFinalAction: "BYLINE_DRIBBLE", wideActions: { left: "BYLINE_DRIBBLE", right: "BYLINE_DRIBBLE" },
      relationships: [{ id: "chase-overlap", fromPlayerId: "kim-jinsu", toPlayerId: "son-heungmin", type: "OVERLAP" }],
      playerInstructions: [],
    },
  },
  {
    id: "lock",
    name: "LOCK",
    formation: "5-4-1",
    intent: "리드 보호",
    tone: "yellow",
    metrics: { attack: 38, defence: 91, centre: 88, transition: 55, fatigue: 32 },
    summary: "하프스페이스를 닫고 한 명의 역습 출구를 유지",
    risk: "상대 진영에서 공을 소유하기 어려움",
    details: {
      aggression: 34, takeOn: 28, passingFrequency: 76, wideFinalAction: "RECYCLE", wideActions: { left: "RECYCLE", right: "RECYCLE" },
      relationships: [{ id: "lock-cover", fromPlayerId: "kim-younggwon", toPlayerId: "kim-jinsu", type: "COVER" }],
      playerInstructions: [],
    },
  },
];

const formationSlots: Record<TacticId, FormationSlot[]> = {
  control: [
    { x: 11, y: 50 }, { x: 28, y: 87 }, { x: 24, y: 38 },
    { x: 24, y: 62 }, { x: 28, y: 13 }, { x: 45, y: 38 },
    { x: 45, y: 62 }, { x: 67, y: 50 }, { x: 67, y: 16 },
    { x: 67, y: 84 }, { x: 86, y: 50 },
  ],
  press: [
    { x: 11, y: 50 }, { x: 28, y: 87 }, { x: 24, y: 38 },
    { x: 24, y: 62 }, { x: 28, y: 13 }, { x: 43, y: 50 },
    { x: 55, y: 35 }, { x: 55, y: 65 }, { x: 76, y: 15 },
    { x: 76, y: 85 }, { x: 87, y: 50 },
  ],
  chase: [
    { x: 11, y: 50 }, { x: 26, y: 78 }, { x: 23, y: 50 },
    { x: 26, y: 22 }, { x: 48, y: 11 }, { x: 55, y: 40 },
    { x: 55, y: 60 }, { x: 48, y: 89 }, { x: 77, y: 17 },
    { x: 77, y: 83 }, { x: 87, y: 50 },
  ],
  lock: [
    { x: 11, y: 50 }, { x: 31, y: 92 }, { x: 24, y: 29 },
    { x: 21, y: 50 }, { x: 31, y: 8 }, { x: 24, y: 71 },
    { x: 55, y: 40 }, { x: 55, y: 60 }, { x: 55, y: 15 },
    { x: 55, y: 85 }, { x: 86, y: 50 },
  ],
};

function createFormationSlots(id: TacticId, layouts: Record<TacticId, FormationSlot[]> = formationSlots): Slot[] {
  return (layouts[id] ?? formationSlots.control).map(({ x, y }) => ({ x, y, role: resolvePitchPosition(x, y).code }));
}

function cloneFormationLayouts(layouts: Record<TacticId, FormationSlot[]>): Record<TacticId, FormationSlot[]> {
  return Object.fromEntries(Object.entries(layouts).map(([id, layout]) => [id, layout.map((slot) => ({ ...slot }))]));
}

function createInitialConfirmedTactics(): Record<TacticId, ConfirmedTacticSnapshot> {
  return Object.fromEntries(initialTactics.map((tactic) => [tactic.id, {
    lineup: players.slice(0, 11).map((player) => ({ ...player })),
    bench: players.slice(11).map((player) => ({ ...player })),
    slots: createFormationSlots(tactic.id),
    details: cloneTacticDetails(tactic.details),
  }]));
}

const navItems: Array<{ id: View; label: string; number: string }> = [
  { id: "match", label: "매치룸", number: "01" },
  { id: "review", label: "경기 리뷰", number: "02" },
  { id: "manager", label: "감독 카드", number: "03" },
  { id: "duel", label: "전술 대결", number: "04" },
];

export default function Home() {
  const [view, setView] = useState<View>("fixture");
  const [selectedFixture, setSelectedFixture] = useState<MatchFixture | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<"home" | "away" | null>(null);
  const [savedTactics, setSavedTactics] = useState<Tactic[]>(initialTactics);
  const [tacticLayouts, setTacticLayouts] = useState<Record<TacticId, FormationSlot[]>>(() => cloneFormationLayouts(formationSlots));
  const [activeTacticId, setActiveTacticId] = useState<TacticId>("control");
  const [lineup, setLineup] = useState(players.slice(0, 11));
  const [bench, setBench] = useState(players.slice(11));
  const [slots, setSlots] = useState<Slot[]>(() => createFormationSlots("control"));
  const [confirmedTactics, setConfirmedTactics] = useState<Record<TacticId, ConfirmedTacticSnapshot>>(() => createInitialConfirmedTactics());
  const [hoveredZone, setHoveredZone] = useState<ReturnType<typeof resolvePitchPosition> | null>(null);
  const [dragAnchor, setDragAnchor] = useState<DragAnchor | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);
  const [switchCount, setSwitchCount] = useState(0);
  const [coachInput, setCoachInput] = useState("");
  const [recommendation, setRecommendation] = useState<AiTacticalRecommendation | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [notice, setNotice] = useState("CONTROL 전술로 경기를 운영 중입니다.");
  const [duelResolved, setDuelResolved] = useState(false);

  function selectFixture(fixture: MatchFixture) {
    if (fixture.availability !== "READY") return;
    setSelectedFixture(fixture);
    setSelectedTeam(null);
    setView("team");
  }

  function selectManagedTeam(team: "home" | "away") {
    if (!selectedFixture || !selectedFixture.availableManagerTeams.includes(team)) return;
    const managedTeam = selectedFixture[team];
    setSelectedTeam(team);
    setView("match");
    setNotice(`${managedTeam.name}의 킥오프 전 전술을 설계하고 저장하세요.`);
  }

  const activeTactic = savedTactics.find((tactic) => tactic.id === activeTacticId) ?? savedTactics[0];
  const currentTacticSnapshot: ConfirmedTacticSnapshot = { lineup, bench, slots, details: activeTactic.details };
  const confirmedTacticSnapshot = confirmedTactics[activeTacticId];
  const hasUnconfirmedChanges = !confirmedTacticSnapshot || tacticSnapshotSignature(currentTacticSnapshot) !== tacticSnapshotSignature(confirmedTacticSnapshot);
  const liveMetrics = useMemo(() => deriveLiveTacticalMetrics({ players: lineup, slots, details: activeTactic.details }), [lineup, slots, activeTactic.details]);
  const confirmedLiveMetrics = useMemo(() => deriveLiveTacticalMetrics({
    players: confirmedTacticSnapshot?.lineup ?? lineup,
    slots: confirmedTacticSnapshot?.slots ?? slots,
    details: confirmedTacticSnapshot?.details ?? activeTactic.details,
  }), [confirmedTacticSnapshot, lineup, slots, activeTactic.details]);
  const metricDelta = useMemo(() => ({
    attack: liveMetrics.attack - confirmedLiveMetrics.attack,
    defence: liveMetrics.defence - confirmedLiveMetrics.defence,
    centre: liveMetrics.centre - confirmedLiveMetrics.centre,
    transition: liveMetrics.transition - confirmedLiveMetrics.transition,
    fatigue: liveMetrics.fatigue - confirmedLiveMetrics.fatigue,
  }), [liveMetrics, confirmedLiveMetrics]);

  function applyTactic(id: TacticId, source: "direct" | "coach" = "direct") {
    const next = savedTactics.find((tactic) => tactic.id === id) ?? savedTactics[0];
    setActiveTacticId(id);
    setSlots(createFormationSlots(id, tacticLayouts));
    setHoveredZone(null);
    setSelectedPlayer(null);
    setSwitchCount((count) => count + 1);
    setNotice(`${next.name} ${next.formation} 전술을 ${source === "coach" ? "AI 추천에서" : "직접"} 적용했습니다.`);
  }

  function resetBoard() {
    if (!confirmedTacticSnapshot) return;
    const restoredSnapshot = cloneTacticSnapshot(confirmedTacticSnapshot);
    setLineup(restoredSnapshot.lineup);
    setBench(restoredSnapshot.bench);
    setSlots(restoredSnapshot.slots);
    setTacticLayouts((current) => ({
      ...current,
      [activeTacticId]: restoredSnapshot.slots.map(({ x, y }) => ({ x, y })),
    }));
    setSavedTactics((current) => current.map((tactic) => tactic.id === activeTacticId
      ? { ...tactic, details: cloneTacticDetails(restoredSnapshot.details) }
      : tactic));
    setHoveredZone(null);
    setSelectedPlayer(null);
    setNotice(`${activeTactic.name} 전술을 마지막 확정 상태로 되돌렸습니다.`);
  }

  function createTactic(name: string, baseTacticId: TacticId) {
    const base = savedTactics.find((tactic) => tactic.id === baseTacticId) ?? activeTactic;
    const customNumber = savedTactics.filter((tactic) => tactic.id.startsWith("custom-")).length + 1;
    const requestedName = name.trim().replace(/\s+/g, " ") || `MY TACTIC ${customNumber}`;
    if (savedTactics.some((tactic) => tacticNameKey(tactic.name) === tacticNameKey(requestedName))) {
      setNotice(`"${requestedName}" 이름의 전술이 이미 있습니다. 다른 이름을 입력하세요.`);
      return false;
    }
    const id = `custom-${customNumber}`;
    const layout = (tacticLayouts[base.id] ?? formationSlots.control).map((slot) => ({ ...slot }));
    const tones: Tone[] = ["orange", "mint", "yellow", "lime"];
    const nextTactic: Tactic = {
      ...base,
      id,
      name: requestedName,
      intent: `${base.name} 기반`,
      tone: tones[(customNumber - 1) % tones.length],
      metrics: { ...base.metrics },
      summary: `${base.name} 전술을 기준으로 만든 사용자 전술`,
      details: {
        ...cloneTacticDetails(base.details),
        relationships: base.details.relationships.map((relationship) => ({ ...relationship, id: `${id}-${relationship.id}` })),
        playerInstructions: base.details.playerInstructions.map((instruction) => ({
          ...instruction,
          passTargets: instruction.passTargets.map((pass) => ({ ...pass, id: `${id}-${pass.id}` })),
        })),
      },
    };
    const createdSlots = createFormationSlots(id, { ...tacticLayouts, [id]: layout });

    setSavedTactics((current) => [...current, nextTactic]);
    setTacticLayouts((current) => ({ ...current, [id]: layout.map((slot) => ({ ...slot })) }));
    setActiveTacticId(id);
    setSlots(createdSlots);
    setConfirmedTactics((current) => ({ ...current, [id]: cloneTacticSnapshot({
      lineup,
      bench,
      slots: createdSlots,
      details: nextTactic.details,
    }) }));
    setHoveredZone(null);
    setSelectedPlayer(null);
    setSwitchCount((count) => count + 1);
    setNotice(`${nextTactic.name} 전술을 ${base.name} 기준으로 만들고 적용했습니다.`);
    return true;
  }

  function updateTacticDetails(id: TacticId, details: DetailedTacticInstructions, announce = true) {
    setSavedTactics((current) => current.map((tactic) => tactic.id === id
      ? { ...tactic, details: cloneTacticDetails(details) }
      : tactic));
    if (announce) setNotice(`${activeTactic.name} 전술의 행동 지침과 선수 관계를 저장했습니다.`);
  }

  function confirmCurrentTactic() {
    setConfirmedTactics((current) => ({ ...current, [activeTacticId]: cloneTacticSnapshot(currentTacticSnapshot) }));
    setTacticLayouts((current) => ({ ...current, [activeTacticId]: slots.map(({ x, y }) => ({ x, y })) }));
    setNotice(`${activeTactic.name} 전술의 현재 배치와 팀·개인 지침을 확정했습니다.`);
  }

  function startDrag(event: DragEvent<HTMLElement>, origin: DragPayload["origin"], index: number) {
    const marker = origin === "pitch" ? event.currentTarget.querySelector<HTMLElement>(":scope > span") : null;
    const markerRect = marker?.getBoundingClientRect();
    const anchorOffsetX = markerRect ? event.clientX - (markerRect.left + markerRect.width / 2) : 0;
    const anchorOffsetY = markerRect ? event.clientY - (markerRect.top + markerRect.height / 2) : 0;
    const payload = { origin, index, anchorOffsetX, anchorOffsetY } satisfies DragPayload;
    setDragAnchor(origin === "pitch" ? { anchorOffsetX, anchorOffsetY } : null);
    event.dataTransfer.setData("application/json", JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "move";
  }

  function readDrag(event: DragEvent<HTMLElement>): DragPayload | null {
    const raw = event.dataTransfer.getData("application/json");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as DragPayload;
    } catch {
      return null;
    }
  }

  function pitchCoordinates(element: HTMLDivElement, clientX: number, clientY: number) {
    const rect = element.getBoundingClientRect();
    return {
      x: Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.max(2, Math.min(98, ((clientY - rect.top) / rect.height) * 100)),
    };
  }

  function previewPitchZone(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const { x, y } = pitchCoordinates(
      event.currentTarget,
      event.clientX - (dragAnchor?.anchorOffsetX ?? 0),
      event.clientY - (dragAnchor?.anchorOffsetY ?? 0),
    );
    const nextZone = resolvePitchPosition(x, y);
    setHoveredZone((current) => current?.zoneId === nextZone.zoneId ? current : nextZone);
  }

  function leavePitchZone(event: DragEvent<HTMLDivElement>) {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return;
    setHoveredZone(null);
  }

  function clearPitchZone() {
    setHoveredZone(null);
    setDragAnchor(null);
  }

  function movePitchPlayer(index: number, x: number, y: number) {
    const position = resolvePitchPosition(x, y);
    setSlots((current) => current.map((slot, slotIndex) => slotIndex === index ? { ...slot, x, y, role: position.code } : slot));
    setTacticLayouts((current) => {
      const activeLayout = current[activeTacticId] ?? slots.map((slot) => ({ x: slot.x, y: slot.y }));
      return { ...current, [activeTacticId]: activeLayout.map((slot, slotIndex) => slotIndex === index ? { x, y } : slot) };
    });
    setNotice(`${lineup[index].name} 선수를 ${position.code} 구역으로 이동하고 현재 전술에 저장했습니다.`);
  }

  function dropOnPitch(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setHoveredZone(null);
    const payload = readDrag(event);
    if (!payload || payload.origin !== "pitch") return;
    const { x, y } = pitchCoordinates(
      event.currentTarget,
      event.clientX - (payload.anchorOffsetX ?? 0),
      event.clientY - (payload.anchorOffsetY ?? 0),
    );
    movePitchPlayer(payload.index, x, y);
    setDragAnchor(null);
  }

  function dropOnPlayer(event: DragEvent<HTMLButtonElement>, targetIndex: number) {
    const payload = readDrag(event);
    if (!payload) return;
    if (payload.origin === "pitch") {
      event.preventDefault();
      event.stopPropagation();
      setHoveredZone(null);
      const pitch = event.currentTarget.closest<HTMLDivElement>(".pitch-field");
      if (!pitch) return;
      const { x, y } = pitchCoordinates(
        pitch,
        event.clientX - (payload.anchorOffsetX ?? 0),
        event.clientY - (payload.anchorOffsetY ?? 0),
      );
      movePitchPlayer(payload.index, x, y);
      setDragAnchor(null);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setHoveredZone(null);
    setDragAnchor(null);
    const incoming = bench[payload.index];
    const outgoing = lineup[targetIndex];
    setLineup((current) => current.map((player, index) => index === targetIndex ? incoming : player));
    setBench((current) => current.map((player, index) => index === payload.index ? outgoing : player));
    setSelectedPlayer(null);
    setNotice(`${outgoing.name} 대신 ${incoming.name} 선수를 투입했습니다. 역할 적합도와 시너지가 다시 계산됩니다.`);
  }

  function clickPitchPlayer(index: number) {
    if (selectedPlayer === index) {
      setSelectedPlayer(null);
      setNotice("개인 지침 편집을 닫았습니다.");
      return;
    }
    setSelectedPlayer(index);
    setNotice(`${lineup[index].name} 선수의 개인 지침을 편집합니다.`);
  }

  function clickBenchPlayer(index: number) {
    if (selectedPlayer === null) {
      setNotice("먼저 교체할 선수를 전술 보드에서 선택하세요.");
      return;
    }
    const incoming = bench[index];
    const outgoing = lineup[selectedPlayer];
    setLineup((current) => current.map((player, playerIndex) => playerIndex === selectedPlayer ? incoming : player));
    setBench((current) => current.map((player, benchIndex) => benchIndex === index ? outgoing : player));
    setSelectedPlayer(null);
    setNotice(`${incoming.name} 선수를 투입했습니다.`);
  }

  function aiRecommendationContext(prompt: string) {
    return {
      prompt,
      minute: 0,
      activeTacticId,
      tactics: savedTactics.map((tactic) => ({ id: tactic.id, name: tactic.name, formation: tactic.formation, intent: tactic.intent })),
      lineup: lineup.map((player) => ({ id: player.id, name: player.name, position: player.position, role: player.role, stamina: player.stamina })),
      liveMetrics,
    };
  }

  async function generateRecommendation() {
    const prompt = coachInput.replace(/\s+/g, " ").trim();
    if (!prompt) return;
    const context = aiRecommendationContext(prompt);
    setAiLoading(true);
    try {
      const response = await fetch("/api/ai-tactical-recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(context),
      });
      const payload = await response.json() as { recommendation?: AiTacticalRecommendation };
      if (!response.ok || !payload.recommendation) throw new Error("Recommendation unavailable");
      const result = payload.recommendation;
      setRecommendation(result);
      const tactic = savedTactics.find((item) => item.id === result.recommendedTacticId) ?? savedTactics[0];
      setNotice(`${result.provider === "gemini" ? "AI" : "로컬 코치"}가 ${tactic.intent} 방향의 전술을 제안했습니다.`);
    } catch {
      const result = createLocalTacticalRecommendation(context) as AiTacticalRecommendation;
      setRecommendation(result);
      setNotice("AI 연결을 사용할 수 없어 로컬 전술 코치의 제안으로 전환했습니다.");
    } finally {
      setAiLoading(false);
    }
  }

  function applyAiRecommendation(result: AiTacticalRecommendation) {
    const target = savedTactics.find((tactic) => tactic.id === result.recommendedTacticId);
    if (!target) return;
    const details = mergeAiRecommendationIntoDetails(target.details, result, lineup);
    setSavedTactics((current) => current.map((tactic) => tactic.id === target.id ? { ...tactic, details } : tactic));
    setActiveTacticId(target.id);
    setSlots(createFormationSlots(target.id, tacticLayouts));
    setHoveredZone(null);
    setSelectedPlayer(null);
    setRecommendation(null);
    setNotice(`${target.name} 전술과 AI 제안 지침을 라이브 보드에 적용했습니다. 저장을 누르면 확정됩니다.`);
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <button className="wordmark" onClick={() => setView("fixture")} aria-label="TOUCHLINE 26 경기 선택으로 이동">
          <span className="wordmark-box">T</span>
          <span>TOUCHLINE <b>26</b></span>
        </button>
        {selectedFixture && selectedTeam && <button className={view === "fixture" ? "fixture-nav active" : "fixture-nav"} onClick={() => setView("fixture")}>경기 선택</button>}
        {selectedFixture && selectedTeam && <nav className="primary-nav" aria-label="서비스 화면">
          {navItems.map((item) => (
            <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)} aria-current={view === item.id ? "page" : undefined}>
              <span>{item.number}</span>{item.label}
            </button>
          ))}
        </nav>}
        {selectedFixture && selectedTeam && view !== "fixture" && view !== "team" && view !== "match" && (
          <div className="header-match">
            <span className="live-dot" /> <b>KICKOFF</b> {selectedFixture.home.code} vs {selectedFixture.away.code}
          </div>
        )}
      </header>

      {view === "fixture" && <FixtureSelector fixtures={matchFixtures} selectedFixtureId={selectedFixture?.id ?? null} onSelect={selectFixture} />}
      {view === "team" && selectedFixture && <TeamSelector fixture={selectedFixture} onBack={() => setView("fixture")} onSelect={selectManagedTeam} />}

      {view === "match" && selectedFixture && selectedTeam && (
        <MatchRoom
          fixture={selectedFixture}
          savedTactics={savedTactics}
          activeTactic={activeTactic}
          liveMetrics={liveMetrics}
          metricDelta={metricDelta}
          lineup={lineup}
          bench={bench}
          slots={slots}
          hoveredZone={hoveredZone}
          selectedPlayer={selectedPlayer}
          coachInput={coachInput}
          recommendation={recommendation}
          aiLoading={aiLoading}
          notice={notice}
          hasUnconfirmedChanges={hasUnconfirmedChanges}
          teamKit={defaultTeamKit}
          onTactic={applyTactic}
          onReset={resetBoard}
          onCreateTactic={createTactic}
          onUpdateTacticDetails={updateTacticDetails}
          onConfirmTactic={confirmCurrentTactic}
          onStartDrag={startDrag}
          onDragOverPitch={previewPitchZone}
          onDragLeavePitch={leavePitchZone}
          onDragEnd={clearPitchZone}
          onDropPitch={dropOnPitch}
          onDropPlayer={dropOnPlayer}
          onPlayerClick={clickPitchPlayer}
          onBenchClick={clickBenchPlayer}
          onCoachInput={setCoachInput}
          onRecommend={generateRecommendation}
          onApplyRecommendation={applyAiRecommendation}
        />
      )}

      {view === "review" && (
        <ReviewScreen activeTactic={activeTactic} switchCount={switchCount} onReplay={() => setView("match")} />
      )}

      {view === "manager" && (
        <ManagerScreen switchCount={switchCount} activeTactic={activeTactic} />
      )}

      {view === "duel" && (
        <DuelScreen activeTactic={activeTactic} resolved={duelResolved} onResolve={() => setDuelResolved(true)} onBack={() => setView("match")} />
      )}

      {selectedFixture && selectedTeam && view !== "fixture" && view !== "team" && view !== "match" && (
        <footer className="app-footer">
          <div><b>DATA POLICY</b><span>FIFA 공식값과 TOUCHLINE 파생 지표를 분리 표시합니다.</span></div>
          <div><span className="source-dot official" /> OFFICIAL DATA <span className="source-dot derived" /> DERIVED SIMULATION</div>
          <strong>THE TOUCHLINE IS YOURS.</strong>
        </footer>
      )}
    </main>
  );
}

type MatchRoomProps = {
  fixture: MatchFixture;
  savedTactics: Tactic[];
  activeTactic: Tactic;
  liveMetrics: LiveTacticalMetrics;
  metricDelta: { attack: number; defence: number; centre: number; transition: number; fatigue: number };
  lineup: Player[];
  bench: Player[];
  slots: Slot[];
  hoveredZone: ReturnType<typeof resolvePitchPosition> | null;
  selectedPlayer: number | null;
  coachInput: string;
  recommendation: AiTacticalRecommendation | null;
  aiLoading: boolean;
  notice: string;
  hasUnconfirmedChanges: boolean;
  teamKit: TeamKit;
  onTactic: (id: TacticId, source?: "direct" | "coach") => void;
  onReset: () => void;
  onCreateTactic: (name: string, baseTacticId: TacticId) => boolean;
  onUpdateTacticDetails: (id: TacticId, details: DetailedTacticInstructions, announce?: boolean) => void;
  onConfirmTactic: () => void;
  onStartDrag: (event: DragEvent<HTMLElement>, origin: DragPayload["origin"], index: number) => void;
  onDragOverPitch: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeavePitch: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDropPitch: (event: DragEvent<HTMLDivElement>) => void;
  onDropPlayer: (event: DragEvent<HTMLButtonElement>, targetIndex: number) => void;
  onPlayerClick: (index: number) => void;
  onBenchClick: (index: number) => void;
  onCoachInput: (value: string) => void;
  onRecommend: () => void;
  onApplyRecommendation: (recommendation: AiTacticalRecommendation) => void;
};

function FixtureSelector({ fixtures, selectedFixtureId, onSelect }: { fixtures: MatchFixture[]; selectedFixtureId: string | null; onSelect: (fixture: MatchFixture) => void }) {
  return (
    <section className="fixture-screen" aria-labelledby="fixture-title">
      <div className="fixture-intro">
        <span>WORLD CUP MATCH ARCHIVE</span>
        <h1 id="fixture-title">어떤 실제 경기를<br />다시 지휘할까요?</h1>
        <p>공식 출전 명단을 기준으로, 그 순간 당신이라면 어떤 전술을 선택했을지 설계합니다.</p>
      </div>

      <div className="fixture-list" aria-label="월드컵 경기 선택">
        {fixtures.map((fixture) => {
          const isReady = fixture.availability === "READY";
          const isSelected = fixture.id === selectedFixtureId;
          return (
            <button key={fixture.id} className={`fixture-card ${isReady ? "ready" : "soon"} ${isSelected ? "selected" : ""}`} onClick={() => onSelect(fixture)} disabled={!isReady}>
              <div className="fixture-card-top"><span>{fixture.tournament}</span><b>{isReady ? "PLAYABLE" : "COMING SOON"}</b></div>
              <div className="fixture-teams"><strong>{fixture.home.code}</strong><i>VS</i><strong>{fixture.away.code}</strong></div>
              <div className="fixture-names"><span>{fixture.home.name}</span><span>{fixture.away.name}</span></div>
              <div className="fixture-card-bottom"><span>{fixture.stage} · {fixture.date}</span><b>{fixture.dataScope}</b></div>
              {isReady && <em>내가 맡을 팀 선택 →</em>}
            </button>
          );
        })}
      </div>

      <div className="fixture-policy"><b>DATA BOUNDARY</b><span>경기·출전 명단은 공식 데이터, 피치 위 배치와 지침은 당신의 반사실적 전술입니다.</span></div>
    </section>
  );
}

function TeamSelector({ fixture, onBack, onSelect }: { fixture: MatchFixture; onBack: () => void; onSelect: (team: "home" | "away") => void }) {
  return (
    <section className="team-select-screen" aria-labelledby="team-select-title">
      <button className="back-to-fixtures" onClick={onBack}>← 경기 다시 선택</button>
      <span>STEP 02 · MANAGER TEAM</span>
      <h1 id="team-select-title">어느 팀의 감독이<br />되시겠어요?</h1>
      <p>{fixture.home.name} vs {fixture.away.name}. 선택한 팀의 공식 출전 명단으로 킥오프 전 전술을 저장합니다.</p>
      <div className="team-select-grid">
        {(["home", "away"] as const).map((side) => {
          const team = fixture[side];
          const playable = fixture.availableManagerTeams.includes(side);
          return <button key={side} className={`team-select-card ${playable ? "ready" : "soon"}`} disabled={!playable} onClick={() => onSelect(side)}>
            <span>{side === "home" ? "HOME TEAM" : "AWAY TEAM"}</span>
            <strong>{team.code}</strong><b>{team.name}</b>
            <small>{playable ? "이 팀으로 전술 설계 시작" : "출전 명단 데이터 연결 예정"}</small>
            {playable && <em>선택 →</em>}
          </button>;
        })}
      </div>
    </section>
  );
}

function MatchRoom(props: MatchRoomProps) {
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [widePlayPickerOpen, setWidePlayPickerOpen] = useState(false);
  const [widePlayPickerSide, setWidePlayPickerSide] = useState<"left" | "right">("left");
  const [opponentSnapshotMinute, setOpponentSnapshotMinute] = useState(0);
  const [coachDrawerOpen, setCoachDrawerOpen] = useState(false);
  const [newTacticName, setNewTacticName] = useState("");
  const [newTacticNameError, setNewTacticNameError] = useState("");
  const [baseTacticId, setBaseTacticId] = useState<TacticId>(props.activeTactic.id);
  const [detailDraft, setDetailDraft] = useState<DetailedTacticInstructions>(() => cloneTacticDetails(props.activeTactic.details));
  const [passLinking, setPassLinking] = useState(false);
  const [relationshipLinking, setRelationshipLinking] = useState<PlayerRelationshipType | null>(null);
  const [passPointer, setPassPointer] = useState<FormationSlot | null>(null);
  const [pendingPass, setPendingPass] = useState<PendingPassDraft | null>(null);
  const [passPopoverPosition, setPassPopoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [activePassId, setActivePassId] = useState<string | null>(null);
  const [playerMenuOpen, setPlayerMenuOpen] = useState(false);
  const [playerMenuPosition, setPlayerMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const playerMenuRef = useRef<HTMLDivElement>(null);
  const playerMenuDragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const pitchFieldRef = useRef<HTMLDivElement>(null);
  const passPopoverRef = useRef<HTMLDivElement>(null);
  const passPopoverDragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const recommended = props.recommendation
    ? props.savedTactics.find((tactic) => tactic.id === props.recommendation.recommendedTacticId) ?? null
    : null;
  const baseTactic = props.savedTactics.find((tactic) => tactic.id === baseTacticId) ?? props.activeTactic;
  const hasDuplicateTacticName = Boolean(tacticNameKey(newTacticName)) && props.savedTactics.some((tactic) => tacticNameKey(tactic.name) === tacticNameKey(newTacticName));
  const selectedPlayerData = props.selectedPlayer === null ? null : props.lineup[props.selectedPlayer];
  const selectedPlayerSlot = props.selectedPlayer === null ? null : props.slots[props.selectedPlayer];
  const selectedInstruction = selectedPlayerData ? playerInstructionFor(selectedPlayerData.id) : null;
  const opponentSnapshot = opponentTacticalSnapshots.find((snapshot) => snapshot.minute === opponentSnapshotMinute) ?? opponentTacticalSnapshots[0];

  useEffect(() => {
    setDetailDraft(cloneTacticDetails(props.activeTactic.details));
    setWidePlayPickerOpen(false);
    setPassLinking(false);
    setRelationshipLinking(null);
    setPassPointer(null);
    setPendingPass(null);
    setActivePassId(null);
    setPlayerMenuOpen(false);
  }, [props.activeTactic.id]);

  useEffect(() => {
    setPassLinking(false);
    setRelationshipLinking(null);
    setPassPointer(null);
    setPendingPass(null);
    setActivePassId(null);
    setPlayerMenuOpen(props.selectedPlayer !== null);
  }, [props.selectedPlayer]);

  useEffect(() => {
    if (!playerMenuOpen) return;
    function closePlayerMenu(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (playerMenuRef.current?.contains(target)) return;
      if (selectedPlayerData && target.closest(`[data-player-id="${selectedPlayerData.id}"]`)) return;
      setPlayerMenuOpen(false);
    }
    function closePlayerMenuWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setPlayerMenuOpen(false);
    }
    document.addEventListener("pointerdown", closePlayerMenu);
    document.addEventListener("keydown", closePlayerMenuWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closePlayerMenu);
      document.removeEventListener("keydown", closePlayerMenuWithEscape);
    };
  }, [playerMenuOpen, selectedPlayerData]);

  useEffect(() => {
    if (!playerMenuOpen || !selectedPlayerSlot) {
      setPlayerMenuPosition(null);
      return;
    }
    const frame = requestAnimationFrame(() => {
      const pitch = pitchFieldRef.current;
      const menu = playerMenuRef.current;
      if (!pitch || !menu) return;
      const preferredX = pitch.clientWidth * selectedPlayerSlot.x / 100 + 24;
      const alternateX = pitch.clientWidth * selectedPlayerSlot.x / 100 - menu.offsetWidth - 24;
      const x = preferredX + menu.offsetWidth <= pitch.clientWidth - 8 ? preferredX : alternateX;
      const y = pitch.clientHeight * selectedPlayerSlot.y / 100 - 18;
      setPlayerMenuPosition(clampPlayerMenuPosition(x, y));
    });
    return () => cancelAnimationFrame(frame);
  }, [playerMenuOpen, props.selectedPlayer, selectedPlayerSlot?.x, selectedPlayerSlot?.y]);

  useEffect(() => {
    if (!playerMenuOpen) return;
    function keepPlayerMenuInsidePitch() {
      setPlayerMenuPosition((current) => current ? clampPlayerMenuPosition(current.x, current.y) : current);
    }
    window.addEventListener("resize", keepPlayerMenuInsidePitch);
    return () => window.removeEventListener("resize", keepPlayerMenuInsidePitch);
  }, [playerMenuOpen]);

  useEffect(() => {
    if (!passLinking && !pendingPass && !relationshipLinking) return;
    function cancelPassWithEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setPassLinking(false);
      setRelationshipLinking(null);
      setPassPointer(null);
      setPendingPass(null);
    }
    document.addEventListener("keydown", cancelPassWithEscape);
    return () => document.removeEventListener("keydown", cancelPassWithEscape);
  }, [passLinking, pendingPass, relationshipLinking]);

  useEffect(() => {
    if (!pendingPass) {
      setPassPopoverPosition(null);
      return;
    }
    const frame = requestAnimationFrame(() => {
      const pitch = pitchFieldRef.current;
      const popover = passPopoverRef.current;
      const targetIndex = props.lineup.findIndex((player) => player.id === pendingPass.toPlayerId);
      if (!pitch || !popover || targetIndex < 0) return;
      const targetSlot = props.slots[targetIndex];
      const preferredX = pitch.clientWidth * targetSlot.x / 100 + 24;
      const alternateX = pitch.clientWidth * targetSlot.x / 100 - popover.offsetWidth - 24;
      const x = preferredX + popover.offsetWidth <= pitch.clientWidth - 8 ? preferredX : alternateX;
      const y = pitch.clientHeight * targetSlot.y / 100 - 18;
      setPassPopoverPosition(clampPassPopoverPosition(x, y));
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingPass?.id, props.lineup, props.slots]);

  useEffect(() => {
    if (!pendingPass) return;
    function keepPassPopoverInsidePitch() {
      setPassPopoverPosition((current) => current ? clampPassPopoverPosition(current.x, current.y) : current);
    }
    window.addEventListener("resize", keepPassPopoverInsidePitch);
    return () => window.removeEventListener("resize", keepPassPopoverInsidePitch);
  }, [pendingPass?.id]);

  function openTacticCreator() {
    setBaseTacticId(props.activeTactic.id);
    setNewTacticName("");
    setCreatorOpen(true);
  }

  function adjustQuickInstruction(key: "aggression" | "takeOn" | "passingFrequency", value: number) {
    const next = { ...props.activeTactic.details, [key]: value };
    setDetailDraft((current) => ({ ...current, [key]: value }));
    props.onUpdateTacticDetails(props.activeTactic.id, next, false);
  }

  function playerInstructionFor(playerId: string): PlayerTacticalInstruction {
    return props.activeTactic.details.playerInstructions.find((instruction) => instruction.playerId === playerId) ?? {
      playerId,
      aggression: props.activeTactic.details.aggression,
      takeOn: props.activeTactic.details.takeOn,
      passingFrequency: props.activeTactic.details.passingFrequency,
      forwardRuns: 50,
      defensiveWorkRate: 50,
      runDirection: "HOLD",
      passTargets: [],
    };
  }

  function updatePlayerInstruction(playerId: string, update: (current: PlayerTacticalInstruction) => PlayerTacticalInstruction) {
    const nextInstruction = update(playerInstructionFor(playerId));
    const exists = props.activeTactic.details.playerInstructions.some((instruction) => instruction.playerId === playerId);
    const playerInstructions = exists
      ? props.activeTactic.details.playerInstructions.map((instruction) => instruction.playerId === playerId ? nextInstruction : instruction)
      : [...props.activeTactic.details.playerInstructions, nextInstruction];
    const next = { ...props.activeTactic.details, playerInstructions };
    setDetailDraft((current) => ({ ...current, playerInstructions: cloneTacticDetails(next).playerInstructions }));
    props.onUpdateTacticDetails(props.activeTactic.id, next, false);
  }

  function adjustPlayerInstruction(key: "aggression" | "takeOn" | "passingFrequency" | "forwardRuns" | "defensiveWorkRate", value: number) {
    if (!selectedPlayerData) return;
    updatePlayerInstruction(selectedPlayerData.id, (current) => ({ ...current, [key]: value }));
  }

  function startPassAssignment() {
    if (!selectedPlayerSlot) return;
    if (passLinking) {
      cancelPassAssignment();
      return;
    }
    setRelationshipLinking(null);
    setPassLinking(true);
    setPassPointer({ x: selectedPlayerSlot.x, y: selectedPlayerSlot.y });
    setPendingPass(null);
    setActivePassId(null);
    setPlayerMenuOpen(false);
  }

  function cancelPassAssignment() {
    setPassLinking(false);
    setPassPointer(null);
    setPendingPass(null);
    setPassPopoverPosition(null);
    setActivePassId(null);
  }

  function startRelationshipAssignment(type: PlayerRelationshipType) {
    if (!selectedPlayerSlot || !selectedPlayerData) return;
    setPassLinking(false);
    setPendingPass(null);
    setActivePassId(null);
    setRelationshipLinking(type);
    setPassPointer({ x: selectedPlayerSlot.x, y: selectedPlayerSlot.y });
    setPlayerMenuOpen(false);
  }

  function cancelRelationshipAssignment() {
    setRelationshipLinking(null);
    setPassPointer(null);
  }

  function handleBoardReset() {
    cancelPassAssignment();
    cancelRelationshipAssignment();
    setPlayerMenuOpen(false);
    props.onReset();
  }

  function clampPassPopoverPosition(x: number, y: number) {
    const pitch = pitchFieldRef.current;
    const popover = passPopoverRef.current;
    if (!pitch || !popover) return { x, y };
    const margin = 8;
    const maxX = Math.max(margin, pitch.clientWidth - popover.offsetWidth - margin);
    const maxY = Math.max(margin, pitch.clientHeight - popover.offsetHeight - margin);
    return {
      x: Math.min(Math.max(margin, x), maxX),
      y: Math.min(Math.max(margin, y), maxY),
    };
  }

  function startPassPopoverDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !passPopoverRef.current) return;
    const popoverRect = passPopoverRef.current.getBoundingClientRect();
    passPopoverDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - popoverRect.left,
      offsetY: event.clientY - popoverRect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function dragPassPopover(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = passPopoverDragRef.current;
    const pitch = pitchFieldRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !pitch) return;
    const pitchRect = pitch.getBoundingClientRect();
    setPassPopoverPosition(clampPassPopoverPosition(
      event.clientX - pitchRect.left - drag.offsetX,
      event.clientY - pitchRect.top - drag.offsetY,
    ));
  }

  function finishPassPopoverDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (passPopoverDragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    passPopoverDragRef.current = null;
  }

  function clampPlayerMenuPosition(x: number, y: number) {
    const pitch = pitchFieldRef.current;
    const menu = playerMenuRef.current;
    if (!pitch || !menu) return { x, y };
    const margin = 8;
    const maxX = Math.max(margin, pitch.clientWidth - menu.offsetWidth - margin);
    const maxY = Math.max(margin, pitch.clientHeight - menu.offsetHeight - margin);
    return {
      x: Math.min(Math.max(margin, x), maxX),
      y: Math.min(Math.max(margin, y), maxY),
    };
  }

  function startPlayerMenuDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !playerMenuRef.current || (event.target as Element).closest("button")) return;
    const menuRect = playerMenuRef.current.getBoundingClientRect();
    playerMenuDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - menuRect.left,
      offsetY: event.clientY - menuRect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function dragPlayerMenu(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = playerMenuDragRef.current;
    const pitch = pitchFieldRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !pitch) return;
    const pitchRect = pitch.getBoundingClientRect();
    setPlayerMenuPosition(clampPlayerMenuPosition(
      event.clientX - pitchRect.left - drag.offsetX,
      event.clientY - pitchRect.top - drag.offsetY,
    ));
  }

  function finishPlayerMenuDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (playerMenuDragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    playerMenuDragRef.current = null;
  }

  function focusPlayerInstructions() {
    setPlayerMenuOpen(false);
    requestAnimationFrame(() => {
      const panel = document.getElementById("player-instruction-panel");
      panel?.focus();
      panel?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function chooseRunDirection(direction: "FORWARD" | "BACKWARD") {
    if (!selectedPlayerData) return;
    updatePlayerInstruction(selectedPlayerData.id, (current) => ({
      ...current,
      runDirection: current.runDirection === direction ? "HOLD" : direction,
    }));
    setPlayerMenuOpen(false);
  }

  function trackPassPointer(event: ReactMouseEvent<HTMLDivElement>) {
    if (!passLinking && !relationshipLinking) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setPassPointer({
      x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
    });
  }

  function handlePitchGroundClick() {
    if (passLinking || pendingPass) cancelPassAssignment();
    if (relationshipLinking) cancelRelationshipAssignment();
    if (playerMenuOpen) setPlayerMenuOpen(false);
    if (widePlayPickerOpen) setWidePlayPickerOpen(false);
  }

  function handlePitchPlayerClick(targetIndex: number) {
    if (relationshipLinking && props.selectedPlayer !== null && selectedPlayerData) {
      if (targetIndex === props.selectedPlayer) {
        cancelRelationshipAssignment();
        return;
      }
      const target = props.lineup[targetIndex];
      const id = `${selectedPlayerData.id}-${target.id}-${relationshipLinking}`;
      const existing = detailDraft.relationships.some((relationship) => relationship.id === id);
      const next = {
        ...detailDraft,
        relationships: existing
          ? detailDraft.relationships.filter((relationship) => relationship.id !== id)
          : [...detailDraft.relationships, { id, fromPlayerId: selectedPlayerData.id, toPlayerId: target.id, type: relationshipLinking }],
      };
      setDetailDraft(next);
      props.onUpdateTacticDetails(props.activeTactic.id, next, false);
      cancelRelationshipAssignment();
      return;
    }
    if (!passLinking || props.selectedPlayer === null || !selectedPlayerData) {
      if (props.selectedPlayer === targetIndex) {
        setPlayerMenuOpen((current) => !current);
        return;
      }
      props.onPlayerClick(targetIndex);
      return;
    }
    if (targetIndex === props.selectedPlayer) {
      cancelPassAssignment();
      return;
    }
    const target = props.lineup[targetIndex];
    const existing = selectedInstruction?.passTargets.find((pass) => pass.toPlayerId === target.id);
    const id = existing?.id ?? `pass-${selectedPlayerData.id}-${target.id}`;
    setPendingPass({ id, fromPlayerId: selectedPlayerData.id, toPlayerId: target.id, intensity: existing?.intensity ?? 50 });
    setPassLinking(false);
    setPassPointer(null);
    setActivePassId(id);
    setPlayerMenuOpen(false);
  }

  function confirmPendingPass() {
    if (!pendingPass) return;
    updatePlayerInstruction(pendingPass.fromPlayerId, (current) => {
      const nextPass = { id: pendingPass.id, toPlayerId: pendingPass.toPlayerId, intensity: pendingPass.intensity };
      return current.passTargets.some((pass) => pass.toPlayerId === pendingPass.toPlayerId)
        ? { ...current, passTargets: current.passTargets.map((pass) => pass.toPlayerId === pendingPass.toPlayerId ? nextPass : pass) }
        : { ...current, passTargets: [...current.passTargets, nextPass] };
    });
    setActivePassId(pendingPass.id);
    setPendingPass(null);
  }

  function adjustPassIntensity(passId: string, intensity: number) {
    if (!selectedPlayerData) return;
    updatePlayerInstruction(selectedPlayerData.id, (current) => ({
      ...current,
      passTargets: current.passTargets.map((pass) => pass.id === passId ? { ...pass, intensity } : pass),
    }));
  }

  function removePassAssignment(passId: string) {
    if (!selectedPlayerData) return;
    updatePlayerInstruction(selectedPlayerData.id, (current) => ({
      ...current,
      passTargets: current.passTargets.filter((pass) => pass.id !== passId),
    }));
    setActivePassId((current) => current === passId ? null : current);
  }

  function submitTactic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (hasDuplicateTacticName || !props.onCreateTactic(newTacticName, baseTacticId)) {
      setNewTacticNameError("같은 이름의 전술이 이미 있습니다.");
      return;
    }
    setCreatorOpen(false);
    setNewTacticName("");
    setNewTacticNameError("");
  }

  function setWideAction(side: "left" | "right", value: WideFinalAction) {
    const next = { ...detailDraft, wideFinalAction: value, wideActions: { ...detailDraft.wideActions, [side]: value } };
    setDetailDraft(next);
    props.onUpdateTacticDetails(props.activeTactic.id, next, false);
  }

  function playerName(playerId: string) {
    return [...props.lineup, ...props.bench].find((player) => player.id === playerId)?.name ?? playerId;
  }
  return (
    <>
      <section className="match-status-bar" aria-label="현재 경기 상황">
        <div className="match-team home"><span>{props.fixture.home.code}</span><b>{props.fixture.home.name}</b></div>
        <div className="match-live-score"><small><i />KICKOFF</small><strong>PRE <i>·</i> MATCH</strong></div>
        <div className="match-team away"><span>{props.fixture.away.code}</span><b>{props.fixture.away.name}</b></div>
        <div className="match-clock"><span>{props.fixture.stage}</span><b>{props.fixture.dataScope}</b></div>
      </section>

      <section className="decision-banner" aria-live="polite">
        <span>PRE-MATCH PLAN</span><p>{props.notice}</p><b>{props.activeTactic.name} · {props.activeTactic.formation}</b>
      </section>

      <section className={`match-workspace ${coachDrawerOpen ? "coach-open" : "coach-collapsed"}`}>
        <aside className="tactic-panel panel">
          <SectionTitle title="저장 전술" />
          <div className="tactic-list">
            {props.savedTactics.map((tactic) => (
              <button key={tactic.id} className={`tactic-card ${tactic.tone} ${props.activeTactic.id === tactic.id ? "active" : ""}`} onClick={() => props.onTactic(tactic.id)} aria-pressed={props.activeTactic.id === tactic.id}>
                <span className="tactic-letter">{tactic.name.slice(0, 1)}</span>
                <span><b>{tactic.name}</b><small>{tactic.formation} · {tactic.intent}</small></span>
                {props.activeTactic.id === tactic.id && <em>ON</em>}
              </button>
            ))}
            <button className="tactic-add-card" onClick={openTacticCreator} aria-expanded={creatorOpen}>
              <span>+</span><b>새 전술</b><small>기준 전술에서 만들기</small>
            </button>
          </div>
          {creatorOpen && (
            <form className="tactic-creator" onSubmit={submitTactic}>
              <div className="tactic-creator-head"><div><span>NEW PLAN</span><b>새 전술 만들기</b></div><button type="button" onClick={() => setCreatorOpen(false)} aria-label="전술 만들기 닫기">×</button></div>
              <label className="tactic-name-field">전술 이름<input autoFocus maxLength={18} value={newTacticName} onChange={(event) => { setNewTacticName(event.target.value); setNewTacticNameError(""); }} aria-invalid={hasDuplicateTacticName} placeholder={`MY TACTIC ${props.savedTactics.length - initialTactics.length + 1}`} /></label>
              {(hasDuplicateTacticName || newTacticNameError) && <p className="tactic-name-error" role="status">{newTacticNameError || "같은 이름의 전술이 이미 있습니다."}</p>}
              <fieldset>
                <legend>어떤 전술을 기준으로 만들까요?</legend>
                <div className="base-tactic-grid">
                  {props.savedTactics.map((tactic) => (
                    <button key={tactic.id} type="button" className={baseTacticId === tactic.id ? "active" : ""} onClick={() => setBaseTacticId(tactic.id)} aria-pressed={baseTacticId === tactic.id}>
                      <b>{tactic.name}</b><small>{tactic.formation}</small>
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="base-tactic-preview"><span>BASE</span><div><b>{baseTactic.name}</b><small>{baseTactic.formation} · {baseTactic.intent}</small></div></div>
              <button className="create-tactic-button" type="submit" disabled={hasDuplicateTacticName}>전술 생성하고 적용</button>
            </form>
          )}
        </aside>

        <section className="board-panel panel">
          <div className="board-toolbar">
            <div className="board-toolbar-actions">
              <span className={props.hasUnconfirmedChanges ? "dirty" : "saved"}>{props.hasUnconfirmedChanges ? "미확정 변경" : "확정됨"}</span>
              <button className="text-button" onClick={handleBoardReset} title="마지막으로 확정한 전술로 되돌리기">되돌리기</button>
              <button className="save-tactic-button" onClick={props.onConfirmTactic} disabled={!props.hasUnconfirmedChanges}>전술 확정</button>
            </div>
          </div>
          <OpponentTacticalTimeline snapshot={opponentSnapshot} activeTactic={props.activeTactic} onMinute={setOpponentSnapshotMinute} onApply={(tacticId) => props.onTactic(tacticId)} />
          <div className="bench-row">
            <div className="bench-label"><span>BENCH</span><small>선택 후 클릭하거나 보드로 드래그</small></div>
            {props.bench.map((player, index) => (
              <button key={player.id} style={kitCssVariables(player.position === "GK" ? props.teamKit.goalkeeper : props.teamKit.outfield)} draggable onDragStart={(event) => props.onStartDrag(event, "bench", index)} onDragEnd={props.onDragEnd} onClick={() => props.onBenchClick(index)}>
                <span>{player.number}</span><div><b>{player.name}</b><small>{player.position} · {player.role}</small></div><em>{player.stamina}%</em>
              </button>
            ))}
          </div>
          <section className="team-instruction-panel" aria-labelledby="team-instruction-title">
            <div className="instruction-panel-head">
              <div><span>TEAM INSTRUCTIONS · 0—100</span><h3 id="team-instruction-title">팀 전체 지침</h3></div>
              <small>{props.activeTactic.name} 전체 선수에게 적용</small>
            </div>
            <div className="team-instruction-sliders">
              {instructionSliders.map((instruction) => (
                <label key={instruction.key}>
                  <span><b>{instruction.label}</b><output>{props.activeTactic.details[instruction.key]}</output></span>
                  <input aria-label={`팀 ${instruction.label} 조절`} type="range" min="0" max="100" value={props.activeTactic.details[instruction.key]} onChange={(event) => adjustQuickInstruction(instruction.key, Number(event.target.value))} />
                  <small><i>{instruction.low}</i><i>{instruction.high}</i></small>
                </label>
              ))}
            </div>
          </section>
          <div className="pitch-shell">
            <div className="pitch">
              <div ref={pitchFieldRef} className={`pitch-field ${passLinking ? "pass-linking" : ""} ${relationshipLinking ? "relationship-linking" : ""}`} onClick={handlePitchGroundClick} onMouseMove={trackPassPointer} onDragOver={props.onDragOverPitch} onDragLeave={props.onDragLeavePitch} onDrop={props.onDropPitch} aria-label="선수 배치 전술 보드, FIFA 권장 105미터 곱하기 68미터 비율, 왼쪽은 우리 골대, 오른쪽은 상대 골대">
                <div className="pitch-markings" aria-hidden="true">
                  <i className="halfway" /><i className="centre-circle" /><i className="centre-mark" />
                  <i className="penalty-area own" /><i className="penalty-area opponent" />
                  <i className="goal-area own" /><i className="goal-area opponent" />
                  <i className="penalty-mark own" /><i className="penalty-mark opponent" />
                  <i className="penalty-arc own" /><i className="penalty-arc opponent" />
                  <i className="corner-arc top-left" /><i className="corner-arc top-right" /><i className="corner-arc bottom-left" /><i className="corner-arc bottom-right" />
                  <i className="goal own" /><i className="goal opponent" />
                </div>
                <div className="tactical-overlay-key" aria-hidden="true"><b>REL {props.activeTactic.details.relationships.length}</b></div>
                <div className="position-zones" aria-hidden="true">
                  {PITCH_PHASES.slice(0, -1).map((phase) => <i key={phase.id} className="zone-line vertical" style={{ left: `${phase.max}%` }} />)}
                  {PITCH_LANES.slice(0, -1).map((lane) => <i key={lane.id} className="zone-line horizontal" style={{ top: `${lane.max}%` }} />)}
                  {props.hoveredZone && (
                    <div
                      className="position-zone-preview"
                      style={{
                        left: `${props.hoveredZone.bounds.left}%`,
                        top: `${props.hoveredZone.bounds.top}%`,
                        width: `${props.hoveredZone.bounds.width}%`,
                        height: `${props.hoveredZone.bounds.height}%`,
                      }}
                    >
                      <b>{props.hoveredZone.code}</b>
                      <span>{props.hoveredZone.label}</span>
                    </div>
                  )}
                  {PITCH_PHASES.map((phase) => <span key={phase.id} className="position-phase-label" style={{ left: `${(phase.min + phase.max) / 2}%` }}>{phase.label}</span>)}
                </div>
                <div className="wide-play-layer">
                  <button type="button" className={`wide-play-zone top action-${props.activeTactic.details.wideActions.left.toLowerCase()}`} onClick={(event) => { event.stopPropagation(); setWidePlayPickerSide("left"); setWidePlayPickerOpen(true); }} aria-label="왼쪽 코너 측면 행동 설정" aria-expanded={widePlayPickerOpen && widePlayPickerSide === "left"}><span>LEFT WING</span><b>{wideActionLabels[props.activeTactic.details.wideActions.left]}</b></button>
                  <button type="button" className={`wide-play-zone bottom action-${props.activeTactic.details.wideActions.right.toLowerCase()}`} onClick={(event) => { event.stopPropagation(); setWidePlayPickerSide("right"); setWidePlayPickerOpen(true); }} aria-label="오른쪽 코너 측면 행동 설정" aria-expanded={widePlayPickerOpen && widePlayPickerSide === "right"}><span>RIGHT WING</span><b>{wideActionLabels[props.activeTactic.details.wideActions.right]}</b></button>
                </div>
                {widePlayPickerOpen && <div className="wide-play-picker" role="dialog" aria-label="측면 행동 설정" onClick={(event) => event.stopPropagation()}>
                  <div><span>{widePlayPickerSide === "left" ? "LEFT WING" : "RIGHT WING"}</span><b>{widePlayPickerSide === "left" ? "왼쪽 코너 채널 행동" : "오른쪽 코너 채널 행동"}</b><button type="button" onClick={() => setWidePlayPickerOpen(false)} aria-label="측면 행동 설정 닫기">×</button></div>
                  <p>양쪽 코너 채널은 독립적으로 설정됩니다.</p>
                  <section>{(Object.entries(wideActionLabels) as Array<[WideFinalAction, string]>).map(([value, label]) => <button key={value} type="button" className={props.activeTactic.details.wideActions[widePlayPickerSide] === value ? "active" : ""} onClick={() => setWideAction(widePlayPickerSide, value)} aria-pressed={props.activeTactic.details.wideActions[widePlayPickerSide] === value}>{label}</button>)}</section>
                </div>}
                <div className="relationship-layer" aria-hidden="true">
                  {props.activeTactic.details.relationships.map((relationship, index) => {
                    const fromIndex = props.lineup.findIndex((player) => player.id === relationship.fromPlayerId);
                    const toIndex = props.lineup.findIndex((player) => player.id === relationship.toPlayerId);
                    if (fromIndex < 0 || toIndex < 0) return null;
                    const from = props.slots[fromIndex];
                    const to = props.slots[toIndex];
                    return <div key={relationship.id} className={`relationship-connection type-${relationship.type.toLowerCase()}`}>
                      <i className="relationship-line" style={relationshipConnectionStyle(from, to, -12 + (index % 4) * 8)} />
                      <span className="relationship-label" style={{ left: `${(from.x + to.x) / 2}%`, top: `${(from.y + to.y) / 2}%`, "--relationship-label-offset": `${((index % 4) - 1.5) * 18}px` } as CSSProperties}>{index + 1}</span>
                    </div>;
                  })}
                  {relationshipLinking && selectedPlayerSlot && passPointer && <div className={`relationship-connection type-${relationshipLinking.toLowerCase()}`}><i className="relationship-line pending" style={connectionStyle(selectedPlayerSlot, passPointer)} /></div>}
                </div>
                <div className="individual-pass-layer" aria-hidden="true">
                  {props.activeTactic.details.playerInstructions.map((instruction) => {
                    if (instruction.runDirection === "HOLD") return null;
                    const fromIndex = props.lineup.findIndex((player) => player.id === instruction.playerId);
                    if (fromIndex < 0) return null;
                    const from = props.slots[fromIndex];
                    const to = { x: Math.max(4, Math.min(96, from.x + (instruction.runDirection === "FORWARD" ? 15 : -15))), y: from.y };
                    return <i key={`run-${instruction.playerId}`} className={`player-run-line ${instruction.runDirection.toLowerCase()}`} style={connectionStyle(from, to)} />;
                  })}
                  {props.activeTactic.details.playerInstructions.flatMap((instruction) => instruction.passTargets.map((pass) => {
                    if (pendingPass?.id === pass.id) return null;
                    const fromIndex = props.lineup.findIndex((player) => player.id === instruction.playerId);
                    const toIndex = props.lineup.findIndex((player) => player.id === pass.toPlayerId);
                    if (fromIndex < 0 || toIndex < 0) return null;
                    const from = props.slots[fromIndex];
                    const to = props.slots[toIndex];
                    return <i key={pass.id} className={`individual-pass-line ${activePassId === pass.id ? "active" : ""}`} style={{ ...arrowConnectionStyle(from, to), opacity: .42 + pass.intensity * .0055, height: `${2 + pass.intensity / 60}px` }} />;
                  }))}
                  {passLinking && selectedPlayerSlot && passPointer && <i className="individual-pass-line pending" style={connectionStyle(selectedPlayerSlot, passPointer)} />}
                  {pendingPass && (() => {
                    const fromIndex = props.lineup.findIndex((player) => player.id === pendingPass.fromPlayerId);
                    const toIndex = props.lineup.findIndex((player) => player.id === pendingPass.toPlayerId);
                    if (fromIndex < 0 || toIndex < 0) return null;
                    return <i className="individual-pass-line active pending-confirmation" style={{ ...arrowConnectionStyle(props.slots[fromIndex], props.slots[toIndex]), opacity: .42 + pendingPass.intensity * .0055, height: `${2 + pendingPass.intensity / 60}px` }} />;
                  })()}
                </div>
                <div className="pitch-coordinate-layer">
                  {props.slots.map((slot, index) => {
                    const player = props.lineup[index];
                    const kitPalette = player.position === "GK" ? props.teamKit.goalkeeper : props.teamKit.outfield;
                    return (
                      <button
                        key={player.id}
                        className={`player-token ${player.position === "GK" ? "goalkeeper" : ""} ${props.selectedPlayer === index ? "selected" : ""} ${passLinking && props.selectedPlayer !== index ? "pass-target" : ""} ${relationshipLinking && props.selectedPlayer !== index ? "relationship-target" : ""}`}
                        style={{ left: `${slot.x}%`, top: `${slot.y}%`, ...kitCssVariables(kitPalette) }}
                        draggable
                        onDragStart={(event) => props.onStartDrag(event, "pitch", index)}
                        onDragEnd={props.onDragEnd}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => props.onDropPlayer(event, index)}
                        onClick={(event) => { event.stopPropagation(); handlePitchPlayerClick(index); }}
                        aria-label={`${player.name}, ${slot.role}, ${player.role}`}
                        aria-pressed={props.selectedPlayer === index}
                        aria-expanded={props.selectedPlayer === index ? playerMenuOpen : undefined}
                        data-position-zone={slot.role}
                        data-player-id={player.id}
                        data-kit-source={props.teamKit.source}
                      >
                        <span>{player.number}</span><b>{player.name}</b><small>{slot.role}</small>
                      </button>
                    );
                  })}
                </div>
                {pendingPass && (() => {
                  const fromPlayer = props.lineup.find((player) => player.id === pendingPass.fromPlayerId);
                  const targetIndex = props.lineup.findIndex((player) => player.id === pendingPass.toPlayerId);
                  if (!fromPlayer || targetIndex < 0) return null;
                  const targetPlayer = props.lineup[targetIndex];
                  const targetSlot = props.slots[targetIndex];
                  return (
                    <div ref={passPopoverRef} className="pass-confirm-popover" style={passPopoverPosition ? { left: passPopoverPosition.x, top: passPopoverPosition.y } : { left: `${targetSlot.x}%`, top: `${targetSlot.y}%`, visibility: "hidden" }} role="dialog" aria-label={`${fromPlayer.name}에서 ${targetPlayer.name} 패스 설정`} onClick={(event) => event.stopPropagation()}>
                      <div className="pass-confirm-header" onPointerDown={startPassPopoverDrag} onPointerMove={dragPassPopover} onPointerUp={finishPassPopoverDrag} onPointerCancel={finishPassPopoverDrag} title="드래그하여 창 이동"><span>PASS INSTRUCTION · DRAG</span><b>{fromPlayer.name} → {targetPlayer.name}</b></div>
                      <label><span>패스 적극도 <output>{pendingPass.intensity}</output></span><input autoFocus aria-label={`${targetPlayer.name} 패스 적극도 설정`} type="range" min="0" max="100" value={pendingPass.intensity} onChange={(event) => setPendingPass((current) => current ? { ...current, intensity: Number(event.target.value) } : current)} /><small><i>상황 우선</i><i>최우선 연결</i></small></label>
                      <div className="pass-confirm-actions"><button type="button" onClick={confirmPendingPass}>연결</button><button type="button" onClick={cancelPassAssignment}>취소</button></div>
                    </div>
                  );
                })()}
                {selectedPlayerData && selectedPlayerSlot && selectedInstruction && playerMenuOpen && !passLinking && !relationshipLinking && !pendingPass && (
                  <div
                    ref={playerMenuRef}
                    className="player-action-menu"
                    style={playerMenuPosition ? { left: playerMenuPosition.x, top: playerMenuPosition.y } : { left: `${selectedPlayerSlot.x}%`, top: `${selectedPlayerSlot.y}%`, visibility: "hidden" }}
                    role="group"
                    aria-label={`${selectedPlayerData.name} 빠른 전술 메뉴`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="player-action-header" onPointerDown={startPlayerMenuDrag} onPointerMove={dragPlayerMenu} onPointerUp={finishPlayerMenuDrag} onPointerCancel={finishPlayerMenuDrag} title="드래그하여 창 이동"><span>#{selectedPlayerData.number}</span><b>{selectedPlayerData.name}</b><small>행동을 선택하세요 · DRAG</small><button className="player-action-close" type="button" onClick={() => setPlayerMenuOpen(false)} aria-label={`${selectedPlayerData.name} 빠른 전술 메뉴 닫기`}>×</button></div>
                    <button type="button" onClick={startPassAssignment}><i>→</i>패스 지정</button>
                    {(Object.entries(relationshipLabels) as Array<[PlayerRelationshipType, string]>).map(([type, label]) => <button key={type} type="button" className={`relationship-action type-${type.toLowerCase()}`} onClick={() => startRelationshipAssignment(type)}><i>↔</i>{label}</button>)}
                    <button type="button" onClick={focusPlayerInstructions}><i>≡</i>개인 지침</button>
                    <button type="button" className={selectedInstruction.runDirection === "FORWARD" ? "active" : ""} onClick={() => chooseRunDirection("FORWARD")} aria-pressed={selectedInstruction.runDirection === "FORWARD"}><i>↗</i>공격 가담</button>
                    <button type="button" className={selectedInstruction.runDirection === "BACKWARD" ? "active" : ""} onClick={() => chooseRunDirection("BACKWARD")} aria-pressed={selectedInstruction.runDirection === "BACKWARD"}><i>↙</i>수비 가담</button>
                  </div>
                )}
              </div>
            </div>
            <div className="relationship-legend" aria-label="선수 관계 범례">
              <div className="relationship-summary"><span>선수 관계</span>{props.activeTactic.details.relationships.length === 0 ? <b>지정 없음</b> : props.activeTactic.details.relationships.map((relationship, index) => <b key={relationship.id} className={`type-${relationship.type.toLowerCase()}`}><i>{index + 1}</i>{playerName(relationship.fromPlayerId)} <em>{relationshipLabels[relationship.type]}</em> {playerName(relationship.toPlayerId)}</b>)}</div>
            </div>
          </div>
          {selectedPlayerData && selectedInstruction ? (
            <section id="player-instruction-panel" className="player-instruction-panel" aria-labelledby="player-instruction-title" tabIndex={-1}>
              <div className="instruction-panel-head player">
                <div><span>PLAYER INSTRUCTIONS · #{selectedPlayerData.number}</span><h3 id="player-instruction-title">{selectedPlayerData.name} 개인 지침</h3><p>{props.slots[props.selectedPlayer ?? 0]?.role} · {selectedPlayerData.role} · 움직임 {selectedInstruction.runDirection === "FORWARD" ? "공격 가담" : selectedInstruction.runDirection === "BACKWARD" ? "수비 가담" : "위치 유지"}</p></div>
                <button type="button" onClick={() => props.onPlayerClick(props.selectedPlayer ?? 0)} aria-label={`${selectedPlayerData.name} 개인 지침 닫기`}>×</button>
              </div>
              <div className="player-instruction-sliders">
                {playerInstructionSliders.map((instruction) => (
                  <label key={instruction.key}>
                    <span><b>{instruction.label}</b><output>{selectedInstruction[instruction.key]}</output></span>
                    <input aria-label={`${selectedPlayerData.name} ${instruction.label} 조절`} type="range" min="0" max="100" value={selectedInstruction[instruction.key]} onChange={(event) => adjustPlayerInstruction(instruction.key, Number(event.target.value))} />
                    <small><i>{instruction.low}</i><i>{instruction.high}</i></small>
                  </label>
                ))}
              </div>
              <div className="pass-assignment-builder">
                <div><span>DIRECTED PASS</span><b>패스 대상 지정</b><p>{passLinking ? "보드에서 패스를 받을 선수를 클릭하세요. 화살표가 마우스를 따라갑니다." : "버튼을 누른 뒤 보드의 다른 선수를 선택하세요."}</p></div>
                <button type="button" className={passLinking ? "active" : ""} onClick={startPassAssignment} aria-pressed={passLinking}>{passLinking ? "지정 취소" : "+ 패스 지정"}</button>
              </div>
              <div className="pass-assignment-list">
                {selectedInstruction.passTargets.length === 0 && <p>아직 지정된 패스 대상이 없습니다.</p>}
                {selectedInstruction.passTargets.map((pass) => (
                  <div key={pass.id} className={activePassId === pass.id ? "active" : ""}>
                    <div className="pass-assignment-row"><span><b>{selectedPlayerData.name}</b><i>→</i><b>{playerName(pass.toPlayerId)}</b></span><button type="button" onClick={() => removePassAssignment(pass.id)} aria-label={`${playerName(pass.toPlayerId)} 패스 지정 삭제`}>×</button></div>
                    <label><span>패스 적극도 <output>{pass.intensity}</output></span><input aria-label={`${playerName(pass.toPlayerId)} 패스 적극도`} type="range" min="0" max="100" value={pass.intensity} onChange={(event) => adjustPassIntensity(pass.id, Number(event.target.value))} /><small><i>상황 우선</i><i>최우선 연결</i></small></label>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <div className="player-instruction-empty"><b>선수 개인 지침</b><span>전술 보드의 선수를 클릭하면 0–100 지침과 패스 연결 옵션이 열립니다.</span></div>
          )}
          <LiveMetricDock liveMetrics={props.liveMetrics} metricDelta={props.metricDelta} />
        </section>

        <aside className={`coach-panel panel ${coachDrawerOpen ? "open" : "collapsed"}`} aria-expanded={coachDrawerOpen}>
          <button className="coach-drawer-toggle" type="button" onClick={() => setCoachDrawerOpen((open) => !open)} aria-expanded={coachDrawerOpen}>
            <span>AI 전술 요청</span><b>{coachDrawerOpen ? "전술 요청 창 접기" : "전술 요청 열기"}</b><i>{coachDrawerOpen ? "↓" : "↑"}</i>
          </button>
          <div className="coach-drawer-content">
          <SectionTitle title="AI 전술 요청" />
          <textarea id="coach-input" aria-label="감독의 전술 요청" value={props.coachInput} onChange={(event) => props.onCoachInput(event.target.value)} rows={4} placeholder="상대 윙을 막으면서 왼쪽 측면으로 빠르게 역습하고 싶어." />
          <button className="primary-button" onClick={props.onRecommend} disabled={props.aiLoading}><span>AI</span>{props.aiLoading ? "전술 분석 중…" : "추천 전술 만들기"}</button>

          {recommended && props.recommendation ? (
            <div className="recommendation-card">
              <div className="recommendation-head"><span>{props.recommendation.provider === "gemini" ? "GEMINI AI" : "LOCAL COACH"}</span><b>{recommended.name} {recommended.formation}</b><em>신뢰 {props.recommendation.confidence}%</em></div>
              <p>{props.recommendation.summary}</p>
              <div className="reason-block positive"><b>추천 이유</b><ul>{props.recommendation.reasons.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}</ul></div>
              <div className="reason-block warning"><b>적용 유의사항</b><p>{props.recommendation.caution}</p></div>
              <button className="confirm-button" onClick={() => props.onApplyRecommendation(props.recommendation)}>AI 제안 적용</button>
              <small className="human-note">{props.recommendation.provider === "gemini" ? "AI가 제안한 팀·개인 지침과 패스 연결을 보드에 적용합니다. 최종 적용은 감독이 확정합니다." : "무료 AI 연결 전 또는 한도 초과 시 로컬 전술 코치가 대신 제안합니다. 최종 적용은 감독이 확정합니다."}</small>
            </div>
          ) : null}

          </div>
        </aside>
      </section>
    </>
  );
}

function OpponentTacticalTimeline({ snapshot, activeTactic, onMinute, onApply }: { snapshot: OpponentTacticalSnapshot; activeTactic: Tactic; onMinute: (minute: number) => void; onApply: (tacticId: TacticId) => void }) {
  const responseIsActive = activeTactic.id === snapshot.responseTacticId;

  return (
    <section className="opponent-timeline-panel" aria-label="15분 단위 상대 전술 분석">
      <header className="opponent-timeline-head">
        <div><span>OPPONENT TACTICAL SNAPSHOT</span><h3>포르투갈 {snapshot.minute}&apos; · {snapshot.formation}</h3><p>공개 이벤트·360 프레임을 압축한 전술 추정 배치</p></div>
        <div><b>{snapshot.block}</b><small>{snapshot.phase}</small></div>
      </header>
      <div className="opponent-timeline-tabs" role="tablist" aria-label="상대 전술 시간대 선택">
        {opponentTacticalSnapshots.map((item) => <button key={item.minute} type="button" className={item.minute === snapshot.minute ? "active" : ""} onClick={() => onMinute(item.minute)} aria-pressed={item.minute === snapshot.minute}>{item.minute}&apos;</button>)}
      </div>
      <div className="opponent-timeline-content">
        <div className="opponent-mini-pitch" aria-label={`포르투갈 ${snapshot.minute}분 추정 배치`}>
          <span>POR FORWARD ←</span>
          <i className="opponent-halfway" />
          {snapshot.shape.map((point, index) => <b key={`${snapshot.minute}-${point.role}-${index}`} className="opponent-token" style={{ left: `${point.x}%`, top: `${point.y}%` }}>{point.role}</b>)}
        </div>
        <div className="opponent-observation"><span>상대 관찰</span><b>{snapshot.headline}</b><p>{snapshot.observation}</p></div>
        <div className={`opponent-response ${responseIsActive ? "active" : ""}`}><span>우리 대응 전술</span><b>{responseIsActive ? `${activeTactic.name} 적용 중` : "이 시간대 추천"}</b><p>{snapshot.responseInstruction}</p><button type="button" onClick={() => onApply(snapshot.responseTacticId)}>{responseIsActive ? "적용된 전술" : "이 대응 전술 적용"}</button></div>
      </div>
    </section>
  );
}

function LiveMetricDock({ liveMetrics, metricDelta }: { liveMetrics: LiveTacticalMetrics; metricDelta: MatchRoomProps["metricDelta"] }) {
  const scores: Array<{ label: string; value: number; tone: Tone }> = [
    { label: "공격", value: liveMetrics.attack, tone: "orange" },
    { label: "수비", value: liveMetrics.defence, tone: "mint" },
    { label: "중앙", value: liveMetrics.centre, tone: "yellow" },
    { label: "전환", value: liveMetrics.transition, tone: "lime" },
    { label: "부담", value: liveMetrics.fatigue, tone: "orange" },
  ];

  return (
    <aside className="live-metric-dock" aria-label="라이브 전술 지표" aria-live="polite">
      <div className="live-metric-dock-inner">
        <div className="dock-title"><small><i /> TACTICAL PLAN INDEX</small><b>전술 지표</b><span>{liveMetrics.phaseLabel}</span></div>
        <div className="dock-score-grid">
          {scores.map((score) => (
            <div key={score.label} className={`dock-score ${score.tone}`}><span>{score.label}</span><b>{score.value}</b><i><em style={{ width: `${score.value}%` }} /></i></div>
          ))}
        </div>
        <div className="dock-details">
          <div className="dock-facts"><span>수비 라인 <b>{liveMetrics.defensiveLineMetres}m</b></span><span>팀 길이 <b>{liveMetrics.teamLengthMetres}m</b></span><span>팀 폭 <b>{liveMetrics.teamWidthMetres}m</b></span><span>컴팩트 <b>{liveMetrics.compactness}</b></span><span>압박 <b>{liveMetrics.pressing}</b></span><span className="warning">뒷공간 <b>{liveMetrics.spaceBehindRisk}</b></span></div>
          <div className="dock-delta"><span>마지막 확정 대비</span><b className={deltaClass(metricDelta.attack)}>공격 {formatDelta(metricDelta.attack)}</b><b className={deltaClass(metricDelta.defence)}>수비 {formatDelta(metricDelta.defence)}</b><b className={deltaClass(metricDelta.centre)}>중앙 {formatDelta(metricDelta.centre)}</b><b className={deltaClass(metricDelta.transition)}>전환 {formatDelta(metricDelta.transition)}</b><b className={deltaClass(-metricDelta.fatigue)}>부담 {formatDelta(metricDelta.fatigue)}</b></div>
        </div>
      </div>
    </aside>
  );
}

function ReviewScreen({ activeTactic, switchCount, onReplay }: { activeTactic: Tactic; switchCount: number; onReplay: () => void }) {
  const managerScore = Math.min(92, 78 + switchCount * 2 + (activeTactic.id === "chase" ? 3 : 0));
  return (
    <section className="screen page-screen">
      <ScreenHeader eyebrow="POST-MATCH REVIEW" title="결과보다 중요한 것은, 왜 그 선택이 작동했는가" description="승패가 아니라 의도, 타이밍, 위험 관리와 실제 영향을 함께 평가합니다." />
      <div className="review-grid">
        <article className="score-card dark-card">
          <span>MANAGER SCORE</span><div><b>{managerScore}</b><em>/ 100</em></div><h2>결정 품질</h2>
          <Metric label="전환 타이밍" value={91} tone="lime" />
          <Metric label="역할 적합도" value={86} tone="mint" />
          <Metric label="공간 대응" value={84} tone="yellow" />
          <Metric label="위험 관리" value={69} tone="orange" />
          <small>TOUCHLINE 평가 모델 v1.0 · 예시 시뮬레이션</small>
        </article>
        <div className="decision-list">
          <DecisionCard number="01" tone="lime" title="잘한 결정" body={`${activeTactic.name} 전환으로 오른쪽 하프스페이스와 박스 진입 빈도가 증가했습니다.`} tag="+12 DECISION IMPACT" />
          <DecisionCard number="02" tone="orange" title="숨은 비용" body="양쪽 측면이 동시에 전진하면서 오른쪽 전환 수비의 회복 거리가 늘어났습니다." tag="-9 RISK MANAGEMENT" />
          <DecisionCard number="03" tone="mint" title="다음 전술 보완" body="왼쪽만 오버랩하고 6번 미드필더를 HOLD 역할로 고정해보세요." tag="REPLAY SUGGESTION" />
        </div>
      </div>
      <div className="timeline-card">
        <div className="timeline-head"><span>MATCH DECISION TIMELINE</span><b>KOR 2-1 POR</b></div>
        <div className="timeline-line"><i /><button><span>00&apos;</span>CONTROL</button><button><span>62&apos;</span>PRESS</button><button className="highlight"><span>79&apos;</span>{activeTactic.name}</button><button><span>90+1&apos;</span>GOAL</button></div>
      </div>
      <div className="screen-actions"><button className="secondary-button" onClick={onReplay}>79분부터 다시 플레이</button><button className="primary-button" onClick={() => window.print()}>리뷰 저장</button></div>
    </section>
  );
}

function ManagerScreen({ switchCount, activeTactic }: { switchCount: number; activeTactic: Tactic }) {
  const switching = Math.min(92, 76 + switchCount * 2);
  const risk = activeTactic.id === "chase" ? 82 : activeTactic.id === "lock" ? 48 : 68;
  return (
    <section className="screen page-screen">
      <ScreenHeader eyebrow="MANAGER STYLE CARD" title="매 경기의 선택이 나만의 감독 정체성이 된다" description="포메이션 취향이 아니라 실제 의사결정의 반복 패턴으로 감독 성향을 만듭니다." />
      <div className="manager-layout">
        <article className="identity-card">
          <div className="identity-top"><span>MY MANAGER ID</span><em>CONFIDENCE 78%</em></div>
          <h2>THE<br />PRESSING<br />ARCHITECT</h2>
          <p>포메이션보다 압박 트리거와 전환 타이밍을 중시하는 감독</p>
          <small>최근 5경기 · 31개 결정 기준</small>
        </article>
        <div className="trait-panel">
          <div className="trait-bars">
            <Metric label="압박 성향" value={82} tone="lime" />
            <Metric label="전술 전환" value={switching} tone="mint" />
            <Metric label="위험 선호" value={risk} tone="orange" />
            <Metric label="근거 활용" value={73} tone="yellow" />
          </div>
          <div className="badge-grid"><span>HIGH PRESS</span><span>EARLY SWITCH</span><span>RISK TAKER</span><span>DATA-DRIVEN</span></div>
          <div className="evidence-log">
            <b>성향 근거</b>
            <article><span>62&apos;</span><p>동점 상황에서 압박 강도를 52에서 82로 높임</p></article>
            <article><span>KO</span><p>킥오프 전 전술을 저장하고 선수 역할을 직접 확정</p></article>
            <article><span>79&apos;</span><p>득점 필요 상황에서 {activeTactic.name} 전술의 위험을 감수</p></article>
          </div>
        </div>
      </div>
      <div className="share-strip"><div><span>SHAREABLE IDENTITY</span><b>싱글 플레이 기록이 Ghost·Live 대결의 메타가 됩니다.</b></div><button className="primary-button">감독 카드 공유</button></div>
    </section>
  );
}

function DuelScreen({ activeTactic, resolved, onResolve, onBack }: { activeTactic: Tactic; resolved: boolean; onResolve: () => void; onBack: () => void }) {
  const userWins = activeTactic.id === "chase" || activeTactic.id === "press";
  return (
    <section className="screen duel-screen">
      <ScreenHeader eyebrow="TACTICAL DUEL" title="같은 경기, 다른 선택 - 전술의 이유까지 맞붙는다" description="동일 스쿼드와 동일 경기 상태에서 선택을 동시에 제출하고 매치업 근거를 비교합니다." dark />
      <div className="duel-stage">
        <article className="duel-card you"><span>YOU</span><h2>{activeTactic.name}<small>{activeTactic.formation}</small></h2><p>{activeTactic.summary}</p><div><Metric label="공격" value={activeTactic.metrics.attack} tone="lime" /><Metric label="수비" value={activeTactic.metrics.defence} tone="mint" /></div></article>
        <div className="versus-orb"><b>VS</b><span>72&apos; · 1-1</span></div>
        <article className="duel-card ghost"><span>GHOST / AI</span><h2>PRESS<small>4-2-3-1</small></h2><p>왼쪽 유도 압박과 세컨드볼 집중, 60분부터 강도 상승</p><div><Metric label="공격" value={76} tone="orange" /><Metric label="수비" value={72} tone="yellow" /></div></article>
      </div>
      {!resolved ? (
        <div className="duel-submit"><p><b>동시 제출 준비 완료</b><span>상대 선택은 제출 전까지 공개되지 않습니다.</span></p><button className="duel-button" onClick={onResolve}>전술 잠금 및 판정</button></div>
      ) : (
        <div className={`duel-result ${userWins ? "win" : "loss"}`}>
          <div><span>MATCHUP RESULT</span><b>{userWins ? "YOU WIN · 54:46" : "GHOST WINS · 52:48"}</b><p>{userWins ? "빠른 전환과 채널 침투가 상대의 왼쪽 유도 압박을 무력화했습니다." : "중앙 보호는 유지했지만 상대의 세컨드볼 압박에서 탈출하지 못했습니다."}</p></div>
          <ol><li><b>WIDTH</b> 반대편 윙어의 폭 유지가 압박 바깥 출구를 만듦</li><li><b>TRANSITION</b> 첫 패스가 전진하면서 수비 재정렬 이전에 진입</li><li><b>RISK</b> 풀백 전진 뒤 공간에서 한 차례 결정적 위기 허용</li></ol>
        </div>
      )}
      <div className="screen-actions dark-actions"><button className="secondary-button" onClick={onBack}>전술 다시 설계</button><button className="primary-button">Ghost 코드 공유</button></div>
    </section>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <div className="section-title section-title-compact"><h2>{title}</h2></div>;
}

function ScreenHeader({ eyebrow, title, description, dark = false }: { eyebrow: string; title: string; description: string; dark?: boolean }) {
  return <header className={`screen-header ${dark ? "dark" : ""}`}><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></header>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return <div className={`metric ${tone}`}><div><span>{label}</span><b>{value}</b></div><div className="metric-track"><i style={{ width: `${value}%` }} /></div></div>;
}

function DecisionCard({ number, tone, title, body, tag }: { number: string; tone: Tone; title: string; body: string; tag: string }) {
  return <article className={`decision-card ${tone}`}><span>{number}</span><div><small>{tag}</small><h2>{title}</h2><p>{body}</p></div></article>;
}

function formatDelta(value: number) {
  if (value === 0) return "0";
  return value > 0 ? `+${value}` : String(value);
}

function deltaClass(value: number) {
  return value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
}
