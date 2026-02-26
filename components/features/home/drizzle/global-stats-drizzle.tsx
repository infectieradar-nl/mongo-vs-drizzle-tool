'use client'

import { useGetResponseCount, useGetUserCount } from "@/components/hooks/drizzle-router-hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const GlobalStatsDrizzle = () => {
    const { data: userCount, isLoading, error } = useGetUserCount();
    const { data: responseCount, isLoading: responseCountLoading, error: responseCountError } = useGetResponseCount();
    if (isLoading || responseCountLoading) return <div>Loading global stats...</div>;
    if (error) return <div>Error fetching global stats: {error.message}</div>;
    if (responseCountError) return <div>Error fetching response count: {responseCountError.message}</div>;

    return (
        <Card className="w-64">
            <CardHeader>
                <CardTitle>Global Stats</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
                <p className="flex justify-between items-center">
                    <span className="">User count: </span>
                    <span className="font-bold font-mono text-end min-w-30 bg-muted rounded-md p-1">{userCount}</span>
                </p>
                <p className="flex justify-between items-center">
                    <span className="">Responses: </span>
                    <span className="font-bold font-mono text-end min-w-30 bg-muted rounded-md p-1">{responseCount}</span>
                </p>
            </CardContent>
        </Card>
    )
}

export default GlobalStatsDrizzle;