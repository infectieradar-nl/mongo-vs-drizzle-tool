import GlobalStatsDrizzle from "@/components/features/home/drizzle/global-stats-drizzle";
import RecentSurveyResponsesDrizzle from "@/components/features/home/drizzle/recent-survey-responses-drizzle";
import TestSurveyFlow from "@/components/features/home/drizzle/test-survey-flow";
import Header from "@/components/features/home/header";
import { requireDrizzleAuth } from "@/lib/auth/utils";

const Page = async () => {
    const session = await requireDrizzleAuth();

    return (
        <div className="w-full p-4 space-y-4">
            <Header
                title="Drizzle ORM Test"
                userEmail={session.user.email}
                logoutHref="/drizzle/login"
            />
            <div className="flex">
                <TestSurveyFlow />
            </div>
            <div className="flex">
                <GlobalStatsDrizzle />
            </div>
            <RecentSurveyResponsesDrizzle />
        </div>
    );
}

export default Page;
