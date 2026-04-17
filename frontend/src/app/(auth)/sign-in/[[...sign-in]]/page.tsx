import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4">
      <div className="aurora-bg aurora-bg-soft" aria-hidden />
      <div className="grain" aria-hidden />
      <div className="relative z-10 reveal reveal-1">
        <SignIn />
      </div>
    </div>
  );
}
