import { Suspense } from "react";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/session";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage({ searchParams }: PageProps<"/profile">) {
  return (
    <div className="mx-auto grid max-w-2xl gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Your profile</h1>
        <p className="text-sm text-muted-foreground">
          Event registrations use these details, so keep them up to date.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-[32rem] rounded-xl" />}>
        <ProfileContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ProfileContent({ searchParams }: Pick<PageProps<"/profile">, "searchParams">) {
  const user = await requireUser("/profile");
  const { welcome } = await searchParams;
  const departments = await prisma.department.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const incomplete = user.role === "STUDENT" && (!user.rollNo || !user.departmentId || !user.year);

  return (
    <>
      {welcome && (
        <Alert>
          <AlertTitle>Welcome to Campus Events!</AlertTitle>
          <AlertDescription>
            Your account is ready. Check your inbox for the link to verify your email.
          </AlertDescription>
        </Alert>
      )}
      {incomplete && !welcome && (
        <Alert>
          <AlertTitle>Finish your profile</AlertTitle>
          <AlertDescription>
            Add your roll number, department and year before registering for events.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            Roll number and department can be set once; ask the event cell to correct them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm user={user} departments={departments} />
        </CardContent>
      </Card>
    </>
  );
}
