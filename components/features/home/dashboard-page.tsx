import React from "react";
import Header from "./header";
import GlobalStats from "./global-stats";
import TestSurveyFlow from "./test-survey-flow";
import RecentSurveyResponses from "./recent-survey-responses";
import { Card, CardContent } from "@/components/ui/card";
import { DatabaseType, SignupAuthClient } from "../../../lib/types";

interface DashboardPageProps {
  title: string;
  userEmail: string;
  logoutHref: string;
  authClient: SignupAuthClient;
  dbType: DatabaseType;
}

const DashboardPage: React.FC<DashboardPageProps> = ({
  title,
  userEmail,
  logoutHref,
  authClient,
  dbType,
}) => {
  return (
    <div className="w-full min-h-screen p-6">
      <Card className="w-full shadow-lg">
        <CardContent>
          <div className="w-full space-y-4">
            <Header
              title={title}
              userEmail={userEmail}
              logoutHref={logoutHref}
              authClient={authClient}
            />
            <div className="flex">
              <TestSurveyFlow dbType={dbType} />
            </div>
            <div className="flex">
              <GlobalStats dbType={dbType} />
            </div>
            <RecentSurveyResponses dbType={dbType} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardPage;
