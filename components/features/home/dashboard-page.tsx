import React from "react";
import Header from "./header";
import GlobalStats from "./global-stats";
import TestSurveyFlow from "./test-survey-flow";
import RecentSurveyResponses from "./recent-survey-responses";
import AccountStressTest from "./account-stress-test";
import { Card, CardContent } from "@/components/ui/card";
import { DatabaseType, SignupAuthClient } from "../../../lib/types";

interface DashboardPageProps {
  userEmail: string;
  logoutHref: string;
  authClient: SignupAuthClient;
  dbType: DatabaseType;
}

const DashboardPage: React.FC<DashboardPageProps> = ({
  userEmail,
  logoutHref,
  authClient,
  dbType,
}) => {
  return (
    <div className="w-full min-h-screen p-6 space-y-6">
      <Header
        title="Database Test Dashboard"
        userEmail={userEmail}
        logoutHref={logoutHref}
        authClient={authClient}
        dbType={dbType}
      />
      <Card className="w-full shadow-md">
        <CardContent>
          <div className="w-full space-y-4">
            <h1 className="text-lg font-bold">Quick Actions</h1>
            <div className="flex">
              <GlobalStats dbType={dbType} />
            </div>
            <div className="flex">
              <TestSurveyFlow dbType={dbType} />
            </div>
            <div className="flex">
              <AccountStressTest dbType={dbType} />
            </div>
            <RecentSurveyResponses dbType={dbType} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardPage;
