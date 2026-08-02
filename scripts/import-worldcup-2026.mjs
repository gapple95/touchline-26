import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const [sourceDirectory, outputPath] = process.argv.slice(2);
if (!sourceDirectory || !outputPath) throw new Error("Usage: node scripts/import-worldcup-2026.mjs <source-directory> <output-path>");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  const [header, ...records] = rows;
  return records.filter((record) => record.some(Boolean)).map((record) => Object.fromEntries(header.map((key, index) => [key, record[index] ?? ""])));
}

async function csv(name) {
  return parseCsv(await readFile(resolve(sourceDirectory, name), "utf8"));
}

const asNumber = (value) => value === "" || value === undefined ? null : Number(value);
const by = (items, key) => Object.fromEntries(items.map((item) => [item[key], item]));
const group = (items, key) => items.reduce((all, item) => {
  const value = item[key];
  (all[value] ??= []).push(item);
  return all;
}, {});

const [teamsRaw, playersRaw, matchesRaw, detailedRaw, lineupsRaw, eventsRaw, statsRaw, venuesRaw, stagesRaw, refereesRaw, playerStatsRaw] = await Promise.all([
  csv("teams.csv"), csv("squads_and_players.csv"), csv("matches.csv"), csv("matches_detailed.csv"), csv("match_lineups.csv"), csv("match_events.csv"), csv("match_team_stats.csv"), csv("venues.csv"), csv("tournament_stages.csv"), csv("referees.csv"), csv("player_stats.csv"),
]);

const teams = teamsRaw.map((team) => ({
  id: Number(team.team_id), name: team.team_name, code: team.fifa_code, group: team.group_letter, confederation: team.confederation,
  fifaRanking: asNumber(team.fifa_ranking_pre_tournament), elo: asNumber(team.elo_rating), manager: team.manager_name,
}));
const players = playersRaw.map((player) => ({
  id: Number(player.player_id), teamId: Number(player.team_id), name: player.player_name, position: player.position, club: player.club_team,
  marketValueEur: asNumber(player.market_value_eur), caps: asNumber(player.caps), dateOfBirth: player.date_of_birth, heightCm: asNumber(player.height_cm), goals: asNumber(player.goals),
}));
const teamById = by(teams, "id");
const playerById = by(players, "id");
const detailedByMatch = by(detailedRaw, "match_id");
const lineupsByMatch = group(lineupsRaw, "match_id");
const eventsByMatch = group(eventsRaw, "match_id");
const statsByMatch = group(statsRaw, "match_id");

const matches = matchesRaw.map((match) => {
  const detail = detailedByMatch[match.match_id] ?? {};
  const presentLineup = (teamId) => (lineupsByMatch[match.match_id] ?? []).filter((row) => Number(row.team_id) === teamId).map((row) => {
    const player = playerById[Number(row.player_id)];
    return {
      playerId: Number(row.player_id), name: player?.name ?? "Unknown", position: player?.position ?? (row.tactical_position || "CM"),
      tacticalPosition: row.tactical_position || player?.position || "CM", starter: row.is_starting_xi === "1", minutes: Number(row.minutes_played || 0),
    };
  });
  const presentStats = (teamId) => {
    const row = (statsByMatch[match.match_id] ?? []).find((item) => Number(item.team_id) === teamId);
    return row ? {
      possession: asNumber(row.possession_pct), shots: asNumber(row.total_shots), shotsOnTarget: asNumber(row.shots_on_target), corners: asNumber(row.corners), fouls: asNumber(row.fouls), offsides: asNumber(row.offsides), saves: asNumber(row.saves), playerOfTheMatch: row.player_of_the_match, source: row.data_source, lastUpdated: row.last_updated,
    } : null;
  };
  const homeId = Number(match.home_team_id);
  const awayId = Number(match.away_team_id);
  return {
    id: Number(match.match_id), date: match.date, kickoffUtc: match.kickoff_time_utc, stage: detail.stage_name ?? "World Cup 2026", venue: detail.stadium_name ?? "", city: detail.city ?? "", country: detail.country ?? "",
    status: match.status, resultType: match.result_type, referee: detail.referee_name ?? "", playerOfTheMatch: detail.player_of_the_match_name ?? "",
    home: { team: teamById[homeId], score: asNumber(match.home_score), penaltyScore: asNumber(match.home_penalty_score), xg: asNumber(match.home_xg), lineup: presentLineup(homeId), stats: presentStats(homeId) },
    away: { team: teamById[awayId], score: asNumber(match.away_score), penaltyScore: asNumber(match.away_penalty_score), xg: asNumber(match.away_xg), lineup: presentLineup(awayId), stats: presentStats(awayId) },
    events: (eventsByMatch[match.match_id] ?? []).map((event) => ({ id: Number(event.event_id), minute: Number(event.minute), type: event.event_type, teamId: Number(event.team_id), playerId: Number(event.player_id), player: playerById[Number(event.player_id)]?.name ?? "Unknown" })),
  };
});

const data = {
  metadata: {
    title: "FIFA World Cup 2026 data pack for TOUCHLINE 26",
    source: "https://github.com/mominullptr/FIFA-World-Cup-2026-Dataset",
    license: "CC0-1.0",
    spatialDataNotice: "The source includes actual squads, starting lineups, appearances, events, and team statistics. It does not include 15-minute player tracking coordinates; tactical board positions are formation-derived models.",
    counts: { teams: teams.length, players: players.length, matches: matches.length, lineupRows: lineupsRaw.length, events: eventsRaw.length, teamStats: statsRaw.length },
  },
  teams,
  players,
  venues: venuesRaw,
  stages: stagesRaw,
  referees: refereesRaw,
  playerStats: playerStatsRaw,
  matches,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(data)}\n`, "utf8");
console.log(`Wrote ${matches.length} matches, ${players.length} players, and ${eventsRaw.length} events to ${outputPath}`);
