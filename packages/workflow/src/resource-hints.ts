/** Season/episode codes parsed from a release title (SxxEyy + 第N集 + 更新至/全N集 + 范围). */
export function extractEpisodeHints(text: string): string[] {
  const hints = new Set<string>();

  // Standard SxxEyy format (e.g., S01E01, S01E02)
  const seasonEpisodePattern = /[Ss](\d{1,2})[Ee](\d{1,3})/g;
  for (const match of text.matchAll(seasonEpisodePattern)) {
    const season = Number(match[1]);
    const episode = Number(match[2]);
    if (Number.isFinite(season) && Number.isFinite(episode)) {
      hints.add(`S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`);
    }
  }

  // Chinese "第N集" format (e.g., 第1集, 第 2 集)
  const chineseEpisodePattern = /第\s*(\d{1,3})\s*集/g;
  for (const match of text.matchAll(chineseEpisodePattern)) {
    const episode = Number(match[1]);
    if (Number.isFinite(episode)) {
      hints.add(`S01E${String(episode).padStart(2, "0")}`);
    }
  }

  // "更新至N集" format (e.g., 更新至36集) - indicates latest aired episode
  const updateToPattern = /更新至\s*(\d{1,3})\s*集/g;
  for (const match of text.matchAll(updateToPattern)) {
    const latestEpisode = Number(match[1]);
    if (Number.isFinite(latestEpisode)) {
      // Generate all episodes up to the latest (assume Season 1)
      for (let ep = 1; ep <= latestEpisode; ep++) {
        hints.add(`S01E${String(ep).padStart(2, "0")}`);
      }
    }
  }

  // "全N集" / "全集" format (e.g., 全24集, 全集)
  const completePattern = /全\s*(\d{1,3})\s*集/g;
  for (const match of text.matchAll(completePattern)) {
    const totalEpisodes = Number(match[1]);
    if (Number.isFinite(totalEpisodes)) {
      for (let ep = 1; ep <= totalEpisodes; ep++) {
        hints.add(`S01E${String(ep).padStart(2, "0")}`);
      }
    }
  }

  // Range format "N-N集" / "N至N集" (e.g., 1-24集, 1至12集)
  const rangePattern = /(\d{1,3})\s*[-~至]\s*(\d{1,3})\s*集/g;
  for (const match of text.matchAll(rangePattern)) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && start <= end) {
      for (let ep = start; ep <= end; ep++) {
        hints.add(`S01E${String(ep).padStart(2, "0")}`);
      }
    }
  }

  // "第N-N集" range format (e.g., 第1-10集)
  const chineseRangePattern = /第\s*(\d{1,3})\s*[-~]\s*(\d{1,3})\s*集/g;
  for (const match of text.matchAll(chineseRangePattern)) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && start <= end) {
      for (let ep = start; ep <= end; ep++) {
        hints.add(`S01E${String(ep).padStart(2, "0")}`);
      }
    }
  }

  return Array.from(hints);
}

/** Coarse quality tokens parsed from a release title. */
export function extractQualityHints(text: string): string[] {
  const hints = new Set<string>();

  // Standard quality patterns (English with word boundaries)
  const standardPatterns = [
    /\b4K\b/i,
    /\b2160p\b/i,
    /\b1080p\b/i,
    /\b720p\b/i,
    /\bHDR\b/i,
    /\bDV\b/i,
    /\bDolby\s*Vision\b/i,
  ];

  // Additional English quality patterns with word boundaries
  const extendedEnglishPatterns = [
    /\bHDR\d*fps\b/i,     // HDR60fps, HDRfps
    /\bREMUX\b/i,         // REMUX
    /\bWEB-DL\b/i,        // WEB-DL
    /\bWEBRip\b/i,        // WEBRip
    /\bBluRay\b/i,        // BluRay
    /\bHDTV\b/i,          // HDTV
    /\bBlueRay\b/i,       // BlueRay (alternate spelling)
  ];

  // Chinese quality patterns (no word boundary - Chinese chars don't have \b)
  const chinesePatterns = [
    /臻彩(?:MAX)?/i,      // 臻彩, 臻彩MAX
    /蓝光/i,              // 蓝光 (Blu-ray)
  ];

  for (const pattern of standardPatterns) {
    const match = pattern.exec(text);
    if (match) {
      // Normalize HDRfps variants to just "HDR"
      if (pattern.source.includes("HDR")) {
        hints.add("HDR");
      } else {
        hints.add(match[0]);
      }
    }
  }

  for (const pattern of extendedEnglishPatterns) {
    const match = pattern.exec(text);
    if (match) {
      // Normalize HDRfps variants to just "HDR"
      if (pattern.source.includes("HDR")) {
        hints.add("HDR");
      } else {
        hints.add(match[0]);
      }
    }
  }

  for (const pattern of chinesePatterns) {
    const match = pattern.exec(text);
    if (match) {
      hints.add(match[0]);
    }
  }

  return Array.from(hints);
}

/**
 * Candidate title transparency classification.
 *
 * - "transparent": standard scene-release or well-structured naming that clearly
 *   states resolution, episodes, and/or release group
 *   (e.g., "The.Dark.Knight.2008.2160p.BluRay.FGT", "莫离 S01E01 1080p")
 * - "semi_transparent": non-standard format (often compliance-motivated long titles)
 *   that still contains extractable quality/episode info
 *   (e.g., "名称：莫离 4K臻彩MAX [HDR60fps][更新至36集]描述：...")
 * - "opaque": bare name or vague bundle with no useful metadata
 *   (e.g., "莫离", "【变形金刚系列】1~5部")
 */
export type CandidateTransparency = "transparent" | "semi_transparent" | "opaque";

export interface ClassifiedCandidate {
  transparency: CandidateTransparency;
  /** Core title extracted from a long/compliance-format title, or null. */
  coreTitle: string | null;
}

/** Pattern for standard scene-release naming: dotted ASCII + year + resolution + group. */
const SCENE_RELEASE_RE = /[A-Za-z][A-Za-z0-9.]+\.\d{4}\.\d{3,4}p\./;

/** Patterns that indicate useful extractable metadata in a title. */
const QUALITY_OR_EPISODE_RE =
  /\d{3,4}p|4K|全集|更新至|全\s*\d{1,3}\s*集|\d{1,3}\s*[-~至]\s*\d{1,3}\s*集|S\d{1,2}E\d{1,3}|第\s*\d{1,3}\s*集|HDR|REMUX|臻彩|蓝光|WEB-DL|BluRay/i;

/**
 * "名称：" prefix format used by compliance-motivated long titles from PanSou.
 * Captures the core title between "名称：" and the first quality/episode/description marker.
 * Example: "名称：莫离 4K臻彩MAX [HDR60fps][更新至36集]描述：..." → coreTitle="莫离"
 */
const COMPLIANCE_TITLE_RE = /名称[：:]\s*([^\[\]【】描述\n]+)/;

export function classifyCandidateTitle(title: string): ClassifiedCandidate {
  // 1. Compliance-format long titles: "名称：...描述：..."
  if (title.startsWith("名称：") || title.startsWith("名称:")) {
    const match = COMPLIANCE_TITLE_RE.exec(title);
    if (match && match[1]) {
      const corePart = match[1].trim();
      // Extract the first word as core title (before quality/episode markers)
      const words = corePart.split(/\s+/);
      const coreTitle = words.length > 0 && words[0] ? words[0] : null;
      return { transparency: "semi_transparent", coreTitle };
    }
    // Malformed compliance title with no extractable core → opaque
    return { transparency: "opaque", coreTitle: null };
  }

  // 2. Standard scene-release format (dotted naming with year + resolution)
  if (SCENE_RELEASE_RE.test(title)) {
    return { transparency: "transparent", coreTitle: null };
  }

  // 3. Title contains extractable quality/episode metadata
  if (QUALITY_OR_EPISODE_RE.test(title)) {
    return { transparency: "semi_transparent", coreTitle: null };
  }

  // 4. No useful metadata — opaque/black-box
  return { transparency: "opaque", coreTitle: null };
}

/** Sort key for candidate ordering by transparency: transparent first, opaque last. */
export const TRANSPARENCY_SORT_ORDER: Record<CandidateTransparency, number> = {
  transparent: 0,
  semi_transparent: 1,
  opaque: 2,
};
