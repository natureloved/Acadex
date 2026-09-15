"use server";

/**
 * Subscription actions.
 *
 * Same shape as the admin actions: resolve the signed-in user, call the service,
 * and redirect with a `?saved=` or `?error=` message for the page to render. The
 * rule that a user may only rotate *their own* token lives in the service, not
 * here, so it cannot be bypassed by calling the service from somewhere else.
 */
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { rotateSubscriptionToken } from "@/lib/services/subscriptions";

/** Send the user back to /subscribe with a single status message. */
function back(key: "saved" | "error", message: string): never {
  redirect(`/subscribe?${new URLSearchParams({ [key]: message }).toString()}`);
}

export async function rotateSubscriptionTokenAction(): Promise<void> {
  const user = await requireUser("/subscribe");

  const result = await rotateSubscriptionToken({ id: user.id, role: user.role });

  if (!result.ok) back("error", result.errors.join(" "));

  back(
    "saved",
    "A new address was generated. The previous address stopped working immediately — resubscribe with the new one.",
  );
}
