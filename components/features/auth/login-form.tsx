"use client"

import Link from "next/link"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { LoadingButton } from "@/components/c-ui/loading-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { drizzleAuthClient } from "@/lib/auth/drizzle-auth-client"
import { mongoAuthClient } from "@/lib/auth/mongo-auth-client"
import { LoginAuthClient } from "@/lib/types"

type LoginFormProps = {
  title: string
  authClient: LoginAuthClient
  signupHref?: string
  callbackURL?: string
}

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z
    .string()
    .min(1, "Password is required.")
    .max(128, "Password is too long."),
})

type LoginValues = z.infer<typeof loginSchema>

const defaultSignupHref: Record<LoginAuthClient, string> = {
  mongo: "/mongo/signup",
  drizzle: "/drizzle/signup",
}

const getErrorMessage = (error: unknown): string => {
  if (typeof error === "string") {
    return error
  }

  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message.length > 0) {
      return message
    }
  }

  return "Login failed. Please check your credentials and try again."
}

export function LoginForm({ title, authClient, signupHref, callbackURL }: LoginFormProps) {
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  const onSubmit = async (values: LoginValues) => {
    const client = authClient === "mongo" ? mongoAuthClient : drizzleAuthClient

    try {
      const result = await client.signIn.email({
        email: values.email,
        password: values.password,
        callbackURL,
      })

      if (result.error) {
        toast.error(getErrorMessage(result.error))
      }
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Enter your email and password to continue.</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  {...field}
                  id="email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={fieldState.invalid}
                  placeholder="name@example.com"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <Controller
            name="password"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  {...field}
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={fieldState.invalid}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <LoadingButton type="submit" className="w-full" isLoading={form.formState.isSubmitting}>
            Log in
          </LoadingButton>

          <p className="text-muted-foreground text-center text-sm">
            Don&apos;t have an account?{" "}
            <Link href={signupHref ?? defaultSignupHref[authClient]} className="text-primary font-medium hover:underline">
              Sign up
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
