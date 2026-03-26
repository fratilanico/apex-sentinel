// APEX-SENTINEL — W13
// FR-W13-02: TelegramBotGateway

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TelegramBotGateway, type HttpClient } from '../../src/operator/telegram-bot-gateway.js';

describe('FR-W13-02: TelegramBotGateway', () => {
  const BOT_TOKEN = 'test-token-123';
  const CHAT_ID = '987654321';

  function makeHttpClient(response: object = { ok: true, result: {} }): HttpClient & { calls: { url: string; body: unknown }[] } {
    const calls: { url: string; body: unknown }[] = [];
    return {
      calls,
      post: vi.fn(async (url: string, body: unknown) => {
        calls.push({ url, body });
        return response;
      }),
    };
  }

  let httpClient: ReturnType<typeof makeHttpClient>;
  let gateway: TelegramBotGateway;

  beforeEach(() => {
    httpClient = makeHttpClient();
    gateway = new TelegramBotGateway({ botToken: BOT_TOKEN, chatId: CHAT_ID, httpClient });
  });

  it('sendAlert posts to correct Telegram URL', async () => {
    await gateway.sendAlert('Hello');
    expect(httpClient.calls[0].url).toContain(`bot${BOT_TOKEN}/sendMessage`);
  });

  it('sendAlert sets parse_mode=MarkdownV2', async () => {
    await gateway.sendAlert('Test');
    const body = httpClient.calls[0].body as Record<string, unknown>;
    expect(body.parse_mode).toBe('MarkdownV2');
  });

  it('sendAlert sets correct chat_id', async () => {
    await gateway.sendAlert('Test');
    const body = httpClient.calls[0].body as Record<string, unknown>;
    expect(body.chat_id).toBe(CHAT_ID);
  });

  it('sendSilent sets disable_notification=true', async () => {
    await gateway.sendSilent('Quiet update');
    const body = httpClient.calls[0].body as Record<string, unknown>;
    expect(body.disable_notification).toBe(true);
  });

  it('sendAlert returns ok=true on success', async () => {
    const result = await gateway.sendAlert('OK');
    expect(result.ok).toBe(true);
  });

  it('retries once on 429 response', async () => {
    let callCount = 0;
    const retryClient: HttpClient = {
      post: vi.fn(async () => {
        callCount++;
        if (callCount === 1) return { ok: false, error_code: 429, description: 'Too Many Requests' };
        return { ok: true, result: {} };
      }),
    };
    const gw = new TelegramBotGateway({ botToken: BOT_TOKEN, chatId: CHAT_ID, httpClient: retryClient });
    const result = await gw.sendAlert('Retry me');
    expect(callCount).toBe(2);
    expect(result.ok).toBe(true);
  });

  it('returns ok=false after failed send', async () => {
    const failClient: HttpClient = {
      post: vi.fn(async () => ({ ok: false, error_code: 400, description: 'Bad Request' })),
    };
    const gw = new TelegramBotGateway({ botToken: BOT_TOKEN, chatId: CHAT_ID, httpClient: failClient });
    const result = await gw.sendAlert('Fail');
    expect(result.ok).toBe(false);
  });

  it('getStats tracks sent count', async () => {
    await gateway.sendAlert('A');
    await gateway.sendAlert('B');
    expect(gateway.getStats().sent).toBe(2);
  });

  it('getStats tracks failed count', async () => {
    const failClient: HttpClient = {
      post: vi.fn(async () => ({ ok: false, error_code: 400, description: 'Fail' })),
    };
    const gw = new TelegramBotGateway({ botToken: BOT_TOKEN, chatId: CHAT_ID, httpClient: failClient });
    await gw.sendAlert('Fail');
    expect(gw.getStats().failed).toBe(1);
  });

  it('rate limit: drops after 20 messages in 1 minute', async () => {
    for (let i = 0; i < 20; i++) {
      await gateway.sendAlert(`Msg ${i}`);
    }
    const result = await gateway.sendAlert('Overflow');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('rate_limit_dropped');
  });

  it('getStats returns rateLimited count on rate limit hit', async () => {
    for (let i = 0; i < 20; i++) {
      await gateway.sendAlert(`Msg ${i}`);
    }
    await gateway.sendAlert('Overflow');
    expect(gateway.getStats().rateLimited).toBeGreaterThan(0);
  });

  it('network error returns ok=false with error string', async () => {
    const errClient: HttpClient = {
      post: vi.fn(async () => { throw new Error('network failure'); }),
    };
    const gw = new TelegramBotGateway({ botToken: BOT_TOKEN, chatId: CHAT_ID, httpClient: errClient });
    const result = await gw.sendAlert('Fail');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('network failure');
  });
});
