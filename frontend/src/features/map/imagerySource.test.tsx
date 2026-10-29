import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ImageryProviders } from "../../entities/imagery";
import { imageryMeta, site } from "../../shared/testing/fixtures";
import { mockApi, requestedRoutes } from "../../shared/testing/mockApi";
import { effectiveProvider, useImageryChoice } from "./imageryChoice";
import { useImageryMeta, useImageryProviders } from "./imageryMeta";
import { imageryLayer } from "./layers/imageryLayer";

const providers: ImageryProviders = {
  default_key: "esri_world_imagery",
  providers: [
    {
      key: "esri_world_imagery",
      label: "Esri World Imagery (sharpest)",
      attribution: "Source: Esri",
      max_zoom: 19,
    },
    {
      key: "sentinel2_cloudless",
      label: "Sentinel-2 cloudless (10 m, 2016)",
      attribution: "Sentinel-2 cloudless",
      max_zoom: 13,
    },
  ],
};

describe("effectiveProvider", () => {
  it("asks for nothing unless something other than the default was chosen", () => {
    expect(effectiveProvider(null, providers)).toBeNull();
    expect(effectiveProvider("esri_world_imagery", providers)).toBeNull();
    expect(effectiveProvider("sentinel2_cloudless", providers)).toBe("sentinel2_cloudless");
  });

  it("drops a remembered source that no longer covers the site", () => {
    expect(effectiveProvider("a_source_for_somewhere_else", providers)).toBeNull();
  });

  it("trusts the remembered choice until the list of sources has arrived", () => {
    expect(effectiveProvider("sentinel2_cloudless", undefined)).toBe("sentinel2_cloudless");
  });
});

describe("useImageryChoice", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("remembers the choice per site, and forgets it when put back to the default", () => {
    const first = renderHook(() => useImageryChoice("site-1"));
    expect(first.result.current[0]).toBeNull();

    act(() => first.result.current[1]("sentinel2_cloudless"));
    expect(first.result.current[0]).toBe("sentinel2_cloudless");

    // A new visit to the same site starts from it; another site is not affected.
    expect(renderHook(() => useImageryChoice("site-1")).result.current[0]).toBe(
      "sentinel2_cloudless",
    );
    expect(renderHook(() => useImageryChoice("site-2")).result.current[0]).toBeNull();

    act(() => first.result.current[1](null));
    expect(first.result.current[0]).toBeNull();
    expect(renderHook(() => useImageryChoice("site-1")).result.current[0]).toBeNull();
  });

  it("still works for this visit when the browser will not store anything", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useImageryChoice("site-1"));
    expect(result.current[0]).toBeNull();
    act(() => result.current[1]("sentinel2_cloudless"));
    expect(result.current[0]).toBe("sentinel2_cloudless");
  });
});

describe("imagery queries", () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );

  it("asks the backend which sources cover the site", async () => {
    mockApi({ [`GET /sites/${site.id}/imagery/providers`]: { json: providers } });
    const { result } = renderHook(() => useImageryProviders(site.id), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(providers));
  });

  it("fetches the meta of the chosen source, and refetches when the choice changes", async () => {
    const chosen = {
      ...imageryMeta,
      provider_key: "sentinel2_cloudless",
      attribution: "Sentinel-2 cloudless",
      max_zoom: 13,
    };
    const fetchMock = mockApi({
      [`GET /sites/${site.id}/imagery/meta`]: (request) => ({
        json: request.query.get("provider") === "sentinel2_cloudless" ? chosen : imageryMeta,
      }),
    });
    const { result, rerender } = renderHook(
      ({ provider }: { provider: string | null }) => useImageryMeta(site.id, provider),
      { wrapper, initialProps: { provider: null as string | null } },
    );
    await waitFor(() => expect(result.current.data?.provider_key).toBe(imageryMeta.provider_key));
    expect(String(fetchMock.mock.calls[0]![0])).not.toContain("provider=");

    rerender({ provider: "sentinel2_cloudless" });
    // The old answer stays up while the new one loads: no flash of the default imagery.
    expect(result.current.data?.provider_key).toBe(imageryMeta.provider_key);
    await waitFor(() => expect(result.current.data?.provider_key).toBe("sentinel2_cloudless"));
    expect(String(fetchMock.mock.calls.at(-1)![0])).toContain("?provider=sentinel2_cloudless");
    expect(requestedRoutes(fetchMock)).toHaveLength(2);
  });
});

describe("imagery layer with a chosen source", () => {
  it("keeps the source in the tile URL, with the placeholders unescaped", () => {
    const spec = imageryLayer.build({
      site,
      imagery: {
        ...imageryMeta,
        provider_key: "sentinel2_cloudless",
        max_zoom: 13,
        tile_url_template: `/api/v1/sites/${site.id}/imagery/{z}/{x}/{y}.png?provider=sentinel2_cloudless`,
      },
    })!;
    expect((spec.sources.imagery as { tiles: string[] }).tiles).toEqual([
      `http://localhost:3000/api/v1/sites/${site.id}/imagery/{z}/{x}/{y}.png?provider=sentinel2_cloudless`,
    ]);
    expect(spec.sources.imagery).toMatchObject({ maxzoom: 13 });
  });
});
