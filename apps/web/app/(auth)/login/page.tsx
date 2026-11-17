import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Asset IQ</h1>
          <p className="text-sm text-muted-foreground">Ask your content library anything. Get cited answers.</p>
        </div>
        <LoginForm next={next && next.startsWith("/") && !next.startsWith("//") ? next : "/library"} initialError={error} />
      </div>
    </main>
  );
}
