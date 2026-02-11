import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Clock,
  CheckCircle2,
  ArrowRight,
  Link2,
  Globe,
  Zap,
  Shield,
  Mail,
  Users
} from "lucide-react";

export default function LandingPage() {
  // Calendar data for February 2026 (starts on Sunday, Monday-first week display)
  const calendarDays = [
    { day: "", blank: true },
    { day: "", blank: true },
    { day: "", blank: true },
    { day: "", blank: true },
    { day: "", blank: true },
    { day: "", blank: true },
    { day: "1", blank: false },
    { day: "2", blank: false },
    { day: "3", blank: false },
    { day: "4", blank: false },
    { day: "5", blank: false },
    { day: "6", blank: false },
    { day: "7", blank: false },
    { day: "8", blank: false },
    { day: "9", blank: false },
    { day: "10", blank: false },
    { day: "11", blank: false, highlighted: true },
    { day: "12", blank: false },
    { day: "13", blank: false },
    { day: "14", blank: false },
    { day: "15", blank: false },
    { day: "16", blank: false },
    { day: "17", blank: false },
    { day: "18", blank: false },
    { day: "19", blank: false },
    { day: "20", blank: false },
    { day: "21", blank: false },
    { day: "22", blank: false },
    { day: "23", blank: false },
    { day: "24", blank: false },
    { day: "25", blank: false },
    { day: "26", blank: false },
    { day: "27", blank: false },
    { day: "28", blank: false },
    { day: "", blank: true },
  ];

  const timeSlots = ["9:00 AM", "10:00 AM", "11:00 AM", "2:00 PM"];

  return (
    <div className="min-h-screen bg-white">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
              <Calendar className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">TimeIQ</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/sign-in">
              <Button variant="ghost">Sign in</Button>
            </Link>
            <Link href="/sign-up">
              <Button>Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/70 to-white">
          {/* Background blur circle */}
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-400/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />

          <div className="container mx-auto px-4 lg:px-8 py-20 lg:py-32">
            <div className="grid lg:grid-cols-5 gap-12 lg:gap-16 items-center relative">
              {/* Left side - Content */}
              <div className="lg:col-span-3 space-y-8">
                <Badge variant="secondary" className="text-blue-600 bg-blue-50 border-blue-100 hover:bg-blue-50">
                  Smart scheduling for modern teams
                </Badge>

                <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tighter text-gray-900">
                  Schedule meetings without{" "}
                  <span className="text-primary">the back-and-forth</span>
                </h1>

                <p className="text-xl text-gray-600 max-w-2xl leading-relaxed">
                  Share your availability, let others book time with you instantly,
                  and never play email tag again. TimeIQ makes scheduling effortless.
                </p>

                <div className="flex flex-col sm:flex-row gap-4">
                  <Link href="/sign-up">
                    <Button size="lg" className="text-base px-8 gap-2">
                      Start for free
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href="/sign-in">
                    <Button size="lg" variant="outline" className="text-base px-8">
                      Sign in
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Right side - Mock Booking UI */}
              <div className="lg:col-span-2 hidden lg:block relative">
                <div className="relative animate-[float_6s_ease-in-out_infinite]">
                  <Card className="p-6 rounded-2xl shadow-2xl shadow-blue-500/20 rotate-1 hover:rotate-0 transition-transform duration-500 bg-white border-blue-100">
                    {/* User info */}
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                        EZ
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">Elon Zito</div>
                        <div className="text-sm text-gray-600">30 min meeting</div>
                      </div>
                    </div>

                    {/* Calendar header */}
                    <div className="mb-4">
                      <div className="text-sm font-semibold text-gray-900 mb-3">February 2026</div>

                      {/* Day headers */}
                      <div className="grid grid-cols-7 gap-1 mb-2">
                        {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
                          <div key={i} className="text-center text-xs font-medium text-gray-500">
                            {day}
                          </div>
                        ))}
                      </div>

                      {/* Calendar grid */}
                      <div className="grid grid-cols-7 gap-1">
                        {calendarDays.map((item, index) => (
                          <div
                            key={index}
                            className={`
                              aspect-square flex items-center justify-center text-sm rounded-md
                              ${item.blank ? "" : "hover:bg-gray-100 cursor-pointer"}
                              ${item.highlighted ? "bg-primary text-white font-semibold hover:bg-primary" : "text-gray-700"}
                            `}
                          >
                            {item.day}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Time slots */}
                    <div className="mb-6 space-y-2">
                      <div className="text-sm font-semibold text-gray-900 mb-3">Select time</div>
                      <div className="grid grid-cols-2 gap-2">
                        {timeSlots.map((time, index) => (
                          <button
                            key={index}
                            className={`
                              px-4 py-2 text-sm rounded-lg font-medium transition-colors
                              ${index === 0
                                ? "bg-primary text-white"
                                : "border border-gray-200 text-gray-700 hover:border-blue-300"
                              }
                            `}
                          >
                            {time}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Confirm button */}
                    <Button className="w-full">Confirm booking</Button>
                  </Card>

                  {/* Floating notification */}
                  <div className="absolute -bottom-4 -left-4 bg-white rounded-lg shadow-lg border border-green-200 px-4 py-3 flex items-center gap-2">
                    <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                      <CheckCircle2 className="h-3 w-3 text-white" />
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold text-gray-900">Booking confirmed!</span>
                      <span className="text-gray-500 ml-1">Just now</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="relative py-24 lg:py-36 overflow-hidden">
          {/* Gradient mesh background */}
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-200/25 rounded-full blur-3xl" />
          <div className="absolute top-1/3 right-1/5 w-[400px] h-[400px] bg-purple-200/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/2 w-[350px] h-[350px] bg-blue-300/15 rounded-full blur-3xl" />

          <div className="relative container mx-auto px-4 lg:px-8">
            <div className="text-center mb-20">
              <Badge variant="secondary" className="text-blue-600 bg-blue-50/80 border-blue-100/60 backdrop-blur-sm mb-5">
                How it works
              </Badge>
              <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-gray-900">
                Three steps to effortless scheduling
              </h2>
            </div>

            <div className="relative">
              {/* Connector line (desktop only) */}
              <div className="hidden md:block steps-connector" />

              <div className="grid md:grid-cols-3 gap-8 lg:gap-10 relative z-10">
                {/* Step 1 */}
                <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-2xl shadow-lg shadow-blue-500/[0.05] p-8 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/[0.08] hover:scale-[1.02]">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 backdrop-blur-sm">
                      <Link2 className="h-6 w-6 text-blue-500" />
                    </div>
                    <Badge variant="secondary" className="text-xs bg-white/60 border-white/40 text-gray-500">
                      Step 1
                    </Badge>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">Share your link</h3>
                  <p className="text-gray-600 leading-relaxed">
                    Create your personalized booking page and share it with anyone.
                    Set your availability once and you&apos;re done.
                  </p>
                </div>

                {/* Step 2 */}
                <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-2xl shadow-lg shadow-blue-500/[0.05] p-8 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/[0.08] hover:scale-[1.02]">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 backdrop-blur-sm">
                      <Clock className="h-6 w-6 text-purple-500" />
                    </div>
                    <Badge variant="secondary" className="text-xs bg-white/60 border-white/40 text-gray-500">
                      Step 2
                    </Badge>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">They pick a time</h3>
                  <p className="text-gray-600 leading-relaxed">
                    Your guests see your real-time availability and choose a slot
                    that works for everyone. No more email ping-pong.
                  </p>
                </div>

                {/* Step 3 */}
                <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-2xl shadow-lg shadow-blue-500/[0.05] p-8 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/[0.08] hover:scale-[1.02]">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10 backdrop-blur-sm">
                      <CheckCircle2 className="h-6 w-6 text-green-500" />
                    </div>
                    <Badge variant="secondary" className="text-xs bg-white/60 border-white/40 text-gray-500">
                      Step 3
                    </Badge>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">You&apos;re booked</h3>
                  <p className="text-gray-600 leading-relaxed">
                    Both parties get instant confirmation and the meeting is
                    automatically added to your calendars. Simple as that.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section — Bento Grid */}
        <section className="relative py-24 lg:py-36 overflow-hidden bg-[#f5f5f7]">
          {/* Subtle mesh */}
          <div className="absolute top-1/4 right-0 w-[450px] h-[450px] bg-indigo-200/15 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/3 w-[400px] h-[400px] bg-sky-200/15 rounded-full blur-3xl" />

          <div className="relative container mx-auto px-4 lg:px-8">
            <div className="text-center mb-20">
              <Badge variant="secondary" className="text-blue-600 bg-blue-50/80 border-blue-100/60 backdrop-blur-sm mb-5">
                Features
              </Badge>
              <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-gray-900">
                Everything you need to own your time
              </h2>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Calendar sync — spans 2 cols on lg */}
              <div className="lg:col-span-2 bg-white/50 backdrop-blur-xl border border-white/70 rounded-2xl shadow-lg shadow-black/[0.03] p-8 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:border-blue-200/60 group">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 mb-5">
                  <Calendar className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium text-blue-600">Calendar sync</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Seamlessly connected</h3>
                <p className="text-gray-600 leading-relaxed max-w-lg">
                  Sync with Google Calendar, Outlook, and iCal to prevent double bookings.
                  Your availability stays accurate across every platform, automatically.
                </p>
              </div>

              {/* Timezone smart */}
              <div className="bg-white/50 backdrop-blur-xl border border-white/70 rounded-2xl shadow-lg shadow-black/[0.03] p-8 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:border-purple-200/60 group">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/10 mb-5">
                  <Globe className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium text-purple-600">Timezone smart</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Always local</h3>
                <p className="text-gray-600 leading-relaxed">
                  Automatically detect and display times in your guests&apos; local timezones.
                </p>
              </div>

              {/* Instant confirmation */}
              <div className="bg-white/50 backdrop-blur-xl border border-white/70 rounded-2xl shadow-lg shadow-black/[0.03] p-8 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:border-amber-200/60 group">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 mb-5">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium text-amber-600">Instant confirmation</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Zero delay</h3>
                <p className="text-gray-600 leading-relaxed">
                  Get notified immediately when someone books time with you.
                </p>
              </div>

              {/* Buffer times */}
              <div className="bg-white/50 backdrop-blur-xl border border-white/70 rounded-2xl shadow-lg shadow-black/[0.03] p-8 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:border-emerald-200/60 group">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 mb-5">
                  <Shield className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-medium text-emerald-600">Buffer times</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Breathing room</h3>
                <p className="text-gray-600 leading-relaxed">
                  Add padding between meetings so you never feel back-to-back.
                </p>
              </div>

              {/* Email notifications + Custom event types — wide card */}
              <div className="lg:col-span-2 bg-white/50 backdrop-blur-xl border border-white/70 rounded-2xl shadow-lg shadow-black/[0.03] p-8 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:border-rose-200/60 group">
                <div className="grid sm:grid-cols-2 gap-8">
                  <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/10 mb-5">
                      <Mail className="h-4 w-4 text-rose-500" />
                      <span className="text-sm font-medium text-rose-600">Email notifications</span>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Stay in the loop</h3>
                    <p className="text-gray-600 leading-relaxed">
                      Automated confirmations, reminders, and calendar invites for everyone involved.
                    </p>
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sky-500/10 mb-5">
                      <Users className="h-4 w-4 text-sky-500" />
                      <span className="text-sm font-medium text-sky-600">Custom event types</span>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Your meetings, your way</h3>
                    <p className="text-gray-600 leading-relaxed">
                      Create different meeting types with unique durations, buffers, and settings.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 lg:py-36">
          <div className="container mx-auto px-4 lg:px-8">
            <div className="relative overflow-hidden bg-gray-950 rounded-3xl p-12 lg:p-20">
              {/* Animated mesh blobs */}
              <div className="cta-blob cta-blob-1" />
              <div className="cta-blob cta-blob-2" />
              <div className="cta-blob cta-blob-3" />

              {/* Glass overlay */}
              <div className="relative bg-white/[0.07] backdrop-blur-2xl border border-white/[0.1] rounded-3xl p-10 lg:p-16 text-center max-w-3xl mx-auto">
                <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6 tracking-tight">
                  Ready to take control of your time?
                </h2>
                <p className="text-lg text-gray-300 mb-10 leading-relaxed">
                  Join thousands of professionals who save hours every week with TimeIQ.
                  Start scheduling smarter today.
                </p>
                <Link href="/sign-up">
                  <Button size="lg" className="text-base px-8 gap-2 bg-blue-500 hover:bg-blue-400 text-white shadow-lg shadow-blue-500/25 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/30">
                    Get started free
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-gray-50/80 backdrop-blur-sm border-t border-gray-200/50 py-10">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex items-center justify-center gap-2.5 mb-3">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
              <Calendar className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-gray-900">TimeIQ</span>
          </div>
          <p className="text-center text-gray-500 text-sm">
            &copy; 2026 TimeIQ. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
