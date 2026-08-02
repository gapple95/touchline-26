import test from "node:test";
import assert from "node:assert/strict";
import { createLocalTacticalRecommendation, normalizeTacticalRecommendation } from "../lib/domain/tactical-ai.js";
import { carryTacticalReferencesThroughSubstitution } from "../lib/domain/tactical-substitution.js";

const context = {
  prompt: "후반 막판에 전방 압박으로 빠르게 득점하고 싶어",
  tactics: [{ id: "control" }, { id: "press" }, { id: "chase" }, { id: "lock" }],
  lineup: [{ id: "lee-kangin", position: "RW" }, { id: "cho-guesung", position: "ST" }],
};

test("creates a deterministic local tactical fallback", () => {
  const recommendation = createLocalTacticalRecommendation(context);
  assert.equal(recommendation.provider, "local");
  assert.equal(recommendation.recommendedTacticId, "press");
  assert.ok(recommendation.passLinks.every((link) => link.fromPlayerId !== link.toPlayerId));
  assert.ok(recommendation.playerPositions.every((position) => position.x >= 3 && position.x <= 97 && position.y >= 3 && position.y <= 97));
});

test("normalizes AI output to permitted tactics, players, and score bounds", () => {
  const recommendation = normalizeTacticalRecommendation({
    recommendedTacticId: "not-allowed", confidence: 120, summary: "AI 제안", reasons: ["근거 1", "근거 2"], caution: "주의",
    teamInstructions: { aggression: -10, takeOn: 55, passingFrequency: 400 },
    playerInstructions: [{ playerId: "unknown", aggression: 1 }, { playerId: "cho-guesung", aggression: 88, takeOn: 55, passingFrequency: 62, forwardRuns: 91, defensiveWorkRate: 45, runDirection: "FORWARD" }],
    passLinks: [{ fromPlayerId: "lee-kangin", toPlayerId: "cho-guesung", intensity: 110 }, { fromPlayerId: "x", toPlayerId: "cho-guesung", intensity: 50 }],
  }, context);
  assert.equal(recommendation.provider, "gemini");
  assert.equal(recommendation.recommendedTacticId, "press");
  assert.deepEqual(recommendation.teamInstructions, { aggression: 0, takeOn: 55, passingFrequency: 100 });
  assert.equal(recommendation.playerInstructions.length, 1);
  assert.deepEqual(recommendation.playerPositions, []);
  assert.deepEqual(recommendation.passLinks, [{ fromPlayerId: "lee-kangin", toPlayerId: "cho-guesung", intensity: 100 }]);
});

test("carries passes and player relationships through a bench substitution", () => {
  const details = {
    relationships: [
      { id: "old-supply", fromPlayerId: "outgoing", toPlayerId: "target", type: "SUPPLY" },
      { id: "old-cover", fromPlayerId: "target", toPlayerId: "outgoing", type: "COVER" },
    ],
    playerInstructions: [
      { playerId: "outgoing", aggression: 70, takeOn: 60, passingFrequency: 80, forwardRuns: 75, defensiveWorkRate: 40, runDirection: "FORWARD", passTargets: [{ id: "old-pass", toPlayerId: "target", intensity: 88 }] },
    ],
  };
  const next = carryTacticalReferencesThroughSubstitution(details, "outgoing", "incoming");
  assert.deepEqual(next.relationships.map(({ fromPlayerId, toPlayerId, type }) => ({ fromPlayerId, toPlayerId, type })), [
    { fromPlayerId: "incoming", toPlayerId: "target", type: "SUPPLY" },
    { fromPlayerId: "target", toPlayerId: "incoming", type: "COVER" },
  ]);
  assert.equal(next.playerInstructions[0].playerId, "incoming");
  assert.equal(next.playerInstructions[0].passTargets[0].toPlayerId, "target");
});
