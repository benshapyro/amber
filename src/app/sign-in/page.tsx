import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <h1 className="font-serif text-5xl font-medium text-primary">Amber</h1>
        <div className="stitch mt-4 mb-8" />
        <SignInForm />
      </div>
    </main>
  );
}
