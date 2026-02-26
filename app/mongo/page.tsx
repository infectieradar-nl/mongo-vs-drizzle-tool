import Header from "@/components/features/home/header";
import { requireMongoAuth } from "@/lib/auth/utils";

const Page = async () => {
    const session = await requireMongoAuth();

    return (
        <div className="w-full">
            <Header
                title="Mongo Test"
                userEmail={session.user.email}
                logoutHref="/mongo/login"
            />
        </div>
    );
}

export default Page;