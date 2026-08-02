import assert from "node:assert/strict";
import test from "node:test";
import { applyTacticalStaminaDrain, deriveLiveTacticalMetrics, derivePlayerFatigueRisks, LIVE_TACTICAL_METRIC_MODEL } from "../lib/domain/live-tactical-metrics.js";

const players = [
  { id: "gk", position: "GK", stamina: 88 },
  ...Array.from({ length: 10 }, (_, index) => ({ id: `p${index + 1}`, position: index < 4 ? "DF" : index < 7 ? "MF" : "FW", stamina: 82 })),
];

const controlSlots = [
  { x: 11, y: 50 }, { x: 28, y: 87 }, { x: 24, y: 38 }, { x: 24, y: 62 }, { x: 28, y: 13 },
  { x: 45, y: 38 }, { x: 45, y: 62 }, { x: 67, y: 50 }, { x: 67, y: 16 }, { x: 67, y: 84 }, { x: 86, y: 50 },
];

const baseDetails = {
  aggression: 52,
  takeOn: 38,
  passingFrequency: 84,
  wideFinalAction: "CUTBACK",
  wideActions: { left: "CUTBACK", right: "CUTBACK" },
  relationships: [],
  playerInstructions: [],
};

test("derives bounded plan metrics and real pitch distances", () => {
  const metrics = deriveLiveTacticalMetrics({ players, slots: controlSlots, details: baseDetails });
  for (const key of ["attack", "defence", "centre", "transition", "fatigue", "pressing", "progression", "spaceBehindRisk", "compactness"]) {
    assert.ok(metrics[key] >= 0 && metrics[key] <= 100, `${key} must remain inside 0-100`);
  }
  assert.ok(metrics.defensiveLineMetres > 0);
  assert.ok(metrics.teamLengthMetres > 0);
  assert.ok(metrics.teamWidthMetres > 0);
  assert.equal(metrics.classification, "TOUCHLINE_DERIVED");
  assert.equal(metrics.methodologyVersion, LIVE_TACTICAL_METRIC_MODEL.methodologyVersion);
  assert.equal(LIVE_TACTICAL_METRIC_MODEL.metricDefinitions.length, 12, "FIFA's combined line-height/team-length metric is stored as two computable definitions");
  assert.equal(LIVE_TACTICAL_METRIC_MODEL.supplementaryMetrics.length, 5);
  assert.equal(LIVE_TACTICAL_METRIC_MODEL.metricDefinitions.find((metric) => metric.id === "expectedGoals").mode, "OBSERVED_ONLY");
  for (const weights of Object.values(LIVE_TACTICAL_METRIC_MODEL.weights)) {
    assert.ok(Math.abs(Object.values(weights).reduce((sum, value) => sum + value, 0) - 1) < 0.000001);
  }
});

test("aggressive forward instructions immediately raise transition and fatigue load", () => {
  const cautious = deriveLiveTacticalMetrics({ players, slots: controlSlots, details: baseDetails });
  const aggressive = deriveLiveTacticalMetrics({
    players,
    slots: controlSlots,
    details: {
      ...baseDetails,
      aggression: 95,
      takeOn: 88,
      passingFrequency: 45,
      playerInstructions: players.slice(1).map((player) => ({
        playerId: player.id,
        aggression: 95,
        takeOn: 88,
        passingFrequency: 45,
        forwardRuns: 92,
        defensiveWorkRate: 70,
        runDirection: "FORWARD",
        passTargets: [],
      })),
    },
  });
  assert.ok(aggressive.transition > cautious.transition);
  assert.ok(aggressive.fatigue > cautious.fatigue);
});

test("a higher defensive unit raises line height and space-behind risk", () => {
  const low = deriveLiveTacticalMetrics({ players, slots: controlSlots, details: baseDetails });
  const highSlots = controlSlots.map((slot, index) => index > 0 && index < 5 ? { ...slot, x: slot.x + 24 } : slot);
  const high = deriveLiveTacticalMetrics({ players, slots: highSlots, details: baseDetails });
  assert.ok(high.defensiveLineMetres > low.defensiveLineMetres);
  assert.ok(high.spaceBehindRisk > low.spaceBehindRisk);
});

test("a directed forward pass raises the progression plan score", () => {
  const withoutPass = deriveLiveTacticalMetrics({ players, slots: controlSlots, details: baseDetails });
  const withPass = deriveLiveTacticalMetrics({
    players,
    slots: controlSlots,
    details: {
      ...baseDetails,
      playerInstructions: [{
        playerId: "p5",
        aggression: 52,
        takeOn: 38,
        passingFrequency: 84,
        forwardRuns: 58,
        defensiveWorkRate: 50,
        runDirection: "HOLD",
        passTargets: [{ id: "p5-p10", toPlayerId: "p10", intensity: 90 }],
      }],
    },
  });
  assert.ok(withPass.progression > withoutPass.progression);
  assert.ok(withPass.attack > withoutPass.attack);
});

test("raises player fatigue risk and brings substitution timing forward for intense instructions", () => {
  const risks = derivePlayerFatigueRisks({
    players,
    minute: 60,
    details: {
      ...baseDetails,
      playerInstructions: [{
        playerId: "p1", aggression: 100, takeOn: 100, passingFrequency: 90,
        forwardRuns: 100, defensiveWorkRate: 100, runDirection: "FORWARD", passTargets: [],
      }],
    },
  });
  const intense = risks.find((risk) => risk.playerId === "p1");
  const baseline = risks.find((risk) => risk.playerId === "p2");
  assert.ok(intense.risk > baseline.risk);
  assert.equal(intense.status, "HIGH");
  assert.match(intense.substitutionWindow, /즉시 고려/);
  assert.ok(intense.drivers.includes("적극성"));
  assert.ok(intense.drivers.includes("1대1 돌파"));
});

test("reduces active player stamina over elapsed tactical match time", () => {
  const intensiveDetails = {
    ...baseDetails,
    playerInstructions: [{
      playerId: "p1", aggression: 100, takeOn: 100, passingFrequency: 90,
      forwardRuns: 100, defensiveWorkRate: 100, runDirection: "FORWARD", passTargets: [],
    }],
  };
  const afterFifteen = applyTacticalStaminaDrain({ players, details: intensiveDetails, minutes: 15 });
  assert.ok(afterFifteen.every((player, index) => player.stamina < players[index].stamina));
  assert.ok(afterFifteen.find((player) => player.id === "p1").stamina < afterFifteen.find((player) => player.id === "p2").stamina);
});
