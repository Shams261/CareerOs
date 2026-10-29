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
/**
 * Short quotations by the part of the day they suit (WI-073, WI-074): forty each, every one
 * from a public-domain source or a proverb, with its author. Mornings and afternoons carry the
 * energetic ones, evenings and nights the calm ones; none shames or scolds.
 */
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
    { text: 'Well done is better than well said.', by: 'Benjamin Franklin' },
    {
      text: 'Energy and persistence conquer all things.',
      by: 'Benjamin Franklin',
    },
    {
      text: 'Do the thing and you will have the power.',
      by: 'Ralph Waldo Emerson',
    },
    {
      text: 'Go confidently in the direction of your dreams.',
      by: 'Henry David Thoreau',
    },
    {
      text: 'Genius is one percent inspiration and ninety-nine percent perspiration.',
      by: 'Thomas Edison',
    },
    { text: 'What you are will show in what you do.', by: 'Thomas Edison' },
    {
      text: 'Courage is resistance to fear, mastery of fear, not absence of fear.',
      by: 'Mark Twain',
    },
    {
      text: 'We are what we repeatedly do. Excellence, then, is a habit.',
      by: 'Will Durant, on Aristotle',
    },
    { text: 'Dare to be wise. Begin!', by: 'Horace' },
    {
      text: 'Keep your eyes on the stars, and your feet on the ground.',
      by: 'Theodore Roosevelt',
    },
    {
      text: 'Seize the day; trust tomorrow as little as you may.',
      by: 'Horace',
    },
    {
      text: 'The beginning is the most important part of the work.',
      by: 'Plato',
    },
    {
      text: 'Difficulties strengthen the mind, as labour does the body.',
      by: 'Seneca',
    },
    { text: 'Great acts are made up of small deeds.', by: 'Lao Tzu' },
    { text: 'He who has begun has half done.', by: 'Horace' },
    { text: 'Light tomorrow with today.', by: 'Elizabeth Barrett Browning' },
    { text: 'Every artist was first an amateur.', by: 'Ralph Waldo Emerson' },
    { text: 'Action is eloquence.', by: 'Shakespeare' },
    { text: 'One today is worth two tomorrows.', by: 'Benjamin Franklin' },
    { text: 'Whatever you can do, or dream you can, begin it.', by: 'Goethe' },
    { text: 'Boldness has genius, power and magic in it.', by: 'Goethe' },
    {
      text: 'Knowing is not enough; we must apply. Willing is not enough; we must do.',
      by: 'Goethe',
    },
    { text: 'Dig the well before you are thirsty.', by: 'Chinese proverb' },
    {
      text: 'Strength does not come from physical capacity. It comes from an indomitable will.',
      by: 'Mahatma Gandhi',
    },
    {
      text: 'The secret of success is constancy to purpose.',
      by: 'Benjamin Disraeli',
    },
    { text: 'Fortune favours the bold.', by: 'Virgil' },
    { text: 'Make haste slowly.', by: 'Augustus' },
    {
      text: 'Never put off till tomorrow what you can do today.',
      by: 'Thomas Jefferson',
    },
    {
      text: 'Early to bed and early to rise makes a man healthy, wealthy, and wise.',
      by: 'Benjamin Franklin',
    },
    {
      text: 'What is not started today is never finished tomorrow.',
      by: 'Goethe',
    },
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
    { text: 'Diligence is the mother of good luck.', by: 'Benjamin Franklin' },
    {
      text: 'The man who moves a mountain begins by carrying away small stones.',
      by: 'Confucius',
    },
    { text: 'Genius is eternal patience.', by: 'Michelangelo' },
    {
      text: 'Our greatest glory is not in never falling, but in rising every time we fall.',
      by: 'Confucius',
    },
    { text: 'Many strokes overthrow the tallest oaks.', by: 'John Lyly' },
    { text: 'Little strokes fell great oaks.', by: 'Benjamin Franklin' },
    {
      text: 'Concentrate all your thoughts upon the work at hand.',
      by: 'Alexander Graham Bell',
    },
    {
      text: "The sun's rays do not burn until brought to a focus.",
      by: 'Alexander Graham Bell',
    },
    { text: 'Strike while the iron is hot.', by: 'Proverb' },
    { text: 'Practice makes perfect.', by: 'Proverb' },
    { text: 'Nothing is impossible to a willing heart.', by: 'John Heywood' },
    {
      text: 'Patience is bitter, but its fruit is sweet.',
      by: 'Jean-Jacques Rousseau',
    },
    {
      text: 'He that can have patience can have what he will.',
      by: 'Benjamin Franklin',
    },
    {
      text: 'Quality is never an accident; it is always the result of intelligent effort.',
      by: 'John Ruskin',
    },
    { text: 'When one door closes, another opens.', by: 'Proverb' },
    { text: 'Step by step the ladder is ascended.', by: 'George Herbert' },
    { text: 'There is no substitute for hard work.', by: 'Thomas Edison' },
    { text: 'Without labour nothing prospers.', by: 'Sophocles' },
    {
      text: 'The reward of a thing well done is to have done it.',
      by: 'Ralph Waldo Emerson',
    },
    {
      text: 'Whatever is worth doing at all is worth doing well.',
      by: 'Lord Chesterfield',
    },
    {
      text: 'Let us then be up and doing, with a heart for any fate.',
      by: 'Henry Wadsworth Longfellow',
    },
    {
      text: 'By learning you will teach; by teaching you will learn.',
      by: 'Latin proverb',
    },
    {
      text: 'Tell me and I forget. Teach me and I remember. Involve me and I learn.',
      by: 'Chinese proverb',
    },
    { text: 'Experience is the teacher of all things.', by: 'Julius Caesar' },
    {
      text: 'What we have to learn to do, we learn by doing.',
      by: 'Aristotle',
    },
    { text: 'Trees that are slow to grow bear the best fruit.', by: 'Molière' },
    {
      text: 'Rivers know this: there is no hurry. We shall get there some day.',
      by: 'A. A. Milne',
    },
    {
      text: 'You cannot plough a field by turning it over in your mind.',
      by: 'Proverb',
    },
    { text: 'Measure twice, cut once.', by: 'Proverb' },
    {
      text: 'The impediment to action advances action.',
      by: 'Marcus Aurelius',
    },
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
      by: 'Henry Wadsworth Longfellow',
    },
    { text: 'Look back, and smile on perils past.', by: 'Walter Scott' },
    { text: 'The unexamined life is not worth living.', by: 'Socrates' },
    {
      text: 'Be content with what you have; rejoice in the way things are.',
      by: 'Lao Tzu',
    },
    { text: 'Wisdom begins in wonder.', by: 'Socrates' },
    {
      text: 'Gratitude is the memory of the heart.',
      by: 'Jean-Baptiste Massieu',
    },
    {
      text: 'Turn your face to the sun and the shadows fall behind you.',
      by: 'Maori proverb',
    },
    { text: 'Silence is a source of great strength.', by: 'Lao Tzu' },
    {
      text: 'The soul becomes dyed with the colour of its thoughts.',
      by: 'Marcus Aurelius',
    },
    {
      text: 'Very little is needed to make a happy life.',
      by: 'Marcus Aurelius',
    },
    { text: 'He is richest who is content with the least.', by: 'Socrates' },
    {
      text: 'A ship in harbour is safe, but that is not what ships are for.',
      by: 'John A. Shedd',
    },
    {
      text: 'A room without books is like a body without a soul.',
      by: 'Cicero',
    },
    {
      text: 'The reading of all good books is like a conversation with the finest minds.',
      by: 'René Descartes',
    },
    {
      text: 'Reflect upon your present blessings, of which every man has many.',
      by: 'Charles Dickens',
    },
    {
      text: 'Nature does not hurry, yet everything is accomplished.',
      by: 'Lao Tzu',
    },
    { text: 'Peace comes from within. Do not seek it without.', by: 'Buddha' },
    { text: 'Where there is love there is life.', by: 'Mahatma Gandhi' },
    { text: 'The sun also rises.', by: 'Ecclesiastes' },
    { text: 'Happiness depends upon ourselves.', by: 'Aristotle' },
    { text: 'Know thyself.', by: 'Delphic maxim' },
    { text: 'After a storm comes a calm.', by: 'Proverb' },
    {
      text: 'The greatest wealth is to live content with little.',
      by: 'Plato',
    },
    {
      text: 'Adopt the pace of nature: her secret is patience.',
      by: 'Ralph Waldo Emerson',
    },
    {
      text: 'Nothing can bring you peace but yourself.',
      by: 'Ralph Waldo Emerson',
    },
    { text: 'The evening praises the day.', by: 'German proverb' },
    { text: 'A quiet mind cureth all.', by: 'Robert Burton' },
    {
      text: 'Content makes poor men rich; discontent makes rich men poor.',
      by: 'Benjamin Franklin',
    },
    { text: 'Time is the wisest counsellor of all.', by: 'Pericles' },
    {
      text: 'Little things console us because little things afflict us.',
      by: 'Blaise Pascal',
    },
    { text: 'Well done is twice done.', by: 'Proverb' },
  ],
  night: [
    { text: 'Finish each day and be done with it.', by: 'Ralph Waldo Emerson' },
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
    { text: 'Rest and be thankful.', by: 'William Wordsworth' },
    {
      text: 'A good laugh and a long sleep are the best cures.',
      by: 'Irish proverb',
    },
    {
      text: 'Sleep is the golden chain that ties health and our bodies together.',
      by: 'Thomas Dekker',
    },
    {
      text: 'Even the darkest night will end and the sun will rise.',
      by: 'Victor Hugo',
    },
    { text: 'The darkest hour is just before the dawn.', by: 'Proverb' },
    {
      text: 'There is a time for many words, and there is also a time for sleep.',
      by: 'Homer',
    },
    { text: "Tired nature's sweet restorer, balmy sleep.", by: 'Edward Young' },
    {
      text: 'O sleep! it is a gentle thing, beloved from pole to pole.',
      by: 'Samuel Taylor Coleridge',
    },
    {
      text: 'Good night, good night! Parting is such sweet sorrow.',
      by: 'Shakespeare',
    },
    {
      text: "One hour's sleep before midnight is worth two after.",
      by: 'Proverb',
    },
    {
      text: 'Write it on your heart that every day is the best day in the year.',
      by: 'Ralph Waldo Emerson',
    },
    { text: 'Blessings on him who invented sleep.', by: 'Miguel de Cervantes' },
    {
      text: 'Dreams are the touchstones of our characters.',
      by: 'Henry David Thoreau',
    },
    { text: 'Hope is the thing with feathers.', by: 'Emily Dickinson' },
    { text: 'The night is far spent, the day is at hand.', by: 'Romans 13:12' },
    {
      text: 'Sleep that knits up the ravelled sleeve of care.',
      by: 'Shakespeare',
    },
    {
      text: 'Let us be grateful to people who make us happy.',
      by: 'Marcel Proust',
    },
    {
      text: 'All shall be well, and all manner of thing shall be well.',
      by: 'Julian of Norwich',
    },
    {
      text: 'The best thinking has been done in solitude.',
      by: 'Thomas Edison',
    },
    {
      text: 'In quietness and in confidence shall be your strength.',
      by: 'Isaiah 30:15',
    },
    { text: 'Let not the sun go down upon your wrath.', by: 'Ephesians 4:26' },
    { text: 'A well-spent day brings happy sleep.', by: 'Leonardo da Vinci' },
    {
      text: 'I have loved the stars too fondly to be fearful of the night.',
      by: 'Sarah Williams',
    },
    { text: 'The sleep of a labouring man is sweet.', by: 'Ecclesiastes 5:12' },
    {
      text: 'Take rest; a field that has rested gives a bountiful crop.',
      by: 'Ovid',
    },
    {
      text: 'Silently, one by one, in the infinite meadows of heaven, blossomed the lovely stars.',
      by: 'Henry Wadsworth Longfellow',
    },
    {
      text: 'Each day is a little life; every waking and rising a little birth.',
      by: 'Arthur Schopenhauer',
    },
    { text: 'To sleep, perchance to dream.', by: 'Shakespeare' },
    {
      text: 'Night brings our troubles to the light, rather than banishes them.',
      by: 'Seneca',
    },
    { text: 'Sleep is the best meditation.', by: 'Tibetan proverb' },
    {
      text: "Day is over, night has come. Today is gone, what's done is done.",
      by: 'Proverb',
    },
    { text: 'Every night is followed by a morning.', by: 'Proverb' },
  ],
};

/** The clock in the band, "19:42" in the owner's zone (24-hour, like every clock in Silsila). */
export function clockLabel(now: number | Date, zone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
}

/** The quotation for a day and a part; `offset` steps to the next one ("Another"). */
export function dailyQuote(day: string, part: DayPart, offset = 0): Quote {
  const pool = QUOTES[part];
  let n = 0;
  for (const c of `${day}:${part}`) n = (n * 31 + c.charCodeAt(0)) % 1_000_003;
  return pool[(n + offset) % pool.length];
}
