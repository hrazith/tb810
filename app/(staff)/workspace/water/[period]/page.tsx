import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{
    period: string;
  }>;
};

export default async function WorkspaceWaterPeriodRedirect({ params }: PageProps) {
  const { period } = await params;
  redirect(`/water/${period}`);
}
