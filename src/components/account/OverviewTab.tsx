"use client";

import type { Session } from "next-auth";

interface OverviewTabProps {
  session: Session;
  accountData: any;
}

export default function OverviewTab({ session, accountData }: OverviewTabProps) {
  return <div>Overview coming soon</div>;
}
