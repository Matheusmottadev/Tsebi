export function isWithinChatBusinessHours(date: Date = new Date()): boolean {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  });

  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");
  const currentMinutes = hour * 60 + minute;

  return currentMinutes >= 9 * 60 && currentMinutes < 18 * 60;
}

