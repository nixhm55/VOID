/**
 * Unified Multi-Provider Music Search Orchestrator for VOID Music Player.
 *
 * Queries all configured and supported music providers concurrently using `Promise.allSettled()`:
 * 1. JioSaavn (`searchJioSaavn`) — locked at #1 top priority
 * 2. All other providers (`searchYouTube`, `searchJamendo`, `searchThirdPartyLossless`,
 *    `searchInternetArchive`, `searchRadioBrowser`) — ordered by song title relevance to the query.
 */

import { searchJioSaavn } from "./musicApi";
import { searchInternetArchive } from "./internetArchiveApi";
import { searchJamendo } from "./jamendoApi";
import { searchRadioBrowser } from "./radioBrowserApi";
import { searchThirdPartyLossless } from "./losslessGatewayApi";
import { searchYouTube } from "./youtubeApi";
import {
  type SearchResult,
  deduplicateAndSortSearchResults,
} from "./quality";

export interface ProviderSearchOutcome {
  provider: string;
  status: "fulfilled" | "rejected";
  count: number;
  error?: string;
}

export interface UnifiedSearchOptions {
  signal?: AbortSignal;
  /**
   * Optional callback invoked as individual providers resolve so fast providers
   * can render immediately while slower providers finish in the background.
   */
  onPartialResults?: (mergedSoFar: SearchResult[]) => void;
}

interface ProviderDescriptor {
  name: string;
  run: (query: string, signal?: AbortSignal) => Promise<SearchResult[]>;
}

export const PROVIDERS: readonly ProviderDescriptor[] = [
  { name: "JioSaavn", run: searchJioSaavn },
  { name: "YouTube", run: searchYouTube },
  { name: "Third-Party Lossless Gateway", run: searchThirdPartyLossless },
  { name: "Jamendo", run: searchJamendo },
  { name: "Internet Archive", run: searchInternetArchive },
  { name: "Radio Browser", run: searchRadioBrowser },
];

/**
 * Executes concurrent searches across all configured providers using `Promise.allSettled()`,
 * normalizes and deduplicates results, and orders them with JioSaavn locked at #1 and all
 * remaining providers sorted by song title relevance to `query`.
 */
export async function searchAllProviders(
  query: string,
  options?: UnifiedSearchOptions
): Promise<{ results: SearchResult[]; outcomes: ProviderSearchOutcome[] }> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return { results: [], outcomes: [] };
  }

  const signal = options?.signal;
  const accumulated: SearchResult[] = [];

  const tasks = PROVIDERS.map(async (provider) => {
    const items = await provider.run(cleanQuery, signal);
    if (!signal?.aborted && Array.isArray(items) && items.length > 0) {
      accumulated.push(...items);
      if (options?.onPartialResults) {
        options.onPartialResults(deduplicateAndSortSearchResults(accumulated, cleanQuery));
      }
    }
    return { provider: provider.name, items };
  });

  const settled = await Promise.allSettled(tasks);

  const outcomes: ProviderSearchOutcome[] = settled.map((entry, idx) => {
    const providerName = PROVIDERS[idx].name;
    if (entry.status === "fulfilled") {
      return {
        provider: providerName,
        status: "fulfilled",
        count: entry.value.items.length,
      };
    }
    return {
      provider: providerName,
      status: "rejected",
      count: 0,
      error: entry.reason instanceof Error ? entry.reason.message : String(entry.reason),
    };
  });

  if (signal?.aborted) {
    return { results: [], outcomes };
  }

  const finalResults = deduplicateAndSortSearchResults(accumulated, cleanQuery);
  return { results: finalResults, outcomes };
}
