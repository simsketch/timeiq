import Link from "next/link";
import type { ReactNode } from "react";

export interface Post {
  slug: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  minutes: number;
  body: ReactNode;
}

export const POSTS: Post[] = [
  {
    slug: "one-booking-link-for-all-your-calendars",
    title: "One booking link for all your calendars: how to stop double bookings",
    description:
      "Most double bookings happen because your booking page only sees one calendar. Here's how to connect Google, Outlook and iCloud so people only book when you're really free.",
    date: "2026-10-27",
    minutes: 5,
    body: (
      <>
        <p>
          You share a booking link, a client picks Thursday at 3, and Thursday at 3 is your kid&apos;s dentist
          appointment. The link did its job: it showed the times your <em>work</em> calendar had open. Your family
          calendar lives in iCloud, your side project lives in Outlook, and the booking page never saw either.
        </p>
        <p>
          The fix is simple to describe: your booking page has to check every calendar you use before it offers a time.
        </p>
        <h2>Why most booking tools only see one or two calendars</h2>
        <p>
          Many scheduling tools connect one calendar on their free plan and a handful on paid plans, and some only
          connect Google or Microsoft accounts directly. Personal calendars, shared family calendars and calendars from
          other apps often get left out, and those are exactly the ones that cause conflicts.
        </p>
        <h2>Every calendar has a private link you can use</h2>
        <p>
          Nearly every calendar app can publish a private iCal (.ics) link. Anything that reads that link sees your
          busy times. Here&apos;s where to find it:
        </p>
        <ul>
          <li>
            <strong>Google Calendar:</strong> Settings, then pick the calendar under &ldquo;Settings for my
            calendars&rdquo;, then <em>Integrate calendar</em>. Copy the <em>Secret address in iCal format</em>.
          </li>
          <li>
            <strong>Outlook / Microsoft 365:</strong> Settings, <em>Calendar</em>, <em>Shared calendars</em>, then{" "}
            <em>Publish a calendar</em>. Pick the calendar, choose &ldquo;Can view all details&rdquo;, publish, and copy
            the ICS link.
          </li>
          <li>
            <strong>iCloud (Apple Calendar):</strong> tap the share icon next to the calendar, turn on{" "}
            <em>Public Calendar</em>, and copy the link. It starts with <code>webcal://</code>, which works fine.
          </li>
        </ul>
        <p>Treat these links like passwords: anyone with the link can see the calendar.</p>
        <h2>What a good setup looks like</h2>
        <ul>
          <li>Every calendar you live by is connected: work, personal, family, and any shared ones.</li>
          <li>Busy times sync often, and are re-checked right before someone confirms a booking.</li>
          <li>Buffers sit around everything, so a meeting never starts the minute you get back from school pickup.</li>
          <li>When a calendar link breaks, you hear about it instead of finding out from a double booking.</li>
        </ul>
        <p>
          TimeIQ does all four: connect as many calendars as you like, it syncs hourly and re-checks before each
          booking, and it emails you if a calendar stops syncing. If you want to see how much your free time shrinks
          once everything is connected, try the <Link href="/tools/booking-capacity">booking capacity calculator</Link>.
        </p>
      </>
    ),
  },
  {
    slug: "get-kids-sports-schedule-into-your-calendar",
    title: "Get the kids' sports and band schedules into your calendar without typing them",
    description:
      "Season schedules arrive as PDFs, screenshots and long emails. Here's the fastest way to get every practice and game onto your calendar, and keep clients from booking over them.",
    date: "2026-10-27",
    minutes: 4,
    body: (
      <>
        <p>
          Every season starts the same way: a PDF from the league, a screenshot from the team app, and an email from the
          coach that says practice moves to Thursdays after the 15th. Typing twenty events into a calendar takes most
          of an evening, and one typo means a missed game.
        </p>
        <h2>Option 1: subscribe, if the league offers it</h2>
        <p>
          Some team apps publish a calendar link. If yours does, add it as a calendar and it stays up to date on its
          own. Most schedules don&apos;t come that way, though.
        </p>
        <h2>Option 2: forward the schedule and let it be read for you</h2>
        <p>
          TimeIQ gives you a private email address. Forward the PDF, the screenshot or the coach&apos;s email to it, and
          TimeIQ reads every event out of it: practices on a repeating schedule become one event per date, games keep
          their locations, and things mentioned only in the email body (like team photos before the first game) are
          picked up too. A minute later you get a reply listing what was added, with a one-click undo.
        </p>
        <p>Two things make this more useful than a plain calendar import:</p>
        <ul>
          <li>
            <strong>The events block your booking page.</strong> If you take client calls, nobody can book you during
            Tuesday practice.
          </li>
          <li>
            <strong>They show up on your phone.</strong> Subscribe to your TimeIQ calendar feed once in Google, Apple
            Calendar or a family display like Skylight, and imported schedules appear there automatically.
          </li>
        </ul>
        <h2>Tips for clean imports</h2>
        <ul>
          <li>Forward the original email, so the year and any notes come along.</li>
          <li>If a schedule changes mid-season, undo the old import and forward the new one.</li>
          <li>Share the address with your partner so either of you can forward schedules. Both of you get the reply.</li>
        </ul>
      </>
    ),
  },
  {
    slug: "share-availability-across-time-zones",
    title: "How to share your availability across time zones (without the back-and-forth)",
    description:
      "\"What times work for you?\" turns into five emails when people are in different time zones. Two ways to answer it in one message.",
    date: "2026-10-27",
    minutes: 4,
    body: (
      <>
        <p>
          Someone in Los Angeles asks when you&apos;re free next week. You check three calendars, type out a list of
          times, convert each one to Pacific in your head, and hope you didn&apos;t miss a meeting. Then they reply with
          a time that&apos;s already gone.
        </p>
        <h2>Start with the overlap</h2>
        <p>
          Before offering times, know which hours both of you are working. New York and Los Angeles share 12 to 5 PM
          Eastern. New York and London share only the morning in New York. Los Angeles and London don&apos;t overlap in a
          normal 9-to-5 at all. The <Link href="/tools/time-zone-overlap">time zone overlap calculator</Link> works it out
          for any set of cities.
        </p>
        <h2>Option 1: send your open times in both zones</h2>
        <p>Write each window in your zone and theirs, so nobody has to convert:</p>
        <blockquote>
          Tue, Nov 3: 9–11:30 AM EST · 6–8:30 AM PST
          <br />
          Wed, Nov 4: 1–4 PM EST · 10 AM–1 PM PST
        </blockquote>
        <p>
          TimeIQ builds this list for you from every connected calendar: pick the days, add a second (or third) time
          zone, and copy it as text or as a picture of your week. It ends with your booking link.
        </p>
        <h2>Option 2: send a booking link</h2>
        <p>
          A booking link shows open times in the visitor&apos;s own time zone automatically, and the time they pick is
          confirmed against your calendars before it&apos;s booked. Send the list when you want to offer a few specific
          slots, and the link when you&apos;re happy for them to choose.
        </p>
        <h2>Daylight saving catches everyone</h2>
        <p>
          The US and Europe change clocks on different weekends in March and in October and November, so for a few weeks
          the usual gap is off by an hour. Tools that compute times from real time zone data handle it; mental math
          usually doesn&apos;t.
        </p>
      </>
    ),
  },
  {
    slug: "how-much-is-15-an-hour-a-year",
    title: "How much is $15 an hour a year? (And $20, $25, $30, part-time and full-time)",
    description:
      "$15 an hour is $31,200 a year full-time and $15,600 at 20 hours a week. A quick table for common rates, and how to work out any rate.",
    date: "2026-10-27",
    minutes: 3,
    body: (
      <>
        <p>
          <strong>$15 an hour is $31,200 a year</strong> at 40 hours a week for 52 weeks, before taxes. That&apos;s $2,600 a
          month or $600 a week. At 20 hours a week it&apos;s half: $15,600 a year, $1,300 a month.
        </p>
        <h2>The formula</h2>
        <p>
          Yearly pay = hourly rate × hours per week × weeks per year. Full-time is 2,080 hours (40 × 52), so a quick
          estimate is to double the hourly rate and add three zeros: $25 an hour is roughly $50,000 a year (exactly
          $52,000).
        </p>
        <h2>Common rates</h2>
        <ul>
          <li>$15/hour: $31,200 full-time, $23,400 at 30 hrs, $15,600 at 20 hrs</li>
          <li>$18/hour: $37,440 full-time, $28,080 at 30 hrs, $18,720 at 20 hrs</li>
          <li>$20/hour: $41,600 full-time, $31,200 at 30 hrs, $20,800 at 20 hrs</li>
          <li>$25/hour: $52,000 full-time, $39,000 at 30 hrs, $26,000 at 20 hrs</li>
          <li>$30/hour: $62,400 full-time, $46,800 at 30 hrs, $31,200 at 20 hrs</li>
          <li>$40/hour: $83,200 full-time, $62,400 at 30 hrs, $41,600 at 20 hrs</li>
          <li>$50/hour: $104,000 full-time, $78,000 at 30 hrs, $52,000 at 20 hrs</li>
        </ul>
        <p>
          For any other rate, schedule or number of weeks, use the{" "}
          <Link href="/tools/hourly-to-salary">hourly to salary calculator</Link>. It also works backwards from a salary.
        </p>
        <h2>If you&apos;re freelance</h2>
        <p>
          These numbers assume someone pays you for every hour, including holidays. Freelancers bill fewer hours than
          they work and pay their own taxes and expenses, so the same yearly income takes a higher rate. The{" "}
          <Link href="/tools/freelance-rate">freelance rate calculator</Link> shows how much higher.
        </p>
      </>
    ),
  },
];

export const postBySlug = (slug: string) => POSTS.find((p) => p.slug === slug);
