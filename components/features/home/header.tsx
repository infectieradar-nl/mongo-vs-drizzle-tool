'use client'

import { drizzleAuthClient } from "@/lib/auth/drizzle-auth-client"
import { mongoAuthClient } from "@/lib/auth/mongo-auth-client"
import { LogOutIcon, UserIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { getErrorMessage } from "@/lib/get-error-message"
import { LoadingButton } from "@/components/c-ui/loading-button"
import { useState } from "react"

interface HeaderProps {
    title: string
    userEmail: string
    logoutHref: string
    authClient?: "drizzle" | "mongo"
}

const authClients = { drizzle: drizzleAuthClient, mongo: mongoAuthClient }

const Header: React.FC<HeaderProps> = ({ title, userEmail, logoutHref, authClient = "drizzle" }) => {
    const [isLoading, setIsLoading] = useState(false)
    const router = useRouter()
    const client = authClients[authClient]

    const handleLogout = async () => {
        setIsLoading(true)
        await client.signOut({
            fetchOptions: {
                onSuccess: () => {
                    router.push(logoutHref)
                    setIsLoading(false)
                },
                onError: (error) => {
                    toast.error(getErrorMessage(error, "Failed to logout"))
                    setIsLoading(false)
                },

            },
        })
    }

    return (
        <header className="flex justify-between items-center w-full">
            <h1 className="text-lg font-bold">{title}</h1>
            <div className="flex items-center gap-2">
                <UserIcon
                    className="size-4"
                />
                {userEmail}
                <LoadingButton
                    variant="outline"
                    size="sm"
                    isLoading={isLoading}
                    onClick={handleLogout}
                >
                    Log out
                    <LogOutIcon className="size-4" />
                </LoadingButton>
            </div>
        </header>
    )
}

export default Header