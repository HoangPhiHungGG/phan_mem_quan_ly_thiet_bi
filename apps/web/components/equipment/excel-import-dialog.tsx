"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { exportExcel } from "@/lib/excel";

type ImportKind = "DEVICE" | "PART";
type PreviewRow = {
  rowNumber: number;
  status: "VALID" | "WARNING" | "ERROR";
  errors: string[];
  warnings: string[];
  skip: boolean;
  original: Record<string, unknown>;
  data: Record<string, unknown>;
};
type Preview = {
  importSessionId: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  skippedRows: number;
  rows: PreviewRow[];
};
type Result = {
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  failedRows: number;
};

const DEVICE_COLUMNS = [
  "STT",
  "Mã tài sản *",
  "Tên thiết bị *",
  "Loại thiết bị *",
  "Model thiết bị",
  "Serial",
  "Nhà cung cấp",
  "Ngày mua",
  "Giá mua (đ)",
  "Bảo hành đến",
  "Tình trạng *",
  "Kho nhập ban đầu *",
  "Ghi chú",
] as const;

const PART_COLUMNS = [
  "STT",
  "Tên linh kiện *",
  "Mã linh kiện",
  "Kiểu quản lý *",
  "Loại linh kiện *",
  "Model linh kiện",
  "Đơn vị tính *",
  "Nhà cung cấp",
  "Thông số",
  "Tồn tối thiểu",
  "Kho nhập ban đầu",
  "Số lượng ban đầu",
  "Danh sách serial",
  "Nguồn nhập",
  "Ghi chú",
] as const;

const value = (row: Record<string, unknown>, column: string) => row[column];

function mapRow(kind: ImportKind, row: Record<string, unknown>) {
  if (kind === "DEVICE")
    return {
      name: value(row, "Tên thiết bị *") ?? value(row, "Tên thiết bị"),
      deviceType: value(row, "Loại thiết bị *") ?? value(row, "Loại thiết bị"),
      model: value(row, "Model thiết bị"),
      assetCode: value(row, "Mã tài sản *") ?? value(row, "Mã tài sản"),
      serial: value(row, "Serial"),
      condition: value(row, "Tình trạng *") ?? value(row, "Tình trạng"),
      warehouse:
        value(row, "Kho nhập ban đầu *") ??
        value(row, "Kho nhập ban đầu") ??
        value(row, "Kho"),
      supplier: value(row, "Nhà cung cấp"),
      purchasedAt: value(row, "Ngày mua"),
      purchasePrice: value(row, "Giá mua (đ)") ?? value(row, "Giá mua"),
      warrantyUntil: value(row, "Bảo hành đến"),
      notes: value(row, "Ghi chú"),
    };
  return {
    name: value(row, "Tên linh kiện *") ?? value(row, "Tên linh kiện"),
    code: value(row, "Mã linh kiện"),
    trackingMode: value(row, "Kiểu quản lý *") ?? value(row, "Kiểu quản lý"),
    componentType:
      value(row, "Loại linh kiện *") ?? value(row, "Loại linh kiện"),
    model: value(row, "Model linh kiện"),
    unit: value(row, "Đơn vị tính *") ?? value(row, "Đơn vị tính"),
    supplier: value(row, "Nhà cung cấp"),
    spec: value(row, "Thông số"),
    minQty: value(row, "Tồn tối thiểu"),
    warehouse: value(row, "Kho nhập ban đầu"),
    quantity: value(row, "Số lượng ban đầu"),
    serials: value(row, "Danh sách serial"),
    source: value(row, "Nguồn nhập"),
    notes: value(row, "Ghi chú"),
  };
}

function toTemplateRow(kind: ImportKind, row: Record<string, unknown>) {
  if (kind === "DEVICE")
    return {
      STT: "",
      "Mã tài sản *": row.assetCode,
      "Tên thiết bị *": row.name,
      "Loại thiết bị *": row.deviceType,
      "Model thiết bị": row.model,
      Serial: row.serial,
      "Nhà cung cấp": row.supplier,
      "Ngày mua": row.purchasedAt,
      "Giá mua (đ)": row.purchasePrice,
      "Bảo hành đến": row.warrantyUntil,
      "Tình trạng *": row.condition,
      "Kho nhập ban đầu *": row.warehouse,
      "Ghi chú": row.notes,
    };
  return {
    STT: "",
    "Tên linh kiện *": row.name,
    "Mã linh kiện": row.code,
    "Kiểu quản lý *": row.trackingMode,
    "Loại linh kiện *": row.componentType,
    "Model linh kiện": row.model,
    "Đơn vị tính *": row.unit,
    "Nhà cung cấp": row.supplier,
    "Thông số": row.spec,
    "Tồn tối thiểu": row.minQty,
    "Kho nhập ban đầu": row.warehouse,
    "Số lượng ban đầu": row.quantity,
    "Danh sách serial": Array.isArray(row.serials)
      ? row.serials.join(", ")
      : row.serials,
    "Nguồn nhập": row.source,
    "Ghi chú": row.notes,
  };
}

function templateRows(columns: readonly string[]) {
  return [Object.fromEntries(columns.map((column) => [column, ""]))];
}

const DEVICE_GUIDE = [
  ["Mã tài sản *", "Có", "IT-LT-001", "Phải duy nhất trong hệ thống"],
  ["Tên thiết bị *", "Có", "Laptop Dell", "Tên hiển thị của thiết bị"],
  ["Loại thiết bị *", "Có", "Laptop", "Tên danh mục, không nhập ID"],
  ["Model thiết bị", "Không", "Latitude 5420", "Chỉ dùng model thiết bị"],
  ["Serial", "Không", "ABC123", "Phải duy nhất nếu nhập"],
  ["Tình trạng *", "Có", "Tốt", "Tốt / Bình thường / Hư hỏng"],
  ["Kho nhập ban đầu *", "Có", "Kho IT", "Kho phải tồn tại trước"],
  ["Ngày mua", "Không", "11/09/2026", "Định dạng dd/mm/yyyy"],
];
const PART_GUIDE = [
  ["Tên linh kiện *", "Có", "SSD Samsung 500GB", "Tên hiển thị"],
  ["Kiểu quản lý *", "Có", "Theo serial", "Theo số lượng / Theo serial"],
  ["Loại linh kiện *", "Có", "SSD", "Tên loại linh kiện"],
  ["Model linh kiện", "Không", "870 EVO 500GB", "Chỉ dùng model linh kiện"],
  ["Đơn vị tính *", "Có", "Cái", "Tên đơn vị tính"],
  ["Kho nhập ban đầu", "Không", "Kho IT", "Kho phải tồn tại trước"],
  [
    "Danh sách serial",
    "Theo serial",
    "SSD001, SSD002",
    "Phân cách bằng dấu phẩy hoặc xuống dòng",
  ],
  [
    "Nguồn nhập",
    "Không",
    "Tồn đầu kỳ",
    "Tồn đầu kỳ / Mua sắm / Thu hồi / Khác",
  ],
];

export function ExcelImportDialog({
  kind,
  open,
  onOpenChange,
  onCompleted,
}: {
  kind: ImportKind;
  open: boolean;
  onOpenChange(open: boolean): void;
  onCompleted(): void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [autoCreateCatalog, setAutoCreateCatalog] = useState(false);
  const [duplicatePolicy, setDuplicatePolicy] = useState("ERROR");
  const [atomic, setAtomic] = useState(true);
  const [importValidRows, setImportValidRows] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label = kind === "DEVICE" ? "Thiết bị" : "Linh kiện";

  function resetPreview() {
    setPreview(null);
    setResult(null);
  }

  async function downloadTemplate() {
    const columns = kind === "DEVICE" ? DEVICE_COLUMNS : PART_COLUMNS;
    const guide = kind === "DEVICE" ? DEVICE_GUIDE : PART_GUIDE;
    await exportExcel(
      kind === "DEVICE" ? "Mau_Import_ThietBi" : "Mau_Import_LinhKien",
      [
        { name: "DU_LIEU", rows: templateRows(columns) },
        {
          name: "HUONG_DAN",
          rows: guide.map(([column, required, example, description]) => ({
            "Tên cột": column,
            "Bắt buộc?": required,
            "Ví dụ": example,
            "Giải thích": description,
          })),
        },
      ],
    );
  }

  async function chooseFile(selected: File | undefined) {
    setError("");
    resetPreview();
    setRows([]);
    setFile(null);
    if (!selected) return;
    if (!/\.xlsx?$/i.test(selected.name)) {
      setError("Chỉ chấp nhận file Excel .xlsx hoặc .xls.");
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setError("File Excel không được lớn hơn 10 MB.");
      return;
    }
    try {
      setBusy(true);
      const XLSX = await import("xlsx");
      const buffer = await selected.arrayBuffer();
      const signature = new Uint8Array(buffer.slice(0, 8));
      const isXlsx = signature[0] === 0x50 && signature[1] === 0x4b;
      const isXls = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every(
        (byte, index) => signature[index] === byte,
      );
      const expectsXlsx = /\.xlsx$/i.test(selected.name);
      if ((expectsXlsx && !isXlsx) || (!expectsXlsx && !isXls))
        throw new Error(
          "Nội dung file không đúng định dạng Excel theo phần mở rộng.",
        );
      const workbook = XLSX.read(buffer, {
        type: "array",
        cellDates: true,
        cellFormula: true,
      });
      const sheet =
        workbook.Sheets.DU_LIEU ?? workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("File không có sheet dữ liệu.");
      if (
        Object.entries(sheet).some(
          ([address, cell]) =>
            !address.startsWith("!") &&
            typeof cell === "object" &&
            cell !== null &&
            "f" in cell,
        )
      )
        throw new Error(
          "File có công thức. Hãy chuyển công thức thành giá trị trước khi import.",
        );
      const firstRow = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: "",
        raw: false,
      })[0];
      const headers = new Set(
        (firstRow ?? []).map((header) => String(header).trim()),
      );
      const requiredColumns =
        kind === "DEVICE"
          ? [
              "Mã tài sản *",
              "Tên thiết bị *",
              "Loại thiết bị *",
              "Tình trạng *",
              "Kho nhập ban đầu *",
            ]
          : [
              "Tên linh kiện *",
              "Kiểu quản lý *",
              "Loại linh kiện *",
              "Đơn vị tính *",
            ];
      const missingColumns = requiredColumns.filter(
        (column) =>
          !headers.has(column) && !headers.has(column.replace(" *", "")),
      );
      if (missingColumns.length)
        throw new Error(
          `File thiếu cột bắt buộc: ${missingColumns.join(", ")}.`,
        );
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: true,
      });
      const mapped = raw
        .map((item) => mapRow(kind, item))
        .filter((item) =>
          Object.values(item).some((itemValue) =>
            String(itemValue ?? "").trim(),
          ),
        );
      if (!mapped.length) throw new Error("File Excel không có dòng dữ liệu.");
      if (mapped.length > 5000)
        throw new Error("Mỗi lần chỉ được import tối đa 5.000 dòng.");
      setFile(selected);
      setRows(mapped);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Không thể đọc file Excel.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function checkFile() {
    if (!file || !rows.length) return;
    setError("");
    try {
      setBusy(true);
      const response = await apiFetch<Preview>(
        `/api/${kind === "DEVICE" ? "devices" : "parts"}/import/preview`,
        {
          method: "POST",
          body: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
            autoCreateCatalog,
            duplicatePolicy,
            rows,
          }),
        },
      );
      setPreview(response);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Không thể kiểm tra file.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview) return;
    setError("");
    try {
      setBusy(true);
      const response = await apiFetch<Result>(
        `/api/${kind === "DEVICE" ? "devices" : "parts"}/import/commit`,
        {
          method: "POST",
          body: JSON.stringify({
            importSessionId: preview.importSessionId,
            atomic,
            importValidRows,
          }),
        },
      );
      setResult(response);
      onCompleted();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Không thể import dữ liệu.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function downloadErrors() {
    if (!preview) return;
    await exportExcel(
      `MauImport_${kind === "DEVICE" ? "ThietBi" : "LinhKien"}_Loi`,
      [
        {
          name: "DU_LIEU_LOI",
          rows: preview.rows
            .filter((row) => row.errors.length)
            .map((row) => ({
              ...toTemplateRow(kind, row.original ?? row.data),
              Lỗi: row.errors.join("; "),
            })),
        },
      ],
    );
  }

  const visibleRows =
    preview?.rows.filter((row) =>
      filter === "ALL"
        ? true
        : filter === "VALID"
          ? row.status === "VALID"
          : filter === "ERROR"
            ? row.status === "ERROR"
            : row.status === "WARNING",
    ) ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`IMPORT ${label.toUpperCase()} TỪ EXCEL`}
      description="Tải file mẫu, chọn file và kiểm tra trước khi ghi dữ liệu."
      className="max-w-6xl"
    >
      <div className="space-y-5">
        <section className="rounded-lg border p-4">
          <h3 className="font-semibold">1. Tải file Excel mẫu</h3>
          <Button
            className="mt-3"
            type="button"
            variant="outline"
            onClick={() => void downloadTemplate()}
          >
            <Download /> Tải mẫu {label}
          </Button>
        </section>

        <section className="rounded-lg border p-4">
          <h3 className="font-semibold">2. Chọn dữ liệu</h3>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(event) => void chooseFile(event.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void chooseFile(event.dataTransfer.files[0]);
            }}
            className="mt-3 flex w-full flex-col items-center rounded-lg border-2 border-dashed p-6 text-sm text-muted-foreground hover:border-primary"
          >
            <Upload className="mb-2 h-7 w-7" />
            Kéo file vào đây hoặc bấm để chọn (.xlsx, .xls; tối đa 10 MB)
          </button>
          {file && (
            <p className="mt-2 text-sm font-medium">
              {file.name} · {rows.length} dòng
            </p>
          )}
        </section>

        <section className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
          <h3 className="sm:col-span-3 font-semibold">3. Tùy chọn</h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoCreateCatalog}
              onChange={(event) => {
                setAutoCreateCatalog(event.target.checked);
                resetPreview();
              }}
            />
            Tự động tạo danh mục chưa tồn tại
          </label>
          <Select
            label="Dữ liệu trùng"
            value={duplicatePolicy}
            onChange={(event) => {
              setDuplicatePolicy(event.target.value);
              resetPreview();
            }}
            options={[
              { value: "ERROR", label: "Báo lỗi" },
              { value: "SKIP", label: "Bỏ qua" },
            ]}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={atomic}
              onChange={(event) => setAtomic(event.target.checked)}
            />
            Hủy toàn bộ nếu có lỗi khi ghi
          </label>
          <div className="sm:col-span-3">
            <Button
              type="button"
              disabled={!file || busy}
              onClick={() => void checkFile()}
            >
              {busy ? (
                <Loader2 className="animate-spin" />
              ) : (
                <FileSpreadsheet />
              )}
              Kiểm tra dữ liệu
            </Button>
          </div>
        </section>

        {error && (
          <p
            role="alert"
            className="rounded-md bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {result ? (
          <section className="rounded-lg border border-green-300 bg-green-50 p-5">
            <h3 className="flex items-center gap-2 font-semibold text-green-800">
              <CheckCircle2 /> IMPORT HOÀN TẤT
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <span>
                Tổng: <b>{result.totalRows}</b>
              </span>
              <span>
                Đã tạo: <b>{result.importedRows}</b>
              </span>
              <span>
                Bỏ qua: <b>{result.skippedRows}</b>
              </span>
              <span>
                Thất bại: <b>{result.failedRows}</b>
              </span>
            </div>
          </section>
        ) : preview ? (
          <section className="space-y-3 rounded-lg border p-4">
            <h3 className="font-semibold">4. Xem trước dữ liệu import</h3>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <span>
                Tổng: <b>{preview.totalRows}</b>
              </span>
              <span className="text-green-700">
                Hợp lệ: <b>{preview.validRows}</b>
              </span>
              <span className="text-amber-700">
                Cảnh báo: <b>{preview.warningRows}</b>
              </span>
              <span className="text-red-700">
                Có lỗi: <b>{preview.errorRows}</b>
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                ["ALL", "Tất cả"],
                ["VALID", "Hợp lệ"],
                ["ERROR", "Có lỗi"],
                ["WARNING", "Cảnh báo"],
              ].map(([value, textLabel]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={filter === value ? "default" : "outline"}
                  onClick={() => setFilter(value)}
                >
                  {textLabel}
                </Button>
              ))}
            </div>
            <div className="max-h-80 overflow-auto rounded-md border">
              <table className="w-full min-w-[800px] text-left text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="p-2">Dòng</th>
                    <th className="p-2">Tên</th>
                    <th className="p-2">Loại</th>
                    <th className="p-2">Model</th>
                    <th className="p-2">Mã/Serial</th>
                    <th className="p-2">Kho</th>
                    <th className="p-2">Kết quả</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.rowNumber} className="border-t align-top">
                      <td className="p-2">{row.rowNumber}</td>
                      <td className="p-2">{String(row.data.name ?? "—")}</td>
                      <td className="p-2">
                        {String(
                          row.data.deviceType ?? row.data.componentType ?? "—",
                        )}
                      </td>
                      <td className="p-2">{String(row.data.model ?? "—")}</td>
                      <td className="p-2">
                        {String(
                          row.data.assetCode ??
                            row.data.code ??
                            row.data.serial ??
                            "—",
                        )}
                      </td>
                      <td className="p-2">
                        {String(row.data.warehouse ?? "—")}
                      </td>
                      <td className="p-2">
                        {row.status === "ERROR" ? (
                          <span className="text-red-700">
                            <XCircle className="inline h-3 w-3" />{" "}
                            {row.errors.join(" ")}
                          </span>
                        ) : row.status === "WARNING" ? (
                          <span className="text-amber-700">
                            <AlertTriangle className="inline h-3 w-3" />{" "}
                            {row.warnings.join(" ")}
                          </span>
                        ) : (
                          <span className="text-green-700">
                            <CheckCircle2 className="inline h-3 w-3" /> Hợp lệ
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.errorRows > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={importValidRows}
                    onChange={(event) =>
                      setImportValidRows(event.target.checked)
                    }
                  />{" "}
                  Chỉ import các dòng hợp lệ
                </label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void downloadErrors()}
                >
                  <Download /> Tải file lỗi
                </Button>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Hủy
              </Button>
              <Button
                type="button"
                disabled={
                  busy ||
                  preview.validRows === 0 ||
                  (preview.errorRows > 0 && !importValidRows)
                }
                onClick={() => void commit()}
              >
                {busy ? (
                  <>
                    <Loader2 className="animate-spin" /> Đang import...
                  </>
                ) : (
                  <>Import {preview.validRows} dòng hợp lệ</>
                )}
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </Dialog>
  );
}
