import { describe, expect, it } from "vitest";
import { buildSearchStreamTerminalEvent } from "../src/lib/search/streamTerminalEvent";

describe("buildSearchStreamTerminalEvent", () => {
  it("returns a done event when the session was saved", () => {
    expect(buildSearchStreamTerminalEvent({ sessionId: 42 })).toEqual({
      type: "done",
      sessionId: 42,
    });
  });

  it("returns an explicit error event when persistence failed", () => {
    expect(buildSearchStreamTerminalEvent({ sessionId: 0 })).toEqual({
      type: "error",
      message: "Search finished, but the result could not be saved. Please try again.",
    });
  });
});
