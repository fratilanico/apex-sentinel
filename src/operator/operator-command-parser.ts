// APEX-SENTINEL — W13 OperatorCommandParser
// FR-W13-06 | src/operator/operator-command-parser.ts
// Parses incoming Telegram bot commands.

// ── Types ────────────────────────────────────────────────────────────────────

export type CommandName = '/status' | '/sitrep' | '/awning' | '/trajectory' | '/silence';

export interface ParsedCommand {
  command: CommandName | string;
  args: Record<string, string>;
  valid: boolean;
  error?: string;
}

const SILENCE_MAX_MINUTES = 60;

// ── OperatorCommandParser ────────────────────────────────────────────────────

export class OperatorCommandParser {

  /**
   * Parses a Telegram message text into a structured command.
   */
  parse(text: string): ParsedCommand {
    const trimmed = text.trim();

    if (!trimmed.startsWith('/')) {
      return { command: '', args: {}, valid: false, error: 'Not a command (must start with /)' };
    }

    const parts = trimmed.split(/\s+/);
    const rawCommand = parts[0].toLowerCase();

    switch (rawCommand) {
      case '/status':
        return this.parseStatus(parts);

      case '/sitrep':
        return this.parseSitrep(parts);

      case '/awning':
        return this.parseAwning(parts);

      case '/trajectory':
        return this.parseTrajectory(parts);

      case '/silence':
        return this.parseSilence(parts);

      default:
        return {
          command: rawCommand,
          args: {},
          valid: false,
          error: `Unknown command: ${rawCommand}`,
        };
    }
  }

  private parseStatus(_parts: string[]): ParsedCommand {
    return { command: '/status', args: {}, valid: true };
  }

  private parseSitrep(_parts: string[]): ParsedCommand {
    return { command: '/sitrep', args: {}, valid: true };
  }

  private parseAwning(_parts: string[]): ParsedCommand {
    return { command: '/awning', args: {}, valid: true };
  }

  private parseTrajectory(parts: string[]): ParsedCommand {
    if (parts.length < 3) {
      return {
        command: '/trajectory',
        args: {},
        valid: false,
        error: 'Usage: /trajectory <lat> <lon>',
      };
    }

    const lat = parts[1];
    const lon = parts[2];

    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);

    if (isNaN(latNum) || isNaN(lonNum)) {
      return {
        command: '/trajectory',
        args: { lat, lon },
        valid: false,
        error: 'Invalid coordinates: lat and lon must be numeric',
      };
    }

    if (latNum < -90 || latNum > 90) {
      return {
        command: '/trajectory',
        args: { lat, lon },
        valid: false,
        error: 'Invalid lat: must be between -90 and 90',
      };
    }

    if (lonNum < -180 || lonNum > 180) {
      return {
        command: '/trajectory',
        args: { lat, lon },
        valid: false,
        error: 'Invalid lon: must be between -180 and 180',
      };
    }

    return { command: '/trajectory', args: { lat, lon }, valid: true };
  }

  private parseSilence(parts: string[]): ParsedCommand {
    if (parts.length < 2) {
      return {
        command: '/silence',
        args: {},
        valid: false,
        error: 'Usage: /silence <minutes>',
      };
    }

    const minutesStr = parts[1];
    const minutes = parseInt(minutesStr, 10);

    if (isNaN(minutes) || minutes <= 0) {
      return {
        command: '/silence',
        args: { minutes: minutesStr },
        valid: false,
        error: 'Minutes must be a positive integer',
      };
    }

    if (minutes > SILENCE_MAX_MINUTES) {
      return {
        command: '/silence',
        args: { minutes: minutesStr },
        valid: false,
        error: `Max silence duration is ${SILENCE_MAX_MINUTES} minutes`,
      };
    }

    return { command: '/silence', args: { minutes: minutesStr }, valid: true };
  }
}
