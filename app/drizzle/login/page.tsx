import { LoginForm } from "@/components/features/auth/login-form"

const Page = () => {
  return (
    <LoginForm
      title="Login for Drizzle Benchmark"
      authClient="drizzle"
      callbackURL="/drizzle"
      signupHref="/drizzle/signup"
    />
  )
}

export default Page
