import test from "node:test";
import assert from "node:assert/strict";
import { createLocalTacticalRecommendation, normalizeTacticalRecommendation } from "../lib/domain/tactical-ai.js";

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
  assert.deepEqual(recommendation.passLinks, [{ fromPlayerId: "lee-kangin", toPlayerId: "cho-guesung", intensity: 100 }]);
});
