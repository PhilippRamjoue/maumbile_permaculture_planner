import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { mockApi, problem } from "../../shared/testing/mockApi";
import { renderApp } from "../../shared/testing/renderApp";

const anonymous = {
  "GET /auth/me": problem(401, "Not authenticated"),
  "POST /auth/refresh": problem(401, "expired"),
};

it("shows unavailable recovery honestly rather than promising an email", async () => {
  mockApi({ ...anonymous, "GET /auth/recovery/status": { json: { enabled: false } } });
  renderApp("/forgot-password");
  expect(await screen.findByText(/Email recovery is not configured/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Email a reset link" })).not.toBeInTheDocument();
});

it("submits an email and displays the generic acknowledgement", async () => {
  mockApi({
    ...anonymous,
    "GET /auth/recovery/status": { json: { enabled: true } },
    "POST /auth/password-reset": {
      status: 202,
      json: { message: "If an active account uses that email, a reset link will be sent." },
    },
  });
  renderApp("/forgot-password");
  await userEvent.type(await screen.findByLabelText("Email"), "person@example.org");
  await userEvent.click(await screen.findByRole("button", { name: "Email a reset link" }));
  expect(await screen.findByText(/If an active account uses/)).toBeVisible();
});
