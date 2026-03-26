// APEX-SENTINEL — W13 TelegramOperatorPipeline
// FR-W13-08 | src/operator/telegram-operator-pipeline.ts
// Full integration: NATS subscribe → compose → rate-limit → route → audit

import { EventEmitter } from 'events';
import type { AwningAlert } from '../nato/nato-alert-formatter.js';
import { TelegramAlertComposer, type IntelBrief, type SitrepStats } from './telegram-alert-composer.js';
import { TelegramBotGateway, type HttpClient } from './telegram-bot-gateway.js';
import { OperatorNotificationRouter, type OperatorRole } from './operator-notification-router.js';
import { AlertRateLimiter } from './alert-rate-limiter.js';
import { HourlyStatusReporter } from './hourly-status-reporter.js';
import { OperatorCommandParser } from './operator-command-parser.js';
import { NotificationAuditLog } from './notification-audit-log.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface NatsClient {
  subscribe(subject: string, handler: (msg: unknown) => void): void;
  publish?(subject: string, data: unknown): void;
}

export interface PipelineConfig {
  botToken: string;
  nats: NatsClient;
  httpClient?: HttpClient;
}

export interface SilenceState {
  until: number; // epoch ms
}

// ── TelegramOperatorPipeline ─────────────────────────────────────────────────

export class TelegramOperatorPipeline extends EventEmitter {
  private readonly composer: TelegramAlertComposer;
  private readonly router: OperatorNotificationRouter;
  private readonly rateLimiter: AlertRateLimiter;
  private readonly reporter: HourlyStatusReporter;
  private readonly commandParser: OperatorCommandParser;
  readonly auditLog: NotificationAuditLog;
  private readonly nats: NatsClient;

  private silence: SilenceState | null = null;
  private running = false;

  constructor(config: PipelineConfig) {
    super();
    this.nats = config.nats;
    this.composer = new TelegramAlertComposer();
    this.router = new OperatorNotificationRouter({
      botToken: config.botToken,
      httpClient: config.httpClient,
    });
    this.rateLimiter = new AlertRateLimiter();
    this.reporter = new HourlyStatusReporter();
    this.commandParser = new OperatorCommandParser();
    this.auditLog = new NotificationAuditLog();
  }

  /** Add an operator to the routing table. */
  addOperator(operatorId: string, role: OperatorRole, chatId: string): void {
    this.router.addOperator(operatorId, role, chatId);
  }

  /** Start subscribing to NATS subjects. */
  start(): void {
    if (this.running) return;
    this.running = true;

    this.nats.subscribe('awning.alert', (msg) => {
      const alert = msg as AwningAlert;
      void this.handleAwningAlert(alert);
    });

    this.nats.subscribe('intel.brief', (msg) => {
      const brief = msg as IntelBrief;
      void this.handleIntelBrief(brief);
    });

    this.emit('started');
  }

  /** Handle incoming Telegram webhook command. */
  async handleCommand(text: string, operatorId: string): Promise<string> {
    const parsed = this.commandParser.parse(text);

    if (!parsed.valid) {
      return `Error: ${parsed.error ?? 'invalid command'}`;
    }

    switch (parsed.command) {
      case '/status':
        return this.handleStatusCommand();

      case '/sitrep':
        return this.handleSitrepCommand();

      case '/awning':
        return this.handleAwningCommand();

      case '/trajectory':
        return `Trajectory for lat=${parsed.args.lat} lon=${parsed.args.lon} — use /awning for current AWNING state`;

      case '/silence': {
        const minutes = parseInt(parsed.args.minutes, 10);
        this.silence = { until: Date.now() + minutes * 60_000 };
        return `Silence mode active for ${minutes} minutes (non-RED alerts suppressed)`;
      }

      default:
        return `Unknown command: ${parsed.command}`;
    }
  }

  /** Apply silence mode for N minutes. */
  setSilence(minutes: number): void {
    this.silence = { until: Date.now() + minutes * 60_000 };
  }

  /** Check if silence mode is active. */
  isSilenced(nowMs: number = Date.now()): boolean {
    if (!this.silence) return false;
    if (nowMs > this.silence.until) {
      this.silence = null;
      return false;
    }
    return true;
  }

  // ── Private handlers ─────────────────────────────────────────────────────────

  private async handleAwningAlert(alert: AwningAlert): Promise<void> {
    // Determine if critical escalation
    const isCritical = alert.awningLevel === 'RED';

    // Rate limit check (skip for RED if it's first occurrence)
    const rateLimitResult = this.rateLimiter.shouldDeliver({
      alertId: alert.alertId,
      awningLevel: alert.awningLevel as 'RED' | 'YELLOW' | 'WHITE',
      sector: alert.droneType, // use droneType as sector key in pipeline
      droneType: alert.droneType,
      isCriticalEscalation: false,
    });

    if (!rateLimitResult.deliver) {
      // Record suppression in audit for each registered operator
      for (const op of this.router.getOperators()) {
        this.auditLog.record({
          operatorId: op.operatorId,
          alertId: alert.alertId,
          awningLevel: alert.awningLevel,
          delivered: false,
          error: rateLimitResult.reason,
        });
      }
      this.emit('rate_limited', alert);
      return;
    }

    // Silence check: only block non-RED alerts
    if (alert.awningLevel !== 'RED' && this.isSilenced()) {
      this.emit('silenced', alert);
      return;
    }

    // Compose message
    const text = this.composer.composeAlert(alert);

    // Route and deliver
    const notifiedIds = await this.router.routeAlert(alert, text);

    // Audit all operators
    for (const op of this.router.getOperators()) {
      const delivered = notifiedIds.includes(op.operatorId);
      this.auditLog.record({
        operatorId: op.operatorId,
        alertId: alert.alertId,
        awningLevel: alert.awningLevel,
        delivered,
        ...(!delivered ? { error: 'not_notified' } : {}),
      });
    }

    this.emit('alert_sent', { alert, notifiedIds });
  }

  private async handleIntelBrief(brief: IntelBrief): Promise<void> {
    const text = this.composer.composeIntelBrief(brief);
    await this.router.routeIntelBrief(text);
    this.emit('intel_brief_sent', brief);
  }

  private handleStatusCommand(): string {
    return '📡 APEX-SENTINEL: System operational. Use /sitrep for full report.';
  }

  private handleSitrepCommand(): string {
    // Generate a basic SITREP with empty stats (real stats injected via external aggregator)
    const stats: SitrepStats = {
      detectionCount: 0,
      awningHistory: [],
      dominantDroneType: 'unknown',
      coveragePercent: 0,
    };
    return this.reporter.generateSitrep(stats);
  }

  private handleAwningCommand(): string {
    return '📋 AWNING transitions: use /sitrep for full history.';
  }
}
