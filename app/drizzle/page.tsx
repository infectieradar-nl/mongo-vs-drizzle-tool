import DashboardPage from "@/components/features/home/dashboard-page";
import { requireDrizzleAuth } from "@/lib/auth/utils";

const Page = async () => {
  const session = await requireDrizzleAuth();

  return (
    <DashboardPage
      title="Drizzle ORM Test Dashboard"
      userEmail={session.user.email}
      logoutHref="/drizzle/login"
      authClient="drizzle"
      dbType="drizzle"
    />
  );
};

export default Page;
