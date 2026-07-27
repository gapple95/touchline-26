/**
 * TOUCHLINE 26 pitch coordinate model.
 *
 * The team always attacks from left to right. The top of the board is the
 * team's left side and the bottom is the team's right side.
 */

export const PITCH_PHASES = Object.freeze([
  { id: "GOALKEEPER", label: "GK", min: 0, max: 18 },
  { id: "DEFENCE", label: "DEF", min: 18, max: 38 },
  { id: "HOLDING", label: "DM", min: 38, max: 50 },
  { id: "MIDFIELD", label: "MID", min: 50, max: 65 },
  { id: "ATTACKING_MIDFIELD", label: "AM", min: 65, max: 82 },
  { id: "FINAL_THIRD", label: "ATT", min: 82, max: 100 },
]);

export const PITCH_LANES = Object.freeze([
  { id: "LEFT_WIDE", min: 0, max: 24 },
  { id: "LEFT_HALFSPACE", min: 24, max: 40 },
  { id: "CENTRE", min: 40, max: 60 },
  { id: "RIGHT_HALFSPACE", min: 60, max: 76 },
  { id: "RIGHT_WIDE", min: 76, max: 100 },
]);

const POSITION_BY_ZONE = Object.freeze({
  GOALKEEPER: Object.freeze({ LEFT_WIDE: "LB", LEFT_HALFSPACE: "CB", CENTRE: "GK", RIGHT_HALFSPACE: "CB", RIGHT_WIDE: "RB" }),
  DEFENCE: Object.freeze({ LEFT_WIDE: "LB", LEFT_HALFSPACE: "CB", CENTRE: "CB", RIGHT_HALFSPACE: "CB", RIGHT_WIDE: "RB" }),
  HOLDING: Object.freeze({ LEFT_WIDE: "LWB", LEFT_HALFSPACE: "DM", CENTRE: "DM", RIGHT_HALFSPACE: "DM", RIGHT_WIDE: "RWB" }),
  MIDFIELD: Object.freeze({ LEFT_WIDE: "LM", LEFT_HALFSPACE: "CM", CENTRE: "CM", RIGHT_HALFSPACE: "CM", RIGHT_WIDE: "RM" }),
  ATTACKING_MIDFIELD: Object.freeze({ LEFT_WIDE: "LW", LEFT_HALFSPACE: "AM", CENTRE: "AM", RIGHT_HALFSPACE: "AM", RIGHT_WIDE: "RW" }),
  FINAL_THIRD: Object.freeze({ LEFT_WIDE: "LW", LEFT_HALFSPACE: "ST", CENTRE: "ST", RIGHT_HALFSPACE: "ST", RIGHT_WIDE: "RW" }),
});

export const POSITION_LABELS = Object.freeze({
  GK: "골키퍼",
  LB: "왼쪽 풀백",
  CB: "센터백",
  RB: "오른쪽 풀백",
  LWB: "왼쪽 윙백",
  DM: "수비형 미드필더",
  RWB: "오른쪽 윙백",
  LM: "왼쪽 미드필더",
  CM: "중앙 미드필더",
  RM: "오른쪽 미드필더",
  LW: "왼쪽 윙어",
  AM: "공격형 미드필더",
  RW: "오른쪽 윙어",
  ST: "스트라이커",
});

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 50));
}

function findBand(bands, value) {
  return bands.find((band) => value >= band.min && (value < band.max || band.max === 100));
}

export function resolvePitchPosition(x, y) {
  const normalizedX = clampPercent(x);
  const normalizedY = clampPercent(y);
  const phase = findBand(PITCH_PHASES, normalizedX) ?? PITCH_PHASES[0];
  const lane = findBand(PITCH_LANES, normalizedY) ?? PITCH_LANES[2];
  const code = POSITION_BY_ZONE[phase.id][lane.id];
  const bounds = Object.freeze({
    left: phase.min,
    top: lane.min,
    width: phase.max - phase.min,
    height: lane.max - lane.min,
  });

  return Object.freeze({
    code,
    label: POSITION_LABELS[code],
    phase: phase.id,
    lane: lane.id,
    zoneId: `${phase.id}:${lane.id}`,
    bounds,
    x: normalizedX,
    y: normalizedY,
  });
}
