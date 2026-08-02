import metricModel from "../../data/tactical-metric-model.json" with { type: "json" };

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const round = (value, digits = 0) => Number(clamp(value, -999, 999).toFixed(digits));
const average = (values, fallback = 0) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
const normalise = (value, min, max) => clamp((value - min) / (max - min) * 100);
const inverseNormalise = (value, min, max) => 100 - normalise(value, min, max);

function weightedScore(weights, components) {
  return round(Object.entries(weights).reduce((total, [key, weight]) => total + (components[key] ?? 0) * weight, 0));
}

function resolveInstructions(players, details) {
  const explicit = new Map(details.playerInstructions.map((instruction) => [instruction.playerId, instruction]));
  return players.map((player) => explicit.get(player.id) ?? {
    playerId: player.id,
    aggression: details.aggression,
    takeOn: details.takeOn,
    passingFrequency: details.passingFrequency,
    forwardRuns: metricModel.defaults.forwardRuns,
    defensiveWorkRate: metricModel.defaults.defensiveWorkRate,
    runDirection: "HOLD",
    passTargets: [],
  });
}

function relationshipScores(relationships) {
  const coverCount = relationships.filter((relationship) => relationship.type === "COVER").length;
  const attackingCount = relationships.filter((relationship) => ["COMBINATION", "OVERLAP", "SUPPLY", "SWITCH"].includes(relationship.type)).length;
  return {
    coverSupport: clamp(coverCount * 34),
    attackingRelationships: clamp(attackingCount * 25),
  };
}

function passScores(players, slots, instructions, details) {
  const slotByPlayerId = new Map(players.map((player, index) => [player.id, slots[index]]));
  const directedPasses = instructions.flatMap((instruction) => instruction.passTargets.map((pass) => ({ instruction, pass })));
  if (!directedPasses.length) {
    return {
      passVerticality: metricModel.defaults.passVerticalityWhenUnset,
      passConnectivity: clamp(details.relationships.length * 12),
      centralPassIntent: 45,
    };
  }

  let intensityTotal = 0;
  let verticalityTotal = 0;
  let centralityTotal = 0;
  const targets = new Set();
  for (const { instruction, pass } of directedPasses) {
    const from = slotByPlayerId.get(instruction.playerId);
    const to = slotByPlayerId.get(pass.toPlayerId);
    if (!from || !to) continue;
    const intensity = clamp(pass.intensity);
    intensityTotal += intensity;
    verticalityTotal += normalise(to.x - from.x, -15, 50) * intensity;
    centralityTotal += inverseNormalise(Math.abs(to.y - 50), 0, 48) * intensity;
    targets.add(pass.toPlayerId);
  }
  const safeIntensity = intensityTotal || 1;
  const averageIntensity = intensityTotal / directedPasses.length;
  return {
    passVerticality: clamp(verticalityTotal / safeIntensity),
    passConnectivity: clamp(directedPasses.length * 12 + targets.size * 7 + averageIntensity * 0.45 + details.relationships.length * 5),
    centralPassIntent: clamp(centralityTotal / safeIntensity),
  };
}

function geometryScores(players, slots, details) {
  const outfieldSlots = slots.filter((_, index) => players[index]?.position !== "GK");
  const xValues = outfieldSlots.map((slot) => clamp(slot.x)).sort((a, b) => a - b);
  const yValues = outfieldSlots.map((slot) => clamp(slot.y));
  const deepestUnit = xValues.slice(0, Math.min(3, xValues.length));
  const blockHighestIndex = Math.max(0, xValues.length - 2);
  const lowestX = xValues[0] ?? 20;
  const blockHighestX = xValues[blockHighestIndex] ?? lowestX;
  const highestX = xValues.at(-1) ?? lowestX;
  const defensiveLineMetres = average(deepestUnit, 20) / 100 * metricModel.pitch.lengthMetres;
  const teamLengthMetres = (blockHighestX - lowestX) / 100 * metricModel.pitch.lengthMetres;
  const fullTeamLengthMetres = (highestX - lowestX) / 100 * metricModel.pitch.lengthMetres;
  const teamWidthMetres = ((Math.max(...yValues, 50) - Math.min(...yValues, 50)) / 100) * metricModel.pitch.widthMetres;
  const lineHeight = normalise(defensiveLineMetres, 15, 50);
  const lengthCompactness = inverseNormalise(teamLengthMetres, 24, 58);
  const widthCompactness = inverseNormalise(teamWidthMetres, 38, 60);
  const compactness = clamp(lengthCompactness * 0.62 + widthCompactness * 0.38);
  const centralDensity = average(yValues.map((y) => clamp(100 - Math.abs(y - 50) * 2.15)), 50);
  const finalThirdCount = outfieldSlots.filter((slot) => slot.x >= metricModel.pitch.finalThirdStartsAtPercent).length;
  const finalThirdPresence = clamp(finalThirdCount / 5 * 100);
  const wideAdvancedCount = outfieldSlots.filter((slot) => slot.x >= 60 && (slot.y <= metricModel.pitch.edgeMarginPercent || slot.y >= 100 - metricModel.pitch.edgeMarginPercent)).length;
  const wideActionScore = { BYLINE_DRIBBLE: 92, EARLY_CROSS: 84, CUTBACK: 78, RECYCLE: 42 };
  const leftWideAction = details.wideActions?.left ?? details.wideFinalAction;
  const rightWideAction = details.wideActions?.right ?? details.wideFinalAction;
  const wideActionIntent = ((wideActionScore[leftWideAction] ?? 50) + (wideActionScore[rightWideAction] ?? 50)) / 2;
  const widthThreat = clamp(normalise(teamWidthMetres, 34, 60) * 0.5 + clamp(wideAdvancedCount / 4 * 100) * 0.28 + wideActionIntent * 0.22);
  const gaps = xValues.slice(1).map((x, index) => x - xValues[index]);
  const lineSupport = inverseNormalise(Math.max(...gaps, 18), 8, 30);
  const shapeSpanLoad = clamp(normalise(fullTeamLengthMetres, 45, 78) * 0.6 + normalise(teamWidthMetres, 38, 60) * 0.4);
  return {
    defensiveLineMetres,
    teamLengthMetres,
    fullTeamLengthMetres,
    teamWidthMetres,
    lineHeight,
    compactness,
    centralDensity,
    finalThirdPresence,
    widthThreat,
    lineSupport,
    shapeSpanLoad,
  };
}

export function deriveLiveTacticalMetrics({ players, slots, details }) {
  const safePlayers = Array.isArray(players) ? players : [];
  const safeSlots = Array.isArray(slots) ? slots : [];
  const instructions = resolveInstructions(safePlayers, details);
  const geometry = geometryScores(safePlayers, safeSlots, details);
  const relationships = relationshipScores(details.relationships);
  const passes = passScores(safePlayers, safeSlots, instructions, details);
  const aggression = average(instructions.map((instruction) => clamp(instruction.aggression)), details.aggression);
  const takeOn = average(instructions.map((instruction) => clamp(instruction.takeOn)), details.takeOn);
  const passingFrequency = average(instructions.map((instruction) => clamp(instruction.passingFrequency)), details.passingFrequency);
  const forwardRuns = clamp(average(instructions.map((instruction) => clamp(instruction.forwardRuns)
    + (instruction.runDirection === "FORWARD" ? 16 : instruction.runDirection === "BACKWARD" ? -12 : 0)), 50));
  const defensiveWork = clamp(average(instructions.map((instruction) => clamp(instruction.defensiveWorkRate)
    + (instruction.runDirection === "BACKWARD" ? 16 : instruction.runDirection === "FORWARD" ? -10 : 0)), 50));
  const stamina = average(safePlayers.map((player) => clamp(player.stamina ?? metricModel.defaults.stamina)), metricModel.defaults.stamina);

  const pressingIntent = weightedScore(metricModel.weights.pressing, {
    aggression,
    defensiveWork,
    lineHeight: geometry.lineHeight,
    finalThirdPresence: geometry.finalThirdPresence,
    coverSupport: relationships.coverSupport,
  });
  const progressionIntent = weightedScore(metricModel.weights.progression, {
    passingFrequency,
    passVerticality: passes.passVerticality,
    forwardRuns,
    takeOn,
    attackingRelationships: relationships.attackingRelationships,
  });
  const spaceBehindRisk = weightedScore(metricModel.weights.spaceBehindRisk, {
    lineHeight: geometry.lineHeight,
    forwardRuns,
    inverseDefensiveWork: 100 - defensiveWork,
    teamLengthLoad: geometry.shapeSpanLoad,
    inverseCoverSupport: 100 - relationships.coverSupport,
  });

  const components = {
    finalThirdPresence: geometry.finalThirdPresence,
    progressionIntent,
    takeOn,
    forwardRuns,
    widthThreat: geometry.widthThreat,
    passConnectivity: passes.passConnectivity,
    stamina,
    compactness: geometry.compactness,
    defensiveWork,
    centralDensity: geometry.centralDensity,
    coverSupport: relationships.coverSupport,
    inverseSpaceBehind: 100 - spaceBehindRisk,
    centralPassIntent: passes.centralPassIntent,
    lineSupport: geometry.lineSupport,
    aggression,
    passVerticality: passes.passVerticality,
    pressingIntent,
    shapeSpanLoad: geometry.shapeSpanLoad,
    staminaDeficit: 100 - stamina,
  };

  const scores = {
    attack: weightedScore(metricModel.weights.attack, components),
    defence: weightedScore(metricModel.weights.defence, components),
    centre: weightedScore(metricModel.weights.centre, components),
    transition: weightedScore(metricModel.weights.transition, components),
    fatigue: weightedScore(metricModel.weights.fatigue, components),
  };

  const outOfPossessionPhase = pressingIntent >= 72
    ? "하이 프레스"
    : geometry.defensiveLineMetres < 25 && geometry.compactness >= 58 ? "로우 블록" : "미드 블록";
  const inPossessionPhase = scores.transition >= 72 && passingFrequency < 68
    ? "카운터어택"
    : progressionIntent >= 67 ? "프로그레션" : "빌드업";

  return Object.freeze({
    ...scores,
    pressing: pressingIntent,
    progression: progressionIntent,
    spaceBehindRisk,
    defensiveLineMetres: round(geometry.defensiveLineMetres, 1),
    teamLengthMetres: round(geometry.teamLengthMetres, 1),
    teamWidthMetres: round(geometry.teamWidthMetres, 1),
    compactness: round(geometry.compactness),
    phaseLabel: `${outOfPossessionPhase} · ${inPossessionPhase}`,
    methodologyVersion: metricModel.methodologyVersion,
    classification: metricModel.classification,
  });
}

function fatigueRoleLoad(position) {
  if (position === "GK") return -18;
  if (["RB", "LB", "RWB", "LWB", "RW", "LW", "FW", "ST"].includes(position)) return 6;
  if (["DM", "CM", "AM"].includes(position)) return 4;
  return 2;
}

function substitutionWindow(risk, minute) {
  if (risk >= 80) return `${Math.max(45, minute)}′ 즉시 고려`;
  if (risk >= 68) return `${Math.max(60, minute)}′—70′ 권장`;
  if (risk >= 55) return `${Math.max(70, minute)}′ 이후 점검`;
  return "80′ 이후 상태 점검";
}

function fatigueDrainPerMinute(player, instruction) {
  const directionLoad = instruction.runDirection === "FORWARD" ? 0.035 : instruction.runDirection === "BACKWARD" ? 0.025 : 0;
  const positionLoad = player.position === "GK" ? 0.005 : ["RB", "LB", "RWB", "LWB", "RW", "LW", "FW", "ST"].includes(player.position) ? 0.025 : ["DM", "CM", "AM"].includes(player.position) ? 0.018 : 0.013;
  return 0.045
    + clamp(instruction.aggression) * 0.00055
    + clamp(instruction.takeOn) * 0.00065
    + clamp(instruction.forwardRuns) * 0.00055
    + clamp(instruction.defensiveWorkRate) * 0.0004
    + clamp(instruction.passingFrequency) * 0.00015
    + directionLoad
    + positionLoad;
}

/** Applies elapsed match-time workload to the current stamina of active players. */
export function applyTacticalStaminaDrain({ players, details, minutes }) {
  const safePlayers = Array.isArray(players) ? players : [];
  const elapsed = clamp(Number(minutes), 0, 20);
  const instructions = resolveInstructions(safePlayers, details);
  return safePlayers.map((player, index) => ({
    ...player,
    stamina: Number(clamp(clamp(player.stamina ?? metricModel.defaults.stamina) - fatigueDrainPerMinute(player, instructions[index]) * elapsed).toFixed(1)),
  }));
}

/**
 * Planned fatigue risk: combines a player's baseline stamina, current minute,
 * and their individual tactical workload. It is an advisory proxy, not an
 * observed physical tracking statistic.
 */
export function derivePlayerFatigueRisks({ players, details, minute = 0 }) {
  const safePlayers = Array.isArray(players) ? players : [];
  const instructions = resolveInstructions(safePlayers, details);
  return safePlayers.map((player, index) => {
    const instruction = instructions[index];
    const movementLoad = instruction.runDirection === "FORWARD" ? 8 : instruction.runDirection === "BACKWARD" ? 6 : 0;
    const staminaDeficit = 100 - clamp(player.stamina ?? metricModel.defaults.stamina);
    const risk = clamp(
      staminaDeficit * 0.75
      + clamp(instruction.aggression) * 0.14
      + clamp(instruction.takeOn) * 0.16
      + clamp(instruction.forwardRuns) * 0.14
      + clamp(instruction.defensiveWorkRate) * 0.1
      + clamp(instruction.passingFrequency) * 0.04
      + movementLoad
      + fatigueRoleLoad(player.position),
    );
    const drivers = [
      clamp(instruction.aggression) >= 70 ? "적극성" : null,
      clamp(instruction.takeOn) >= 70 ? "1대1 돌파" : null,
      clamp(instruction.forwardRuns) >= 70 || instruction.runDirection === "FORWARD" ? "공격 가담" : null,
      clamp(instruction.defensiveWorkRate) >= 70 || instruction.runDirection === "BACKWARD" ? "수비 가담" : null,
    ].filter(Boolean);
    return Object.freeze({
      playerId: player.id,
      risk: round(risk),
      status: risk >= 80 ? "HIGH" : risk >= 65 ? "WATCH" : "STEADY",
      substitutionWindow: substitutionWindow(round(risk), Math.round(clamp(Number(minute), 0, 90))),
      drivers,
    });
  }).sort((a, b) => b.risk - a.risk);
}

export { metricModel as LIVE_TACTICAL_METRIC_MODEL };
