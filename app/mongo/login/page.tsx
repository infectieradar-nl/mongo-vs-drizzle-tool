import { LoginForm } from "@/components/features/auth/login-form"

const Page = () => {
  return (
    <LoginForm
      title="Login for Mongo Benchmark"
      authClient="mongo"
      callbackURL="/mongo"
      signupHref="/mongo/signup"
    />
  )
}

export default Page
