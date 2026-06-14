import { mbtiEventDestinationCandidates } from './agentInputs';

describe('MBTI event participant movement destinations', () => {
  test('uses the event staging point before facility and fallback destinations', () => {
    const destinations = mbtiEventDestinationCandidates('shop', { x: 43, y: 27 });

    expect(destinations[0]).toEqual({ x: 43, y: 27 });
    expect(destinations).toContainEqual({ x: 20, y: 23 });
  });

  test('falls back to the square when the event location is unknown', () => {
    expect(mbtiEventDestinationCandidates('unknown')).toContainEqual({ x: 20, y: 23 });
  });
});
