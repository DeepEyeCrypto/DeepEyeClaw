/**
 * DeepEyeClaw — Perplexity Provider Tests
 */

import { describe, it, expect } from "vitest";
import {
  buildPerplexityProvider,
  buildPerplexityExtraParams,
  selectPerplexityModel,
  suggestRecencyFilter,
  formatCitations,
  PERPLEXITY_BASE_URL,
  PERPLEXITY_MODELS,
} from "./perplexity-provider.js";

describe("buildPerplexityProvider", () => {
  it("returns valid provider config", () => {
    const provider = buildPerplexityProvider();
    expect(provider.baseUrl).toBe(PERPLEXITY_BASE_URL);
    expect(provider.api).toBe("openai-completions");
    expect(provider.models.length).toBe(3);
  });

  it("includes all Perplexity models", () => {
    const provider = buildPerplexityProvider();
    const ids = provider.models.map((m) => m.id);
    expect(ids).toContain("sonar");
    expect(ids).toContain("sonar-pro");
    expect(ids).toContain("sonar-reasoning-pro");
  });

  it("marks sonar-reasoning-pro as a reasoning model", () => {
    const provider = buildPerplexityProvider();
    const reasoning = provider.models.find((m) => m.id === "sonar-reasoning-pro");
    expect(reasoning?.reasoning).toBe(true);
  });

  it("marks sonar-pro as supporting images", () => {
    const provider = buildPerplexityProvider();
    const pro = provider.models.find((m) => m.id === "sonar-pro");
    expect(pro?.input).toContain("image");
  });

  it("has correct context windows", () => {
    const provider = buildPerplexityProvider();
    const sonar = provider.models.find((m) => m.id === "sonar");
    const pro = provider.models.find((m) => m.id === "sonar-pro");
    expect(sonar?.contextWindow).toBe(128000);
    expect(pro?.contextWindow).toBe(200000);
  });
});

describe("buildPerplexityExtraParams", () => {
  it("enables citations by default", () => {
    const params = buildPerplexityExtraParams("sonar");
    expect(params.return_citations).toBe(true);
  });

  it("adds recency filter when specified", () => {
    const params = buildPerplexityExtraParams("sonar", {
      search_recency_filter: "day",
    });
    expect(params.search_recency_filter).toBe("day");
  });

  it("adds domain filter when specified", () => {
    const params = buildPerplexityExtraParams("sonar", {
      search_domain_filter: ["example.com"],
    });
    expect(params.search_domain_filter).toEqual(["example.com"]);
  });

  it("supports images only for sonar-pro", () => {
    const proParams = buildPerplexityExtraParams("sonar-pro", { return_images: true });
    expect(proParams.return_images).toBe(true);

    const sonarParams = buildPerplexityExtraParams("sonar", { return_images: true });
    expect(sonarParams.return_images).toBeUndefined();
  });
});

describe("selectPerplexityModel", () => {
  it("selects sonar for simple real-time", () => {
    const model = selectPerplexityModel({
      isRealtime: true,
      needsReasoning: false,
      needsDeepSearch: false,
    });
    expect(model).toBe("sonar");
  });

  it("selects sonar-pro for deep search", () => {
    const model = selectPerplexityModel({
      isRealtime: true,
      needsReasoning: false,
      needsDeepSearch: true,
    });
    expect(model).toBe("sonar-pro");
  });

  it("selects sonar-reasoning-pro for reasoning", () => {
    const model = selectPerplexityModel({
      isRealtime: false,
      needsReasoning: true,
      needsDeepSearch: false,
    });
    expect(model).toBe("sonar-reasoning-pro");
  });

  it("prioritizes reasoning over deep search", () => {
    const model = selectPerplexityModel({
      isRealtime: true,
      needsReasoning: true,
      needsDeepSearch: true,
    });
    expect(model).toBe("sonar-reasoning-pro");
  });
});

describe("suggestRecencyFilter", () => {
  it("returns 'hour' for breaking news", () => {
    expect(suggestRecencyFilter(true, "breaking news about earthquake")).toBe("hour");
    expect(suggestRecencyFilter(true, "live score of the match")).toBe("hour");
  });

  it("returns 'day' for today queries", () => {
    expect(suggestRecencyFilter(true, "What happened today")).toBe("day");
  });

  it("returns 'week' for this week queries", () => {
    expect(suggestRecencyFilter(true, "most recent developments this week")).toBe("week");
  });

  it("returns undefined for non-real-time", () => {
    expect(suggestRecencyFilter(false, "What is quantum computing?")).toBeUndefined();
  });
});

describe("formatCitations", () => {
  it("formats string citations", () => {
    const result = formatCitations(["https://example.com", "https://test.com"]);
    expect(result).toContain("[1] https://example.com");
    expect(result).toContain("[2] https://test.com");
    expect(result).toContain("📚 Sources:");
  });

  it("formats object citations", () => {
    const result = formatCitations([{ url: "https://example.com", text: "Example" }]);
    expect(result).toContain("https://example.com");
  });

  it("returns empty string for no citations", () => {
    expect(formatCitations(undefined)).toBe("");
    expect(formatCitations([])).toBe("");
  });
});
