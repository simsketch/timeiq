import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, CheckCircle2 } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Calendar className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-gray-900">TimeIQ</span>
          </div>
          <div className="flex items-center space-x-4">
            <Link href="/sign-in">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/sign-up">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="container mx-auto px-4 py-20 text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Schedule meetings without
            <br />
            <span className="text-primary">the back-and-forth</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            TimeIQ is your smart scheduling assistant. Share your availability,
            let others book time with you, and never miss a meeting again.
          </p>
          <Link href="/sign-up">
            <Button size="lg" className="text-lg px-8 py-6">
              Start Scheduling for Free
            </Button>
          </Link>
        </section>

        <section className="container mx-auto px-4 py-16">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-lg shadow-sm border">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Share your link</h3>
              <p className="text-gray-600">
                Create your personalized booking page and share it with anyone.
                Set your availability and let TimeIQ handle the rest.
              </p>
            </div>

            <div className="bg-white p-8 rounded-lg shadow-sm border">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <Clock className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">They pick a time</h3>
              <p className="text-gray-600">
                Your guests see your real-time availability and choose a time
                that works for both of you. No more email ping-pong.
              </p>
            </div>

            <div className="bg-white p-8 rounded-lg shadow-sm border">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <CheckCircle2 className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Meeting confirmed</h3>
              <p className="text-gray-600">
                Both parties get instant confirmation. The meeting is
                automatically added to your calendar. Simple as that.
              </p>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-20 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to take control of your time?
          </h2>
          <p className="text-gray-600 mb-8">
            Join thousands of professionals who save time with TimeIQ
          </p>
          <Link href="/sign-up">
            <Button size="lg">Get Started Free</Button>
          </Link>
        </section>
      </main>

      <footer className="border-t bg-gray-50 py-8">
        <div className="container mx-auto px-4 text-center text-gray-600">
          <p>&copy; 2026 TimeIQ. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
