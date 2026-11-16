import { redirect } from "next/navigation";
import { currentUser, signIn } from "@/auth";
import { devLoginEnabled } from "@/auth.config";

export const metadata = { title: "Sign in · Ornate Marketing OS" };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect("/");
  const { error } = await searchParams;
  const domain = process.env.ALLOWED_DOMAIN ?? "ornatesolar.com";
  return (
    <div className="login">
      <div className="card">
        <h1>Ornate Marketing OS</h1>
        <p className="muted">AI managers and agents for Ornate Solar and UnityESS. Sign in with your @{domain} Google account.</p>
        {error && <p className="pill pill-error">That account can&apos;t sign in here.</p>}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="btn btn-accent" style={{ justifyContent: "center", padding: "10px" }}>
            Sign in with Google
          </button>
        </form>
        {devLoginEnabled() && (
          <>
            <p className="divider">Local development only</p>
            <form
              action={async (fd: FormData) => {
                "use server";
                await signIn("dev", { email: String(fd.get("email") ?? ""), redirectTo: "/" });
              }}
            >
              <input name="email" type="email" defaultValue={(process.env.HEAD_EMAILS ?? "").split(",")[0]} aria-label="Email" />
              <button className="btn btn-ghost" style={{ justifyContent: "center" }}>Dev sign-in</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
