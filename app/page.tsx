import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (

    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="text-2xl">
          Mongo vs Drizzle Benchmark Tool
        </CardTitle>
        <CardDescription>
          Compare MongoDB and Drizzle performance for our use case with the
          same auth and application flow so we can make a data-backed
          decision.
        </CardDescription>
      </CardHeader>
      <CardContent />
      <CardFooter className="flex w-full flex-col gap-3 sm:flex-row">
        <Button asChild size="lg" className="w-full sm:flex-1">
          <Link href="/drizzle">Go to Drizzle</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full sm:flex-1">
          <Link href="/mongo">Go to Mongo</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
