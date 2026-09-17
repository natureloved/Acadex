import Link from "next/link";

import {
  buttonSecondary,
  EmptyState,
  NotificationTypeBadge,
  PageHeading,
} from "@/components/ui";
import { markAllReadAction, markReadAction } from "@/lib/actions/notifications";
import { requireUser } from "@/lib/auth";
import { listNotifications, unreadCount } from "@/lib/services/notifications";
import { formatDate } from "@/lib/format";
import { firstParam } from "@/lib/params";

export const metadata = {
  title: "Notifications",
  description:
    "Every notice addressed to you: reminders for dates that are coming up and warnings when a date you are in scope for is moved or cancelled.",
};

// The page reads the session cookie and the live notice list, so it is
// per-request: a cached copy would show a stale unread count.
export const dynamic = "force-dynamic";

/**
 * Notification centre.
 *
 * Any signed-in user, at any role. `proxy.ts` does not cover this path (its
 * matcher is deliberately limited to /admin and /staff), so the authorisation
 * check is `requireUser()` here: the page is the gate, exactly as the note in
 * proxy.ts describes.
 *
 * The notices themselves come from `listNotifications`, which is scoped to the
 * signed-in user id; there is no query parameter anywhere on this page that could
 * name a different person's notices.
 */
export default async function NotificationsPage(props: PageProps<"/notifications">) {
  const user = await requireUser("/notifications");

  const searchParams = await props.searchParams;
  const unreadOnly = firstParam(searchParams.unread) !== undefined;

  const [notifications, unread] = await Promise.all([
    listNotifications(user.id, { unreadOnly }),
    unreadCount(user.id),
  ]);

  return (
    <div>
      <PageHeading
        title="Notifications"
        description="Reminders before a date arrives, and a warning whenever a date you are in scope for moves or is cancelled."
      >
        {/* A real form posting to a server action, so "mark all as read" works
            without JavaScript. Only shown when there is something to mark. */}
        {unread > 0 ? (
          <form action={markAllReadAction}>
            <button type="submit" className={buttonSecondary}>
              Mark all as read
            </button>
          </form>
        ) : null}
      </PageHeading>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="text-sm text-slate-600">
          {notifications.length === 0
            ? "Nothing to show"
            : `${notifications.length} ${notifications.length === 1 ? "notice" : "notices"}`}
          {unread > 0 ? ` · ${unread} unread` : " · all read"}
        </p>

        <nav aria-label="Filter" className="ml-auto flex items-center gap-1 text-sm">
          <Link
            href="/notifications"
            aria-current={unreadOnly ? undefined : "page"}
            className={
              unreadOnly
                ? "rounded-md px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100"
                : "rounded-md bg-slate-100 px-3 py-1.5 font-semibold text-slate-900"
            }
          >
            All
          </Link>
          <Link
            href="/notifications?unread=1"
            aria-current={unreadOnly ? "page" : undefined}
            className={
              unreadOnly
                ? "rounded-md bg-slate-100 px-3 py-1.5 font-semibold text-slate-900"
                : "rounded-md px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100"
            }
          >
            Unread only
          </Link>
        </nav>
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          title={unreadOnly ? "Nothing unread" : "No notifications yet"}
          body={
            unreadOnly
              ? "You have read everything addressed to you. Switch to “All” to see the notices you have already dealt with."
              : "Notices appear here when a date in your scope is moved or cancelled, and a week and a day before an event you are in scope for starts. Subscribing to the calendar adds the same dates to your calendar application."
          }
          action={{ href: "/calendar", label: "Browse the calendar" }}
        />
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {notifications.map((notification) => {
            const isUnread = notification.readAt === null;

            return (
              <li
                key={notification.id}
                // Unread notices carry a left accent and a tinted background in
                // addition to the dot, so the state is not colour-only.
                className={`flex flex-wrap gap-x-4 gap-y-3 p-4 ${
                  isUnread ? "border-l-4 border-blue-600 bg-blue-50/40" : "border-l-4 border-transparent"
                }`}
              >
                <div className="min-w-0 grow">
                  <div className="flex flex-wrap items-center gap-2">
                    {isUnread ? (
                      <span
                        className="size-2 shrink-0 rounded-full bg-blue-600"
                        aria-hidden="true"
                      />
                    ) : null}
                    <h2
                      className={`text-sm ${isUnread ? "font-bold text-slate-900" : "font-semibold text-slate-700"}`}
                    >
                      {notification.title}
                    </h2>
                    <NotificationTypeBadge type={notification.type} />
                    {isUnread ? (
                      <span className="sr-only">Unread</span>
                    ) : null}
                  </div>

                  <p
                    className={`mt-1 max-w-3xl text-sm ${isUnread ? "text-slate-700" : "text-slate-600"}`}
                  >
                    {notification.body}
                  </p>

                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <time dateTime={notification.createdAt.toISOString()}>
                      Raised {formatDate(notification.createdAt)}
                    </time>
                    {notification.event ? (
                      <Link
                        // The detail page applies the visibility and audience
                        // gate itself, so a notice can never be a way around
                        // STAFF_ONLY: a reader who is no longer entitled to the
                        // event gets the same "not found" as anywhere else.
                        href={`/calendar/${notification.event.id}`}
                        className="font-medium text-blue-700 hover:underline"
                      >
                        View the event: {notification.event.title}
                      </Link>
                    ) : null}
                  </p>
                </div>

                {isUnread ? (
                  <form action={markReadAction} className="flex items-center">
                    <input type="hidden" name="notificationId" value={notification.id} />
                    <button
                      type="submit"
                      className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-300 transition-all duration-150 hover:bg-white active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 shadow-2xs"
                    >
                      Mark as read
                      <span className="sr-only">: {notification.title}</span>
                    </button>
                  </form>
                ) : (
                  <span className="flex items-center text-xs text-slate-400">Read</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
