import { Link, type RouteObject } from "react-router-dom";

import { CreditsPage } from "../features/credits";
import { LoginPage, RegisterPage } from "../features/auth";
import { SitesDashboardPage } from "../features/sites-dashboard";
import { AppLayout } from "./AppLayout";
import { GuestOnly, RequireAuth } from "./guards";

/**
 * The route tree. Later packages add their routes here (editor WP9).
 * The map page is code-split: MapLibre is large and only needed once a site is opened.
 */
export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { path: "credits", element: <CreditsPage /> },
      {
        element: <GuestOnly />,
        children: [
          { path: "login", element: <LoginPage /> },
          { path: "register", element: <RegisterPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          { index: true, element: <SitesDashboardPage /> },
          {
            path: "sites/new",
            lazy: async () => ({
              Component: (await import("../features/site-setup/SiteSetupPage")).SiteSetupPage,
            }),
          },
          {
            path: "sites/:siteId",
            lazy: async () => ({
              Component: (await import("../features/map/SiteMapPage")).SiteMapPage,
            }),
          },
          { path: "sites/:siteId/credits", element: <CreditsPage /> },
        ],
      },
      { path: "*", element: <NotFound /> },
    ],
  },
];

function NotFound() {
  return (
    <section>
      <h1>Page not found</h1>
      <Link to="/">Back to the start</Link>
    </section>
  );
}
