'use client'

import { drizzleAuthClient } from "@/lib/auth/drizzle-auth-client"
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
}


const Header: React.FC<HeaderProps> = ({ title, userEmail, logoutHref }) => {
    const [isLoading, setIsLoading] = useState(false)
    const router = useRouter()

    const handleLogout = async () => {
        setIsLoading(true)
        await drizzleAuthClient.signOut({
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
        <header className="flex justify-between items-center p-4 w-full">
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