import type { ComponentType, ReactNode } from "react";
import { BookingCapacityCalculator } from "./booking-capacity";
import { FreelanceRateCalculator } from "./freelance-rate";
import { HourlySalaryCalculator } from "./hourly-salary";
import { MeetingCostCalculator } from "./meeting-cost";
import { TimezoneOverlapCalculator } from "./timezone-overlap";

/**
 * Name, title (page <title> and H1), description (meta and card blurb) and CTA live in
 * messages under tools.items.<key>.
 */
export interface Tool {
  slug: string;
  key: "hourlyToSalary" | "freelanceRate" | "meetingCost" | "timeZoneOverlap" | "bookingCapacity";
  Calculator: ComponentType;
  /** Explainer under the calculator (also what search engines read). English only: long-form SEO copy. */
  body: ReactNode;
}

export const TOOLS: Tool[] = [
  {
    slug: "hourly-to-salary",
    key: "hourlyToSalary",
    Calculator: HourlySalaryCalculator,
    body: (
      <>
        <h2>How the math works</h2>
        <p>
          Yearly pay is <strong>hourly rate × hours per week × weeks worked</strong>. At 40 hours a week and 52 weeks,
          that&apos;s 2,080 hours, which is why people say &ldquo;double the hourly rate and add three zeros&rdquo;:
          $25 an hour is about $52,000 a year.
        </p>
        <h2>Quick answers</h2>
        <ul>
          <li>$15/hour full time (40 hrs): $31,200 a year, $2,600 a month.</li>
          <li>$15/hour at 20 hours a week: $15,600 a year, $1,300 a month.</li>
          <li>$20/hour full time: $41,600 a year.</li>
          <li>$25/hour full time: $52,000 a year.</li>
          <li>$30/hour full time: $62,400 a year.</li>
          <li>$50/hour full time: $104,000 a year.</li>
        </ul>
        <h2>Part-time and unpaid weeks</h2>
        <p>
          Change hours per week for part-time work. If you&apos;re a contractor without paid time off, set weeks worked to
          the weeks you actually bill. Two weeks off at $30/hour full time costs $2,400.
        </p>
      </>
    ),
  },
  {
    slug: "freelance-rate",
    key: "freelanceRate",
    Calculator: FreelanceRateCalculator,
    body: (
      <>
        <h2>Why freelance rates look high</h2>
        <p>
          An employee&apos;s salary covers 2,080 paid hours. A freelancer pays their own taxes, software and insurance,
          takes unpaid time off, and spends a third of the week on sales, email and admin nobody pays for. A $90,000
          take-home goal can need well over $100 an hour.
        </p>
        <h2>The levers that matter most</h2>
        <ul>
          <li><strong>Billable share.</strong> Going from 55% to 70% billable is like a 27% raise.</li>
          <li><strong>Weeks off.</strong> Plan for them up front instead of hoping to make them up.</li>
          <li><strong>Scheduling overhead.</strong> Every back-and-forth email to find a time is unbilled. A booking link removes it.</li>
        </ul>
      </>
    ),
  },
  {
    slug: "meeting-cost",
    key: "meetingCost",
    Calculator: MeetingCostCalculator,
    body: (
      <>
        <h2>How it&apos;s calculated</h2>
        <p>
          Each person&apos;s hourly cost is their salary plus benefits and overhead, divided by 2,080 working hours. Multiply
          by the number of people and the meeting length, then by how often it happens over a 50-week year.
        </p>
        <h2>Cheap ways to cut the bill</h2>
        <ul>
          <li>Default meetings to 25 or 50 minutes instead of 30 or 60.</li>
          <li>Invite the people who decide; send notes to everyone else.</li>
          <li>Replace status meetings with a written update.</li>
          <li>Let people book focused one-on-ones instead of holding standing slots nobody needs.</li>
        </ul>
      </>
    ),
  },
  {
    slug: "time-zone-overlap",
    key: "timeZoneOverlap",
    Calculator: TimezoneOverlapCalculator,
    body: (
      <>
        <h2>Finding a time that works everywhere</h2>
        <p>
          Add every location in the meeting. The blue band is when everyone is inside their workday. If there&apos;s no
          overlap, someone has to stretch, so rotate who it is.
        </p>
        <h2>Common pairs (9 to 5)</h2>
        <ul>
          <li>New York and Los Angeles: 12 to 5 PM Eastern, 9 AM to 2 PM Pacific.</li>
          <li>New York and London: 9 AM to 12 PM Eastern, 2 to 5 PM in London (most of the year).</li>
          <li>Los Angeles and London: no overlap in a 9-to-5 day.</li>
        </ul>
        <p>
          Daylight saving starts and ends on different dates in the US and Europe, so these shift by an hour for a few
          weeks each spring and fall. The calculator uses today&apos;s offsets.
        </p>
      </>
    ),
  },
  {
    slug: "booking-capacity",
    key: "bookingCapacity",
    Calculator: BookingCapacityCalculator,
    body: (
      <>
        <h2>The hidden number: time you&apos;re already busy</h2>
        <p>
          Coaches, tutors and consultants often set eight bookable hours a day, then lose half of them to school runs,
          gym, family events and other work calendars. If those calendars aren&apos;t connected to your booking page,
          clients see those hours as free and book right over them.
        </p>
        <h2>Buffers pay for themselves</h2>
        <p>
          Ten minutes between 30-minute calls costs you a meeting or two a day, but stops calls running into each other
          and gives you time for notes. A daily cap protects the rest of your day.
        </p>
      </>
    ),
  },
];

export const toolBySlug = (slug: string) => TOOLS.find((t) => t.slug === slug);
