import { minutesToHHMM, parseTimeInMinutes } from './datetime';

describe('datetime utilities', () => {
  describe('parseTimeInMinutes', () => {
    it('should parse valid time strings', () => {
      expect(parseTimeInMinutes('00:00')).toBe(0);
      expect(parseTimeInMinutes('09:30')).toBe(570);
      expect(parseTimeInMinutes('12:00')).toBe(720);
      expect(parseTimeInMinutes('23:59')).toBe(1439);
    });

    it('should handle midnight as 24:00', () => {
      expect(parseTimeInMinutes('24:00')).toBe(1440);
    });

    it('should parse times without leading zeros', () => {
      expect(parseTimeInMinutes('9:30')).toBe(570);
      expect(parseTimeInMinutes('09:3')).toBe(9 * 60 + 3);
    });

    it('should return null for invalid formats', () => {
      expect(parseTimeInMinutes('invalid')).toBeNull();
      expect(parseTimeInMinutes('25:00')).toBeNull();
      expect(parseTimeInMinutes('12:60')).toBeNull();
      expect(parseTimeInMinutes('-1:00')).toBeNull();
      expect(parseTimeInMinutes('12:-1')).toBeNull();
    });

    it('should return null for non-numeric values', () => {
      expect(parseTimeInMinutes('ab:cd')).toBeNull();
      expect(parseTimeInMinutes('12:xy')).toBeNull();
    });
  });

  describe('minutesToHHMM', () => {
    it('should format minutes to HH:MM', () => {
      expect(minutesToHHMM(0)).toBe('00:00');
      expect(minutesToHHMM(570)).toBe('09:30');
      expect(minutesToHHMM(720)).toBe('12:00');
      expect(minutesToHHMM(1439)).toBe('23:59');
    });

    it('should pad single digits with zeros', () => {
      expect(minutesToHHMM(5)).toBe('00:05');
      expect(minutesToHHMM(65)).toBe('01:05');
      expect(minutesToHHMM(125)).toBe('02:05');
    });

    it('should handle edge cases', () => {
      expect(minutesToHHMM(1)).toBe('00:01');
      expect(minutesToHHMM(59)).toBe('00:59');
      expect(minutesToHHMM(60)).toBe('01:00');
      expect(minutesToHHMM(1380)).toBe('23:00');
    });
  });

  describe('parseTimeInMinutes and minutesToHHMM are inverse operations', () => {
    it('should round-trip correctly', () => {
      const testCases = ['00:00', '09:30', '12:00', '18:45', '23:59'];

      testCases.forEach((timeStr) => {
        const minutes = parseTimeInMinutes(timeStr);
        expect(minutes).not.toBeNull();
        expect(minutesToHHMM(minutes!)).toBe(timeStr);
      });
    });
  });
});
