import type { ReactNode } from "react";

export const REPOSITORY_URL = "https://github.com/PhilippRamjoue/maumbile_permaculture_planner";

export interface LegalSection {
  heading: string;
  body: ReactNode;
}

/** A short, readable legal text: a title, the date it was last changed and titled sections. */
export function LegalPage({
  title,
  updated,
  sections,
}: {
  title: string;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <article className="legal">
      <h1>{title}</h1>
      <p className="muted">Last updated: {updated}</p>
      {sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.body}
        </section>
      ))}
    </article>
  );
}
