"use client";

import { LoadingButton } from "@/components/c-ui/loading-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getErrorMessage } from "@/lib/get-error-message";
import { useState } from "react";
import type { DatabaseType } from "../../../lib/types";
import { dashboardHooks } from "../../hooks/hooks-selector";

interface ResetProps {
  dbType: DatabaseType;
}

type ResetStatus = "idle" | "loading" | "success" | "error";

const Reset: React.FC<ResetProps> = ({ dbType }) => {
  const hooks = dashboardHooks[dbType];
  const purgeAllOtherUsers = hooks.usePurgeAllOtherUsers();
  const purgeAllResponses = hooks.usePurgeAllResponses();

  const [status, setStatus] = useState<ResetStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingButton, setLoadingButton] = useState<
    "users" | "responses" | null
  >(null);

  const handlePurgeOtherUsers = async () => {
    setLoadingButton("users");
    setStatus("loading");
    setErrorMessage(null);

    try {
      await purgeAllOtherUsers.mutateAsync();
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        `Purge users failed: ${getErrorMessage(error, "Failed.")}`,
      );
    } finally {
      setLoadingButton(null);
    }
  };

  const handlePurgeAllResponses = async () => {
    setLoadingButton("responses");
    setStatus("loading");
    setErrorMessage(null);

    try {
      await purgeAllResponses.mutateAsync();
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        `Purge responses failed: ${getErrorMessage(error, "Failed.")}`,
      );
    } finally {
      setLoadingButton(null);
    }
  };

  return (
    <Card className="w-96">
      <CardHeader>
        <CardTitle>Data Reset</CardTitle>
        <CardDescription>Purge data from the database.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2">
          <LoadingButton
            variant="destructive"
            isLoading={loadingButton === "users"}
            onClick={handlePurgeOtherUsers}
          >
            Purge All Other Users
          </LoadingButton>
          <LoadingButton
            variant="destructive"
            isLoading={loadingButton === "responses"}
            onClick={handlePurgeAllResponses}
          >
            Purge All Responses
          </LoadingButton>
        </div>

        {status === "error" && errorMessage && (
          <p className="text-sm text-destructive">Error: {errorMessage}</p>
        )}
      </CardContent>
    </Card>
  );
};

export default Reset;
