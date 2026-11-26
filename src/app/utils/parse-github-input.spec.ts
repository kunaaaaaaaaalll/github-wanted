import { parseGithubInput } from './parse-github-input';

describe('parseGithubInput', () => {
  const accepts: Array<[string, string]> = [
    ['torvalds', 'torvalds'],
    ['@torvalds', 'torvalds'],
    ['  torvalds \n', 'torvalds'],
    ['github.com/torvalds', 'torvalds'],
    ['https://github.com/torvalds', 'torvalds'],
    ['http://www.github.com/torvalds/', 'torvalds'],
    ['https://github.com/torvalds?tab=repositories', 'torvalds'],
    ['https://github.com/torvalds#top', 'torvalds'],
    ['https://github.com/torvalds/linux', 'torvalds'],
    ['https://github.com/orgs/angular/people', 'angular'],
    ['GitHub.com/Sindre-Sorhus', 'Sindre-Sorhus'],
    ['a', 'a'],
    ['a'.repeat(39), 'a'.repeat(39)],
  ];
  for (const [input, expected] of accepts) {
    it(`accepts ${JSON.stringify(input)}`, () => {
      expect(parseGithubInput(input)).toEqual({ ok: true, username: expected });
    });
  }

  it('reports empty input separately', () => {
    expect(parseGithubInput('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  const rejects = [
    'https://gitlab.com/torvalds',
    'https://github.com/',
    'https://github.com/settings',
    'github.com/explore',
    '-torvalds',
    'torvalds-',
    'tor valds',
    'tor_valds',
    'a'.repeat(40),
    '@',
    'https://',
  ];
  for (const input of rejects) {
    it(`rejects ${JSON.stringify(input)}`, () => {
      expect(parseGithubInput(input)).toEqual({ ok: false, reason: 'invalid' });
    });
  }
});
