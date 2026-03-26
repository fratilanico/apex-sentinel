// APEX-SENTINEL — W13 TelegramBotGateway
// FR-W13-02 | src/operator/telegram-bot-gateway.ts
// Raw HTTP client for Telegram Bot API — no npm telegram packages.

// ── Types ────────────────────────────────────────────────────────────────────

export interface HttpClient {
  post(url: string, body: unknown): Promise<{ ok: boolean; result?: unknown; error_code?: number; description?: string }>;
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

export interface GatewayStats {
  sent: number;
  failed: number;
  dropped: number;
  rateLimited: number;
}

// ── Rate limit state ─────────────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 20;

// ── Default HTTP client (raw fetch) ─────────────────────────────────────────

const defaultHttpClient: HttpClient = {
  async post(url: string, body: unknown) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.json() as Promise<{ ok: boolean; result?: unknown; error_code?: number; description?: string }>;
  },
};

// ── TelegramBotGateway ───────────────────────────────────────────────────────

export class TelegramBotGateway {
  private readonly baseUrl: string;
  private readonly chatId: string;
  private readonly http: HttpClient;

  private stats: GatewayStats = { sent: 0, failed: 0, dropped: 0, rateLimited: 0 };
  private readonly messageTimes: number[] = []; // timestamps of messages in current window

  constructor(config: {
    botToken: string;
    chatId: string;
    httpClient?: HttpClient;
  }) {
    this.baseUrl = `https://api.telegram.org/bot${config.botToken}`;
    this.chatId = config.chatId;
    this.http = config.httpClient ?? defaultHttpClient;
  }

  /**
   * Sends alert with parse_mode=MarkdownV2. Retries once on 429.
   */
  async sendAlert(text: string): Promise<SendResult> {
    return this.send(text, false);
  }

  /**
   * Sends with disable_notification=true (non-critical).
   */
  async sendSilent(text: string): Promise<SendResult> {
    return this.send(text, true);
  }

  /**
   * Returns current delivery statistics.
   */
  getStats(): GatewayStats {
    return { ...this.stats };
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async send(text: string, silent: boolean): Promise<SendResult> {
    // Rate limit check
    if (!this.checkRateLimit()) {
      this.stats.dropped++;
      this.stats.rateLimited++;
      return { ok: false, error: 'rate_limit_dropped' };
    }

    const body: Record<string, unknown> = {
      chat_id: this.chatId,
      text,
      parse_mode: 'MarkdownV2',
    };

    if (silent) {
      body.disable_notification = true;
    }

    const url = `${this.baseUrl}/sendMessage`;

    try {
      const result = await this.http.post(url, body);

      if (result.ok) {
        this.stats.sent++;
        return { ok: true };
      }

      // Retry once on 429
      if (result.error_code === 429) {
        this.stats.rateLimited++;
        const retry = await this.http.post(url, body);
        if (retry.ok) {
          this.stats.sent++;
          return { ok: true };
        }
        this.stats.failed++;
        return { ok: false, error: retry.description ?? 'retry_failed' };
      }

      this.stats.failed++;
      return { ok: false, error: result.description ?? 'send_failed' };
    } catch (err) {
      this.stats.failed++;
      return { ok: false, error: String(err) };
    }
  }

  private checkRateLimit(): boolean {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;

    // Prune old timestamps
    while (this.messageTimes.length > 0 && this.messageTimes[0] < windowStart) {
      this.messageTimes.shift();
    }

    if (this.messageTimes.length >= RATE_LIMIT_MAX) {
      // Drop oldest to make room (queue overflow drops oldest)
      this.messageTimes.shift();
      return false; // signal dropped
    }

    this.messageTimes.push(now);
    return true;
  }
}
