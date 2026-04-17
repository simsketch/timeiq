import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Sidebar } from "@/components/dashboard/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <div className="relative h-screen flex overflow-hidden">
      <div className="aurora-bg aurora-bg-soft" aria-hidden />
      <div className="grain" aria-hidden />

      <aside className="hidden md:flex md:w-72 md:flex-col md:fixed md:inset-y-0 z-30 p-3">
        <Sidebar />
        <div className="absolute bottom-7 left-7 z-40">
          <UserButton afterSignOutUrl="/" />
        </div>
      </aside>

      <main className="relative flex-1 md:pl-72">
        <div className="h-full overflow-y-auto">
          <div className="mx-auto max-w-6xl px-6 lg:px-10 py-10">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
