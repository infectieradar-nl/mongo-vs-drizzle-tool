import Header from "@/components/features/home/header";
import { requireDrizzleAuth } from "@/lib/auth/utils";

const Page = async () => {
    const session = await requireDrizzleAuth();

    return (
        <div className="w-full">
            <Header
                title="Drizzle ORM Test"
                userEmail={session.user.email}
                logoutHref="/drizzle/login"
            />
        </div>
    );
}

export default Page;