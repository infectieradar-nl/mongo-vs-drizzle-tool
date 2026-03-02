import DashboardPage from "@/components/features/home/dashboard-page";
import { dashboardConfigs } from "@/components/features/home/dashboard-config";
import { requireDrizzleAuth } from "@/lib/auth/utils";

const Page = async () => {
  const session = await requireDrizzleAuth();
  const config = dashboardConfigs.drizzle;

  return (
    <DashboardPage
      title={config.title}
      userEmail={session.user.email}
      logoutHref={config.logoutHref}
      authClient={config.authClient}
      dbType={config.dbType}
    />
  );
};

export default Page;
