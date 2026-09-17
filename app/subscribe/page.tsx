import Link from "next/link";
import { headers } from "next/headers";

import { CopyField } from "@/components/copy-field";
import { buttonPrimary, buttonSecondary, PageHeading } from "@/components/ui";
import { rotateSubscriptionTokenAction } from "@/lib/actions/subscriptions";
import { getCurrentUser } from "@/lib/auth";
import { firstParam } from "@/lib/params";
import { getOrCreateSubscription } from "@/lib/services/subscriptions";

export const metadata = {
  title: "Subscribe to the calendar",
  description:
    "Subscribe once in Google Calendar, Outlook or Apple Calendar and receive every published LASU date, correction and cancellation automatically.",
};

// The page reads the session cookie and the request host, so it is per-request.
export const dynamic = "force-dynamic";

/**
 * Build an absolute URL for the current request.
 *
 * The feed address has to be absolute because it is pasted into a calendar
 * client, which knows nothing about this app. Deriving it from the request means
 * the page works on localhost, on a LAN address during a demo, and on the real
 * domain without a configuration value that can drift out of date. A proxy (or a
 * tunnel like ngrok, which is how this gets demoed from a phone) passes the
 * public host and protocol in `x-forwarded-*`, so those win over `host`.
 */
async function requestBaseUrl(): Promise<string> {
  const store = await headers();

  const host = store.get("x-forwarded-host") ?? store.get("host") ?? "localhost:3000";
  const forwardedProto = store.get("x-forwarded-proto");
  const protocol = forwardedProto ?? (host.startsWith("localhost") ? "http" : "https");

  return `${protocol}://${host}`;
}

/** The three clients a Nigerian student or member of staff is likely to use. */
const CLIENT_STEPS: { name: string; steps: string[] }[] = [
  {
    name: "Google Calendar",
    steps: [
      "On a computer, open Google Calendar.",
      'Next to "Other calendars", click the + and choose "From URL".',
      "Paste the address above and click Add calendar.",
      "It appears under \u201cOther calendars\u201d and refreshes on its own.",
    ],
  },
  {
    name: "Outlook (web or desktop)",
    steps: [
      "Open Outlook Calendar and choose \u201cAdd calendar\u201d.",
      "Pick \u201cSubscribe from web\u201d.",
      "Paste the address, give it a name such as \u201cLASU calendar\u201d, and save.",
      "Allow up to a few hours before the first sync.",
    ],
  },
  {
    name: "Apple Calendar (iPhone, iPad, Mac)",
    steps: [
      "Tap or click the webcal address above \u2014 it opens Calendar directly.",
      "Or: Settings \u203a Calendar \u203a Accounts \u203a Add Account \u203a Other \u203a Add Subscribed Calendar, then paste the address.",
      "Leave \u201cRemove Alerts\u201d off, and set \u201cAuto-refresh\u201d to every hour.",
    ],
  },
];

/**
 * Subscribe screen.
 *
 * Two audiences in one route:
 *  - a signed-in user gets their personal, audience-filtered feed address plus
 *    the controls to regenerate it;
 *  - an anonymous visitor gets an explanation of what subscribing does, the
 *    public feed (which needs no account) and a link to sign in for the personal
 *    one. No login wall, because the public calendar genuinely is public.
 */
export default async function SubscribePage(props: PageProps<"/subscribe">) {
  const searchParams = await props.searchParams;
  const saved = firstParam(searchParams.saved);
  const error = firstParam(searchParams.error);

  const [user, baseUrl] = await Promise.all([getCurrentUser(), requestBaseUrl()]);

  const publicFeedUrl = `${baseUrl}/ics/public.ics`;

  return (
    <div className="max-w-3xl">
      <PageHeading
        title="Subscribe to the calendar"
        description="Add the LASU academic calendar to Google Calendar, Outlook or Apple Calendar once. Every published date, every correction and every cancellation then arrives automatically: you never have to come back here to check."
      />

      {saved ? (
        <p
          role="status"
          className="mb-6 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-600/20"
        >
          {saved}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mb-6 rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-600/20"
        >
          {error}
        </p>
      ) : null}

      {user ? (
        <PersonalFeed
          baseUrl={baseUrl}
          userName={user.name}
          userId={user.id}
          publicFeedUrl={publicFeedUrl}
        />
      ) : (
        <AnonymousIntro publicFeedUrl={publicFeedUrl} />
      )}

      <section aria-labelledby="how-heading" className="mt-10">
        <h2 id="how-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          How to subscribe
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {CLIENT_STEPS.map((client) => (
            <div
              key={client.name}
              className="rounded-lg border border-slate-200 bg-white p-4"
            >
              <h3 className="text-sm font-bold text-slate-900">{client.name}</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-slate-600">
                {client.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Calendar clients decide for themselves how often to check a subscribed
          calendar (usually between one hour and one day). Acadex advertises a
          one-hour refresh interval, and shows the time each entry was last changed
          so a correction is easy to spot.
        </p>
      </section>
    </div>
  );
}

/** The signed-in view: personal feed address, webcal link and rotation. */
async function PersonalFeed({
  baseUrl,
  userId,
  userName,
  publicFeedUrl,
}: {
  baseUrl: string;
  userId: string;
  userName: string;
  publicFeedUrl: string;
}) {
  // Created on first visit: accounts that predate this feature have no
  // Subscription row yet, and the user should not have to know that.
  const subscription = await getOrCreateSubscription(userId);

  const feedPath = `/ics/${subscription.icsToken}.ics`;
  const feedUrl = `${baseUrl}${feedPath}`;
  // `webcal://` is the scheme calendar applications register for, so a click
  // subscribes instead of downloading a file.
  const webcalUrl = feedUrl.replace(/^https?:\/\//, "webcal://");

  return (
    <>
      <section
        aria-labelledby="personal-heading"
        className="rounded-lg border border-slate-200 bg-white p-5"
      >
        <h2 id="personal-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Your personal feed
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          This feed contains everything you are entitled to see, {userName}: all
          whole-university dates plus the ones published for your faculty,
          department and level.
        </p>

        <div className="mt-4">
          <CopyField
            id="personal-feed-url"
            label="Your calendar address"
            value={feedUrl}
            hint="Copy this into your calendar application."
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a href={webcalUrl} className={buttonPrimary}>
            Subscribe in one click
          </a>
          <a href={feedPath} className={buttonSecondary}>
            Preview the .ics file
          </a>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          The one-click link uses the <code>webcal://</code> scheme, which opens
          Apple Calendar, Outlook or Google Calendar (whichever is installed)
          with the address already filled in.
        </p>
      </section>

      <section
        aria-labelledby="secret-heading"
        className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-5"
      >
        <h2 id="secret-heading" className="text-base font-bold text-amber-900">
          Treat this address as a secret
        </h2>
        <p className="mt-1 text-sm text-amber-900">
          Anyone who has this address can read your feed: there is no password on
          it, because calendar applications cannot sign in. Only share it with
          yourself, and do not post it in a group chat or a public repository.
        </p>
        <p className="mt-2 text-sm text-amber-900">
          If it does leak, generate a new address below. The old one stops working
          immediately, and you will need to subscribe again with the new one.
        </p>

        <form action={rotateSubscriptionTokenAction} className="mt-4 no-print">
          <button type="submit" className={buttonSecondary}>
            Regenerate my address
          </button>
        </form>
        <p className="mt-2 text-xs text-amber-900">
          Regenerating is recorded in the audit log. The address values themselves
          are never logged.
        </p>
      </section>

      <section
        aria-labelledby="public-heading"
        className="mt-6 rounded-lg border border-slate-200 bg-white p-5"
      >
        <h2 id="public-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Whole-university calendar
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          The public feed needs no account and contains every published
          whole-university date, but not the notices targeted at your faculty,
          department or level, which is what your personal feed adds.
        </p>
        <div className="mt-3">
          <CopyField
            id="public-feed-url"
            label="Public calendar address"
            value={publicFeedUrl}
            hint="Safe to share with anyone."
          />
        </div>
        <p className="mt-3">
          <a
            href={publicFeedUrl.replace(/^https?:\/\//, "webcal://")}
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            Subscribe to the whole-university calendar
          </a>
          {" · "}
          <Link href="/calendar" className="text-sm font-medium text-blue-700 hover:underline">
            Browse it on the website
          </Link>
        </p>
      </section>
    </>
  );
}

/** The anonymous view: what subscribing means, and how to get a personal feed. */
function AnonymousIntro({ publicFeedUrl }: { publicFeedUrl: string }) {
  return (
    <>
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-base font-bold text-slate-900">
          Anyone can subscribe to the university calendar
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          The public feed carries every published whole-university date: session
          dates, registration windows, lectures, examinations, results and
          convocation. It updates itself, so a date that moves or is cancelled
          changes in your calendar without you checking the website.
        </p>

        <div className="mt-4">
          <CopyField
            id="public-feed-url"
            label="Public calendar address"
            value={publicFeedUrl}
            hint="Copy this into Google Calendar, Outlook or Apple Calendar."
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a
            href={publicFeedUrl.replace(/^https?:\/\//, "webcal://")}
            className={buttonPrimary}
          >
            Subscribe in one click
          </a>
          <Link href="/calendar" className={buttonSecondary}>
            View the calendar
          </Link>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-5">
        <h2 className="text-base font-bold text-blue-900">
          Sign in for a personal feed
        </h2>
        <p className="mt-1 text-sm text-blue-900">
          A personal feed adds the dates published for your own faculty, department
          and level. Staff accounts also receive internal, staff-only notices. Sign
          in and Acadex will generate a private address for you.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link href="/login?next=%2Fsubscribe" className={buttonPrimary}>
            Sign in
          </Link>
          <Link href="/register" className={buttonSecondary}>
            Create an account
          </Link>
        </div>
      </section>
    </>
  );
}
