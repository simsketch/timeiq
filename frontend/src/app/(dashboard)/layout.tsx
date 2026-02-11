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
    <div className="h-screen flex">
      <div className="hidden md:flex md:w-72 md:flex-col md:fixed md:inset-y-0">
        <Sidebar />
        <div className="absolute bottom-4 left-4">
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>
      <main className="flex-1 md:pl-72">
        <div className="h-full overflow-y-auto">
          <div className="container mx-auto p-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
