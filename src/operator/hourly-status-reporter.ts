// APEX-SENTINEL — W13 HourlyStatusReporter
// FR-W13-05 | src/operator/hourly-status-reporter.ts
// Generates hourly SITREP with box-drawing structure. No pipe chars.

// ── Types ────────────────────────────────────────────────────────────────────

export interface AwningEntry {
  ts: string;
  level: string;
  droneType?: string;
}

export interface SitrepStats {
  detectionCount: number;
  awningHistory: AwningEntry[];
  dominantDroneType: string;
  coveragePercent: number;
}

// ── HourlyStatusReporter ─────────────────────────────────────────────────────

export class HourlyStatusReporter {

  /**
   * Generates a structured SITREP with box-drawing chars.
   * Sections: SUMMARY, DETECTIONS, AWNING HISTORY, THREAT MATRIX
   */
  generateSitrep(stats: SitrepStats): string {
    const sections: string[] = [];

    sections.push(this.buildHeader());
    sections.push(this.buildSummary(stats));
    sections.push(this.buildDetections(stats));
    sections.push(this.buildAwningHistory(stats.awningHistory));
    sections.push(this.buildThreatMatrix(stats));
    sections.push(this.buildFooter());

    return sections.join('\n');
  }

  private buildHeader(): string {
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    return [
      '┌─────────────────────────────────────┐',
      '│     APEX-SENTINEL HOURLY SITREP     │',
      `│     ${now} UTC`.padEnd(38) + '│',
      '├─────────────────────────────────────┤',
    ].join('\n');
  }

  private buildSummary(stats: SitrepStats): string {
    const lines = [
      '│ SUMMARY                             │',
      `│  Detections:  ${String(stats.detectionCount).padEnd(22)}│`,
      `│  Dominant:    ${stats.dominantDroneType.slice(0, 22).padEnd(22)}│`,
      `│  Coverage:    ${String(stats.coveragePercent).padEnd(19)}%    │`,
      '├─────────────────────────────────────┤',
    ];
    return lines.join('\n');
  }

  private buildDetections(stats: SitrepStats): string {
    const total = stats.detectionCount;
    const redCount = stats.awningHistory.filter(e => e.level === 'RED').length;
    const yellowCount = stats.awningHistory.filter(e => e.level === 'YELLOW').length;

    return [
      '│ DETECTIONS                          │',
      `│  Total events: ${String(total).padEnd(21)}│`,
      `│  RED alerts:   ${String(redCount).padEnd(21)}│`,
      `│  YLW alerts:   ${String(yellowCount).padEnd(21)}│`,
      '├─────────────────────────────────────┤',
    ].join('\n');
  }

  private buildAwningHistory(history: AwningEntry[]): string {
    const lines = [
      '│ AWNING HISTORY (last 5)             │',
    ];

    const recent = history.slice(-5);
    if (recent.length === 0) {
      lines.push('│  No transitions recorded            │');
    } else {
      for (const entry of recent) {
        const ts = entry.ts.slice(11, 19); // HH:MM:SS
        const level = entry.level.padEnd(6);
        const drone = (entry.droneType ?? 'unknown').slice(0, 14).padEnd(14);
        lines.push(`│  ${ts} ${level} ${drone}  │`);
      }
    }

    lines.push('├─────────────────────────────────────┤');
    return lines.join('\n');
  }

  private buildThreatMatrix(stats: SitrepStats): string {
    const lines = [
      '│ THREAT MATRIX                       │',
      `│  Primary:  ${stats.dominantDroneType.slice(0, 25).padEnd(25)}│`,
    ];

    // Count by level
    const redPct = stats.awningHistory.length === 0 ? 0
      : Math.round((stats.awningHistory.filter(e => e.level === 'RED').length / stats.awningHistory.length) * 100);

    lines.push(`│  RED ratio: ${String(redPct).padEnd(24)}%│`);
    lines.push('├─────────────────────────────────────┤');
    return lines.join('\n');
  }

  private buildFooter(): string {
    return '└─────────────────────────────────────┘';
  }
}
