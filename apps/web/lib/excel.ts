"use client";

export async function exportExcel(
  filename: string,
  sheets: Array<{ name: string; rows: Record<string, unknown>[] }>,
) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets)
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(sheet.rows),
      sheet.name.slice(0, 31),
    );
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
