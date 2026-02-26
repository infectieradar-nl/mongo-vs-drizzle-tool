import { SignupForm } from "@/components/features/auth/signup-form"

const Page = () => {
  return (
    <SignupForm
      title="Sign up for Mongo Benchmark"
      authClient="mongo"
      callbackURL="/mongo"
      loginHref="/mongo/login"
    />
  )
}

export default Page
