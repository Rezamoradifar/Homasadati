import type { Metadata } from "next";
import AdminOrderPrint from "../../../../../src/platform/AdminOrderPrint";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminOrderPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminOrderPrint orderId={id} />;
}
