import GlobalStatsMongo from "@/components/features/home/mongo/global-stats-mongo";
import RecentSurveyResponsesMongo from "@/components/features/home/mongo/recent-survey-responses-mongo";
import TestSurveyFlowMongo from "@/components/features/home/mongo/test-survey-flow-mongo";
import Header from "@/components/features/home/header";
import { requireMongoAuth } from "@/lib/auth/utils";

const Page = async () => {
  const session = await requireMongoAuth();

  return (
    <div className="w-full p-4 space-y-4">
      <Header
        title="Mongo Test"
        userEmail={session.user.email}
        logoutHref="/mongo/login"
        authClient="mongo"
      />
      <div className="flex">
        <TestSurveyFlowMongo />
      </div>
      <div className="flex">
        <GlobalStatsMongo />
      </div>
      <RecentSurveyResponsesMongo />
    </div>
  );
};

export default Page;