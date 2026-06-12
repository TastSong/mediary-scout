import { describe, expect, it } from "vitest";
import {
  createBarkChannel,
  createNotifyChannelsFromEnv,
  createServerChanChannel,
  createWebhookChannel,
  createWeComChannel,
  dispatchNotifications,
  type NotifyFetch,
} from "../src/index.js";

interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

function recordingFetch(requests: RecordedRequest[], ok = true): NotifyFetch {
  return async (url, init) => {
    requests.push({
      url,
      method: init.method,
      headers: init.headers ?? {},
      body: init.body ?? "",
    });
    return { ok, status: ok ? 200 : 500 };
  };
}

const message = {
  title: "黑袍纠察队 更新",
  text: "S05E08 已入库",
  markdown: "**S05E08** 已入库",
};

describe("notify channels", () => {
  it("bark posts JSON to api.day.app with the device key", async () => {
    const requests: RecordedRequest[] = [];
    const channel = createBarkChannel({ key: "device_key", fetchImpl: recordingFetch(requests) });
    await channel.send(message);

    expect(requests[0]?.url).toBe("https://api.day.app/device_key");
    const body = JSON.parse(requests[0]!.body);
    expect(body).toMatchObject({ title: message.title, body: message.text, group: "media-track" });
  });

  it("serverchan posts title/desp with markdown preferred", async () => {
    const requests: RecordedRequest[] = [];
    const channel = createServerChanChannel({
      sendKey: "SCT_KEY",
      fetchImpl: recordingFetch(requests),
    });
    await channel.send(message);

    expect(requests[0]?.url).toBe("https://sctapi.ftqq.com/SCT_KEY.send");
    const body = new URLSearchParams(requests[0]!.body);
    expect(body.get("title")).toBe(message.title);
    expect(body.get("desp")).toBe(message.markdown);
  });

  it("wecom posts markdown msgtype when markdown is present, text otherwise", async () => {
    const requests: RecordedRequest[] = [];
    const channel = createWeComChannel({
      webhookUrl: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=K",
      fetchImpl: recordingFetch(requests),
    });
    await channel.send(message);
    await channel.send({ title: "t", text: "plain" });

    expect(JSON.parse(requests[0]!.body)).toEqual({
      msgtype: "markdown",
      markdown: { content: `**${message.title}**\n${message.markdown}` },
    });
    expect(JSON.parse(requests[1]!.body)).toEqual({
      msgtype: "text",
      text: { content: "t\nplain" },
    });
  });

  it("generic webhook posts the whole message as JSON", async () => {
    const requests: RecordedRequest[] = [];
    const channel = createWebhookChannel({
      url: "https://example.com/hook",
      fetchImpl: recordingFetch(requests),
    });
    await channel.send(message);

    expect(requests[0]?.url).toBe("https://example.com/hook");
    expect(JSON.parse(requests[0]!.body)).toMatchObject({
      title: message.title,
      text: message.text,
      markdown: message.markdown,
    });
  });

  it("builds only the channels configured in env", () => {
    const channels = createNotifyChannelsFromEnv({
      MEDIA_TRACK_PUSH_BARK_KEY: "bk",
      MEDIA_TRACK_PUSH_WEBHOOK_URL: "https://example.com/h",
    });
    expect(channels.map((channel) => channel.id).sort()).toEqual(["bark", "webhook"]);
    expect(createNotifyChannelsFromEnv({})).toEqual([]);
  });
});

describe("dispatchNotifications", () => {
  it("sends every notification to every channel and reports failures without throwing", async () => {
    const okRequests: RecordedRequest[] = [];
    const ok = createBarkChannel({ key: "k", fetchImpl: recordingFetch(okRequests) });
    const failing = createWebhookChannel({
      url: "https://down.example.com/hook",
      fetchImpl: recordingFetch([], false),
    });

    const result = await dispatchNotifications({
      channels: [ok, failing],
      notifications: [
        {
          id: "n1",
          workflowRunId: "r1",
          kind: "episodes_restored",
          title: "翘楚 episodes restored",
          body: "2 episodes restored",
          createdAt: "2026-06-13T00:00:00.000Z",
        },
        {
          id: "n2",
          workflowRunId: "r1",
          kind: "already_current",
          title: "翘楚 already current",
          body: "0 episodes restored",
          createdAt: "2026-06-13T00:00:01.000Z",
        },
      ],
    });

    expect(okRequests).toHaveLength(2);
    expect(result.sent).toBe(2);
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0]?.channelId).toBe("webhook");
  });
});
