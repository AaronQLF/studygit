import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = {
  title: "Sign up · personalGit",
};

type SearchParams = Promise<{ next?: string }>;

export default async function SignupPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { next } = await searchParams;
  return <AuthForm mode="signup" next={next ?? "/app"} />;
}
