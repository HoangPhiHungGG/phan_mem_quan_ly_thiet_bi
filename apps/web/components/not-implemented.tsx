import { Construction } from "lucide-react";

export function NotImplemented({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 py-20">
      <Construction className="h-12 w-12 text-muted-foreground" />
      <h2 className="mt-4 text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Chưa triển khai. Chức năng này sẽ được phát triển trong các bước tiếp
        theo.
      </p>
    </div>
  );
}
