"use client";

import { drizzleAuthClient } from "@/lib/auth/drizzle-auth-client";
import { mongoAuthClient } from "@/lib/auth/mongo-auth-client";
import { LogOutIcon, UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/get-error-message";
import { LoadingButton } from "@/components/c-ui/loading-button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useState } from "react";
import { DatabaseType } from "@/lib/types";

interface HeaderProps {
  title: string;
  userEmail: string;
  logoutHref: string;
  authClient?: "drizzle" | "mongo";
  dbType: DatabaseType;
}

const authClients = { drizzle: drizzleAuthClient, mongo: mongoAuthClient };

const Header: React.FC<HeaderProps> = ({
  title,
  userEmail,
  logoutHref,
  authClient = "drizzle",
  dbType,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const client = authClients[authClient];

  const handleDatabaseChange = (newDbType: DatabaseType) => {
    router.push(`/${newDbType}`);
  };

  const handleLogout = async () => {
    setIsLoading(true);
    await client.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push(logoutHref);
          setIsLoading(false);
        },
        onError: (error) => {
          toast.error(getErrorMessage(error, "Failed to logout"));
          setIsLoading(false);
        },
      },
    });
  };

  return (
    <Card className="w-full shadow-md">
      <CardContent className="p-4">
        <header className="flex justify-between items-center w-full">
          <h1 className="text-xl font-bold">{title}</h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <UserIcon className="size-4" />
              {userEmail}
              <LoadingButton
                variant="outline"
                size="default"
                isLoading={isLoading}
                onClick={handleLogout}
              >
                Log out
                <LogOutIcon className="size-4" />
              </LoadingButton>
              <Select value={dbType} onValueChange={handleDatabaseChange}>
                <SelectTrigger
                  className="h-9! w-32 shadow-xs font-medium hover:bg-muted"
                  size="default"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="drizzle">Drizzle ORM</SelectItem>
                  <SelectItem value="mongo">MongoDB</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </header>
      </CardContent>
    </Card>
  );
};

export default Header;
