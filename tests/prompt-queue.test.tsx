// @vitest-environment jsdom
/**
 * ────────────────────────────────────────────────────────────────────────────
 * ONE INTERRUPTION AT A TIME
 * ────────────────────────────────────────────────────────────────────────────
 * Four overlays competed for the bottom of the screen, each deciding for
 * itself and none aware of the others. The install banner and the update
 * banner both targeted `bottom-6 right-6`; the install banner and the
 * retargeting ad both waited exactly 2 seconds. So a first-time visitor on an
 * installable browser could meet an install prompt and a retargeting ad
 * landing on the same corner at the same moment, on top of an ad strip.
 *
 * The hand-tuned `bottom-[calc(9rem+…)]` offsets hid that as long as only one
 * was ever eligible, which is not a property anything enforced.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  PromptQueueProvider,
  usePromptSlot,
  type PromptId,
} from "@/components/providers/prompt-queue";

afterEach(cleanup);

/** A stand-in for a real prompt: renders only when it owns the slot. */
function Prompt({ id, wants }: { id: PromptId; wants: boolean }) {
  const hasSlot = usePromptSlot(id, wants);
  return hasSlot ? <div data-testid={id}>{id}</div> : null;
}

function renderPrompts(prompts: { id: PromptId; wants: boolean }[]) {
  return render(
    <PromptQueueProvider>
      {prompts.map((p) => (
        <Prompt key={p.id} id={p.id} wants={p.wants} />
      ))}
    </PromptQueueProvider>
  );
}

const shown = () => ["update", "install", "retargeting", "mobile-ad"].filter((id) => screen.queryByTestId(id));

describe("the prompt queue", () => {
  it("shows the only eligible prompt", () => {
    renderPrompts([
      { id: "install", wants: true },
      { id: "retargeting", wants: false },
    ]);
    expect(shown()).toEqual(["install"]);
  });

  it("shows nothing when nothing is eligible", () => {
    renderPrompts([
      { id: "install", wants: false },
      { id: "update", wants: false },
    ]);
    expect(shown()).toEqual([]);
  });

  it("never shows two at once, whatever wants in", () => {
    renderPrompts([
      { id: "update", wants: true },
      { id: "install", wants: true },
      { id: "retargeting", wants: true },
      { id: "mobile-ad", wants: true },
    ]);
    expect(shown()).toHaveLength(1);
  });

  it("puts a stale-code warning ahead of an offer, and an offer ahead of an ad", () => {
    // The order is an editorial judgement: running old code is a correctness
    // problem, installing is a useful offer, an ad is the thing that can wait.
    renderPrompts([
      { id: "update", wants: true },
      { id: "install", wants: true },
      { id: "retargeting", wants: true },
    ]);
    expect(shown()).toEqual(["update"]);

    cleanup();
    renderPrompts([
      { id: "install", wants: true },
      { id: "retargeting", wants: true },
      { id: "mobile-ad", wants: true },
    ]);
    expect(shown()).toEqual(["install"]);

    cleanup();
    renderPrompts([
      { id: "retargeting", wants: true },
      { id: "mobile-ad", wants: true },
    ]);
    expect(shown()).toEqual(["retargeting"]);
  });

  it("hands the slot on when the winner stops wanting it", () => {
    const { rerender } = render(
      <PromptQueueProvider>
        <Prompt id="update" wants />
        <Prompt id="install" wants />
      </PromptQueueProvider>
    );
    expect(shown()).toEqual(["update"]);

    // The reader dismisses the update banner.
    rerender(
      <PromptQueueProvider>
        <Prompt id="update" wants={false} />
        <Prompt id="install" wants />
      </PromptQueueProvider>
    );
    expect(shown(), "the next prompt takes the freed slot").toEqual(["install"]);
  });

  it("releases the slot when the winner unmounts", () => {
    const { rerender } = render(
      <PromptQueueProvider>
        <Prompt id="update" wants />
        <Prompt id="install" wants />
      </PromptQueueProvider>
    );
    expect(shown()).toEqual(["update"]);

    rerender(
      <PromptQueueProvider>
        <Prompt id="install" wants />
      </PromptQueueProvider>
    );
    expect(shown()).toEqual(["install"]);
  });

  it("stays quiet outside the provider rather than fighting for the corner", () => {
    render(<Prompt id="install" wants />);
    expect(screen.queryByTestId("install")).toBeNull();
  });
});
