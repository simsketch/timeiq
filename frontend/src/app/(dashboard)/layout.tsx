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
    <div className="h-screen flex bg-[#f5f5f7]">
      <div className="hidden md:flex md:w-72 md:flex-col md:fixed md:inset-y-0 z-30">
        <Sidebar />
        <div className="absolute bottom-5 left-5 z-20">
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>
      <main className="flex-1 md:pl-72">
        <div className="h-full overflow-y-auto">
          <div className="flex items-center justify-end px-8 pt-6 pb-0">
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: { avatarBox: "h-9 w-9" },
              }}
            />
          </div>
          <div className="mx-auto max-w-6xl px-8 pb-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
