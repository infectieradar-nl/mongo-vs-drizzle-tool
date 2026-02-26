import { SignupForm } from "@/components/features/auth/signup-form"

const Page = () => {
  return (
    <SignupForm
      title="Sign up for Drizzle Benchmark"
      authClient="drizzle"
      callbackURL="/drizzle"
      loginHref="/drizzle/login"
    />
  )
}

export default Page
