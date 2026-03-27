#!/usr/bin/env tsx
// APEX-SENTINEL — Live Demo Server
// Run: npx tsx scripts/demo-live.ts
//
// Wires live open-source feeds → DashboardApiServer → Leaflet map
// Data sources (all free, no auth):
//   • adsb.lol — live ADS-B transponder data (Romania airspace)
//   • open-meteo.com — current weather (Bucharest)
//   • gdeltproject.org — live conflict events (Romania region)
//   • ExtendedDemoScenarioEngine — EUDIS challenge scenarios
// Open http://localhost:8080 to see the live map

import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { DashboardStateStore } from '../src/dashboard/dashboard-state-store.js';
import { SseStreamManager } from '../src/dashboard/sse-stream-manager.js';
import { NodeHealthAggregator } from '../src/dashboard/node-health-aggregator.js';
import { ApiRateLimiter } from '../src/dashboard/api-rate-limiter.js';
import { DashboardApiServer } from '../src/dashboard/dashboard-api-server.js';
import { DetectionSerializer } from '../src/dashboard/detection-serializer.js';
import { ExtendedDemoScenarioEngine } from '../src/demo/extended-demo-scenario-engine.js';
import type { ExtendedScenarioName } from '../src/demo/extended-demo-scenario-engine.js';

// ── Romania bounding box ─────────────────────────────────────────────────────
const ROMANIA = { lat: 45.9, lon: 24.9, dist: 250 }; // center + radius nm

// ── Bootstrap ────────────────────────────────────────────────────────────────
const store = new DashboardStateStore();
const sse = new SseStreamManager();
const nodes = new NodeHealthAggregator();
const rateLimiter = new ApiRateLimiter();
const serializer = new DetectionSerializer();
const apiServer = new DashboardApiServer(store, sse, nodes, rateLimiter);
const scenarioEngine = new ExtendedDemoScenarioEngine();
const emitter = new EventEmitter();

// Live aircraft cache for the /aircraft endpoint (populated by ADS-B poll)
const liveAircraft: Array<{
  icao: string; callsign: string; lat: number; lon: number;
  alt: number; speed: number; track: number; ts: number;
}> = [];

// Weather cache
let weather = { temp: 0, wind_speed: 0, visibility: 10000, description: 'unknown' };

// GDELT events cache
const gdeltEvents: Array<{ title: string; lat: number; lon: number; ts: number }> = [];

// ── Scenario event → store + SSE ─────────────────────────────────────────────
emitter.on('scenario_event', (ev: Record<string, unknown>) => {
  if (ev.type === 'detection') {
    const raw = {
      id: `det-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      stage: (ev.stage as number) ?? 1,
      droneType: (ev.threat as string) ?? 'Unknown',
      lat: ev.lat as number,
      lon: ev.lon as number,
      confidence: (ev.confidence as number) ?? 0.7,
      source: (ev.source as string) ?? 'acoustic',
      ts: Date.now(),
    };
    const det = serializer.serialize(raw, store.getSnapshot().awningLevel);
    store.update({ type: 'detection', detection: det });
    sse.broadcast('detection', det);
    process.stdout.write(`  ⚡ DETECT  ${raw.droneType} lat=${raw.lat.toFixed(3)} lon=${raw.lon.toFixed(3)} conf=${(raw.confidence * 100).toFixed(0)}%\n`);
  } else if (ev.type === 'awning_update') {
    const level = ev.level as 'WHITE' | 'YELLOW' | 'RED' | 'GREEN';
    store.update({ type: 'awning_update', level, reason: (ev.reason as string) ?? '' });
    sse.broadcast('awning_update', { level, reason: ev.reason });
    process.stdout.write(`  🔔 AWNING  ${level}  (${ev.reason})\n`);
  } else if (ev.type === 'alert') {
    sse.broadcast('awning_update', { level: 'ALERT', message: ev.message, severity: ev.severity });
    process.stdout.write(`  🚨 ALERT   [${ev.severity}] ${ev.message}\n`);
  }
});

// ── Live ADS-B poll (adsb.lol, free, no auth) ────────────────────────────────
async function pollAdsb(): Promise<void> {
  try {
    const url = `https://api.adsb.lol/v2/lat/${ROMANIA.lat}/lon/${ROMANIA.lon}/dist/${ROMANIA.dist}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return;
    const data = await res.json() as { ac?: Array<Record<string, unknown>> };
    const aircraft = (data.ac ?? []).slice(0, 80); // cap at 80 for perf
    liveAircraft.length = 0;
    for (const ac of aircraft) {
      const lat = ac.lat as number | undefined;
      const lon = ac.lon as number | undefined;
      if (lat == null || lon == null) continue;
      liveAircraft.push({
        icao: (ac.hex as string) ?? '??????',
        callsign: (((ac.flight as string) ?? '').trim() || (ac.hex as string)) ?? '???',
        lat, lon,
        alt: (ac.alt_baro as number) ?? 0,
        speed: (ac.gs as number) ?? 0,
        track: (ac.track as number) ?? 0,
        ts: Date.now(),
      });
    }
    sse.broadcast('node_health', { aircraft: liveAircraft.length, ts: Date.now() });
    process.stdout.write(`  ✈  ADS-B   ${liveAircraft.length} aircraft in Romania airspace\n`);
  } catch {
    // network hiccup — silently skip
  }
}

// ── OpenMeteo weather poll ───────────────────────────────────────────────────
async function pollWeather(): Promise<void> {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast' +
      '?latitude=44.43&longitude=26.10' +
      '&current=temperature_2m,wind_speed_10m,visibility,weather_code' +
      '&wind_speed_unit=ms';
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return;
    const data = await res.json() as { current?: Record<string, unknown> };
    const cur = data.current ?? {};
    weather = {
      temp: (cur.temperature_2m as number) ?? 0,
      wind_speed: (cur.wind_speed_10m as number) ?? 0,
      visibility: (cur.visibility as number) ?? 10000,
      description: weatherCodeToText((cur.weather_code as number) ?? 0),
    };
    process.stdout.write(`  🌤  WEATHER ${weather.temp}°C  wind ${weather.wind_speed}m/s  vis ${(weather.visibility / 1000).toFixed(0)}km  ${weather.description}\n`);
  } catch { /* skip */ }
}

function weatherCodeToText(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 19) return 'Mist/fog';
  if (code <= 29) return 'Drizzle';
  if (code <= 39) return 'Rain';
  if (code <= 49) return 'Snow';
  if (code <= 59) return 'Rain';
  if (code <= 69) return 'Heavy rain';
  if (code <= 79) return 'Snowfall';
  if (code <= 82) return 'Rain showers';
  if (code <= 86) return 'Snow showers';
  if (code <= 99) return 'Thunderstorm';
  return 'Unknown';
}

// ── GDELT conflict events poll ───────────────────────────────────────────────
async function pollGdelt(): Promise<void> {
  try {
    // GDELT GEO API: events near Romania in last 24h
    const url = 'https://api.gdeltproject.org/api/v2/geo/geo' +
      '?query=Ukraine+OR+Romania+OR+Moldova+military+drone&mode=artlist&maxrecords=10&format=json' +
      '&timespan=1d&lat=45.9&lng=24.9&radius=500';
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return;
    const data = await res.json() as { articles?: Array<Record<string, unknown>> };
    gdeltEvents.length = 0;
    for (const art of (data.articles ?? []).slice(0, 8)) {
      if (!art.url) continue;
      gdeltEvents.push({
        title: (art.title as string ?? '').slice(0, 80),
        lat: (art.latitude as number) ?? 44.4,
        lon: (art.longitude as number) ?? 26.1,
        ts: Date.now(),
      });
    }
    if (gdeltEvents.length > 0) {
      process.stdout.write(`  📰 GDELT   ${gdeltEvents.length} regional conflict events\n`);
    }
  } catch { /* skip */ }
}

// ── Scenario loop ─────────────────────────────────────────────────────────────
const SCENARIO_SEQUENCE: ExtendedScenarioName[] = [
  'CHALLENGE_01_PERIMETER',
  'NATO_AWNING_ESCALATION',
  'CHALLENGE_02_URBAN',
  'CHALLENGE_01_SWARM',
  'CHALLENGE_02_TRAJECTORY',
  'FULL_PIPELINE',
];
let scenarioIdx = 0;

function runNextScenario(): void {
  const name = SCENARIO_SEQUENCE[scenarioIdx % SCENARIO_SEQUENCE.length];
  scenarioIdx++;
  process.stdout.write(`\n  ▶  SCENARIO ${name}\n`);
  scenarioEngine.runScenario(name, emitter, 1);
  // Next scenario after current finishes + 15s buffer
  const manifest = scenarioEngine.getScenarioManifest();
  const entry = manifest.find(m => m.name === name);
  const durationMs = ((entry?.duration_s ?? 30) + 15) * 1000;
  setTimeout(runNextScenario, durationMs);
}

// ── Serve Leaflet map at / ───────────────────────────────────────────────────
function serveMap(res: ServerResponse): void {
  const html = buildMapHtml();
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function serveAircraft(res: ServerResponse): void {
  const body = JSON.stringify({ aircraft: liveAircraft, weather, gdelt: gdeltEvents });
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

// ── Patch DashboardApiServer to add / and /aircraft routes ───────────────────
const originalHandler = apiServer.createRequestHandler();
const patchedHandler = (req: IncomingMessage, res: ServerResponse): void => {
  const url = req.url?.split('?')[0] ?? '/';
  if (url === '/' || url === '/index.html') return serveMap(res);
  if (url === '/aircraft') return serveAircraft(res);
  originalHandler(req, res);
};

// ── Start ────────────────────────────────────────────────────────────────────
const server = createServer(patchedHandler);

server.listen(8080, async () => {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  APEX-SENTINEL  live demo  →  http://localhost:8080       ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  console.log('  Feeds:');
  console.log('    • adsb.lol      — live ADS-B Romania (poll 10s)');
  console.log('    • open-meteo    — Bucharest weather (poll 5min)');
  console.log('    • gdeltproject  — regional conflict events (poll 10min)');
  console.log('    • ExtendedDemoScenarioEngine — 6 EUDIS scenarios (looping)\n');

  // Start SSE heartbeat
  sse.start();

  // Initial polls
  await Promise.all([pollAdsb(), pollWeather(), pollGdelt()]);

  // Recurring polls
  setInterval(pollAdsb, 10_000);
  setInterval(pollWeather, 5 * 60_000);
  setInterval(pollGdelt, 10 * 60_000);

  // Broadcast live aircraft via SSE every 10s
  setInterval(() => {
    sse.broadcast('node_health', {
      aircraft: liveAircraft,
      weather,
      nodeCount: nodes.getNodeGrid().length,
      ts: Date.now(),
    });
  }, 10_000);

  // Start scenario loop after 3s
  setTimeout(runNextScenario, 3000);
});

// Wire SSE endpoint to the patched server (not apiServer's internal server)
// The sse.addClient is called from within the DashboardApiServer handler for /stream
// which we're passing through via originalHandler — so it's already wired.

// ── HTML map builder ─────────────────────────────────────────────────────────
function buildMapHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>APEX-SENTINEL — Live Operations Map</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; background: #0a0e14; color: #c9d1d9; }
  #app { display: flex; flex-direction: column; height: 100vh; }

  /* ── Header ── */
  #header {
    display: flex; align-items: center; gap: 16px;
    padding: 8px 16px; background: #0d1117; border-bottom: 1px solid #21262d;
    flex-shrink: 0;
  }
  #header h1 { font-size: 14px; font-weight: 700; letter-spacing: 2px; color: #58a6ff; }
  #awning-badge {
    padding: 3px 12px; border-radius: 3px; font-size: 11px; font-weight: 700;
    letter-spacing: 1px; transition: all 0.5s;
  }
  .awning-WHITE  { background: #21262d; color: #8b949e; }
  .awning-GREEN  { background: #1a4a2e; color: #3fb950; }
  .awning-YELLOW { background: #3d2e00; color: #e3b341; }
  .awning-RED    { background: #4a1a1a; color: #f85149; animation: pulse-red 1s infinite; }
  @keyframes pulse-red { 0%,100%{box-shadow:0 0 6px #f85149} 50%{box-shadow:0 0 20px #f85149} }

  #stats { margin-left: auto; display: flex; gap: 20px; font-size: 11px; color: #8b949e; }
  .stat { display: flex; flex-direction: column; align-items: flex-end; }
  .stat-val { color: #c9d1d9; font-weight: 700; }

  /* ── Main layout ── */
  #main { display: flex; flex: 1; overflow: hidden; }
  #map { flex: 1; }

  /* ── Sidebar ── */
  #sidebar {
    width: 280px; flex-shrink: 0; background: #0d1117;
    border-left: 1px solid #21262d; display: flex; flex-direction: column;
    overflow: hidden;
  }
  .panel { border-bottom: 1px solid #21262d; }
  .panel-title {
    padding: 6px 12px; font-size: 10px; font-weight: 700;
    letter-spacing: 1.5px; color: #58a6ff; background: #161b22;
    text-transform: uppercase;
  }
  .panel-body { padding: 6px; max-height: 180px; overflow-y: auto; }

  /* detection list */
  .det-item {
    padding: 4px 6px; margin: 2px 0; border-radius: 3px;
    background: #161b22; font-size: 11px; border-left: 3px solid #21262d;
    transition: border-color 0.3s;
  }
  .det-item.stage-3 { border-color: #f85149; }
  .det-item.stage-2 { border-color: #e3b341; }
  .det-item.stage-1 { border-color: #3fb950; }
  .det-threat { color: #ff7b72; font-weight: 700; }
  .det-meta { color: #8b949e; font-size: 10px; }

  /* aircraft list */
  .ac-item {
    padding: 3px 6px; font-size: 10px; color: #8b949e;
    border-bottom: 1px solid #161b22; display: flex; justify-content: space-between;
  }
  .ac-callsign { color: #79c0ff; font-weight: 700; }

  /* GDELT feed */
  .ev-item { padding: 4px 6px; font-size: 10px; color: #8b949e; border-bottom: 1px solid #161b22; }
  .ev-title { color: #c9d1d9; }

  /* weather */
  #weather-body { padding: 8px 12px; font-size: 11px; }
  .weather-row { display: flex; justify-content: space-between; padding: 2px 0; }
  .weather-key { color: #8b949e; }
  .weather-val { color: #c9d1d9; font-weight: 700; }

  /* log */
  #log { flex: 1; overflow-y: auto; padding: 4px; }
  .log-line { font-size: 10px; color: #8b949e; padding: 1px 4px; }
  .log-line.detect { color: #f85149; }
  .log-line.awning { color: #e3b341; }
  .log-line.info { color: #3fb950; }
</style>
</head>
<body>
<div id="app">

<!-- Header -->
<div id="header">
  <h1>⬛ APEX-SENTINEL</h1>
  <div id="awning-badge" class="awning-WHITE">WHITE</div>
  <div id="stats">
    <div class="stat"><span class="stat-val" id="stat-detections">0</span><span>detections</span></div>
    <div class="stat"><span class="stat-val" id="stat-aircraft">0</span><span>aircraft</span></div>
    <div class="stat"><span class="stat-val" id="stat-nodes">3</span><span>nodes</span></div>
    <div class="stat"><span class="stat-val" id="stat-uptime">0s</span><span>uptime</span></div>
  </div>
</div>

<!-- Main -->
<div id="main">
  <div id="map"></div>
  <div id="sidebar">

    <!-- Detections -->
    <div class="panel">
      <div class="panel-title">⚡ Detections</div>
      <div class="panel-body" id="det-list"></div>
    </div>

    <!-- Aircraft -->
    <div class="panel">
      <div class="panel-title">✈ ADS-B Live (adsb.lol)</div>
      <div class="panel-body" id="ac-list"></div>
    </div>

    <!-- Weather -->
    <div class="panel">
      <div class="panel-title">🌤 Weather — Bucharest</div>
      <div id="weather-body">
        <div class="weather-row"><span class="weather-key">Temp</span><span class="weather-val" id="w-temp">—</span></div>
        <div class="weather-row"><span class="weather-key">Wind</span><span class="weather-val" id="w-wind">—</span></div>
        <div class="weather-row"><span class="weather-key">Visibility</span><span class="weather-val" id="w-vis">—</span></div>
        <div class="weather-row"><span class="weather-key">Conditions</span><span class="weather-val" id="w-desc">—</span></div>
      </div>
    </div>

    <!-- GDELT -->
    <div class="panel">
      <div class="panel-title">📰 GDELT — Regional Events</div>
      <div class="panel-body" id="gdelt-list"></div>
    </div>

    <!-- Log -->
    <div class="panel-title">📋 Event Log</div>
    <div id="log"></div>

  </div>
</div>
</div>

<script>
// ── Map init ────────────────────────────────────────────────────────────────
const map = L.map('map').setView([45.9, 24.9], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OSM contributors',
  className: 'map-tiles',
}).addTo(map);

// dark overlay
document.querySelectorAll('.map-tiles').forEach(t => {
  t.style.filter = 'invert(100%) hue-rotate(180deg) brightness(0.85) contrast(0.9)';
});

// ── Sentinel node markers (3 nodes around Bucharest) ────────────────────────
const NODE_POSITIONS = [
  { id: 'node-01', lat: 44.43, lon: 26.10, name: 'SENTINEL-01' },
  { id: 'node-02', lat: 44.38, lon: 26.05, name: 'SENTINEL-02' },
  { id: 'node-03', lat: 44.47, lon: 26.15, name: 'SENTINEL-03' },
];
const nodeIcon = L.divIcon({
  html: '<div style="width:12px;height:12px;background:#3fb950;border:2px solid #fff;border-radius:50%;box-shadow:0 0 8px #3fb950"></div>',
  iconSize: [12, 12], iconAnchor: [6, 6], className: '',
});
NODE_POSITIONS.forEach(n => {
  L.marker([n.lat, n.lon], { icon: nodeIcon })
    .bindPopup('<b>' + n.name + '</b><br>Status: ONLINE<br>Range: 2km')
    .addTo(map);
  // Acoustic range circle
  L.circle([n.lat, n.lon], {
    radius: 2000, color: '#3fb950', weight: 1,
    fillColor: '#3fb950', fillOpacity: 0.04, dashArray: '4 4',
  }).addTo(map);
});

// ── Aircraft layer ───────────────────────────────────────────────────────────
const aircraftLayer = L.layerGroup().addTo(map);
const aircraftMarkers = new Map();

const acIcon = (track) => L.divIcon({
  html: \`<div style="transform:rotate(\${track}deg);font-size:16px;line-height:1">✈</div>\`,
  iconSize: [20, 20], iconAnchor: [10, 10], className: '',
});

// ── Detection layer ──────────────────────────────────────────────────────────
const detectionLayer = L.layerGroup().addTo(map);
const detections = [];
let detCount = 0;

function stageColor(stage) {
  if (stage >= 3) return '#f85149';
  if (stage === 2) return '#e3b341';
  return '#3fb950';
}

function addDetection(d) {
  if (d.approxLat == null || d.approxLon == null) return;
  detCount++;
  document.getElementById('stat-detections').textContent = detCount;

  const color = stageColor(d.stage ?? 1);
  const marker = L.circleMarker([d.approxLat, d.approxLon], {
    radius: 10, color: color, weight: 2,
    fillColor: color, fillOpacity: 0.3,
  }).bindPopup(
    \`<b>\${d.droneType ?? 'Unknown'}</b><br>Stage: \${d.stage}<br>Conf: \${((d.confidence ?? 0) * 100).toFixed(0)}%<br>Source: \${d.source ?? '—'}\`
  ).addTo(detectionLayer);

  // Pulse effect: grow then shrink
  let r = 10;
  const pulse = setInterval(() => {
    r += 2; marker.setRadius(r);
    if (r >= 22) { clearInterval(pulse); marker.setRadius(10); }
  }, 80);

  // Add to sidebar list
  const list = document.getElementById('det-list');
  const item = document.createElement('div');
  item.className = \`det-item stage-\${d.stage ?? 1}\`;
  item.innerHTML = \`<span class="det-threat">\${d.droneType ?? 'Unknown'}</span>
    <span class="det-meta"> · Stage \${d.stage ?? 1} · \${((d.confidence ?? 0)*100).toFixed(0)}% · \${d.source ?? '—'}</span>\`;
  list.prepend(item);
  while (list.children.length > 12) list.removeChild(list.lastChild);

  addLog(\`DETECT \${d.droneType ?? '?'} stage=\${d.stage ?? 1} conf=\${((d.confidence ?? 0)*100).toFixed(0)}%\`, 'detect');
  detections.push({ marker, ts: Date.now() });
  // Remove after 90s
  setTimeout(() => { detectionLayer.removeLayer(marker); }, 90_000);
}

// ── AWNING badge ─────────────────────────────────────────────────────────────
let currentAwning = 'WHITE';
function setAwning(level) {
  if (level === currentAwning) return;
  currentAwning = level;
  const badge = document.getElementById('awning-badge');
  badge.textContent = level;
  badge.className = 'awning-' + (level === 'ALERT' ? 'RED' : level);
  addLog('AWNING → ' + level, 'awning');
}

// ── Log ──────────────────────────────────────────────────────────────────────
function addLog(msg, cls = 'info') {
  const log = document.getElementById('log');
  const ts = new Date().toTimeString().slice(0,8);
  const line = document.createElement('div');
  line.className = 'log-line ' + cls;
  line.textContent = ts + '  ' + msg;
  log.prepend(line);
  while (log.children.length > 60) log.removeChild(log.lastChild);
}

// ── Live data poll: /aircraft ────────────────────────────────────────────────
let startTs = Date.now();

async function fetchLiveData() {
  try {
    const r = await fetch('/aircraft');
    if (!r.ok) return;
    const d = await r.json();

    // Update uptime
    document.getElementById('stat-uptime').textContent =
      Math.floor((Date.now() - startTs) / 1000) + 's';

    // Update weather panel
    if (d.weather) {
      document.getElementById('w-temp').textContent = d.weather.temp + '°C';
      document.getElementById('w-wind').textContent = d.weather.wind_speed + ' m/s';
      document.getElementById('w-vis').textContent = (d.weather.visibility / 1000).toFixed(0) + ' km';
      document.getElementById('w-desc').textContent = d.weather.description;
    }

    // Update aircraft on map
    const seen = new Set();
    document.getElementById('stat-aircraft').textContent = d.aircraft.length;
    for (const ac of d.aircraft) {
      seen.add(ac.icao);
      if (aircraftMarkers.has(ac.icao)) {
        aircraftMarkers.get(ac.icao).setLatLng([ac.lat, ac.lon]);
      } else {
        const m = L.marker([ac.lat, ac.lon], { icon: acIcon(ac.track) })
          .bindPopup(\`<b>\${ac.callsign}</b><br>Alt: \${ac.alt}ft<br>Speed: \${ac.speed.toFixed(0)}kts<br>ICAO: \${ac.icao}\`)
          .addTo(aircraftLayer);
        aircraftMarkers.set(ac.icao, m);
      }
    }
    // Remove stale aircraft
    for (const [icao, m] of aircraftMarkers) {
      if (!seen.has(icao)) { aircraftLayer.removeLayer(m); aircraftMarkers.delete(icao); }
    }

    // Update aircraft sidebar list
    const acList = document.getElementById('ac-list');
    acList.innerHTML = '';
    for (const ac of d.aircraft.slice(0, 20)) {
      const row = document.createElement('div');
      row.className = 'ac-item';
      row.innerHTML = \`<span class="ac-callsign">\${ac.callsign}</span>
        <span>\${ac.alt}ft \${ac.speed.toFixed(0)}kts</span>\`;
      acList.appendChild(row);
    }
    if (d.aircraft.length > 20) {
      const more = document.createElement('div');
      more.className = 'ac-item';
      more.style.color = '#58a6ff';
      more.textContent = \`+ \${d.aircraft.length - 20} more aircraft\`;
      acList.appendChild(more);
    }

    // GDELT events
    const gdList = document.getElementById('gdelt-list');
    gdList.innerHTML = '';
    for (const ev of d.gdelt) {
      const item = document.createElement('div');
      item.className = 'ev-item';
      item.innerHTML = \`<div class="ev-title">\${ev.title || '(no title)'}</div>\`;
      gdList.appendChild(item);
    }

  } catch (e) { /* skip */ }
}
fetchLiveData();
setInterval(fetchLiveData, 10_000);

// ── SSE stream ───────────────────────────────────────────────────────────────
let evtSource;
function connectSSE() {
  if (evtSource) evtSource.close();
  evtSource = new EventSource('/stream');
  evtSource.onopen = () => addLog('SSE stream connected', 'info');
  evtSource.onerror = () => {
    addLog('SSE reconnecting…', 'info');
    setTimeout(connectSSE, 3000);
  };
  evtSource.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'detection') {
        addDetection(msg.data ?? msg);
      } else if (msg.type === 'awning_update') {
        const payload = msg.data ?? msg;
        setAwning(payload.level);
      } else if (msg.type === 'heartbeat') {
        // silent
      } else if (msg.type === 'node_health') {
        // handled by /aircraft poll
      }
    } catch {}
  };
}
connectSSE();

addLog('APEX-SENTINEL live demo started', 'info');
addLog('Feeds: adsb.lol + open-meteo + gdeltproject', 'info');
</script>
</body>
</html>`;
}
