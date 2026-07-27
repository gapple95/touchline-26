import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolvePitchPosition } from "../lib/domain/pitch-zones.js";

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

test("server-renders the TOUCHLINE 26 product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /TOUCHLINE 26/);
  assert.match(html, /결정을 내리는 축구/);
  assert.match(html, /라이브 전술 보드/);
  assert.match(html, /전술 요청/);
  assert.match(html, /전술 대결/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/);
});

test("keeps the core interaction contract in source", async () => {
  const [page, layout, css, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /draggable/);
  assert.match(page, /dropOnPitch/);
  assert.match(page, /position-zone-preview/);
  assert.match(page, /pitch-coordinate-layer/);
  assert.match(page, /PITCH_INSET_PX/);
  assert.match(page, /goalkeeper/);
  assert.match(page, /onDragLeavePitch/);
  assert.match(page, /왼쪽은 우리 골대, 오른쪽은 상대 골대/);
  assert.doesNotMatch(page, /ATTACK/);
  assert.doesNotMatch(page + css, /goal-label/);
  assert.match(page, /generateRecommendation/);
  assert.match(page, /requires|최종 적용은 감독이 확정/);
  assert.match(page, /Tactical|TACTICAL DUEL/);
  assert.match(layout, /감독의 판단을 플레이하다/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(page + layout, /�/);
});

test("reassigns the displayed position from pitch coordinates", () => {
  assert.equal(resolvePitchPosition(24, 50).code, "CB");
  const rightBackZone = resolvePitchPosition(24, 90);
  assert.equal(rightBackZone.code, "RB");
  assert.equal(rightBackZone.label, "오른쪽 풀백");
  assert.deepEqual(rightBackZone.bounds, { left: 18, top: 76, width: 20, height: 24 });
  assert.equal(resolvePitchPosition(24, 10).code, "LB");
  assert.equal(resolvePitchPosition(44, 50).code, "DM");
  assert.equal(resolvePitchPosition(72, 50).code, "AM");
  assert.equal(resolvePitchPosition(88, 50).code, "ST");
});
