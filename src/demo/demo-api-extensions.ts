// APEX-SENTINEL — W17 DemoApiExtensions
// FR-W17-05 | src/demo/demo-api-extensions.ts

import type { IncomingMessage, ServerResponse } from 'node:http';
import { ExtendedDemoScenarioEngine, type ExtendedScenarioName } from './extended-demo-scenario-engine.js';
import { EudisComplianceScorecard } from './eudis-compliance-scorecard.js';
import { PerformanceBenchmarkSuite } from './performance-benchmark-suite.js';
import { CoverageMapDataBuilder } from './coverage-map-data-builder.js';
import { WaveManifestGenerator } from './wave-manifest-generator.js';
import { EventEmitter } from 'node:events';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DemoApiOptions {
  scenarioEngine?: ExtendedDemoScenarioEngine;
  scorecard?: EudisComplianceScorecard;
  benchmarkSuite?: PerformanceBenchmarkSuite;
  coverageBuilder?: CoverageMapDataBuilder;
  manifestGenerator?: WaveManifestGenerator;
}

export interface RouteResult {
  statusCode: number;
  body: unknown;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
  });
}

// ── DemoApiExtensions ─────────────────────────────────────────────────────────

export class DemoApiExtensions {
  private readonly engine: ExtendedDemoScenarioEngine;
  private readonly scorecard: EudisComplianceScorecard;
  private readonly benchmarks: PerformanceBenchmarkSuite;
  private readonly coverage: CoverageMapDataBuilder;
  private readonly manifest: WaveManifestGenerator;
  private readonly emitter: EventEmitter;
  private cachedBenchmarkResult: unknown = null;

  constructor(options: DemoApiOptions = {}) {
    this.engine = options.scenarioEngine ?? new ExtendedDemoScenarioEngine();
    this.scorecard = options.scorecard ?? new EudisComplianceScorecard();
    this.benchmarks = options.benchmarkSuite ?? new PerformanceBenchmarkSuite();
    this.coverage = options.coverageBuilder ?? new CoverageMapDataBuilder();
    this.manifest = options.manifestGenerator ?? new WaveManifestGenerator();
    this.emitter = new EventEmitter();

    // Register system benchmarks by default
    this.benchmarks.registerSystemBenchmarks();
  }

  /**
   * Returns true if this handler handles the given path/method combo.
   */
  handles(url: string, method: string): boolean {
    if (url === '/demo/scenarios' && method === 'GET') return true;
    if (url.startsWith('/demo/run/') && method === 'POST') return true;
    if (url === '/demo/scorecard' && method === 'GET') return true;
    if (url === '/demo/benchmark' && method === 'GET') return true;
    if (url === '/demo/coverage' && method === 'GET') return true;
    if (url === '/demo/status' && method === 'GET') return true;
    return false;
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url?.split('?')[0] ?? '/';
    const method = req.method ?? 'GET';

    if (url === '/demo/scenarios' && method === 'GET') {
      await this.handleScenarios(res);
    } else if (url.startsWith('/demo/run/') && method === 'POST') {
      const scenarioName = url.slice('/demo/run/'.length) as ExtendedScenarioName;
      await this.handleRunScenario(req, res, scenarioName);
    } else if (url === '/demo/scorecard' && method === 'GET') {
      await this.handleScorecard(res);
    } else if (url === '/demo/benchmark' && method === 'GET') {
      await this.handleBenchmark(res);
    } else if (url === '/demo/coverage' && method === 'GET') {
      await this.handleCoverage(res);
    } else if (url === '/demo/status' && method === 'GET') {
      await this.handleStatus(res);
    } else {
      sendJson(res, 404, { error: 'Not Found', path: url });
    }
  }

  // ── Route handlers ────────────────────────────────────────────────────────

  private async handleScenarios(res: ServerResponse): Promise<void> {
    const scenarios = this.engine.getScenarioManifest();
    sendJson(res, 200, { scenarios, count: scenarios.length });
  }

  private async handleRunScenario(req: IncomingMessage, res: ServerResponse, name: ExtendedScenarioName): Promise<void> {
    const validScenarios: ExtendedScenarioName[] = [
      'CHALLENGE_01_PERIMETER', 'CHALLENGE_01_SWARM',
      'CHALLENGE_02_URBAN', 'CHALLENGE_02_TRAJECTORY',
      'NATO_AWNING_ESCALATION', 'FULL_PIPELINE',
    ];

    if (!validScenarios.includes(name)) {
      sendJson(res, 400, { error: 'Unknown scenario', scenario: name, valid: validScenarios });
      return;
    }

    // Fire and forget — 202 Accepted
    this.engine.runScenario(name, this.emitter, 10); // 10x speed for demo
    sendJson(res, 202, {
      accepted: true,
      scenario: name,
      message: `Scenario ${name} started`,
    });
  }

  private async handleScorecard(res: ServerResponse): Promise<void> {
    const score = this.scorecard.getScore();
    sendJson(res, 200, {
      scorecard: this.scorecard.scorecard,
      score,
      metCount: this.scorecard.getMetCount(),
      totalRequirements: this.scorecard.scorecard.length,
    });
  }

  private async handleBenchmark(res: ServerResponse): Promise<void> {
    if (this.cachedBenchmarkResult) {
      sendJson(res, 200, this.cachedBenchmarkResult);
      return;
    }
    const summary = await this.benchmarks.runAll();
    this.cachedBenchmarkResult = summary;
    sendJson(res, 200, summary);
  }

  private async handleCoverage(res: ServerResponse): Promise<void> {
    const geoJson = this.coverage.getCoverageGeoJson();
    const coverageSummary = this.coverage.getCoverageSummary();
    sendJson(res, 200, { geoJson, summary: coverageSummary });
  }

  private async handleStatus(res: ServerResponse): Promise<void> {
    const stats = this.manifest.getStats();
    const score = this.scorecard.getScore();
    const scenarios = this.engine.getScenarioManifest();
    const active = this.engine.getActiveScenario();

    sendJson(res, 200, {
      system: 'APEX-SENTINEL',
      version: 'W17',
      status: 'operational',
      waveManifest: stats,
      eudisScore: score,
      demoScenarios: {
        available: scenarios.length,
        active,
      },
      timestamp: new Date().toISOString(),
    });
  }

  getEmitter(): EventEmitter {
    return this.emitter;
  }
}
