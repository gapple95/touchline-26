"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, DragEvent, FormEvent, MouseEvent as ReactMouseEvent } from "react";
import { PITCH_LANES, PITCH_PHASES, resolvePitchPosition } from "@/lib/domain/pitch-zones.js";
import type { DetailedTacticInstructions, KitPalette, PlayerRelationshipType, PlayerTacticalInstruction, TeamKit, WideFinalAction } from "@/lib/domain/football";

type View = "match" | "review" | "manager" | "duel";
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

function cloneTacticDetails(details: DetailedTacticInstructions): DetailedTacticInstructions {
  return {
    ...details,
    relationships: details.relationships.map((relationship) => ({ ...relationship })),
    playerInstructions: details.playerInstructions.map((instruction) => ({
      ...instruction,
      passTargets: instruction.passTargets.map((pass) => ({ ...pass })),
    })),
  };
}

function connectionStyle(from: FormationSlot, to: FormationSlot): CSSProperties {
  const dx = to.x - from.x;
  const projectedDy = (to.y - from.y) / (105 / 68);
  const length = Math.hypot(dx, projectedDy);
  const angle = Math.atan2(projectedDy, dx) * 180 / Math.PI;
  return { left: `${from.x}%`, top: `${from.y}%`, width: `${length}%`, transform: `rotate(${angle}deg)` };
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
      aggression: 52, takeOn: 38, passingFrequency: 84, wideFinalAction: "CUTBACK",
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
      aggression: 86, takeOn: 61, passingFrequency: 58, wideFinalAction: "EARLY_CROSS",
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
      aggression: 92, takeOn: 82, passingFrequency: 49, wideFinalAction: "BYLINE_DRIBBLE",
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
      aggression: 34, takeOn: 28, passingFrequency: 76, wideFinalAction: "RECYCLE",
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

const navItems: Array<{ id: View; label: string; number: string }> = [
  { id: "match", label: "매치룸", number: "01" },
  { id: "review", label: "경기 리뷰", number: "02" },
  { id: "manager", label: "감독 카드", number: "03" },
  { id: "duel", label: "전술 대결", number: "04" },
];

export default function Home() {
  const [view, setView] = useState<View>("match");
  const [savedTactics, setSavedTactics] = useState<Tactic[]>(initialTactics);
  const [tacticLayouts, setTacticLayouts] = useState<Record<TacticId, FormationSlot[]>>(() => cloneFormationLayouts(formationSlots));
  const [tacticDefaults, setTacticDefaults] = useState<Record<TacticId, FormationSlot[]>>(() => cloneFormationLayouts(formationSlots));
  const [activeTacticId, setActiveTacticId] = useState<TacticId>("control");
  const [previousTacticId, setPreviousTacticId] = useState<TacticId>("control");
  const [lineup, setLineup] = useState(players.slice(0, 11));
  const [bench, setBench] = useState(players.slice(11));
  const [slots, setSlots] = useState<Slot[]>(() => createFormationSlots("control"));
  const [hoveredZone, setHoveredZone] = useState<ReturnType<typeof resolvePitchPosition> | null>(null);
  const [dragAnchor, setDragAnchor] = useState<DragAnchor | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);
  const [minute, setMinute] = useState(70);
  const [switchCount, setSwitchCount] = useState(0);
  const [coachInput, setCoachInput] = useState("후반 70분, 왼쪽 측면을 지키면서 빠르게 역습하고 싶어.");
  const [recommendation, setRecommendation] = useState<TacticId | null>(null);
  const [notice, setNotice] = useState("CONTROL 전술로 경기를 운영 중입니다.");
  const [simulated, setSimulated] = useState(false);
  const [duelResolved, setDuelResolved] = useState(false);

  const activeTactic = savedTactics.find((tactic) => tactic.id === activeTacticId) ?? savedTactics[0];
  const previousTactic = savedTactics.find((tactic) => tactic.id === previousTacticId) ?? savedTactics[0];

  const metricDelta = useMemo(() => ({
    attack: activeTactic.metrics.attack - previousTactic.metrics.attack,
    defence: activeTactic.metrics.defence - previousTactic.metrics.defence,
    centre: activeTactic.metrics.centre - previousTactic.metrics.centre,
  }), [activeTactic, previousTactic]);

  function applyTactic(id: TacticId, source: "direct" | "coach" = "direct") {
    const next = savedTactics.find((tactic) => tactic.id === id) ?? savedTactics[0];
    setPreviousTacticId(activeTacticId);
    setActiveTacticId(id);
    setSlots(createFormationSlots(id, tacticLayouts));
    setHoveredZone(null);
    setSelectedPlayer(null);
    setSwitchCount((count) => count + 1);
    setSimulated(false);
    setNotice(`${next.name} ${next.formation} 전술을 ${source === "coach" ? "AI 추천에서" : "직접"} 적용했습니다.`);
  }

  function resetBoard() {
    setLineup(players.slice(0, 11));
    setBench(players.slice(11));
    const defaultLayout = tacticDefaults[activeTacticId] ?? formationSlots.control;
    setTacticLayouts((current) => ({ ...current, [activeTacticId]: defaultLayout.map((slot) => ({ ...slot })) }));
    setSlots(createFormationSlots(activeTacticId, { ...tacticLayouts, [activeTacticId]: defaultLayout }));
    setHoveredZone(null);
    setSelectedPlayer(null);
    setNotice("선수 배치를 현재 전술의 기본 위치로 되돌렸습니다.");
  }

  function createTactic(name: string, baseTacticId: TacticId) {
    const base = savedTactics.find((tactic) => tactic.id === baseTacticId) ?? activeTactic;
    const customNumber = savedTactics.filter((tactic) => tactic.id.startsWith("custom-")).length + 1;
    const id = `custom-${customNumber}`;
    const layout = (tacticLayouts[base.id] ?? formationSlots.control).map((slot) => ({ ...slot }));
    const tones: Tone[] = ["orange", "mint", "yellow", "lime"];
    const nextTactic: Tactic = {
      ...base,
      id,
      name: name.trim() || `MY TACTIC ${customNumber}`,
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

    setSavedTactics((current) => [...current, nextTactic]);
    setTacticLayouts((current) => ({ ...current, [id]: layout.map((slot) => ({ ...slot })) }));
    setTacticDefaults((current) => ({ ...current, [id]: layout.map((slot) => ({ ...slot })) }));
    setPreviousTacticId(activeTacticId);
    setActiveTacticId(id);
    setSlots(createFormationSlots(id, { ...tacticLayouts, [id]: layout }));
    setHoveredZone(null);
    setSelectedPlayer(null);
    setSwitchCount((count) => count + 1);
    setNotice(`${nextTactic.name} 전술을 ${base.name} 기준으로 만들고 적용했습니다.`);
  }

  function updateTacticDetails(id: TacticId, details: DetailedTacticInstructions, announce = true) {
    setSavedTactics((current) => current.map((tactic) => tactic.id === id
      ? { ...tactic, details: cloneTacticDetails(details) }
      : tactic));
    if (announce) setNotice(`${activeTactic.name} 전술의 행동 지침과 선수 관계를 저장했습니다.`);
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

  function generateRecommendation() {
    const prompt = coachInput.replace(/\s+/g, " ").trim();
    let next: TacticId = "control";
    if (/지키|리드|수비|잠그/.test(prompt)) next = /역습|골|득점|빠르게/.test(prompt) ? "press" : "lock";
    if (/골|득점|추격|전방|공격 숫자/.test(prompt)) next = "chase";
    if (/압박|탈취|세컨드볼/.test(prompt)) next = "press";
    if (/점유|안정|통제/.test(prompt)) next = "control";
    setRecommendation(next);
    const tactic = savedTactics.find((item) => item.id === next) ?? savedTactics[0];
    setNotice(`AI 코치가 요청을 ${tactic.intent} 의도로 해석했습니다. 적용 전 이유와 위험을 확인하세요.`);
  }

  function simulateNextPhase() {
    setMinute(79);
    setSimulated(true);
    setNotice("79분: 전술 선택의 결과가 반영되었습니다. 경기 리뷰에서 판단 근거를 확인할 수 있습니다.");
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <button className="wordmark" onClick={() => setView("match")} aria-label="TOUCHLINE 26 매치룸으로 이동">
          <span className="wordmark-box">T</span>
          <span>TOUCHLINE <b>26</b></span>
        </button>
        <nav className="primary-nav" aria-label="서비스 화면">
          {navItems.map((item) => (
            <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)} aria-current={view === item.id ? "page" : undefined}>
              <span>{item.number}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="header-match">
          <span className="live-dot" /> <b>{minute}&apos;</b> KOR 1-1 POR
        </div>
      </header>

      {view === "match" && (
        <MatchRoom
          savedTactics={savedTactics}
          activeTactic={activeTactic}
          previousTactic={previousTactic}
          metricDelta={metricDelta}
          lineup={lineup}
          bench={bench}
          slots={slots}
          hoveredZone={hoveredZone}
          selectedPlayer={selectedPlayer}
          coachInput={coachInput}
          recommendation={recommendation}
          minute={minute}
          notice={notice}
          simulated={simulated}
          teamKit={defaultTeamKit}
          onTactic={applyTactic}
          onReset={resetBoard}
          onCreateTactic={createTactic}
          onUpdateTacticDetails={updateTacticDetails}
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
          onSimulate={simulateNextPhase}
          onReview={() => setView("review")}
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

      <footer className="app-footer">
        <div><b>DATA POLICY</b><span>FIFA 공식값과 TOUCHLINE 파생 지표를 분리 표시합니다.</span></div>
        <div><span className="source-dot official" /> OFFICIAL DATA <span className="source-dot derived" /> DERIVED SIMULATION</div>
        <strong>THE TOUCHLINE IS YOURS.</strong>
      </footer>
    </main>
  );
}

type MatchRoomProps = {
  savedTactics: Tactic[];
  activeTactic: Tactic;
  previousTactic: Tactic;
  metricDelta: { attack: number; defence: number; centre: number };
  lineup: Player[];
  bench: Player[];
  slots: Slot[];
  hoveredZone: ReturnType<typeof resolvePitchPosition> | null;
  selectedPlayer: number | null;
  coachInput: string;
  recommendation: TacticId | null;
  minute: number;
  notice: string;
  simulated: boolean;
  teamKit: TeamKit;
  onTactic: (id: TacticId, source?: "direct" | "coach") => void;
  onReset: () => void;
  onCreateTactic: (name: string, baseTacticId: TacticId) => void;
  onUpdateTacticDetails: (id: TacticId, details: DetailedTacticInstructions, announce?: boolean) => void;
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
  onSimulate: () => void;
  onReview: () => void;
};

function MatchRoom(props: MatchRoomProps) {
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [detailEditorOpen, setDetailEditorOpen] = useState(false);
  const [newTacticName, setNewTacticName] = useState("");
  const [baseTacticId, setBaseTacticId] = useState<TacticId>(props.activeTactic.id);
  const [detailDraft, setDetailDraft] = useState<DetailedTacticInstructions>(() => cloneTacticDetails(props.activeTactic.details));
  const [relationFrom, setRelationFrom] = useState(props.lineup[8]?.id ?? props.lineup[0]?.id ?? "");
  const [relationTo, setRelationTo] = useState(props.lineup[10]?.id ?? props.lineup[1]?.id ?? "");
  const [relationType, setRelationType] = useState<PlayerRelationshipType>("COMBINATION");
  const [passLinking, setPassLinking] = useState(false);
  const [passPointer, setPassPointer] = useState<FormationSlot | null>(null);
  const [activePassId, setActivePassId] = useState<string | null>(null);
  const [playerMenuOpen, setPlayerMenuOpen] = useState(false);
  const recommended = props.savedTactics.find((tactic) => tactic.id === props.recommendation) ?? null;
  const baseTactic = props.savedTactics.find((tactic) => tactic.id === baseTacticId) ?? props.activeTactic;
  const selectedPlayerData = props.selectedPlayer === null ? null : props.lineup[props.selectedPlayer];
  const selectedPlayerSlot = props.selectedPlayer === null ? null : props.slots[props.selectedPlayer];
  const selectedInstruction = selectedPlayerData ? playerInstructionFor(selectedPlayerData.id) : null;

  useEffect(() => {
    setDetailDraft(cloneTacticDetails(props.activeTactic.details));
    setDetailEditorOpen(false);
    setPassLinking(false);
    setPassPointer(null);
    setActivePassId(null);
    setPlayerMenuOpen(false);
  }, [props.activeTactic.id]);

  useEffect(() => {
    setPassLinking(false);
    setPassPointer(null);
    setActivePassId(null);
    setPlayerMenuOpen(props.selectedPlayer !== null);
  }, [props.selectedPlayer]);

  function openTacticCreator() {
    setBaseTacticId(props.activeTactic.id);
    setNewTacticName("");
    setDetailEditorOpen(false);
    setCreatorOpen(true);
  }

  function openDetailEditor() {
    setCreatorOpen(false);
    setDetailDraft(cloneTacticDetails(props.activeTactic.details));
    setDetailEditorOpen(true);
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
    setPassLinking((current) => !current);
    setPassPointer({ x: selectedPlayerSlot.x, y: selectedPlayerSlot.y });
    setActivePassId(null);
    setPlayerMenuOpen(false);
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
    if (!passLinking) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setPassPointer({
      x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
    });
  }

  function handlePitchPlayerClick(targetIndex: number) {
    if (!passLinking || props.selectedPlayer === null || !selectedPlayerData) {
      if (props.selectedPlayer === targetIndex) {
        setPlayerMenuOpen((current) => !current);
        return;
      }
      props.onPlayerClick(targetIndex);
      return;
    }
    if (targetIndex === props.selectedPlayer) {
      setPassLinking(false);
      setPassPointer(null);
      return;
    }
    const target = props.lineup[targetIndex];
    const id = `pass-${selectedPlayerData.id}-${target.id}`;
    updatePlayerInstruction(selectedPlayerData.id, (current) => current.passTargets.some((pass) => pass.toPlayerId === target.id)
      ? current
      : { ...current, passTargets: [...current.passTargets, { id, toPlayerId: target.id, intensity: 50 }] });
    setPassLinking(false);
    setPassPointer(null);
    setActivePassId(id);
    setPlayerMenuOpen(false);
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
    props.onCreateTactic(newTacticName, baseTacticId);
    setCreatorOpen(false);
    setNewTacticName("");
  }

  function addRelationship() {
    if (!relationFrom || !relationTo || relationFrom === relationTo) return;
    const id = `${relationFrom}-${relationTo}-${relationType}`;
    setDetailDraft((current) => current.relationships.some((relationship) => relationship.id === id)
      ? current
      : { ...current, relationships: [...current.relationships, { id, fromPlayerId: relationFrom, toPlayerId: relationTo, type: relationType }] });
  }

  function saveTacticDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    props.onUpdateTacticDetails(props.activeTactic.id, detailDraft);
    setDetailEditorOpen(false);
  }

  function playerName(playerId: string) {
    return [...props.lineup, ...props.bench].find((player) => player.id === playerId)?.name ?? playerId;
  }
  return (
    <>
      <section className="match-hero">
        <div>
          <p className="eyebrow">WORLD CUP MATCH LAB / GROUP H</p>
          <h1>결정을 내리는 축구.</h1>
          <p>공식 경기 데이터를 읽고, 직접 전술을 움직이고, 선택의 결과를 복기하세요.</p>
        </div>
        <div className="score-strip" aria-label="현재 경기 상황">
          <div><span className="team-code">KOR</span><strong>대한민국</strong></div>
          <div className="current-score"><small>{props.minute}&apos; LIVE</small><b>1 <i>-</i> 1</b><span>다음 장면까지 03:18</span></div>
          <div><span className="team-code">POR</span><strong>포르투갈</strong></div>
        </div>
      </section>

      <section className="decision-banner" aria-live="polite">
        <span>LIVE DECISION</span><p>{props.notice}</p><b>{props.activeTactic.name} · {props.activeTactic.formation}</b>
      </section>

      <section className="match-workspace">
        <aside className="tactic-panel panel">
          <SectionTitle number="01" eyebrow="MATCH PLAN" title="저장 전술" description="경기 중 즉시 전환할 수 있습니다." />
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
              <label className="tactic-name-field">전술 이름<input autoFocus maxLength={18} value={newTacticName} onChange={(event) => setNewTacticName(event.target.value)} placeholder={`MY TACTIC ${props.savedTactics.length - initialTactics.length + 1}`} /></label>
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
              <button className="create-tactic-button" type="submit">전술 생성하고 적용</button>
            </form>
          )}
          <div className="tactic-detail-summary">
            <div className="tactic-detail-summary-head"><div><span>DETAIL INSTRUCTIONS</span><b>{props.activeTactic.name} 세부 전술</b></div><button type="button" onClick={openDetailEditor} aria-expanded={detailEditorOpen}>관계·측면 설정</button></div>
            <p><b>팀 전체 지침:</b> 라이브 전술 보드 아래에서 즉시 조절 <i /> <b>개인 지침:</b> 선수 클릭</p>
            <p><b>측면:</b> {wideActionLabels[props.activeTactic.details.wideFinalAction]} <i /> <b>관계:</b> {props.activeTactic.details.relationships.length}개</p>
          </div>
          {detailEditorOpen && (
            <form className="tactic-detail-editor" onSubmit={saveTacticDetails}>
              <div className="detail-editor-head"><div><span>RELATIONS &amp; WIDE PLAY</span><b>관계·측면 행동 설정</b></div><button type="button" onClick={() => setDetailEditorOpen(false)} aria-label="세부 전술 닫기">×</button></div>
              <fieldset className="wide-action-field">
                <legend>측면에서 코너 부근까지 전진했을 때</legend>
                <div>
                  {(Object.entries(wideActionLabels) as Array<[WideFinalAction, string]>).map(([value, label]) => (
                    <button key={value} type="button" className={detailDraft.wideFinalAction === value ? "active" : ""} onClick={() => setDetailDraft((current) => ({ ...current, wideFinalAction: value }))} aria-pressed={detailDraft.wideFinalAction === value}>{label}</button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="relationship-field">
                <legend>선수 관계 설정</legend>
                <div className="relationship-builder">
                  <select aria-label="관계를 시작할 선수" value={relationFrom} onChange={(event) => setRelationFrom(event.target.value)}>{props.lineup.map((player) => <option key={player.id} value={player.id}>{player.name} · {player.position}</option>)}</select>
                  <select aria-label="관계 유형" value={relationType} onChange={(event) => setRelationType(event.target.value as PlayerRelationshipType)}>{(Object.entries(relationshipLabels) as Array<[PlayerRelationshipType, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                  <select aria-label="관계를 받을 선수" value={relationTo} onChange={(event) => setRelationTo(event.target.value)}>{props.lineup.map((player) => <option key={player.id} value={player.id}>{player.name} · {player.position}</option>)}</select>
                  <button type="button" onClick={addRelationship} disabled={relationFrom === relationTo}>+ 관계 추가</button>
                </div>
                <div className="relationship-list">
                  {detailDraft.relationships.length === 0 && <p>아직 정의된 선수 관계가 없습니다.</p>}
                  {detailDraft.relationships.map((relationship) => (
                    <div key={relationship.id}><span><b>{playerName(relationship.fromPlayerId)}</b><i>{relationshipLabels[relationship.type]}</i><b>{playerName(relationship.toPlayerId)}</b></span><button type="button" onClick={() => setDetailDraft((current) => ({ ...current, relationships: current.relationships.filter((item) => item.id !== relationship.id) }))} aria-label={`${playerName(relationship.fromPlayerId)}와 ${playerName(relationship.toPlayerId)} 관계 삭제`}>×</button></div>
                  ))}
                </div>
              </fieldset>
              <button className="save-detail-button" type="submit">세부 전술 저장</button>
            </form>
          )}
          <div className="metric-card">
            <div className="metric-heading"><span>전술 지표</span><small>TOUCHLINE DERIVED</small></div>
            <Metric label="공격 위협" value={props.activeTactic.metrics.attack} tone="orange" />
            <Metric label="수비 안정" value={props.activeTactic.metrics.defence} tone="mint" />
            <Metric label="중앙 보호" value={props.activeTactic.metrics.centre} tone="yellow" />
            <Metric label="전환 속도" value={props.activeTactic.metrics.transition} tone="lime" />
          </div>
          <div className="delta-card">
            <span>{props.previousTactic.name} 대비</span>
            <div><b className={deltaClass(props.metricDelta.attack)}>공격 {formatDelta(props.metricDelta.attack)}</b><b className={deltaClass(props.metricDelta.defence)}>수비 {formatDelta(props.metricDelta.defence)}</b><b className={deltaClass(props.metricDelta.centre)}>중앙 {formatDelta(props.metricDelta.centre)}</b></div>
          </div>
          <div className="risk-note"><span>RISK</span><p>{props.activeTactic.risk}</p></div>
        </aside>

        <section className="board-panel panel">
          <div className="board-toolbar">
            <SectionTitle number="02" eyebrow="DIRECT CONTROL" title="라이브 전술 보드" description="드래그해 배치하고, 선수를 클릭해 개인 지침을 설정하세요." />
            <button className="text-button" onClick={props.onReset}>배치 초기화</button>
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
          <div className="bench-row">
            <div className="bench-label"><span>BENCH</span><small>선택 후 클릭하거나 보드로 드래그</small></div>
            {props.bench.map((player, index) => (
              <button key={player.id} style={kitCssVariables(player.position === "GK" ? props.teamKit.goalkeeper : props.teamKit.outfield)} draggable onDragStart={(event) => props.onStartDrag(event, "bench", index)} onDragEnd={props.onDragEnd} onClick={() => props.onBenchClick(index)}>
                <span>{player.number}</span><div><b>{player.name}</b><small>{player.position} · {player.role}</small></div><em>{player.stamina}%</em>
              </button>
            ))}
          </div>
          <div className="pitch-shell">
            <div className="pitch">
              <div className={`pitch-field ${passLinking ? "pass-linking" : ""}`} onMouseMove={trackPassPointer} onDragOver={props.onDragOverPitch} onDragLeave={props.onDragLeavePitch} onDrop={props.onDropPitch} aria-label="선수 배치 전술 보드, FIFA 권장 105미터 곱하기 68미터 비율, 왼쪽은 우리 골대, 오른쪽은 상대 골대">
                <div className="pitch-markings" aria-hidden="true">
                  <i className="halfway" /><i className="centre-circle" /><i className="centre-mark" />
                  <i className="penalty-area own" /><i className="penalty-area opponent" />
                  <i className="goal-area own" /><i className="goal-area opponent" />
                  <i className="penalty-mark own" /><i className="penalty-mark opponent" />
                  <i className="penalty-arc own" /><i className="penalty-arc opponent" />
                  <i className="corner-arc top-left" /><i className="corner-arc top-right" /><i className="corner-arc bottom-left" /><i className="corner-arc bottom-right" />
                  <i className="goal own" /><i className="goal opponent" />
                </div>
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
                <div className="player-relationship-layer" aria-hidden="true">
                  {props.activeTactic.details.relationships.map((relationship) => {
                    const fromIndex = props.lineup.findIndex((player) => player.id === relationship.fromPlayerId);
                    const toIndex = props.lineup.findIndex((player) => player.id === relationship.toPlayerId);
                    if (fromIndex < 0 || toIndex < 0) return null;
                    const from = props.slots[fromIndex];
                    const to = props.slots[toIndex];
                    return <i key={relationship.id} className={`player-relationship-line relation-${relationship.type.toLowerCase()}`} style={connectionStyle(from, to)} data-relationship-type={relationshipLabels[relationship.type]} />;
                  })}
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
                    const fromIndex = props.lineup.findIndex((player) => player.id === instruction.playerId);
                    const toIndex = props.lineup.findIndex((player) => player.id === pass.toPlayerId);
                    if (fromIndex < 0 || toIndex < 0) return null;
                    const from = props.slots[fromIndex];
                    const to = props.slots[toIndex];
                    const fromPlayer = props.lineup[fromIndex];
                    const toPlayer = props.lineup[toIndex];
                    return [
                      <i key={`${pass.id}-line`} className={`individual-pass-line ${activePassId === pass.id ? "active" : ""}`} style={{ ...connectionStyle(from, to), opacity: .35 + pass.intensity * .006, borderTopWidth: `${1 + pass.intensity / 45}px` }} />,
                      <span key={`${pass.id}-direction`} className="pass-direction-chip" style={{ left: `${(from.x + to.x) / 2}%`, top: `${(from.y + to.y) / 2}%` }}>{fromPlayer.number} → {toPlayer.number}</span>,
                    ];
                  }))}
                  {passLinking && selectedPlayerSlot && passPointer && <i className="individual-pass-line pending" style={connectionStyle(selectedPlayerSlot, passPointer)} />}
                </div>
                <div className="pitch-coordinate-layer">
                  {props.slots.map((slot, index) => {
                    const player = props.lineup[index];
                    const kitPalette = player.position === "GK" ? props.teamKit.goalkeeper : props.teamKit.outfield;
                    return (
                      <button
                        key={player.id}
                        className={`player-token ${player.position === "GK" ? "goalkeeper" : ""} ${props.selectedPlayer === index ? "selected" : ""} ${passLinking && props.selectedPlayer !== index ? "pass-target" : ""}`}
                        style={{ left: `${slot.x}%`, top: `${slot.y}%`, ...kitCssVariables(kitPalette) }}
                        draggable
                        onDragStart={(event) => props.onStartDrag(event, "pitch", index)}
                        onDragEnd={props.onDragEnd}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => props.onDropPlayer(event, index)}
                        onClick={() => handlePitchPlayerClick(index)}
                        aria-label={`${player.name}, ${slot.role}, ${player.role}`}
                        aria-pressed={props.selectedPlayer === index}
                        data-position-zone={slot.role}
                        data-kit-source={props.teamKit.source}
                      >
                        <span>{player.number}</span><b>{player.name}</b><small>{slot.role}</small>
                      </button>
                    );
                  })}
                </div>
                {selectedPlayerData && selectedPlayerSlot && selectedInstruction && playerMenuOpen && !passLinking && (
                  <div
                    className={`player-action-menu ${selectedPlayerSlot.x > 68 ? "align-left" : ""} ${selectedPlayerSlot.y > 58 ? "align-up" : ""}`}
                    style={{ left: `${selectedPlayerSlot.x}%`, top: `${selectedPlayerSlot.y}%` }}
                    role="group"
                    aria-label={`${selectedPlayerData.name} 빠른 전술 메뉴`}
                  >
                    <div><span>#{selectedPlayerData.number}</span><b>{selectedPlayerData.name}</b><small>행동을 선택하세요</small></div>
                    <button type="button" onClick={startPassAssignment}><i>→</i>패스 지정</button>
                    <button type="button" onClick={focusPlayerInstructions}><i>≡</i>개인 지침</button>
                    <button type="button" className={selectedInstruction.runDirection === "FORWARD" ? "active" : ""} onClick={() => chooseRunDirection("FORWARD")} aria-pressed={selectedInstruction.runDirection === "FORWARD"}><i>↗</i>앞으로 달리기</button>
                    <button type="button" className={selectedInstruction.runDirection === "BACKWARD" ? "active" : ""} onClick={() => chooseRunDirection("BACKWARD")} aria-pressed={selectedInstruction.runDirection === "BACKWARD"}><i>↙</i>뒤로 달리기</button>
                  </div>
                )}
              </div>
            </div>
          </div>
          {selectedPlayerData && selectedInstruction ? (
            <section id="player-instruction-panel" className="player-instruction-panel" aria-labelledby="player-instruction-title" tabIndex={-1}>
              <div className="instruction-panel-head player">
                <div><span>PLAYER INSTRUCTIONS · #{selectedPlayerData.number}</span><h3 id="player-instruction-title">{selectedPlayerData.name} 개인 지침</h3><p>{props.slots[props.selectedPlayer ?? 0]?.role} · {selectedPlayerData.role} · 움직임 {selectedInstruction.runDirection === "FORWARD" ? "앞으로" : selectedInstruction.runDirection === "BACKWARD" ? "뒤로" : "유지"}</p></div>
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
        </section>

        <aside className="coach-panel panel">
          <SectionTitle number="03" eyebrow="LLM COACH" title="전술 요청" description="말로 요청하고, 이유를 확인한 뒤 직접 확정합니다." />
          <label className="coach-input-label" htmlFor="coach-input">감독의 의도</label>
          <textarea id="coach-input" value={props.coachInput} onChange={(event) => props.onCoachInput(event.target.value)} rows={4} />
          <button className="primary-button" onClick={props.onRecommend}><span>AI</span> 추천 전술 만들기</button>

          {recommended ? (
            <div className="recommendation-card">
              <div className="recommendation-head"><span>추천 01</span><b>{recommended.name} {recommended.formation}</b><em>신뢰 86%</em></div>
              <p>{recommended.summary}</p>
              <div className="reason-block positive"><b>추천 이유</b><ul><li>현재 1-1 상황과 입력한 우선순위를 반영</li><li>이강인의 전진 패스와 손흥민의 채널 침투를 연결</li></ul></div>
              <div className="reason-block warning"><b>적용 위험</b><p>{recommended.risk}</p></div>
              <button className="confirm-button" onClick={() => props.onTactic(recommended.id, "coach")}>이 전술로 확정</button>
              <small className="human-note">AI는 추천만 제공합니다. 최종 적용은 감독이 확정합니다.</small>
            </div>
          ) : (
            <div className="coach-empty">
              <span>TACTICAL INTENT</span><b>자연어를 전술 객체로 변환합니다.</b><p>경기 상태, 선호 구역, 핵심 선수, 최대 위험도를 구조화해 저장 전술 안에서 추천합니다.</p>
            </div>
          )}

          <button className="simulate-button" onClick={props.onSimulate}>다음 장면 시뮬레이션 <span>→</span></button>
          {props.simulated && (
            <div className="simulation-result" role="status">
              <small>79&apos; SIMULATION RESULT</small><b>박스 진입 +3 · 역습 허용 +1</b><p>선택한 전술의 공격 효과가 위험 증가보다 컸습니다.</p><button onClick={props.onReview}>경기 리뷰 보기</button>
            </div>
          )}
        </aside>
      </section>
    </>
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
            <article><span>70&apos;</span><p>AI 추천을 확인한 뒤 선수 역할을 수정하고 직접 확정</p></article>
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

function SectionTitle({ number, eyebrow, title, description }: { number: string; eyebrow: string; title: string; description: string }) {
  return <div className="section-title"><span>{number}</span><div><small>{eyebrow}</small><h2>{title}</h2><p>{description}</p></div></div>;
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
