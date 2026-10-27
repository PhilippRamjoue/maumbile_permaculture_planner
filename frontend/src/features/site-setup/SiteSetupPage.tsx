import { useEffect, useState } from "react";
import { Link, useBlocker } from "react-router-dom";

import { useCurrentUser } from "../auth";
import { CoordinatesStep } from "./CoordinatesStep";
import { CountryStep } from "./CountryStep";
import { useSetupStore } from "./store";
import { clearSetupDraft, persistSetupDraft, restoreSetupDraft } from "./draftRecovery";
import { ModalDialog } from "../../shared/ui/ModalDialog";

/** `/sites/new`: pick the country, outline the land, create the site and open its map. */
export function SiteSetupPage() {
  const { data: user } = useCurrentUser();
  const step = useSetupStore((s) => s.step);
  const countryCode = useSetupStore((s) => s.countryCode);
  const [recovered, setRecovered] = useState(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const draft = useSetupStore.getState();
    return (
      currentLocation.pathname !== nextLocation.pathname && (!!draft.name || draft.rows.length > 0)
    );
  });

  // A fresh draft each visit; start from the user's own country when they have one.
  useEffect(() => {
    useSetupStore.getState().reset({ countryCode: user?.country_code?.toUpperCase() ?? null });
    if (user) setRecovered(restoreSetupDraft(user.id));
    const unsubscribe = useSetupStore.subscribe(() => {
      if (user) persistSetupDraft(user.id);
    });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const draft = useSetupStore.getState();
      if (draft.rows.length || draft.name) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", beforeUnload);
      useSetupStore.getState().reset();
    };
    // Only on mount/unmount: later user refetches must not wipe the draft.
  }, []);

  return (
    <section className="setup">
      <header className="setup__header">
        <Link to="/">← My sites</Link>
        <h1>New site</h1>
      </header>
      {recovered && (
        <div className="notice" role="status">
          Your unfinished site was recovered in this tab.
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (user) clearSetupDraft(user.id);
              useSetupStore.getState().reset();
              setRecovered(false);
            }}
          >
            Start over
          </button>
        </div>
      )}
      {blocker.state === "blocked" && (
        <ModalDialog label="Unfinished site" onCancel={() => blocker.reset()}>
          <p>Your site is unfinished. Its draft will stay in this tab until you sign out.</p>
          <button className="btn" onClick={() => blocker.reset()}>
            Keep editing
          </button>
          <button className="btn" onClick={() => blocker.proceed()}>
            Leave and keep draft
          </button>
        </ModalDialog>
      )}
      {step === "country" ? (
        <CountryStep
          countryCode={countryCode}
          onCountryChange={(code) => useSetupStore.getState().setCountry(code)}
          onContinue={() => useSetupStore.getState().setStep("coordinates")}
        />
      ) : (
        <CoordinatesStep />
      )}
    </section>
  );
}
