import DashboardPage from "@/components/features/home/dashboard-page";
import { requireMongoAuth } from "@/lib/auth/utils";

const Page = async () => {
  const session = await requireMongoAuth();

  return (
    <DashboardPage
      title="Mongo Test Dashboard"
      userEmail={session.user.email}
      logoutHref="/mongo/login"
      authClient="mongo"
      dbType="mongo"
    />
  );
};

export default Page;
