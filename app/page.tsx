"use client";

import { DragEvent, useMemo, useState } from "react";

type Player = { id: number; name: string; number: number; role: string; energy: number; trait: string };
type DragPayload = { player: Player; origin: "pitch" | "bench"; index: number };

const squad: Player[] = [
  { id: 1, name: "김승규", number: 1, role: "GK", energy: 88, trait: "빌드업" },
  { id: 2, name: "김문환", number: 15, role: "RB", energy: 91, trait: "오버랩" },
  { id: 3, name: "권경원", number: 20, role: "CB", energy: 86, trait: "커버" },
  { id: 4, name: "김영권", number: 19, role: "CB", energy: 82, trait: "전진 패스" },
  { id: 5, name: "김진수", number: 3, role: "LB", energy: 79, trait: "크로스" },
  { id: 6, name: "정우영", number: 5, role: "DM", energy: 76, trait: "밸런스" },
  { id: 7, name: "황인범", number: 6, role: "CM", energy: 84, trait: "탈압박" },
  { id: 8, name: "이재성", number: 10, role: "AM", energy: 80, trait: "압박" },
  { id: 9, name: "손흥민", number: 7, role: "LW", energy: 78, trait: "전환" },
  { id: 10, name: "이강인", number: 18, role: "RW", energy: 89, trait: "키패스" },
  { id: 11, name: "조규성", number: 9, role: "ST", energy: 83, trait: "제공권" },
  { id: 12, name: "황희찬", number: 11, role: "FW", energy: 93, trait: "침투" },
  { id: 13, name: "홍철", number: 14, role: "LB", energy: 87, trait: "얼리 크로스" },
  { id: 14, name: "정우영", number: 25, role: "AM", energy: 90, trait: "세컨드 볼" },
];

const formations: Record<string, { left: number; top: number; role: string }[]> = {
  "4-2-3-1": [
    { left: 50, top: 88, role: "GK" }, { left: 14, top: 70, role: "RB" }, { left: 38, top: 74, role: "CB" },
    { left: 62, top: 74, role: "CB" }, { left: 86, top: 70, role: "LB" }, { left: 37, top: 52, role: "DM" },
    { left: 63, top: 52, role: "CM" }, { left: 17, top: 32, role: "LW" }, { left: 50, top: 37, role: "AM" },
    { left: 83, top: 32, role: "RW" }, { left: 50, top: 14, role: "ST" },
  ],
  "4-3-3": [
    { left: 50, top: 88, role: "GK" }, { left: 14, top: 70, role: "RB" }, { left: 38, top: 74, role: "CB" },
    { left: 62, top: 74, role: "CB" }, { left: 86, top: 70, role: "LB" }, { left: 50, top: 56, role: "DM" },
    { left: 29, top: 46, role: "CM" }, { left: 71, top: 46, role: "CM" }, { left: 16, top: 24, role: "LW" },
    { left: 84, top: 24, role: "RW" }, { left: 50, top: 14, role: "ST" },
  ],
  "3-4-3": [
    { left: 50, top: 88, role: "GK" }, { left: 22, top: 72, role: "CB" }, { left: 50, top: 75, role: "CB" },
    { left: 78, top: 72, role: "CB" }, { left: 12, top: 49, role: "LWB" }, { left: 38, top: 52, role: "CM" },
    { left: 62, top: 52, role: "CM" }, { left: 88, top: 49, role: "RWB" }, { left: 18, top: 24, role: "LW" },
    { left: 82, top: 24, role: "RW" }, { left: 50, top: 14, role: "ST" },
  ],
};

const insights = [
  { label: "상대 빌드업", value: "좌측 집중", note: "칸셀루 전진 후방 공간 발생", tone: "amber" },
  { label: "압박 회피", value: "68%", note: "중앙보다 측면 전개가 +14%", tone: "mint" },
  { label: "전환 기회", value: "높음", note: "볼 탈취 후 8초가 승부처", tone: "coral" },
];

export default function Home() {
  const [formation, setFormation] = useState("4-2-3-1");
  const [lineup, setLineup] = useState<Player[]>(squad.slice(0, 11));
  const [bench, setBench] = useState<Player[]>(squad.slice(11));
  const [press, setPress] = useState(64);
  const [line, setLine] = useState(58);
  const [risk, setRisk] = useState(72);
  const [minute, setMinute] = useState(67);
  const [simulated, setSimulated] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  const score = useMemo(() => Math.round((press * .34 + line * .24 + risk * .42) / 10), [press, line, risk]);
  const advice = risk > 78
    ? "공격 리스크가 높습니다. 김진수의 오버랩을 제한하면 역습 실점 확률을 낮출 수 있어요."
    : press < 52
      ? "포르투갈의 후방 전개가 편해집니다. 압박 강도를 60 이상으로 올려 측면 패스를 유도하세요."
      : "현재 설정은 볼 탈취 후 손흥민–황희찬의 전환 속도를 가장 잘 살리는 조합입니다.";

  function startDrag(event: DragEvent, player: Player, origin: DragPayload["origin"], index: number) {
    event.dataTransfer.setData("application/json", JSON.stringify({ player, origin, index }));
    event.dataTransfer.effectAllowed = "move";
  }

  function dropOnPitch(event: DragEvent, target: number) {
    event.preventDefault();
    const raw = event.dataTransfer.getData("application/json");
    if (!raw) return;
    const payload = JSON.parse(raw) as DragPayload;
    if (payload.origin === "pitch") {
      const next = [...lineup];
      [next[payload.index], next[target]] = [next[target], next[payload.index]];
      setLineup(next);
    } else {
      const outgoing = lineup[target];
      setLineup(lineup.map((player, index) => index === target ? payload.player : player));
      setBench(bench.map((player, index) => index === payload.index ? outgoing : player));
    }
    setSimulated(false);
  }

  function selectPlayer(index: number) {
    if (selected === null) setSelected(index);
    else {
      const next = [...lineup];
      [next[selected], next[index]] = [next[index], next[selected]];
      setLineup(next);
      setSelected(null);
      setSimulated(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="터치라인 홈">
          <span className="brand-mark">T</span>
          <span>TOUCHLINE <b>26</b></span>
        </a>
        <div className="match-tag"><span className="live-dot" /> MATCH LAB · QATAR 2022 DATA</div>
        <button className="ghost-button" onClick={() => window.location.reload()}>새 전술</button>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">MATCHDAY / GROUP H · 2022.12.02</p>
          <h1>역사를 다시 쓰는<br /><em>90분의 선택.</em></h1>
          <p className="hero-copy">대한민국이 포르투갈을 만난 그날. 실제 경기 데이터를 바탕으로<br className="desktop-only" /> 당신의 선발과 전술이 어떤 장면을 만드는지 실험하세요.</p>
        </div>
        <div className="scoreboard" aria-label="경기 정보">
          <div><span className="flag kr">🇰🇷</span><strong>대한민국</strong><small>KOR</small></div>
          <div className="versus"><span>GROUP H</span><b>VS</b><small>교육도시 스타디움</small></div>
          <div><span className="flag">🇵🇹</span><strong>포르투갈</strong><small>POR</small></div>
        </div>
      </section>

      <section className="insight-strip" aria-label="상대 분석">
        <div className="strip-title"><span>01</span><div><b>SCOUT REPORT</b><small>상대 분석 브리핑</small></div></div>
        {insights.map((item) => <article key={item.label} className={`insight ${item.tone}`}><small>{item.label}</small><strong>{item.value}</strong><p>{item.note}</p></article>)}
        <div className="mini-map" aria-label="포르투갈 공격 방향 히트맵"><i /><i /><i /><span>POR ATTACK MAP</span></div>
      </section>

      <section className="workspace">
        <aside className="control-panel">
          <div className="section-heading"><span>02</span><div><h2>전술 설계</h2><p>당신의 축구를 숫자로 정의하세요.</p></div></div>
          <label className="control-label">포메이션</label>
          <div className="formation-tabs">
            {Object.keys(formations).map((item) => <button className={formation === item ? "active" : ""} key={item} onClick={() => { setFormation(item); setSimulated(false); }}>{item}</button>)}
          </div>
          <div className="range-group">
            <Range label="압박 강도" value={press} setValue={setPress} low="대기" high="즉시 압박" />
            <Range label="수비 라인" value={line} setValue={setLine} low="낮게" high="높게" />
            <Range label="공격 리스크" value={risk} setValue={setRisk} low="안정" high="과감" />
          </div>
          <div className="coach-note">
            <div><span>AI</span><b>코치 제안</b><small>설정 실시간 분석</small></div>
            <p>{advice}</p>
          </div>
          <label className="control-label">경기 시점</label>
          <div className="minute-tabs">{[46, 67, 82].map((m) => <button key={m} onClick={() => { setMinute(m); setSimulated(false); }} className={minute === m ? "active" : ""}>{m}&apos;</button>)}</div>
        </aside>

        <section className="pitch-area">
          <div className="pitch-toolbar"><div><span className="live-dot" /><b>LIVE TACTICAL BOARD</b></div><p>선수를 드래그하거나 두 명을 차례로 눌러 위치를 바꾸세요</p></div>
          <div className="pitch">
            <div className="pitch-lines"><i className="center-line" /><i className="center-circle" /><i className="box top" /><i className="box bottom" /></div>
            <div className="direction">ATTACK <span>↑</span></div>
            {formations[formation].map((pos, index) => {
              const player = lineup[index];
              return <button
                key={player.id}
                className={`player ${selected === index ? "selected" : ""}`}
                style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
                draggable
                onDragStart={(event) => startDrag(event, player, "pitch", index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => dropOnPitch(event, index)}
                onClick={() => selectPlayer(index)}
                aria-label={`${player.name}, ${pos.role} 위치`}
              ><span>{player.number}</span><b>{player.name}</b><small>{pos.role}</small></button>;
            })}
          </div>
          <div className="bench">
            <div><span>BENCH</span><small>피치 위 선수에게 드롭해 교체</small></div>
            {bench.map((player, index) => <button key={player.id} draggable onDragStart={(event) => startDrag(event, player, "bench", index)}><span>{player.number}</span><div><b>{player.name}</b><small>{player.role} · {player.trait}</small></div><em>{player.energy}%</em></button>)}
          </div>
        </section>

        <aside className="match-panel">
          <div className="section-heading compact"><span>03</span><div><h2>매치 플랜</h2><p>{minute}분, 다음 장면을 설계합니다.</p></div></div>
          <div className="plan-meter"><div><span>전술 적합도</span><b>{score}<small>/10</small></b></div><div className="meter"><i style={{ width: `${score * 10}%` }} /></div></div>
          <div className="match-state">
            <small>{minute}&apos; CURRENT SCORE</small>
            <div><span>🇰🇷 <b>{minute < 82 ? 1 : 1}</b></span><em>—</em><span><b>1</b> 🇵🇹</span></div>
            <p>{minute < 82 ? "한 골이 더 필요합니다" : "추가시간, 마지막 공격입니다"}</p>
          </div>
          <div className="plan-list">
            <article><span>1</span><div><b>유도</b><p>상대 전개를 오른쪽 측면으로 제한</p></div></article>
            <article><span>2</span><div><b>탈취</b><p>황인범이 세컨드 볼을 선점</p></div></article>
            <article><span>3</span><div><b>전환</b><p>손흥민에서 반대편 침투로 빠르게</p></div></article>
          </div>
          <button className="simulate" onClick={() => setSimulated(true)}><span>▶</span> 이 전술로 시뮬레이션</button>
          {simulated && <div className="result" role="status"><small>SIMULATION RESULT</small><b>대한민국 2 — 1 포르투갈</b><p>90+1&apos; 빠른 전환 · 황희찬 득점</p><div><span>승리 확률 61%</span><span>xG 1.42</span></div></div>}
        </aside>
      </section>

      <footer>
        <div><b>DATA NOTE</b><p>2022 FIFA 월드컵 경기 결과와 StatsBomb Open Data의 이벤트 구조를 바탕으로 만든 전술 체험 프로토타입입니다. 전술 결과는 교육용 시뮬레이션입니다.</p></div>
        <span>THE TOUCHLINE IS YOURS.</span>
      </footer>
    </main>
  );
}

function Range({ label, value, setValue, low, high }: { label: string; value: number; setValue: (value: number) => void; low: string; high: string }) {
  return <label className="range"><span><b>{label}</b><em>{value}</em></span><input type="range" min="20" max="95" value={value} onChange={(event) => setValue(Number(event.target.value))} /><small><i>{low}</i><i>{high}</i></small></label>;
}
