// APEX-SENTINEL — W13 TelegramAlertComposer
// FR-W13-01 | src/operator/telegram-alert-composer.ts
// Formats AWNING alerts as Telegram MarkdownV2 messages.
// RULE: No pipe chars (|). Box-drawing chars ONLY for tables.

import type { AwningAlert } from '../nato/nato-alert-formatter.js';
import type { TrajectoryPrediction } from '../nato/stage35-trajectory-predictor.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface IntelBrief {
  briefId: string;
  summary: string;
  sources: string[];
  ts: string;
}

export interface SitrepStats {
  detectionCount: number;
  awningHistory: AwningEntry[];
  dominantDroneType: string;
  coveragePercent: number;
}

export interface AwningEntry {
  ts: string;
  level: string;
  droneType?: string;
}

// ── MarkdownV2 escape ────────────────────────────────────────────────────────

/**
 * Escapes special MarkdownV2 characters per Telegram docs.
 * Characters: _ * [ ] ( ) ~ ` > # + - = | { } . !
 */
function escMd(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// ── TelegramAlertComposer ────────────────────────────────────────────────────

export class TelegramAlertComposer {

  /**
   * Composes a Telegram MarkdownV2 alert message for an AWNING alert.
   */
  composeAlert(awningAlert: AwningAlert): string {
    const { awningLevel, droneType, stage, alertId, ts } = awningAlert;

    const lines: string[] = [];

    if (awningLevel === 'RED') {
      lines.push(`🚨 *AWNING RED* — ${escMd(droneType)} — Stage ${escMd(String(stage ?? '?'))}`);
    } else if (awningLevel === 'YELLOW') {
      lines.push(`⚠️ *AWNING YELLOW* — Potential ${escMd(droneType)}`);
    } else {
      lines.push(`✅ *AWNING WHITE* — All clear`);
    }

    lines.push(`Alert ID: \`${alertId}\``);
    lines.push(`Time: \`${ts.slice(0, 19).replace('T', ' ')} UTC\``);

    // Trajectory block for Stage 3.5 (trajectory present)
    if (awningAlert.trajectory && awningAlert.trajectory.length > 0) {
      lines.push('');
      lines.push(this.buildTrajectoryBlock(awningAlert.trajectory));
    }

    return lines.join('\n');
  }

  /**
   * Composes a condensed intel brief (max 5 lines).
   */
  composeIntelBrief(intelBrief: IntelBrief): string {
    const summaryLines = intelBrief.summary
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .slice(0, 5);

    const lines: string[] = [
      `📋 *Intel Brief* \`${escMd(intelBrief.briefId)}\``,
      ...summaryLines.map(l => escMd(l)),
    ];

    return lines.join('\n');
  }

  /**
   * Composes an hourly status overview.
   */
  composeHourlyStatus(stats: SitrepStats): string {
    const lines: string[] = [
      `📊 *Hourly Status*`,
      `Detections: ${stats.detectionCount}`,
      `Dominant: \`${stats.dominantDroneType}\``,
      `Coverage: ${stats.coveragePercent}%`,
    ];

    if (stats.awningHistory.length > 0) {
      const lastLevel = stats.awningHistory[stats.awningHistory.length - 1].level;
      lines.push(`Last AWNING: ${lastLevel}`);
    }

    return lines.join('\n');
  }

  /**
   * Builds a box-drawing trajectory ETA table.
   * Columns: ETA 30s / 60s / 120s
   * Uses ─ │ ┌ ┐ └ ┘ ├ ┤ — NO pipe chars.
   */
  private buildTrajectoryBlock(trajectory: TrajectoryPrediction[]): string {
    // Find predictions closest to 30, 60, 120 seconds
    const targets = [30, 60, 120];
    const rows = targets.map(t => {
      const pred = trajectory.reduce((best, p) =>
        Math.abs(p.tSeconds - t) < Math.abs(best.tSeconds - t) ? p : best,
      );
      return {
        eta: `${t}s`,
        lat: pred.lat.toFixed(4),
        lon: pred.lon.toFixed(4),
        alt: `${Math.round(pred.altM)}m`,
        r: `±${Math.round(pred.confidenceRadius_m)}m`,
      };
    });

    const lines: string[] = [];
    lines.push('```');
    lines.push('┌──────┬──────────┬──────────┬──────┬───────┐');
    lines.push('│ ETA  │ Lat      │ Lon      │ Alt  │ R     │');
    lines.push('├──────┼──────────┼──────────┼──────┼───────┤');
    for (const r of rows) {
      lines.push(
        `│ ${r.eta.padEnd(4)} │ ${r.lat.padEnd(8)} │ ${r.lon.padEnd(8)} │ ${r.alt.padEnd(4)} │ ${r.r.padEnd(5)} │`,
      );
    }
    lines.push('└──────┴──────────┴──────────┴──────┴───────┘');
    lines.push('```');

    return lines.join('\n');
  }
}
