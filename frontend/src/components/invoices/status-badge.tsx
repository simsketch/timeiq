import { Badge } from "@/components/ui/badge";
import { InvoiceStatus, STATUS_LABEL } from "@/lib/invoicing";

const CLASSES: Record<InvoiceStatus, string> = {
  draft: "border-transparent bg-slate-200 text-slate-800 hover:bg-slate-200",
  sent: "border-transparent bg-blue-100 text-blue-800 hover:bg-blue-100",
  paid: "border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  void: "border-transparent bg-rose-100 text-rose-800 hover:bg-rose-100",
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge className={CLASSES[status]}>{STATUS_LABEL[status]}</Badge>;
}
