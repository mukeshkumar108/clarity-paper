import type { SearchProgressEvent, SearchResult } from "./types";

export function buildSearchStreamTerminalEvent(
  result: Pick<SearchResult, "sessionId">,
): SearchProgressEvent {
  return result.sessionId > 0
    ? { type: "done", sessionId: result.sessionId }
    : { type: "error", message: "Search finished, but the result could not be saved. Please try again." };
}
