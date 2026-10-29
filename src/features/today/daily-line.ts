/**
 * The daily line (WI-073, ADR-028): a greeting for the part of the day and one short quotation,
 * chosen by the day and the part, so the same line stays all morning and a new one comes in the
 * afternoon. Every quotation is a real one from a public-domain source, attributed; none is
 * written by a model, and none pushes. Pure; covered by tests/daily-line.test.ts.
 */
export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';
export const DAY_PARTS: DayPart[] = [
  'morning',
  'afternoon',
  'evening',
  'night',
];

/** The part of the day by the owner's local hour: 5–11 morning, 12–16 afternoon, 17–20 evening. */
export function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

const GREETINGS: Record<DayPart, string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
  night: 'Good night',
};
/** "Good morning, Shams." from the owner's first name; "Good morning." without one. */
export function greeting(part: DayPart, name: string | null | undefined) {
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first ? `${GREETINGS[part]}, ${first}.` : `${GREETINGS[part]}.`;
}

export type Quote = { text: string; by: string };
/** Short public-domain quotations, by the part of the day they suit. */
export const QUOTES: Record<DayPart, Quote[]> = {
  morning: [
    { text: 'Begin at once to live.', by: 'Seneca' },
    { text: 'Well begun is half done.', by: 'Aristotle' },
    {
      text: 'A journey of a thousand miles begins with a single step.',
      by: 'Lao Tzu',
    },
    {
      text: 'First say to yourself what you would be; then do what you have to do.',
      by: 'Epictetus',
    },
    {
      text: 'Do what you can, with what you have, where you are.',
      by: 'Theodore Roosevelt',
    },
    { text: 'Little by little, one travels far.', by: 'Proverb' },
    { text: 'The morning hour has gold in its mouth.', by: 'German proverb' },
    { text: 'An inch of time is an inch of gold.', by: 'Chinese proverb' },
    {
      text: 'No longer talk about what a good man should be. Be one.',
      by: 'Marcus Aurelius',
    },
    { text: 'Each day provides its own gifts.', by: 'Martial' },
  ],
  afternoon: [
    {
      text: 'It does not matter how slowly you go, so long as you do not stop.',
      by: 'Confucius',
    },
    { text: 'Confine yourself to the present.', by: 'Marcus Aurelius' },
    { text: 'Drop by drop is the water pot filled.', by: 'Dhammapada' },
    { text: 'Practice is the best of all instructors.', by: 'Publilius Syrus' },
    { text: 'The best way out is always through.', by: 'Robert Frost' },
    {
      text: 'Patience and time do more than strength or passion.',
      by: 'Jean de La Fontaine',
    },
    {
      text: 'Nothing is so difficult that it cannot be found out by seeking.',
      by: 'Terence',
    },
    {
      text: 'One thing at a time, and all things in succession.',
      by: 'Josiah Gilbert Holland',
    },
    { text: 'Fall seven times, stand up eight.', by: 'Japanese proverb' },
    { text: 'Work is love made visible.', by: 'Kahlil Gibran' },
  ],
  evening: [
    { text: 'Count each separate day as a separate life.', by: 'Seneca' },
    { text: 'It is quality rather than quantity that matters.', by: 'Seneca' },
    { text: 'Enough is as good as a feast.', by: 'Proverb' },
    { text: 'Rest is not idleness.', by: 'John Lubbock' },
    {
      text: 'The evening of a well-spent life brings its lamps with it.',
      by: 'Joseph Joubert',
    },
    {
      text: 'In all things it is better to hope than to despair.',
      by: 'Goethe',
    },
    {
      text: 'He who knows that enough is enough will always have enough.',
      by: 'Lao Tzu',
    },
    { text: 'Still waters run deep.', by: 'Proverb' },
    {
      text: 'I laugh when I hear that the fish in the water is thirsty.',
      by: 'Kabir',
    },
    {
      text: 'The day is done, and the darkness falls from the wings of Night.',
      by: 'Longfellow',
    },
  ],
  night: [
    { text: 'Finish each day and be done with it.', by: 'Emerson' },
    { text: 'The night is the mother of counsel.', by: 'Proverb' },
    { text: 'Tomorrow is a new day.', by: 'Proverb' },
    { text: 'Retire into yourself.', by: 'Marcus Aurelius' },
    { text: 'We are such stuff as dreams are made on.', by: 'Shakespeare' },
    { text: 'Nothing is permanent but change.', by: 'Heraclitus' },
    {
      text: 'Hope is the pillar that holds up the world.',
      by: 'Pliny the Elder',
    },
    { text: 'What is done is done.', by: 'Shakespeare' },
    { text: 'Rest and be thankful.', by: 'Wordsworth' },
    {
      text: 'A good laugh and a long sleep are the best cures.',
      by: 'Irish proverb',
    },
  ],
};

/** The quotation for a day and a part; `offset` steps to the next one ("Another"). */
export function dailyQuote(day: string, part: DayPart, offset = 0): Quote {
  const pool = QUOTES[part];
  let n = 0;
  for (const c of `${day}:${part}`) n = (n * 31 + c.charCodeAt(0)) % 1_000_003;
  return pool[(n + offset) % pool.length];
}
