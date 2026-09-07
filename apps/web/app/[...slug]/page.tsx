import { NotImplemented } from "@/components/not-implemented";
import { notFound } from "next/navigation";

const pageTitles: Record<string, string> = {
  "thiet-bi": "Thiết bị",
  "linh-kien": "Linh kiện",
  kho: "Kho",
  "cap-phat": "Cấp phát",
  "muon-tra": "Mượn/trả",
  "dieu-chuyen": "Điều chuyển",
  "thu-hoi": "Thu hồi",
  "sua-chua": "Sửa chữa",
  "kiem-ke": "Kiểm kê",
  "thanh-ly": "Thanh lý",
  "bao-cao": "Báo cáo",
  "quan-tri": "Quản trị",
};

export default async function ModulePage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const key = slug[0] ?? "";
  if (key === "mua-sam") notFound();
  const title = pageTitles[key] ?? "Chức năng";

  return <NotImplemented title={title} />;
}
