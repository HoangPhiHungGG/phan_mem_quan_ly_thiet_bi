import { Construction } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export function NotImplemented({ title }: { title: string }) {
  const descriptions: Record<string, string> = {
    "Sửa chữa": "Quản lý tiếp nhận, sửa chữa và hoàn tất thiết bị.",
    "Kiểm kê": "Theo dõi các đợt kiểm kê tài sản và chênh lệch thực tế.",
    "Thanh lý": "Quản lý hồ sơ và trạng thái thanh lý tài sản.",
    "Báo cáo": "Tổng hợp dữ liệu tài sản và hoạt động kho.",
  };
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title={title}
        description={
          descriptions[title] ?? `Quản lý nghiệp vụ ${title.toLowerCase()}.`
        }
      />
      <EmptyState
        icon={<Construction className="h-7 w-7 text-muted-foreground" />}
        title={`Chưa có dữ liệu ${title.toLowerCase()}`}
        description={`Các hồ sơ ${title.toLowerCase()} được tạo sẽ xuất hiện tại đây.`}
        className="min-h-[190px] max-w-none border-dashed shadow-none"
      />
    </div>
  );
}
