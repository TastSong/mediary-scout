import type { NotificationEvent } from "./domain.js";

/**
 * Outbound push: the in-app feed is the source of truth; these channels are
 * delivery only. Every adapter is "HTTPS POST a token-bearing URL with
 * title + body" — the user picks whichever channels they configured, and a
 * delivery failure never affects workflow runs (collected, not thrown).
 */
export interface NotifyMessage {
  title: string;
  text: string;
  markdown?: string;
  url?: string;
}

export interface NotifyChannel {
  id: string;
  send(message: NotifyMessage): Promise<void>;
}

export type NotifyFetch = (
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number }>;

const defaultFetch: NotifyFetch = async (url, init) => {
  const response = await fetch(url, init);
  return { ok: response.ok, status: response.status };
};

function assertDelivered(channelId: string, result: { ok: boolean; status: number }): void {
  if (!result.ok) {
    throw new Error(`${channelId} push failed with HTTP ${result.status}`);
  }
}

/** Bark (iOS, APNs). 3-step user setup: install app, copy key, paste. */
export function createBarkChannel(options: {
  key: string;
  baseUrl?: string;
  fetchImpl?: NotifyFetch;
}): NotifyChannel {
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const baseUrl = (options.baseUrl ?? "https://api.day.app").replace(/\/$/, "");
  return {
    id: "bark",
    async send(message) {
      const result = await fetchImpl(`${baseUrl}/${options.key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: message.title,
          body: message.text,
          group: "media-track",
          ...(message.url === undefined ? {} : { url: message.url }),
        }),
      });
      assertDelivered("bark", result);
    },
  };
}

/** Server酱 Turbo — lands in personal WeChat, zero app install. */
export function createServerChanChannel(options: {
  sendKey: string;
  fetchImpl?: NotifyFetch;
}): NotifyChannel {
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  return {
    id: "serverchan",
    async send(message) {
      const body = new URLSearchParams({
        title: message.title,
        desp: message.markdown ?? message.text,
      });
      const result = await fetchImpl(`https://sctapi.ftqq.com/${options.sendKey}.send`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: body.toString(),
      });
      assertDelivered("serverchan", result);
    },
  };
}

/** 企业微信群机器人 webhook. */
export function createWeComChannel(options: {
  webhookUrl: string;
  fetchImpl?: NotifyFetch;
}): NotifyChannel {
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  return {
    id: "wecom",
    async send(message) {
      const payload =
        message.markdown !== undefined
          ? { msgtype: "markdown", markdown: { content: `**${message.title}**\n${message.markdown}` } }
          : { msgtype: "text", text: { content: `${message.title}\n${message.text}` } };
      const result = await fetchImpl(options.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      assertDelivered("wecom", result);
    },
  };
}

/** Power-user escape hatch: POST the whole message to any URL. */
export function createWebhookChannel(options: {
  url: string;
  fetchImpl?: NotifyFetch;
}): NotifyChannel {
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  return {
    id: "webhook",
    async send(message) {
      const result = await fetchImpl(options.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });
      assertDelivered("webhook", result);
    },
  };
}

export function createNotifyChannelsFromEnv(
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: NotifyFetch,
): NotifyChannel[] {
  const channels: NotifyChannel[] = [];
  const shared = fetchImpl === undefined ? {} : { fetchImpl };
  if (env["MEDIA_TRACK_PUSH_BARK_KEY"]) {
    channels.push(
      createBarkChannel({
        key: env["MEDIA_TRACK_PUSH_BARK_KEY"],
        ...(env["MEDIA_TRACK_PUSH_BARK_BASE_URL"]
          ? { baseUrl: env["MEDIA_TRACK_PUSH_BARK_BASE_URL"] }
          : {}),
        ...shared,
      }),
    );
  }
  if (env["MEDIA_TRACK_PUSH_SERVERCHAN_SENDKEY"]) {
    channels.push(
      createServerChanChannel({ sendKey: env["MEDIA_TRACK_PUSH_SERVERCHAN_SENDKEY"], ...shared }),
    );
  }
  if (env["MEDIA_TRACK_PUSH_WECOM_WEBHOOK"]) {
    channels.push(createWeComChannel({ webhookUrl: env["MEDIA_TRACK_PUSH_WECOM_WEBHOOK"], ...shared }));
  }
  if (env["MEDIA_TRACK_PUSH_WEBHOOK_URL"]) {
    channels.push(createWebhookChannel({ url: env["MEDIA_TRACK_PUSH_WEBHOOK_URL"], ...shared }));
  }
  return channels;
}

export interface NotifyDispatchResult {
  sent: number;
  failures: Array<{ channelId: string; notificationId: string; error: string }>;
}

export async function dispatchNotifications(input: {
  channels: NotifyChannel[];
  notifications: NotificationEvent[];
}): Promise<NotifyDispatchResult> {
  let sent = 0;
  const failures: NotifyDispatchResult["failures"] = [];
  for (const notification of input.notifications) {
    const message: NotifyMessage = {
      title: notification.title,
      text: notification.body,
    };
    let delivered = false;
    for (const channel of input.channels) {
      try {
        await channel.send(message);
        delivered = true;
      } catch (error) {
        failures.push({
          channelId: channel.id,
          notificationId: notification.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (delivered) {
      sent += 1;
    }
  }
  return { sent, failures };
}
