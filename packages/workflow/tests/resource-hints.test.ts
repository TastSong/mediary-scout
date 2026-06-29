import { describe, expect, it } from "vitest";
import {
  extractEpisodeHints,
  extractQualityHints,
  classifyCandidateTitle,
  TRANSPARENCY_SORT_ORDER,
  type CandidateTransparency,
} from "../src/resource-hints.js";

describe("extractEpisodeHints", () => {
  describe("standard SxxEyy format", () => {
    it("extracts S01E01 from 'Show S01E01'", () => {
      expect(extractEpisodeHints("Show S01E01")).toEqual(["S01E01"]);
    });

    it("extracts one episode from 'Show S01E01' (concatenated E codes not supported)", () => {
      // Note: S01E01E02E03 format only extracts S01E01 due to regex limitation
      expect(extractEpisodeHints("Show S01E01E02E03")).toEqual(["S01E01"]);
    });

    it("handles lowercase format 'show s01e01'", () => {
      expect(extractEpisodeHints("show s01e01")).toEqual(["S01E01"]);
    });
  });

  describe("Chinese 第N集 format", () => {
    it("extracts S01E01 from '第1集'", () => {
      expect(extractEpisodeHints("莫离 第1集")).toEqual(["S01E01"]);
    });

    it("handles spaces '第 2 集'", () => {
      expect(extractEpisodeHints("莫离 第 2 集")).toEqual(["S01E02"]);
    });

    it("extracts multiple from '第1集 第2集'", () => {
      expect(extractEpisodeHints("莫离 第1集 第2集")).toEqual(["S01E01", "S01E02"]);
    });
  });

  describe("更新至N集 format (new)", () => {
    it("generates all episodes up to 36 from '更新至36集'", () => {
      const hints = extractEpisodeHints("莫离 更新至36集");
      expect(hints).toContain("S01E01");
      expect(hints).toContain("S01E36");
      expect(hints.length).toBe(36);
    });

    it("handles spaces '更新至 12 集'", () => {
      const hints = extractEpisodeHints("Show 更新至 12 集");
      expect(hints.length).toBe(12);
      expect(hints).toContain("S01E12");
    });
  });

  describe("全N集 format (new)", () => {
    it("generates all 24 episodes from '全24集'", () => {
      const hints = extractEpisodeHints("莫离 全24集");
      expect(hints.length).toBe(24);
      expect(hints).toContain("S01E01");
      expect(hints).toContain("S01E24");
    });
  });

  describe("range format N-N集 (new)", () => {
    it("generates episodes 1-10 from '1-10集'", () => {
      const hints = extractEpisodeHints("莫离 1-10集");
      expect(hints.length).toBe(10);
      expect(hints).toContain("S01E01");
      expect(hints).toContain("S01E10");
    });

    it("handles '1至12集' format", () => {
      const hints = extractEpisodeHints("Show 1至12集");
      expect(hints.length).toBe(12);
    });

    it("handles '第1-10集' format", () => {
      const hints = extractEpisodeHints("莫离 第1-10集");
      expect(hints.length).toBe(10);
    });

    it("handles tilde separator '1~24集'", () => {
      const hints = extractEpisodeHints("Show 1~24集");
      expect(hints.length).toBe(24);
    });
  });

  describe("combined formats", () => {
    it("extracts from compliance long title", () => {
      const title = "名称：莫离 4K臻彩MAX [HDR60fps][更新至36集]描述：剧情简介...";
      const hints = extractEpisodeHints(title);
      expect(hints.length).toBe(36);
      expect(hints).toContain("S01E36");
    });
  });
});

describe("extractQualityHints", () => {
  describe("standard quality patterns", () => {
    it("extracts 4K", () => {
      expect(extractQualityHints("Show 4K")).toEqual(["4K"]);
    });

    it("extracts 1080p", () => {
      expect(extractQualityHints("Show 1080p")).toEqual(["1080p"]);
    });

    it("extracts HDR", () => {
      expect(extractQualityHints("Show HDR")).toEqual(["HDR"]);
    });

    it("extracts DV (Dolby Vision)", () => {
      expect(extractQualityHints("Show DV")).toEqual(["DV"]);
    });
  });

  describe("extended quality patterns (new)", () => {
    it("extracts HDR from HDR60fps (normalized)", () => {
      expect(extractQualityHints("Show HDR60fps")).toEqual(["HDR"]);
    });

    it("extracts 臻彩", () => {
      expect(extractQualityHints("莫离 臻彩")).toEqual(["臻彩"]);
    });

    it("extracts 臻彩MAX", () => {
      expect(extractQualityHints("莫离 臻彩MAX")).toEqual(["臻彩MAX"]);
    });

    it("extracts REMUX", () => {
      expect(extractQualityHints("Show REMUX")).toEqual(["REMUX"]);
    });

    it("extracts 蓝光", () => {
      expect(extractQualityHints("莫离 蓝光")).toEqual(["蓝光"]);
    });

    it("extracts WEB-DL", () => {
      expect(extractQualityHints("Show WEB-DL")).toEqual(["WEB-DL"]);
    });

    it("extracts BluRay", () => {
      expect(extractQualityHints("Show BluRay")).toEqual(["BluRay"]);
    });
  });

  describe("multiple quality tags", () => {
    it("extracts multiple quality tags", () => {
      const hints = extractQualityHints("莫离 4K HDR 臻彩MAX");
      expect(hints).toEqual(expect.arrayContaining(["4K", "HDR", "臻彩MAX"]));
    });

    it("extracts from compliance long title", () => {
      const title = "名称：莫离 4K臻彩MAX [HDR60fps][更新至36集]描述：...";
      const hints = extractQualityHints(title);
      expect(hints).toEqual(expect.arrayContaining(["4K", "臻彩MAX", "HDR"]));
    });
  });
});

describe("classifyCandidateTitle", () => {
  describe("compliance-format long titles (semi_transparent)", () => {
    it("classifies '名称：...' format as semi_transparent", () => {
      const title = "名称：莫离 4K臻彩MAX [HDR60fps][更新至36集]描述：叶府的长女叶璃...";
      const result = classifyCandidateTitle(title);
      expect(result.transparency).toBe("semi_transparent");
      expect(result.coreTitle).toBe("莫离");
    });

    it("extracts core title from compliance format", () => {
      const title = "名称：The.Dark.Knight 4K [全集]描述：...";
      const result = classifyCandidateTitle(title);
      expect(result.transparency).toBe("semi_transparent");
      expect(result.coreTitle).toBe("The.Dark.Knight");
    });

    it("handles '名称:' (colon variant)", () => {
      const title = "名称:莫离 1080p 描述：...";
      const result = classifyCandidateTitle(title);
      expect(result.transparency).toBe("semi_transparent");
      expect(result.coreTitle).toBe("莫离");
    });
  });

  describe("scene-release format (transparent)", () => {
    it("classifies standard scene release as transparent", () => {
      const title = "The.Dark.Knight.2008.2160p.BluRay.FGT";
      const result = classifyCandidateTitle(title);
      expect(result.transparency).toBe("transparent");
      expect(result.coreTitle).toBeNull();
    });

    it("classifies 'Show.Name.2024.1080p.WEB-DL.Group' as transparent", () => {
      const title = "Oppenheimer.2023.1080p.WEB-DL.NTb";
      const result = classifyCandidateTitle(title);
      expect(result.transparency).toBe("transparent");
    });
  });

  describe("non-standard with metadata (semi_transparent)", () => {
    it("classifies '莫离 4K 更新至36集' as semi_transparent", () => {
      const result = classifyCandidateTitle("莫离 4K 更新至36集");
      expect(result.transparency).toBe("semi_transparent");
      expect(result.coreTitle).toBeNull();
    });

    it("classifies 'Show 1080p S01E01' as semi_transparent", () => {
      const result = classifyCandidateTitle("Show 1080p S01E01");
      expect(result.transparency).toBe("semi_transparent");
    });

    it("classifies '莫离 全24集' as semi_transparent", () => {
      const result = classifyCandidateTitle("莫离 全24集");
      expect(result.transparency).toBe("semi_transparent");
    });

    it("classifies 'Show 1-12集' as semi_transparent", () => {
      const result = classifyCandidateTitle("Show 1-12集");
      expect(result.transparency).toBe("semi_transparent");
    });
  });

  describe("bare name / no metadata (opaque)", () => {
    it("classifies bare name '莫离' as opaque", () => {
      const result = classifyCandidateTitle("莫离");
      expect(result.transparency).toBe("opaque");
      expect(result.coreTitle).toBeNull();
    });

    it("classifies vague bundle '【变形金刚系列】1~5部' as opaque", () => {
      const result = classifyCandidateTitle("【变形金刚系列】1~5部");
      expect(result.transparency).toBe("opaque");
    });

    it("classifies '名称：' with no extractable core as opaque", () => {
      const result = classifyCandidateTitle("名称：");
      expect(result.transparency).toBe("opaque");
    });
  });
});

describe("TRANSPARENCY_SORT_ORDER", () => {
  it("orders transparent first", () => {
    expect(TRANSPARENCY_SORT_ORDER["transparent"]).toBe(0);
  });

  it("orders semi_transparent as fallback", () => {
    expect(TRANSPARENCY_SORT_ORDER["semi_transparent"]).toBe(1);
  });

  it("orders opaque last", () => {
    expect(TRANSPARENCY_SORT_ORDER["opaque"]).toBe(2);
  });

  it("preserves ordering invariant", () => {
    expect(TRANSPARENCY_SORT_ORDER["transparent"]).toBeLessThan(TRANSPARENCY_SORT_ORDER["semi_transparent"]);
    expect(TRANSPARENCY_SORT_ORDER["semi_transparent"]).toBeLessThan(TRANSPARENCY_SORT_ORDER["opaque"]);
  });
});