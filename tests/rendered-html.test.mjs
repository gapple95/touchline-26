import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PITCH_DIMENSIONS_METRES, resolvePitchPosition } from "../lib/domain/pitch-zones.js";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the TOUCHLINE 26 fixture selection", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /TOUCHLINE 26/);
  assert.match(html, /class="fixture-screen"/);
  assert.match(html, /어떤 실제 경기를/);
  assert.match(html, /공식 경기 정보 · 선발 11명 · 교체 출전 선수/);
  assert.doesNotMatch(html, /class="header-match"/);
  assert.doesNotMatch(html, /WORLD CUP MATCH LAB/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/);
});

test("keeps the core interaction contract in source", async () => {
  const [page, layout, css, packageJson, managerRoute, reviewRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai-manager-card/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai-match-review/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /draggable/);
  assert.match(page, /dropOnPitch/);
  assert.match(page, /carryTacticalReferencesThroughSubstitution/);
  assert.match(page, /createTactic/);
  assert.match(page, /tactic-add-card/);
  assert.match(page, /어떤 전술을 기준으로 만들까요/);
  assert.match(page, /setTacticLayouts/);
  assert.match(page, /team-instruction-sliders/);
  assert.match(page, /player-instruction-sliders/);
  assert.match(page, /aria-label=\{`팀 \$\{instruction\.label\} 조절`\}/);
  assert.match(page, /label: "적극성"/);
  assert.match(page, /startRelationshipAssignment/);
  assert.match(page, /wide-play-picker/);
  assert.match(page, /relationshipLinking/);
  assert.match(page, /1대1 돌파/);
  assert.match(page, /relationshipLinking/);
  assert.match(page, /wideFinalAction/);
  assert.match(page, /onUpdateTacticDetails/);
  assert.doesNotMatch(page + css, /player-relationship-layer/);
  assert.match(page + css, /relationship-layer/);
  assert.match(page + css, /wide-play-layer/);
  assert.match(page, /relationshipConnectionStyle/);
  assert.match(page + css, /relationship-legend/);
  assert.match(page, /relationship-label-offset/);
  assert.match(page + css, /individual-pass-layer/);
  assert.doesNotMatch(page + css, /pass-direction-chip/);
  assert.match(page, /arrowConnectionStyle/);
  assert.match(css, /@keyframes pass-flow/);
  assert.match(page + css, /player-action-menu/);
  assert.match(page, /document\.addEventListener\("pointerdown", closePlayerMenu\)/);
  assert.match(page + css, /player-action-close/);
  assert.match(page, /ConfirmedTacticSnapshot/);
  assert.match(page, /confirmCurrentTactic/);
  assert.match(page, /전술 확정/);
  assert.doesNotMatch(page + css, /확정 전으로|revert-tactic-button|revertCurrentTactic/);
  assert.match(page + css, /save-tactic-button/);
  assert.match(page, /deriveLiveTacticalMetrics/);
  assert.match(page, /derivePlayerFatigueRisks/);
  assert.match(page, /applyTacticalStaminaDrain/);
  assert.match(page, /applyBetweenMatchRecovery/);
  assert.match(page, /currentMatchMinutes/);
  assert.match(page, /previousMatchMinutes/);
  assert.match(page, /function createKickoffSquad\(\): Player\[\]/);
  assert.match(page, /stamina: 100/);
  assert.match(page, /function createConfirmedTacticsForSquad\(/);
  assert.match(page, /setConfirmedTactics\(createConfirmedTacticsForSquad\(savedTactics, tacticLayouts, nextLineup, nextBench\)\)/);
  assert.match(page + css, /player-stamina/);
  assert.match(page + css, /player-action-stamina/);
  assert.match(page + css, /player-instruction-stamina/);
  assert.match(page + css, /SUBSTITUTION WATCH/);
  assert.match(page + css, /TACTICAL PLAN INDEX/);
  assert.match(page + css, /live-metric-dock/);
  assert.match(page, /function LiveMetricDock/);
  assert.doesNotMatch(page, /<div className="metric-card">/);
  assert.match(page, /마지막 확정 대비/);
  assert.ok(page.indexOf('<div className="bench-row">') < page.indexOf('<section className="team-instruction-panel"'));
  assert.ok(page.indexOf('<div className="bench-row">') < page.indexOf('<div className="pitch-shell">'));
  assert.match(css, /\.bench-row \{[^}]*grid-template-columns: repeat\(3/);
  assert.match(css, /\.bench-label \{[^}]*grid-column: 1 \/ -1/);
  assert.ok(page.indexOf('<div className="pitch-shell">') < page.indexOf('<section id="player-instruction-panel"'));
  assert.match(page, /passLinking/);
  assert.doesNotMatch(page + css, /pass-linking-toolbar/);
  assert.match(page + css, /pass-confirm-popover/);
  assert.match(page + css, /pass-confirm-header/);
  assert.match(page, /passPopoverPosition/);
  assert.match(page, /clampPassPopoverPosition/);
  assert.match(page, /startPassPopoverDrag/);
  assert.match(page, /dragPassPopover/);
  assert.match(page, /playerMenuPosition/);
  assert.match(page, /clampPlayerMenuPosition/);
  assert.match(page, /startPlayerMenuDrag/);
  assert.match(page, /dragPlayerMenu/);
  assert.match(page + css, /player-action-header/);
  assert.match(page, /passLinking \|\| pendingPass/);
  assert.match(page, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(page, /PendingPassDraft/);
  assert.match(page, /confirmPendingPass/);
  assert.match(page, /handlePitchGroundClick/);
  assert.match(page, /event\.stopPropagation\(\); handlePitchPlayerClick/);
  assert.match(page, /cancelPassAssignment/);
  assert.match(page, /function handleBoardReset\(\)/);
  assert.match(page, /const restoredSnapshot = cloneTacticSnapshot\(confirmedTacticSnapshot\)/);
  assert.match(page, /setLineup\(restoredSnapshot\.lineup\.map/);
  assert.match(page, /setBench\(restoredSnapshot\.bench\.map/);
  assert.match(page, /setSlots\(restoredSnapshot\.slots\)/);
  assert.match(page, /details: cloneTacticDetails\(restoredSnapshot\.details\)/);
  assert.match(page, /onClick=\{handleBoardReset\}/);
  assert.match(page, />되돌리기<\/button>/);
  assert.match(page, /cancelPassWithEscape/);
  assert.match(page, /confirmPendingPass}>연결/);
  assert.match(page, /cancelPassAssignment}>취소/);
  assert.match(page, /패스 적극도/);
  assert.match(page, /공격 가담/);
  assert.match(page, /수비 가담/);
  assert.match(page, /playerInstructions/);
  assert.match(page, /Math\.hypot\(dx, projectedDy\)/);
  assert.match(page, /closest<HTMLDivElement>\("\.pitch-field"\)/);
  assert.match(page, /anchorOffsetX/);
  assert.match(page, /event\.clientX - \(payload\.anchorOffsetX \?\? 0\)/);
  assert.match(page, /position-zone-preview/);
  assert.match(page, /pitch-coordinate-layer/);
  assert.match(page, /pitch-field/);
  assert.match(page + css, /105\s*\/\s*68/);
  assert.match(css, /15\.7142857143%/);
  assert.match(css, /5\.2380952381%/);
  assert.match(css, /17\.4285714286%/);
  assert.match(page, /goalkeeper/);
  assert.match(page, /TOUCHLINE_FALLBACK/);
  assert.match(page + css, /--kit-shirt/);
  assert.match(css, /var\(--kit-number/);
assert.match(css, /player-token > span, \.player-token > b, \.player-token > small, \.player-token > small \* \{ pointer-events: none/);
  assert.match(css, /--token-anchor-x: -17px/);
  assert.doesNotMatch(css, /player-token[\s\S]{0,400}translate\(-50%,-50%\)/);
  assert.match(page, /onDragLeavePitch/);
  assert.match(page, /왼쪽은 우리 골대, 오른쪽은 상대 골대/);
  assert.doesNotMatch(page, /ATTACK/);
  assert.doesNotMatch(page + css, /goal-label/);
  assert.match(page, /generateRecommendation/);
  assert.match(page, /api\/ai-manager-card/);
  assert.match(css, /\.badge-grid span \{[^}]*align-items: center;[^}]*justify-content: center/);
  assert.match(page, /returnToFixtureSelection/);
  assert.match(page, /다른 경기 고르기/);
  assert.doesNotMatch(page, /AI로 다시 분석/);
  assert.match(page, /scoreTacticalMatchup\(decision\)/);
  assert.match(managerRoute, /GEMINI_API_KEY/);
  assert.match(managerRoute, /manager-profile analyst/);
  assert.match(managerRoute, /localAnalysis/);
  assert.match(page, /api\/ai-match-review/);
  assert.match(page + css, /review-ai-summary/);
  assert.match(reviewRoute, /Korean football match reviewer/);
  assert.match(reviewRoute, /GEMINI_API_KEY/);
  assert.match(page, /requires|최종 적용은 감독이 확정/);
  assert.match(page, /Tactical|TACTICAL DUEL/);
  assert.match(layout, /감독의 판단을 플레이하다/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(page + layout, /�/);
});

test("provides replaceable default kit colours", async () => {
  const sample = JSON.parse(await readFile(new URL("../data/players/kor-2026.sample.json", import.meta.url), "utf8"));
  assert.equal(sample.kit.source, "TOUCHLINE_FALLBACK");
  assert.equal(sample.kit.outfield.shirt, "#d8ff50");
  assert.equal(sample.kit.goalkeeper.shirt, "#ffc857");
  assert.notEqual(sample.kit.goalkeeper.shirt, sample.kit.outfield.shirt);
});

test("models detailed instructions and player relationships per tactic", async () => {
  const data = JSON.parse(await readFile(new URL("../data/tactics/presets.json", import.meta.url), "utf8"));
  assert.equal(data.schemaVersion, "1.2.0");
  assert.equal(data.presets.length, 4);
  for (const tactic of data.presets) {
    assert.equal(typeof tactic.instructions.aggression, "number");
    assert.equal(typeof tactic.instructions.takeOn, "number");
    assert.equal(typeof tactic.instructions.passingFrequency, "number");
    assert.match(tactic.instructions.wideFinalAction, /^(BYLINE_DRIBBLE|EARLY_CROSS|CUTBACK|RECYCLE)$/);
    assert.match(tactic.instructions.wideActions.left, /^(BYLINE_DRIBBLE|EARLY_CROSS|CUTBACK|RECYCLE)$/);
    assert.match(tactic.instructions.wideActions.right, /^(BYLINE_DRIBBLE|EARLY_CROSS|CUTBACK|RECYCLE)$/);
    assert.ok(Array.isArray(tactic.relationships));
    assert.ok(tactic.relationships.every((relationship) => relationship.fromPlayerId !== relationship.toPlayerId));
    assert.ok(Array.isArray(tactic.playerInstructions));
  }
  const playerInstructions = data.presets.flatMap((tactic) => tactic.playerInstructions);
  assert.ok(playerInstructions.length > 0);
  for (const instruction of playerInstructions) {
    assert.ok([instruction.aggression, instruction.takeOn, instruction.passingFrequency, instruction.forwardRuns, instruction.defensiveWorkRate].every((value) => value >= 0 && value <= 100));
    assert.match(instruction.runDirection, /^(HOLD|FORWARD|BACKWARD)$/);
    assert.ok(instruction.passTargets.every((pass) => pass.intensity >= 0 && pass.intensity <= 100));
  }
});

test("reassigns the displayed position from pitch coordinates", () => {
  assert.deepEqual(PITCH_DIMENSIONS_METRES, {
    length: 105,
    width: 68,
    goalWidth: 7.32,
    goalAreaDepth: 5.5,
    penaltyAreaDepth: 16.5,
    penaltyMarkDistance: 11,
    circleRadius: 9.15,
    cornerRadius: 1,
  });
  assert.equal(resolvePitchPosition(24, 50).code, "CB");
  const rightBackZone = resolvePitchPosition(24, 90);
  assert.equal(rightBackZone.code, "RB");
  assert.equal(rightBackZone.label, "오른쪽 풀백");
  assert.ok(Math.abs(rightBackZone.bounds.left - (16.5 / 105 * 100)) < 0.0001);
  assert.ok(Math.abs(rightBackZone.bounds.top - ((68 - 13.84) / 68 * 100)) < 0.0001);
  assert.equal(resolvePitchPosition(24, 10).code, "LB");
  assert.equal(resolvePitchPosition(44, 50).code, "DM");
  assert.equal(resolvePitchPosition(72, 50).code, "AM");
  assert.equal(resolvePitchPosition(88, 50).code, "ST");
});
