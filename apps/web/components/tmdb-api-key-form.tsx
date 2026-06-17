"use client";

import { useState, useTransition } from "react";
import { Check, LoaderCircle, Trash2 } from "lucide-react";
import { saveTmdbApiKeyAction, clearTmdbApiKeyAction } from "../app/actions";

export function TmdbApiKeyForm({ apiKeySet }: { apiKeySet: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(apiKeySet);
  const [result, setResult] = useState<string | null>(null);

  const handleSave = () => {
    startTransition(async () => {
      const res = await saveTmdbApiKeyAction(apiKey);
      setResult(res.success ? "✅ 保存成功" : `❌ ${res.message ?? "保存失败"}`);
      if (res.success && apiKey.trim()) {
        setApiKey("");
        setHasKey(true);
      }
      setTimeout(() => setResult(null), 3000);
    });
  };

  const handleClear = () => {
    startTransition(async () => {
      const res = await clearTmdbApiKeyAction();
      setResult(res.success ? "✅ 已清除，改用代理兜底" : `❌ ${res.message ?? "清除失败"}`);
      if (res.success) setHasKey(false);
      setTimeout(() => setResult(null), 3000);
    });
  };

  return (
    <div className="push-form">
      <p className="panel-note" style={{ marginBottom: 12 }}>
        默认元数据走作者的代理服务（已缓存、开箱即用）。想更稳可在{" "}
        <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">
          TMDB
        </a>{" "}
        申请自己的 API Read Token 填入——直连你自己的额度；调不通时会自动回退到代理。留空不改动已保存的值。
      </p>
      <div className="push-field">
        <label className="push-label">TMDB API Read Token</label>
        <input
          type="password"
          className="setting-control"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={hasKey ? "已设置(留空不改)" : "eyJhbGciOi…（v4 read token）"}
          aria-label="TMDB API Key"
          autoComplete="off"
        />
      </div>
      <div className="setting-row" style={{ marginTop: 4 }}>
        <button type="button" className="primary-button" onClick={handleSave} disabled={isPending}>
          {isPending ? <LoaderCircle size={14} className="spin" aria-hidden /> : <Check size={14} aria-hidden />}
          保存
        </button>
        {hasKey ? (
          <button type="button" className="secondary-button" onClick={handleClear} disabled={isPending}>
            <Trash2 size={14} aria-hidden />
            清除
          </button>
        ) : null}
        {result ? <span className="panel-note">{result}</span> : null}
      </div>
    </div>
  );
}
