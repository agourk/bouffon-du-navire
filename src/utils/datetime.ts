export function parseTimeInMinutes(timeStr: string): number | null {
  const [hours, minutes] = timeStr.split(":").map(Number);

  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 24 || minutes < 0 || minutes >= 60) {
    return null;
  }

  return hours * 60 + minutes;
}
