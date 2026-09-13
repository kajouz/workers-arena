// @vitest-environment jsdom
/**
 * useVoiceSearch must subscribe to the SpeechRecognition API ONCE per mount.
 *
 * Both call sites pass an inline arrow, so the callback identity changes on
 * every render. With the callback in the effect's dependency list the hook
 * re-subscribed — and re-called `setSupported(true)` — on each render, which
 * queued another render: React threw "Maximum update depth exceeded" as soon as
 * a search re-render landed (toggling the fee-waived filter did it) and the
 * page stopped responding. The subscription must therefore be independent of
 * the callback's identity, while the callback itself stays CURRENT (a stale
 * closure would search for the previous query).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import { useVoiceSearch } from "@/hooks/use-voice-search";

type ResultEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };

/** A stand-in SpeechRecognition that records construction + language. */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  static transcripts: ResultEvent = { results: [[{ transcript: "سباك" }]] };
  lang = "";
  interimResults = true;
  maxAlternatives = 0;
  continuous = true;
  started = 0;
  stopped = 0;
  onresult: ((event: ResultEvent) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.started += 1;
  }
  stop() {
    this.stopped += 1;
  }
  /** Deliver a result as the browser would. */
  emit(): void {
    this.onresult?.(FakeRecognition.transcripts);
  }
}

function Harness({ onResult, ticks = 3 }: { onResult: (t: string) => void; ticks?: number }) {
  const { supported, listening, toggle } = useVoiceSearch(onResult);
  // Force the re-renders that used to drive the loop: an unstable callback
  // identity plus a state update per render.
  useEffect(() => {
    for (let i = 0; i < ticks; i++) void Promise.resolve();
  });
  return (
    <div>
      <span data-testid="supported">{String(supported)}</span>
      <span data-testid="listening">{String(listening)}</span>
      <button onClick={toggle}>toggle</button>
    </div>
  );
}

describe("useVoiceSearch", () => {
  beforeEach(() => {
    FakeRecognition.instances = [];
    (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  });

  it("subscribes once per mount, even when the callback changes every render", () => {
    const { rerender } = render(<Harness onResult={() => {}} />);
    for (let i = 0; i < 5; i++) rerender(<Harness onResult={() => {}} />);
    expect(
      FakeRecognition.instances.length,
      "re-subscribing per render is what looped the page"
    ).toBe(1);
  });

  it("reports support and uses the tenant's Arabic speech locale", () => {
    const { getByTestId } = render(<Harness onResult={() => {}} />);
    expect(getByTestId("supported").textContent).toBe("true");
    expect(FakeRecognition.instances[0]!.lang).toMatch(/^ar/);
  });

  it("calls the LATEST callback, not the one captured at mount", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Harness onResult={first} />);
    rerender(<Harness onResult={second} />);
    act(() => FakeRecognition.instances[0]!.emit());
    expect(second).toHaveBeenCalledWith("سباك");
    expect(first).not.toHaveBeenCalled();
  });

  it("is inert when the browser has no SpeechRecognition", () => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    const { getByTestId, getByText } = render(<Harness onResult={() => {}} />);
    expect(getByTestId("supported").textContent).toBe("false");
    act(() => getByText("toggle").click());
    expect(getByTestId("listening").textContent).toBe("false");
  });
});
