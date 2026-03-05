import type { ClassifiedUser } from "./types";

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCSV(rows: ClassifiedUser[]): string {
  const headers: Array<keyof ClassifiedUser> = [
    "username",
    "displayName",
    "profileUrl",
    "lastActivityISO",
    "activitySource",
    "profileState",
    "enrichmentStatus",
    "lastCheckedAt",
    "category",
    "daysSince",
    "inactiveOver30",
    "unfollowedAt",
    "note"
  ];

  const escape = (value: unknown) => {
    const stringValue = String(value ?? "");
    return stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")
      ? `"${stringValue.replace(/"/g, '""')}"`
      : stringValue;
  };

  const lines = rows.map((row) => headers.map((header) => escape(row[header])).join(","));
  return [headers.join(","), ...lines].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
