import { useEffect } from "react";
import { Link } from "react-router-dom";

import { useCurrentUser } from "../auth";
import { CoordinatesStep } from "./CoordinatesStep";
import { CountryStep } from "./CountryStep";
import { useSetupStore } from "./store";

/** `/sites/new`: pick the country, outline the land, create the site and open its map. */
export function SiteSetupPage() {
  const { data: user } = useCurrentUser();
  const step = useSetupStore((s) => s.step);
  const countryCode = useSetupStore((s) => s.countryCode);

  // A fresh draft each visit; start from the user's own country when they have one.
  useEffect(() => {
    useSetupStore.getState().reset({ countryCode: user?.country_code?.toUpperCase() ?? null });
    return () => useSetupStore.getState().reset();
    // Only on mount/unmount: later user refetches must not wipe the draft.
  }, []);

  return (
    <section className="setup">
      <header className="setup__header">
        <Link to="/">← My sites</Link>
        <h1>New site</h1>
      </header>
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
