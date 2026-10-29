import { useState } from "react";
import type { PlanDetail } from "../../entities/planning";
import type { Site } from "../../entities/site";
import { ModalDialog } from "../../shared/ui/ModalDialog";
import { saveBlob } from "../export/api";
import { draftCoordinates, type BoundaryDraftStore } from "./focus/boundaryDraft";
import type { EditorStore } from "./store";
import type { useEditorPersistence } from "./useEditorPersistence";
import { errorMessage as message } from "./messages";

export function EditorSaveFeedback({
  site,
  plan,
  store,
  draft,
  persistence,
}: {
  site: Site;
  plan: PlanDetail;
  store: EditorStore;
  draft: BoundaryDraftStore;
  persistence: ReturnType<typeof useEditorPersistence>;
}) {
  const { save, goals, boundaryDirty, boundaryValid, saveBoundary, blocker, flush } = persistence;
  const [leaveError, setLeaveError] = useState<string | null>(null);
  return (
    <>
      {save.isError &&
        (/self-intersection|invalid polygon/i.test(message(save.error)) ? (
          <p role="alert">
            A shape crosses itself, so it can’t be saved. Drag the stray corner back onto the
            others, or press Ctrl+Z (⌘Z) to undo the last change. Your draft is still here.
          </p>
        ) : (
          <p role="alert">
            Could not save: {message(save.error)} Your draft is still here. Retry saving.
          </p>
        ))}
      {goals.failed && (
        <p role="alert">
          Could not save your goals: {message(goals.error)} They are still here. Retry saving.
        </p>
      )}
      {boundaryDirty && !boundaryValid && (
        <p role="alert">
          Your border has unsaved, invalid changes. Return to Boundary to fix or discard them.
        </p>
      )}
      {saveBoundary.isError && boundaryDirty && (
        <p role="alert">
          Could not save the border: {message(saveBoundary.error)}. Your draft is still here.
        </p>
      )}
      {(save.isError || goals.failed || saveBoundary.isError) && (
        <div className="editor-tools">
          <button
            type="button"
            className="btn"
            onClick={() =>
              saveBlob(
                new Blob(
                  [
                    JSON.stringify(
                      {
                        version: 1,
                        plan: { ...plan, goals: goals.goals },
                        site: {
                          ...site,
                          boundary: {
                            type: "Polygon",
                            coordinates: [draftCoordinates(draft.getState().vertices)],
                          },
                        },
                        ...store.getState().document,
                      },
                      null,
                      2,
                    ),
                  ],
                  { type: "application/json" },
                ),
                "maumbile-unsaved-draft.json",
              )
            }
          >
            Download unsaved draft
          </button>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Reload saved design
          </button>
        </div>
      )}
      {blocker.state === "blocked" && (
        <ModalDialog
          label="Unsaved design"
          onCancel={() => {
            if (!save.isPending && !saveBoundary.isPending && !goals.saving) blocker.reset();
          }}
        >
          <p>You have unsaved changes. Leave this design?</p>
          <button
            className="btn"
            disabled={save.isPending || saveBoundary.isPending || goals.saving}
            onClick={() => blocker.reset()}
          >
            Keep editing
          </button>
          <button
            className="btn"
            disabled={
              save.isPending ||
              saveBoundary.isPending ||
              goals.saving ||
              (boundaryDirty && !boundaryValid)
            }
            onClick={() => {
              void flush()
                .then(() => blocker.proceed())
                .catch((error: unknown) => setLeaveError(message(error)));
            }}
          >
            Save and leave
          </button>
          {leaveError && <p role="alert">{leaveError}</p>}
          <button
            className="btn"
            disabled={save.isPending || saveBoundary.isPending || goals.saving}
            onClick={() => blocker.proceed()}
          >
            Discard changes and leave
          </button>
        </ModalDialog>
      )}
    </>
  );
}
