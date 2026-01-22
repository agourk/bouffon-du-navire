export function parseTimeInMinutes(timeStr: string): number | null {
  const [hours, minutes] = timeStr.split(":").map(Number);

  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 24 || minutes < 0 || minutes >= 60) {
    return null;
  }

  return hours * 60 + minutes;
}

/**
 * Converts minutes since midnight to HH:MM format.
 * @param minutesOfDay Total minutes since midnight (0-1439)
 * @returns Formatted time string in HH:MM format
 */
export function minutesToHHMM(minutesOfDay: number): string {
  const hours = Math.floor(minutesOfDay / 60);
  const minutes = minutesOfDay % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
