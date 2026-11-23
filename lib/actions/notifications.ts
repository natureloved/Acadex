"use server";

/**
 * Notification actions.
 *
 * Same shape as the other action modules: resolve the signed-in user, check the
 * input, then call the service. The rule that a user may only touch *their own*
 * notices lives in the service (`markRead` / `markAllRead` are scoped by user id),
 * so it holds even if these wrappers are reached from somewhere unexpected.
 *
 * Neither action redirects. Both are submitted from the notification page itself,
 * and the current URL *is* the state worth preserving a reader who filtered to
 * `?unread=1` and marked one notice read should stay on that filtered list. A
 * redirect would need a hidden return path on every form; `revalidatePath` gives
 * the same result with less to get wrong, and works with JavaScript disabled
 * because the form posts and the page renders server-side either way.
 */
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { markAllRead, markRead } from "@/lib/services/notifications";

export async function markReadAction(formData: FormData): Promise<void> {
  const user = await requireUser("/notifications");

  const notificationId = String(formData.get("notificationId") ?? "").trim();
  if (!notificationId) return;

  await markRead(user.id, notificationId);
  revalidatePath("/notifications");
}

export async function markAllReadAction(): Promise<void> {
  const user = await requireUser("/notifications");

  await markAllRead(user.id);
  revalidatePath("/notifications");
}
