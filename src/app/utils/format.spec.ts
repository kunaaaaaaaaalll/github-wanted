import { formatCount, formatExact } from './format';

describe('formatCount', () => {
  const cases: Array<[number, string]> = [
    [0, '0'],
    [999, '999'],
    [9_999, '9,999'],
    [10_000, '10K'],
    [12_480, '12.4K'],
    [999_999, '999.9K'],
    [1_000_000, '1M'],
    [1_250_000, '1.2M'],
    [3_400_000_000, '3.4B'],
  ];
  for (const [n, expected] of cases) {
    it(`${n} → ${expected}`, () => expect(formatCount(n)).toBe(expected));
  }
});

describe('formatExact', () => {
  it('adds thousands separators', () => expect(formatExact(1204331)).toBe('1,204,331'));
});
