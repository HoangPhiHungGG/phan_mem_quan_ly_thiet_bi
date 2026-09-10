import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TransactionDetailButton({
  onClick,
  disabled,
  title = "Xem chi tiết chứng từ",
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="min-w-[7.5rem]"
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      <Eye aria-hidden="true" /> Xem chi tiết
    </Button>
  );
}
