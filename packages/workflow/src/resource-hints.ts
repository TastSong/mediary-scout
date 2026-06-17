/** Season/episode codes parsed from a release title (SxxEyy + 第N集). */
export function extractEpisodeHints(text: string): string[] {
  const hints = new Set<string>();
  const seasonEpisodePattern = /[Ss](\d{1,2})[Ee](\d{1,3})/g;
  for (const match of text.matchAll(seasonEpisodePattern)) {
    const season = Number(match[1]);
    const episode = Number(match[2]);
    if (Number.isFinite(season) && Number.isFinite(episode)) {
      hints.add(`S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`);
    }
  }

  const chineseEpisodePattern = /第\s*(\d{1,3})\s*集/g;
  for (const match of text.matchAll(chineseEpisodePattern)) {
    const episode = Number(match[1]);
    if (Number.isFinite(episode)) {
      hints.add(`S01E${String(episode).padStart(2, "0")}`);
    }
  }

  return Array.from(hints);
}

/** Coarse quality tokens parsed from a release title. */
export function extractQualityHints(text: string): string[] {
  const hints = new Set<string>();
  const patterns = [/\b4K\b/i, /\b2160p\b/i, /\b1080p\b/i, /\b720p\b/i, /\bHDR\b/i, /\bDV\b/i];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      hints.add(match[0]);
    }
  }
  return Array.from(hints);
}
