export type MetricSource = "FIFA_OFFICIAL" | "STATSBOMB_OPEN_DATA" | "TOUCHLINE_DERIVED";
export type PositionCode = "GK" | "CB" | "FB" | "WB" | "DM" | "CM" | "AM" | "W" | "ST";
export type MatchPhase = "IN_POSSESSION" | "OUT_OF_POSSESSION" | "ATTACK_TRANSITION" | "DEFENCE_TRANSITION" | "SET_PIECE";

export interface MetricValue {
  value: number | null;
  unit: "count" | "percent" | "minutes" | "meters" | "km/h" | "xg" | "score_0_100";
  source: MetricSource;
  sourceUrl: string;
  competitionId: string;
  matchId?: string;
  collectedAt: string;
}

export interface PlayerIdentity {
  playerId: string;
  fifaDisplayName: string;
  shirtName: string;
  shirtNumber: number;
  teamId: string;
  nationality: string;
  dateOfBirth: string | null;
  heightCm: number | null;
  preferredFoot: "LEFT" | "RIGHT" | "BOTH" | "UNKNOWN";
  fifaPositionGroup: "GK" | "DF" | "MF" | "FW";
}

export interface FifaOfficialStats {
  basic: {
    appearances: MetricValue;
    starts: MetricValue;
    minutesPlayed: MetricValue;
    goals: MetricValue;
    assists: MetricValue;
  };
  attacking: Record<
    "attemptsAtGoal" | "attemptsOnTarget" | "attemptsInsideArea" | "attemptsOutsideArea" |
    "headedAttempts" | "expectedGoals" | "openPlayAttempts" | "attackingSequencesEndingInShot",
    MetricValue
  >;
  distribution: Record<
    "passes" | "passesCompleted" | "passingAccuracy" | "crosses" | "crossingAccuracy" |
    "takeOnsCompleted" | "defensiveLinebreaksAttempted" | "defensiveLinebreakAccuracy" |
    "switchesOfPlayAttempted" | "switchesOfPlayAccuracy",
    MetricValue
  >;
  defending: Record<
    "tackles" | "interceptions" | "blocks" | "clearances" | "aerialDuelsWon" | "possessionRegains",
    MetricValue
  >;
  discipline: Record<"foulsCommitted" | "foulsSuffered" | "yellowCards" | "redCards" | "offsides", MetricValue>;
  goalkeeping: Record<
    "attemptsOnTargetFaced" | "saves" | "savePercentage" | "goalsConceded" | "cleanSheets" |
    "goalPreventions" | "passesCompleted" | "distributionBeyondOpposition" | "possessionRegains",
    MetricValue
  >;
  movement: Record<"ballProgressions" | "receptionsBetweenLines" | "distanceCovered", MetricValue>;
  physical: Record<"topSpeed" | "highSpeedDistance" | "sprints" | "totalDistance", MetricValue>;
}

export interface RoleAffinity {
  roleId:
    | "SWEEPER_KEEPER" | "BUILDUP_KEEPER" | "STOPPER" | "COVER_CB" | "BALL_PLAYING_CB"
    | "OVERLAPPING_FULLBACK" | "INVERTED_FULLBACK" | "ANCHOR" | "BALL_WINNER" | "REGISTA"
    | "BOX_TO_BOX" | "MEZZALA" | "CENTRAL_PLAYMAKER" | "TOUCHLINE_WINGER"
    | "INSIDE_FORWARD" | "WIDE_PLAYMAKER" | "CHANNEL_RUNNER" | "TARGET_FORWARD"
    | "POACHER" | "PRESSING_FORWARD" | "FALSE_NINE";
  supportedPositions: PositionCode[];
  score: number;
  confidence: number;
  evidenceMetricPaths: string[];
  methodologyVersion: string;
}

export interface PlayerRecord {
  schemaVersion: string;
  identity: PlayerIdentity;
  officialStats: FifaOfficialStats;
  eligiblePositions: PositionCode[];
  roleAffinities: RoleAffinity[];
  tacticalTags: string[];
  availability: {
    condition: "AVAILABLE" | "LIMITED" | "INJURED" | "SUSPENDED" | "UNKNOWN";
    fatigueScore: number | null;
    cardRiskScore: number | null;
    updatedAt: string;
  };
}

export interface SynergyReason {
  ruleId: string;
  impact: number;
  summary: string;
  evidenceMetricPaths: string[];
  confidence: number;
}

export interface PlayerSynergy {
  playerIds: [string, string] | [string, string, string];
  context: {
    formationId: string;
    phase: MatchPhase;
    scoreDifference: number;
    minute: number;
    opponentBlock: "LOW" | "MID" | "HIGH" | "UNKNOWN";
  };
  scores: {
    attack: number;
    defence: number;
    transition: number;
    buildup: number;
    setPiece: number;
  };
  positiveReasons: SynergyReason[];
  conflicts: SynergyReason[];
  methodologyVersion: string;
}

export interface TacticalMetrics {
  attack: {
    chanceCreation: number;
    boxEntry: number;
    widthUsage: number;
    centralPenetration: number;
    counterSpeed: number;
  };
  defence: {
    pressing: number;
    centralProtection: number;
    wideCoverage: number;
    spaceBehindRisk: number;
    transitionDefence: number;
  };
  operation: {
    buildupStability: number;
    roleFit: number;
    teamSynergy: number;
    fatigueRisk: number;
  };
  methodologyVersion: string;
}

export interface TacticPreset {
  tacticId: string;
  name: string;
  formationId: string;
  intent: "CONTROL" | "PRESS" | "CHASE" | "PROTECT";
  assignments: Array<{ slotId: string; playerId: string; position: PositionCode; roleId: RoleAffinity["roleId"] }>;
  instructions: {
    pressing: number;
    defensiveLine: number;
    attackingWidth: number;
    tempo: number;
    risk: number;
  };
  phaseInstructions: Partial<Record<MatchPhase, string[]>>;
  switchConditions: Array<{ minuteFrom: number; scoreDifferenceMax: number; recommendedNextTacticId: string }>;
  metrics: TacticalMetrics;
  version: number;
}

export interface TacticalIntent {
  sourceText: string;
  matchState: { minute: number; scoreDifference: number; substitutionsRemaining: number };
  priorities: Array<"SCORE" | "CONTROL" | "PROTECT_LEAD" | "PREVENT_COUNTER" | "SAVE_ENERGY">;
  preferredZones: Array<"LEFT" | "RIGHT" | "CENTRE" | "LEFT_HALFSPACE" | "RIGHT_HALFSPACE">;
  focalPlayerIds: string[];
  requestedRoleIds: RoleAffinity["roleId"][];
  maxRisk: number;
}

export interface TacticRecommendation {
  parsedIntent: TacticalIntent;
  candidates: Array<{
    tacticId: string;
    score: number;
    playerChanges: Array<{ outPlayerId: string; inPlayerId: string }>;
    assignmentChanges: TacticPreset["assignments"];
    reasons: string[];
    risks: string[];
  }>;
  requiresUserConfirmation: true;
  modelVersion: string;
}

export interface ManagerEvaluation {
  matchId: string;
  managerScore: number;
  dimensions: {
    lineupFit: number;
    switchTiming: number;
    synergyRealization: number;
    riskManagement: number;
    substitutionImpact: number;
  };
  decisions: Array<{
    minute: number;
    action: string;
    tacticIdBefore: string;
    tacticIdAfter: string;
    expectedMetricDelta: Partial<TacticalMetrics>;
    observedOutcome: string;
    assessment: "GOOD" | "NEUTRAL" | "REVIEW";
    explanation: string;
  }>;
  strengths: string[];
  improvements: string[];
  replaySuggestions: string[];
  methodologyVersion: string;
}

export type ManagerArchetype =
  | "HIGH_PRESS_ARCHITECT"
  | "CENTRAL_CONTROLLER"
  | "WIDE_OVERLOAD_PLANNER"
  | "TRANSITION_GAMBLER"
  | "BALANCE_MANAGER"
  | "DEFENSIVE_PROTECTOR";

export interface ManagerStyleCard {
  managerId: string;
  displayName: string;
  sample: {
    matches: number;
    duelRounds: number;
    decisionCount: number;
  };
  traits: {
    pressingAggression: number;
    riskTolerance: number;
    switchingTempo: number;
    widthPreference: number;
    centralPreference: number;
    transitionPreference: number;
    roleFitPriority: number;
    evidenceReliance: number;
    comebackAggression: number;
  };
  primaryArchetype: ManagerArchetype;
  secondaryArchetype: ManagerArchetype | null;
  evidence: Array<{
    trait: keyof ManagerStyleCard["traits"];
    matchId: string;
    minute: number;
    decisionId: string;
    summary: string;
  }>;
  confidence: number;
  methodologyVersion: string;
  generatedAt: string;
}

export type TacticalDuelMode = "AI" | "GHOST" | "LIVE";
export type TacticalDuelStatus = "WAITING" | "IN_PROGRESS" | "COMPLETED" | "ABANDONED";

export interface DuelRoundDecision {
  decisionId: string;
  participantId: string;
  tacticId: string;
  assignments: TacticPreset["assignments"];
  instructions: TacticPreset["instructions"];
  submittedAt: string;
  locked: boolean;
}

export interface DuelRoundResolution {
  roundId: string;
  seed: string;
  metricDeltas: Record<string, Partial<TacticalMetrics>>;
  scoreDelta: Record<string, number>;
  matchupExplanations: Array<{
    winnerParticipantId: string | null;
    category: "WIDTH" | "CENTRE" | "PRESS" | "BUILDUP" | "TRANSITION" | "SET_PIECE";
    summary: string;
    evidenceMetricPaths: string[];
  }>;
}

export interface TacticalDuel {
  duelId: string;
  mode: TacticalDuelMode;
  scenarioId: string;
  roomCode: string | null;
  status: TacticalDuelStatus;
  participants: Array<{
    participantId: string;
    displayName: string;
    control: "HUMAN" | "AI" | "GHOST";
    managerStyleCardId: string | null;
  }>;
  rounds: Array<{
    roundId: string;
    minute: number;
    score: [number, number];
    deadlineAt: string | null;
    decisions: DuelRoundDecision[];
    resolution: DuelRoundResolution | null;
  }>;
  winnerParticipantId: string | null;
  deterministicSeed: string;
  fallbackMode: "AI" | "GHOST";
  createdAt: string;
  completedAt: string | null;
  schemaVersion: string;
}
