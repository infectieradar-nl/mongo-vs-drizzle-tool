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
import { useRouter } from "next/navigation"
import { SignupAuthClient } from "@/lib/types"


type SignupFormProps = {
    title: string
    authClient: SignupAuthClient
    loginHref?: string
    callbackURL?: string
}

const signupSchema = z
    .object({
        email: z.string().email("Enter a valid email address."),
        password: z
            .string()
            .min(1, "Password is required.")
            .max(128, "Password is too long."),
        confirmPassword: z
            .string()
            .min(1, "Confirm your password."),
    })
    .refine((values) => values.password === values.confirmPassword, {
        message: "Passwords do not match.",
        path: ["confirmPassword"],
    })

type SignupValues = z.infer<typeof signupSchema>

const defaultLoginHref: Record<SignupAuthClient, string> = {
    mongo: "/mongo/login",
    drizzle: "/drizzle/login",
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

    return "Sign up failed. Please try again."
}

const getNameFromEmail = (email: string): string => {
    const localPart = email.split("@")[0]?.trim()
    return localPart && localPart.length > 0 ? localPart : "User"
}

export function SignupForm({ title, authClient, loginHref, callbackURL }: SignupFormProps) {
    const router = useRouter()
    const form = useForm<SignupValues>({
        resolver: zodResolver(signupSchema),
        defaultValues: {
            email: "",
            password: "",
            confirmPassword: "",
        },
    })

    const onSubmit = async (values: SignupValues) => {
        const client = authClient === "mongo" ? mongoAuthClient : drizzleAuthClient

        try {
            client.signUp.email({
                email: values.email,
                password: values.password,
                name: getNameFromEmail(values.email),
                callbackURL,
            }, {
                onSuccess: () => {
                    toast.success("Account created successfully")
                    router.push(callbackURL ?? "/")
                },
                onError: (error) => {
                    toast.error(getErrorMessage(error))
                },
            })

        } catch (error) {
            toast.error(getErrorMessage(error))
        }
    }

    return (
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>Create your account to continue.</CardDescription>
            </CardHeader>

            <CardContent>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
                    <Controller
                        name="email"
                        control={form.control}
                        render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel htmlFor="signup-email">Email</FieldLabel>
                                <Input
                                    {...field}
                                    id="signup-email"
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
                                <FieldLabel htmlFor="signup-password">Password</FieldLabel>
                                <Input
                                    {...field}
                                    id="signup-password"
                                    type="password"
                                    autoComplete="new-password"
                                    aria-invalid={fieldState.invalid}
                                />
                                <FieldError errors={[fieldState.error]} />
                            </Field>
                        )}
                    />

                    <Controller
                        name="confirmPassword"
                        control={form.control}
                        render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel htmlFor="signup-confirm-password">Confirm password</FieldLabel>
                                <Input
                                    {...field}
                                    id="signup-confirm-password"
                                    type="password"
                                    autoComplete="new-password"
                                    aria-invalid={fieldState.invalid}
                                />
                                <FieldError errors={[fieldState.error]} />
                            </Field>
                        )}
                    />

                    <LoadingButton type="submit" className="w-full" isLoading={form.formState.isSubmitting}>
                        Sign up
                    </LoadingButton>

                    <p className="text-muted-foreground text-center text-sm">
                        Already have an account?{" "}
                        <Link href={loginHref ?? defaultLoginHref[authClient]} className="text-primary font-medium hover:underline">
                            Log in
                        </Link>
                    </p>
                </form>
            </CardContent>
        </Card>
    )
}
