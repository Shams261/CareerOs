/**
 * Researched interview material (WI-012, October 2026): the formats SDE II loops use, the
 * per-company loops, the behavioural frameworks and a de-duplicated question bank. Public
 * research only, nothing personal. Every item names its sources; official pages are marked,
 * prep-site syntheses and Glassdoor reports are marked as such so the owner can judge them.
 */
export type Ref = [label: string, url: string, kind?: string];
export type ResearchItem = {
  slug: string;
  title: string;
  kind?: 'CONCEPT' | 'QUESTION';
  priority?: 1 | 2 | 3;
  estimateMinutes?: number;
  scope: string;
  checkpoint?: string;
  notes?: string;
  references?: Ref[];
};
export type ResearchSection = { name: string; items: ResearchItem[] };

const official = (label: string, url: string): Ref => [label, url, 'official'];
const prep = (label: string, url: string): Ref => [label, url, 'prep site'];
const anecdotal = (label: string, url: string): Ref => [
  label,
  url,
  'anecdotal',
];

/* ------------------------------------------------------------ interview formats (technical roadmap) */

export const INTERVIEW_FORMATS: ResearchSection = {
  name: 'Interview formats you will meet (2025–2026)',
  items: [
    {
      slug: 'format-online-assessment',
      title: 'Online assessment',
      priority: 1,
      scope:
        'Timed, unproctored or lightly proctored coding in the browser. Amazon SDE II: 90 minutes of coding (two problems) plus 20 minutes of design scenarios and an 8-minute work-style survey (official). Microsoft uses Codility-style assessments (reported). Assessed: correctness on hidden tests, time management, reading the brief.',
      checkpoint:
        'Two LeetCode mediums in 70 minutes with tests passing, twice in a row, in JavaScript without an IDE.',
      references: [
        official(
          'Amazon SDE II interview prep',
          'https://amazon.jobs/content/en/how-we-hire/sde-ii-interview-prep',
        ),
        prep(
          'InterviewQuery Microsoft guide',
          'https://www.interviewquery.com/guides/microsoft-software-engineer',
        ),
      ],
    },
    {
      slug: 'format-coding-screen',
      title: 'Coding phone screen',
      priority: 1,
      scope:
        '45–60 minutes with an engineer in CoderPad or a doc. Either one multi-part practical problem (Stripe, Wealthsimple) or one or two LeetCode-medium questions (Google, Shopify). Assessed: working code, narration, edge cases, how you take hints.',
      checkpoint:
        'Can solve a multi-part practical problem while narrating, with a test for each part, in 40 minutes.',
      references: [
        prep(
          'interviewing.io Stripe',
          'https://interviewing.io/stripe-interview-questions',
        ),
        prep(
          'DesignGurus Wealthsimple',
          'https://www.designgurus.io/answers/detail/what-is-the-wealthsimple-interview-process-like-round-by-round',
        ),
        prep(
          'HelloInterview Google L4',
          'https://www.hellointerview.com/guides/google/l4',
        ),
      ],
    },
    {
      slug: 'format-leetcode-onsite',
      title: 'LeetCode-style onsite coding',
      priority: 1,
      scope:
        'Google: two or three rounds, medium to hard, often combining patterns, code cannot be run. Meta: one classic round, 35 minutes, two problems. Amazon: syntactically correct code, no pseudo code (official). Microsoft: easy-to-medium. Assessed: pattern recognition, clean code, complexity analysis, communication.',
      checkpoint:
        'Recognise the pattern inside 30 seconds for any core problem in the DSA roadmap and code it without running it.',
      references: [
        official(
          'Meta interview prep',
          'https://www.metacareers.com/blog/preparing-for-your-software-engineering-interview-at-meta/',
        ),
        official(
          'Amazon SDE II interview prep',
          'https://amazon.jobs/content/en/how-we-hire/sde-ii-interview-prep',
        ),
        prep(
          'ex-Googler 2026 guide',
          'https://dev.to/alex_hunter_44f4c9ed6671e/google-coding-interview-the-complete-2026-guide-from-an-ex-googler-3185',
        ),
      ],
    },
    {
      slug: 'format-practical-coding',
      title: 'Practical "build a feature" coding and pair programming',
      priority: 1,
      scope:
        'Build something small and realistic, iteratively, with the interviewer as a pair. Stripe general coding (IAM, log redaction, rate limiter); Shopify 75–90 minute iterative app; Wealthsimple and Clio pair programming. Assessed: structure, tests, naming, how you handle changing requirements, how you use docs.',
      checkpoint:
        'Finished every practical task in the DSA roadmap\'s "Practical coding" section with tests, each under 60 minutes.',
      references: [
        prep(
          'interviewing.io Stripe',
          'https://interviewing.io/stripe-interview-questions',
        ),
        prep(
          'interviewing.io Shopify',
          'https://interviewing.io/shopify-interview-questions',
        ),
        anecdotal(
          'Glassdoor Wealthsimple',
          'https://www.glassdoor.com/Interview/Wealthsimple-Software-Engineer-Interview-Questions-EI_IE908271.0,12_KO13,30.htm',
        ),
      ],
    },
    {
      slug: 'format-bug-squash',
      title: 'Bug squash: debugging in an unfamiliar repository',
      priority: 1,
      scope:
        "A real-looking codebase with a failing test or a reported bug. Stripe Bug Bash; Google code-comprehension pilot (May 2026); phase one of Meta's AI-enabled round. Method: run the failing test first, orient from the stack trace, one hypothesis at a time, narrate, minimal fix, re-run, say what else might break.",
      checkpoint:
        'Found and fixed a planted bug in an unfamiliar 2k-line repo in under 25 minutes, three times, narrating throughout.',
      references: [
        prep(
          'leonstaff Stripe bug squash and integration guide (Aug 2026)',
          'https://leonstaff.com/blogs/stripe-technical-interview-bug-squash-integration-guide/',
        ),
        anecdotal(
          'LeetCode discuss: Stripe new grad 2026',
          'https://leetcode.com/discuss/post/7566910/',
        ),
      ],
    },
    {
      slug: 'format-integration',
      title: 'Integration / API round',
      priority: 1,
      scope:
        'Integrate with a documented third-party API from a starter repo (Stripe, below Staff). Read the docs first; pagination (cursor and offset); idempotency keys on writes; 429 and Retry-After with capped backoff; defensive parsing; a small end-to-end flow at the end.',
      checkpoint:
        'Completed the "Retry with bounded backoff, idempotency keys, pagination" task against a fake API with tests.',
      references: [
        prep(
          'leonstaff Stripe integration guide',
          'https://leonstaff.com/blogs/stripe-technical-interview-bug-squash-integration-guide/',
        ),
      ],
    },
    {
      slug: 'format-code-review',
      title: 'Code review round',
      priority: 1,
      scope:
        'Review a pull request live or in a doc. Airbnb scores it with a rubric; Elastic and GitHub run it; Google engineering managers debug in a doc. Method: restate the intent, read once end to end, rank findings by impact (correctness → design → tests → style), say why and give the fix, name the failing test, separate blockers from nits, kind and specific tone.',
      checkpoint:
        'Reviewed three generated PRs with planted issues and found every correctness issue first, with a fix and a test named for each.',
      references: [
        prep(
          'Interview formats research summary (WI-012 handoff)',
          'https://github.com/Shams261/CareerOs/blob/main/docs/WI-012-HANDOFF.md',
        ),
      ],
    },
    {
      slug: 'format-take-home',
      title: 'Take-home',
      priority: 3,
      scope:
        '1Password 48 hours; Cohere and Notion 4–8 hours then a pairing session on it; Vercel 3–5 hours (all anecdotal). Assessed: README, tests, structure, trade-off notes, honesty about what is unfinished.',
      checkpoint:
        'A reusable starter (lint, tests, README template) ready so a take-home starts at the problem, not the setup.',
      references: [
        anecdotal(
          'Prep-site and Glassdoor syntheses, 2025–2026',
          'https://www.glassdoor.com/Interview/1Password-Interview-Questions-E1056627.htm',
        ),
      ],
    },
    {
      slug: 'format-system-design',
      title: 'System design at mid-level',
      priority: 1,
      scope:
        'Amazon: at least one round in the SDE II loop. Stripe: API-contract focus (ledger, webhooks, idempotency). Shopify: design layered onto the coding round. Wealthsimple: "Bring Your Own System", you present a system you built. Google L4: none. Microsoft: from about L61. The Hello Interview delivery framework covers all of them.',
      checkpoint:
        'Can design a payments ledger with webhooks and idempotent retries in 35 minutes, and present one of your own systems in 15.',
      references: [
        official(
          'Amazon SDE II interview prep',
          'https://amazon.jobs/content/en/how-we-hire/sde-ii-interview-prep',
        ),
        prep(
          'aced.io Stripe guide',
          'https://www.aced.io/guides/stripe-software-engineer-interview',
        ),
        prep(
          'DesignGurus Wealthsimple',
          'https://www.designgurus.io/answers/detail/what-is-the-wealthsimple-interview-process-like-round-by-round',
        ),
      ],
    },
    {
      slug: 'format-ai-assisted',
      title: 'AI-assisted coding round versus AI banned',
      priority: 1,
      scope:
        'Allowed: Canva (official since June 2025); Shopify (judged on reviewing and verifying AI output; endless re-prompting is marked down); Meta since October 2025 (60 minutes, multi-file bug fix → implement → optimise with a chat-only assistant, full-screen sharing); a Google Gemini-allowed pilot. Banned: Amazon, Stripe, standard Google rounds. Assessed when allowed: whether you verify, test and correct what the assistant produces.',
      checkpoint:
        'Did one 60-minute session with an assistant where every suggestion was checked by a test before accepting it; can say what the assistant got wrong.',
      references: [
        official(
          'Canva engineering: AI in coding interviews',
          'https://www.canva.dev/blog/engineering/yes-you-can-use-ai-in-our-interviews/',
        ),
        prep(
          'interviewing.io Shopify',
          'https://interviewing.io/shopify-interview-questions',
        ),
        prep(
          'HelloInterview Meta E5',
          'https://www.hellointerview.com/guides/meta/e5',
        ),
      ],
    },
    {
      slug: 'format-project-deep-dive',
      title: 'Resume and project deep dive',
      priority: 1,
      scope:
        'Shopify Technical Deep Dive; Wealthsimple Bring Your Own System; Faire; Stripe only at Staff. 15–20 minutes of narrative then 30–40 minutes of probing: ownership one level below the story, internals of every technology named, metrics with honest ranges, alternatives and where the design breaks, production failures, what you would change. The probes are in the Behavioural roadmap.',
      checkpoint:
        'Presented 1V-01 and PROJ-03 to a mock interviewer and answered every probe in the "Project deep dive probes" section without notes.',
      references: [
        prep(
          'interviewing.io Shopify',
          'https://interviewing.io/shopify-interview-questions',
        ),
        prep(
          'DesignGurus Wealthsimple',
          'https://www.designgurus.io/answers/detail/what-is-the-wealthsimple-interview-process-like-round-by-round',
        ),
      ],
    },
    {
      slug: 'format-behavioural',
      title: 'Behavioural and values rounds',
      priority: 1,
      scope:
        'Amazon: two or three Leadership Principle questions per interviewer with 3–8 follow-ups and a bar raiser. Stripe: Operating Principles with the hiring manager. Google: Googleyness and Leadership. Shopify: Life Story with a recruiter (chronological, not STAR). Microsoft: growth mindset probed in every round. Wealthsimple: values interview. Full frameworks and the question bank are in the Behavioural roadmap.',
      checkpoint:
        'Eight stories rehearsed to 90 seconds each and mapped to every competency in the question bank.',
      references: [
        official(
          'Amazon Leadership Principles',
          'https://www.amazon.jobs/content/en/our-workplace/leadership-principles',
        ),
        official(
          'Stripe operating principles',
          'https://stripe.com/jobs/culture',
        ),
      ],
    },
    {
      slug: 'company-loops',
      title: 'Per-company loops (reported, October 2026)',
      priority: 2,
      scope:
        "What each target company's loop looked like in 2025–2026 reports. Stripe, Shopify and Wealthsimple publish no process page, so these are prep-site and candidate reports; confirm the exact loop with the recruiter every time.",
      checkpoint: "Read once; re-read before each company's first call.",
      notes: [
        'Stripe: recruiter → 60-minute practical coding screen (multi-part, no LeetCode) → onsite of general coding, bug bash, integration, system design (API contracts) and a hiring-manager behavioural on the operating principles. AI prohibited; docs and a debugger allowed. One Glassdoor mention of an AI-assisted round conflicts.',
        'Shopify: recruiter Life Story (chronological) → AI-assisted coding screen in your own IDE (1 hour) → onsite with a two-hour AI coding round, a technical deep dive on your own work and a craft / values conversation. Problems are not algorithmically hard; design and verification matter.',
        'Wealthsimple: recruiter → CoderPad screen → Bring Your Own System (present a system you built) → pair programming on a multi-level problem → values interview. OOP structure is judged. Take-homes reported only for co-op roles.',
        'Amazon SDE II (official): online assessment (90 min coding, 20 min design scenarios, 8 min work style) → phone screen → loop of four 55-minute rounds (two coding, one design, one behavioural-heavy), Leadership Principles in every round, a bar raiser in one.',
        'Google L4: one phone screen → four or five onsite rounds: two or three coding, one Googleyness and Leadership; no system design at L4. Code cannot be run; no AI in standard rounds; a Gemini-allowed pilot exists.',
        'Meta E5: screen → onsite with two coding rounds (35 minutes, two problems each), one system design, one behavioural; one coding round is now AI-enabled (60 minutes, multi-file). DP is discouraged by interviewers.',
        'Microsoft (about L61–62): Codility OA (one easy, one hard) → screen → four or five onsite rounds, easy-to-medium coding, design from about L61, growth-mindset questions throughout (small-sample reports).',
        'Clio, Faire, 1Password, Cohere, Notion, Vercel, Linear: screens plus a take-home or a pairing session, then a project deep dive and a values conversation (anecdotal, small samples; 1Password 48-hour take-home; Cohere 4–8 hours then pair on it; Notion similar; Vercel 3–5 hours).',
      ].join('\n\n'),
      references: [
        official(
          'Amazon SDE II interview prep',
          'https://amazon.jobs/content/en/how-we-hire/sde-ii-interview-prep',
        ),
        official(
          'Meta interview prep',
          'https://www.metacareers.com/blog/preparing-for-your-software-engineering-interview-at-meta/',
        ),
        prep(
          'HelloInterview Google L4',
          'https://www.hellointerview.com/guides/google/l4',
        ),
        prep(
          'HelloInterview Meta E5',
          'https://www.hellointerview.com/guides/meta/e5',
        ),
        prep(
          'HelloInterview Microsoft senior',
          'https://www.hellointerview.com/guides/microsoft/senior',
        ),
        prep(
          'interviewing.io Stripe',
          'https://interviewing.io/stripe-interview-questions',
        ),
        prep(
          'interviewing.io Shopify',
          'https://interviewing.io/shopify-interview-questions',
        ),
        prep(
          'DesignGurus Wealthsimple',
          'https://www.designgurus.io/answers/detail/what-is-the-wealthsimple-interview-process-like-round-by-round',
        ),
        anecdotal(
          'Glassdoor Shopify',
          'https://www.glassdoor.com/Interview/Shopify-Interview-Questions-E675933.htm',
        ),
      ],
    },
  ],
};

/* ------------------------------------------------------------ behavioural frameworks per company */

type Framework = {
  company: string;
  slug: string;
  framework: string;
  checkpoint: string;
  references: Ref[];
  questions: string[];
};

const FRAMEWORKS: Framework[] = [
  {
    company: 'Amazon',
    slug: 'amazon',
    framework:
      'Sixteen Leadership Principles (official). SDE II loops lean on Ownership, Deliver Results, Dive Deep, Customer Obsession, Bias for Action, Earn Trust, Have Backbone; Disagree and Commit, and Insist on the Highest Standards. Each interviewer owns two or three principles and asks one question per principle with three to eight follow-ups ("what data did you use", "who disagreed", "what changed"). The bar raiser is a trained interviewer from another team. Answers are STAR, "I" not "we", with numbers.',
    checkpoint:
      'Two distinct stories ready for each of the eight principles above, each with the back-pocket details (data, who disagreed, what changed).',
    references: [
      official(
        'Amazon Leadership Principles',
        'https://www.amazon.jobs/content/en/our-workplace/leadership-principles',
      ),
      official(
        'Amazon SDE II interview prep',
        'https://amazon.jobs/content/en/how-we-hire/sde-ii-interview-prep',
      ),
    ],
    questions: [
      'Tell me about a time you took ownership of a problem outside your scope. (Ownership)',
      'Tell me about a time you had to dive deep into data or a system to find a root cause. (Dive Deep)',
      'Describe a time you delivered a result under a tight deadline and what you cut. (Deliver Results)',
      'Tell me about a decision you made with incomplete information. (Bias for Action)',
      'Tell me about a time you disagreed with your manager or a senior engineer and what you did. (Have Backbone; Disagree and Commit)',
      'Tell me about a time you raised the quality bar on your team. (Insist on the Highest Standards)',
      'Describe a time you earned the trust of a sceptical stakeholder. (Earn Trust)',
      'Tell me about a time you built something for a customer need the customer had not articulated. (Customer Obsession)',
      'Tell me about a time you simplified a process or a system. (Invent and Simplify)',
      'Tell me about a time you failed and what you learned. (Learn and Be Curious)',
      'Tell me about a time you took a calculated risk. (Bias for Action)',
      'Tell me about a time you had to say no to a request. (Frugality; Deliver Results)',
    ],
  },
  {
    company: 'Stripe',
    slug: 'stripe',
    framework:
      'The six current operating principles on stripe.com: Users first; Create with craft and beauty; Move with urgency and focus; Collaborate egolessly; Stay curious; Obsess over talent. (The older list some handbooks carry is out of date.) The behavioural conversation is with the hiring manager or a "leveler"; there is no separate resume deep-dive round below Staff. Expect probing on user impact, rigor, and how you work with others.',
    checkpoint:
      'One story per principle, told in 90 seconds, with the user outcome stated first.',
    references: [
      official(
        'Stripe operating principles',
        'https://stripe.com/jobs/culture',
      ),
      prep(
        'interviewing.io Stripe',
        'https://interviewing.io/stripe-interview-questions',
      ),
    ],
    questions: [
      'Tell me about a time you put the user ahead of an easier engineering choice. (Users first)',
      'Describe work you are proud of for its craft. What did you refuse to ship? (Craft and beauty)',
      'Tell me about a time you had to move fast without lowering the bar. (Urgency and focus)',
      'Tell me about a time you changed your mind because of a colleague. (Collaborate egolessly)',
      'What did you learn recently that changed how you build systems? (Stay curious)',
      'How do you help the people around you do their best work? (Obsess over talent)',
      'Why Stripe, and what would you build in your first 90 days?',
      'Tell me about a production incident you owned end to end.',
      'Describe a time you found a correctness bug nobody else had noticed.',
    ],
  },
  {
    company: 'Shopify',
    slug: 'shopify',
    framework:
      'The Life Story interview with a recruiter: chronological, "trophies and bruises", not STAR; they want the arc, the decisions and the honest low points. Craft deep dives on your own work later in the loop. "Trust battery" and "Mastery" are internal vocabulary, not interview frameworks. One Glassdoor Staff report describes a rejection for heavy unverified AI use in the coding round.',
    checkpoint:
      'A 10-minute chronological life story with three turning points and two honest bruises, rehearsed aloud.',
    references: [
      prep(
        'interviewing.io Shopify',
        'https://interviewing.io/shopify-interview-questions',
      ),
      anecdotal(
        'Glassdoor Shopify',
        'https://www.glassdoor.com/Interview/Shopify-Interview-Questions-E675933.htm',
      ),
    ],
    questions: [
      'Walk me through your life and career from the beginning: what did you choose and why?',
      'What is the biggest bruise in your career and what did it change?',
      'What is the trophy you are proudest of, and what did it cost?',
      'Tell me about the craft of a thing you built: what did you obsess over?',
      'How do you decide when something is good enough to ship?',
      'How do you use AI tools in your work, and when do you not trust them?',
      'Why Shopify, why commerce, why now?',
      'Tell me about a time you worked with a merchant or a user directly.',
    ],
  },
  {
    company: 'Wealthsimple',
    slug: 'wealthsimple',
    framework:
      'Six official values: Client first (×3, it is repeated on purpose); Ship it; Be a maker-owner; Naive ambition; Be human; Keep it simple. The loop includes "Bring Your Own System", where you present a system you built and defend its decisions, and a values interview that asks "why Wealthsimple" bluntly.',
    checkpoint:
      'A 15-minute Bring Your Own System presentation of 1V-01 or 1V-02 with a diagram, plus one story per value.',
    references: [
      official(
        'Wealthsimple values',
        'https://www.wealthsimple.com/en-ca/about',
      ),
      prep(
        'DesignGurus Wealthsimple',
        'https://www.designgurus.io/answers/detail/what-is-the-wealthsimple-interview-process-like-round-by-round',
      ),
    ],
    questions: [
      'Why Wealthsimple?',
      'Present a system you built. Why these decisions, and where does it break? (Bring Your Own System)',
      'Tell me about a time you shipped something imperfect on purpose. (Ship it)',
      'Tell me about a time you owned an outcome nobody asked you to own. (Maker-owner)',
      'Tell me about an ambitious thing you tried that others thought was naive. (Naive ambition)',
      'Tell me about a time you simplified a product or a design. (Keep it simple)',
      "Describe a time you put a client's interest ahead of a metric. (Client first)",
      'Tell me about a difficult conversation with a teammate. (Be human)',
    ],
  },
  {
    company: 'Google',
    slug: 'google',
    framework:
      'Googleyness and Leadership: humility, comfort with ambiguity, collaboration, leadership without authority, doing the right thing. Four or five STAR questions in one round, some hypothetical ("what would you do if…"). Official prep pages were not retrievable; this is a prep-site synthesis.',
    checkpoint:
      'Five STAR stories plus answers to three hypothetical prompts, each under two minutes.',
    references: [
      prep(
        'HelloInterview Google L4',
        'https://www.hellointerview.com/guides/google/l4',
      ),
    ],
    questions: [
      'Tell me about a time you led without formal authority.',
      'Describe a time you worked through an ambiguous problem with no clear owner.',
      'Tell me about a time you were wrong and how you handled it.',
      'How would you handle a teammate who consistently misses deadlines? (hypothetical)',
      'Tell me about a time you helped a struggling colleague.',
      'What would you do if you disagreed with a technical decision already made? (hypothetical)',
      'Tell me about a time you did the right thing for a user at a cost to your team.',
      'Describe a time you had to learn something quickly to deliver.',
    ],
  },
  {
    company: 'Meta',
    slug: 'meta',
    framework:
      'Eight signals: motivation, proactivity, working in unstructured environments, perseverance, conflict resolution, empathy, growth, communication. The scope of your stories sets the level; interviewers probe numbers and your personal part. One behavioural round in the loop.',
    checkpoint:
      'One story per signal with team-level scope and a number in each.',
    references: [
      prep(
        'HelloInterview Meta E5',
        'https://www.hellointerview.com/guides/meta/e5',
      ),
      official(
        'Meta interview prep',
        'https://www.metacareers.com/blog/preparing-for-your-software-engineering-interview-at-meta/',
      ),
    ],
    questions: [
      'What motivates you, and what kind of work drains you? (motivation)',
      'Tell me about something you started without being asked. (proactivity)',
      'Describe a time you worked with no spec and no process. (unstructured environments)',
      'Tell me about a project that dragged on and how you kept going. (perseverance)',
      'Tell me about a conflict with a peer and how it was resolved. (conflict resolution)',
      "Tell me about a time you changed a decision because of someone else's situation. (empathy)",
      'What feedback changed how you work? (growth)',
      'Tell me about a time you had to explain a technical trade-off to non-engineers. (communication)',
    ],
  },
  {
    company: 'Microsoft',
    slug: 'microsoft',
    framework:
      'Culture attributes (official): growth mindset, customer obsession, diverse and inclusive, one Microsoft, making a difference. Growth mindset is probed in every round, usually as "tell me about a time you failed / learned". The "three core questions" some guides cite are unsourced.',
    checkpoint:
      'Two failure-and-learning stories and one customer story ready for any round.',
    references: [
      official(
        'Microsoft culture',
        'https://www.microsoft.com/en-us/about/corporate-values',
      ),
      prep(
        'HelloInterview Microsoft senior',
        'https://www.hellointerview.com/guides/microsoft/senior',
      ),
    ],
    questions: [
      'Tell me about a time you failed and what you learned. (growth mindset)',
      'Tell me about a time you received hard feedback. (growth mindset)',
      'Tell me about a customer problem you solved. (customer obsession)',
      'Describe a time you worked across teams to get something done. (one Microsoft)',
      'How do you make sure quieter teammates are heard? (diverse and inclusive)',
      'Tell me about work that made a difference beyond your team.',
    ],
  },
  {
    company: 'YC and high-growth startups',
    slug: 'startups',
    framework:
      'No published framework; founders and early engineers ask about why this company, shipping without a spec, deciding without permission, good enough to ship, a 90-day plan, and they screen for red flags (needing process, blaming others, no opinions). Ramp, Rely, Linear, Vercel and similar companies run founder or early-engineer conversations plus a project deep dive.',
    checkpoint:
      'A 90-day plan for one target company and a two-minute answer to "why us" that names their product decisions.',
    references: [
      prep(
        'Prep-site syntheses 2025–2026 (see handoff)',
        'https://github.com/Shams261/CareerOs/blob/main/docs/WI-012-HANDOFF.md',
      ),
    ],
    questions: [
      'Why us? What have you noticed about our product that you would change?',
      'Tell me about something you shipped with no spec.',
      'Tell me about a decision you made without asking permission.',
      'How do you decide what is good enough to ship?',
      'What would your first 90 days here look like?',
      'What do you need from a team to do your best work? (red-flag screen)',
      'Tell me about a time you were the only engineer on something.',
    ],
  },
  {
    company: 'Canadian scale-ups (Clio, Cohere, 1Password)',
    slug: 'canadian-scaleups',
    framework:
      'Reported rounds (anecdotal, small samples): Clio pairs on code and asks values questions; Cohere runs a take-home then a pairing session and asks about judgment with AI tools (memorised LeetCode flagged, Claude Code allowed in one 2026 report); 1Password a 48-hour take-home and a values conversation on security mindset.',
    checkpoint:
      'One story on security mindset, one on AI-tool judgment, and the take-home starter ready.',
    references: [
      anecdotal(
        'Cohere interview prep 2026 (jobsbyculture)',
        'https://jobsbyculture.com/blog/cohere-interview-prep-2026',
      ),
    ],
    questions: [
      'How do you decide when to trust an AI-generated change?',
      'Tell me about a time you found a security problem in your own code.',
      'Describe a take-home or side project you are proud of and what you would add with another day.',
      'How do you pair with someone who codes differently from you?',
    ],
  },
];

export const FRAMEWORK_SECTIONS: ResearchSection[] = FRAMEWORKS.map((f) => ({
  name: `Company: ${f.company}`,
  items: [
    {
      slug: `framework-${f.slug}`,
      title: `${f.company}: what they assess and how`,
      priority: 1,
      scope: f.framework,
      checkpoint: f.checkpoint,
      references: f.references,
    },
    ...f.questions.map((q, i) => ({
      slug: `${f.slug}-q${i + 1}`,
      title: q,
      kind: 'QUESTION' as const,
      priority: 2 as const,
      scope: `Asked at ${f.company} (${f.references[0][2] === 'official' ? 'framework from the official page; question wording from prep sites' : 'prep-site and candidate reports'}).`,
      checkpoint:
        'Answered aloud in 60–120 seconds from a real story, with the result quantified.',
      references: f.references,
    })),
  ],
}));

/* ------------------------------------------------------------ master question bank */

type BankGroup = {
  name: string;
  mapping: string;
  questions: [string, string][];
};

const BANK: BankGroup[] = [
  {
    name: 'Ownership and initiative',
    mapping: 'Ambiguous requirements / end-to-end ownership',
    questions: [
      [
        'Tell me about the most ambiguous problem you have owned.',
        'Amazon, Google, Stripe',
      ],
      [
        'Describe something you delivered end to end.',
        'Amazon, Wealthsimple, Shopify',
      ],
      ['When did you go beyond your assigned scope?', 'Amazon, Meta'],
      ['How did you decide what not to build?', 'Stripe, startups'],
      [
        'Tell me about something you started without being asked.',
        'Meta, startups',
      ],
      [
        'Tell me about a time you owned an outcome nobody asked you to own.',
        'Wealthsimple',
      ],
      ['Describe a time you were the only engineer on something.', 'startups'],
      ['Tell me about a time you took a calculated risk.', 'Amazon'],
    ],
  },
  {
    name: 'Technical judgment and decisions',
    mapping: 'Technical complexity / correctness',
    questions: [
      [
        'Tell me about a difficult design trade-off.',
        'Stripe, Google, Shopify',
      ],
      [
        'Describe when a simple solution beat a sophisticated one.',
        'Stripe, Wealthsimple',
      ],
      [
        'How did you protect correctness under concurrency?',
        'Stripe, Wealthsimple',
      ],
      [
        'Tell me about a technical decision you would change today.',
        'Google, Meta',
      ],
      [
        'How do you know when a design is over-engineered?',
        'Shopify, startups',
      ],
      [
        'Tell me about a time you chose a boring technology on purpose.',
        'startups',
      ],
      [
        'Describe a time you pushed back on a requirement for technical reasons.',
        'Amazon, Google',
      ],
      [
        'Walk me through a system you designed and where it breaks.',
        'Wealthsimple, Stripe',
      ],
      [
        'Tell me about a time you found a correctness bug nobody else noticed.',
        'Stripe',
      ],
      [
        'How do you decide between fixing a root cause and shipping a mitigation?',
        'Amazon, Stripe',
      ],
      ['Tell me about a migration you planned.', 'Shopify, Microsoft'],
    ],
  },
  {
    name: 'Execution and results',
    mapping: 'Business impact / operational',
    questions: [
      [
        'What is your highest-impact engineering contribution?',
        'Amazon, Meta, Stripe',
      ],
      ['Tell me about making a measurable improvement.', 'Amazon, Microsoft'],
      ['How did you choose priorities under limited time?', 'Amazon, Google'],
      [
        'Tell me about a project that was harder than expected.',
        'Meta, Google',
      ],
      [
        'Describe a time you delivered under a tight deadline and what you cut.',
        'Amazon, startups',
      ],
      [
        'Tell me about a time you shipped something imperfect on purpose.',
        'Wealthsimple, Shopify',
      ],
      ['How do you decide what is good enough to ship?', 'Shopify, startups'],
      [
        'Tell me about a time you had to move fast without lowering the bar.',
        'Stripe',
      ],
      ['Tell me about a time you missed a deadline.', 'Amazon, Microsoft'],
      ['What would your first 90 days here look like?', 'startups'],
    ],
  },
  {
    name: 'Customer and user focus',
    mapping: 'Working with non-engineers',
    questions: [
      [
        'Tell me about a time you put the user ahead of an easier engineering choice.',
        'Stripe, Wealthsimple',
      ],
      ['Tell me about a customer problem you solved.', 'Microsoft, Amazon'],
      [
        'Tell me about a time you built for a need the customer had not articulated.',
        'Amazon',
      ],
      [
        'Tell me about a time you worked with a user or merchant directly.',
        'Shopify',
      ],
      [
        "Describe a time you put a client's interest ahead of a metric.",
        'Wealthsimple',
      ],
    ],
  },
  {
    name: 'Collaboration and influence',
    mapping: 'Working with non-engineers',
    questions: [
      ['How did you influence a change without authority?', 'Google, Amazon'],
      [
        'How do you communicate risks to non-technical stakeholders?',
        'Meta, Wealthsimple',
      ],
      [
        'How did you get feedback on a proposed architecture?',
        'Stripe, Google',
      ],
      [
        'Tell me about a time you helped a struggling colleague.',
        'Google, Microsoft',
      ],
      ['How do you help the people around you do their best work?', 'Stripe'],
      [
        'Describe a time you worked across teams to get something done.',
        'Microsoft, Amazon',
      ],
      [
        'How do you pair with someone who codes differently from you?',
        'Clio, Wealthsimple',
      ],
      ['How do you approach code review and feedback?', 'all'],
    ],
  },
  {
    name: 'Conflict and disagreement',
    mapping: 'Working with non-engineers',
    questions: [
      [
        'Describe a disagreement with a teammate and how it was resolved.',
        'Amazon, Meta, Google',
      ],
      [
        'Tell me about a time you disagreed with your manager and what you did.',
        'Amazon',
      ],
      [
        'Tell me about a time you changed your mind because of a colleague.',
        'Stripe',
      ],
      [
        'What would you do if you disagreed with a decision already made?',
        'Google',
      ],
      [
        'Tell me about a difficult conversation with a teammate.',
        'Wealthsimple',
      ],
      [
        'Tell me about a time you had to say no to a request.',
        'Amazon, startups',
      ],
    ],
  },
  {
    name: 'Failure, mistakes, feedback and growth',
    mapping: 'Learned from mistakes / constraints',
    questions: [
      ['Describe a production issue and your response.', 'Stripe, Amazon'],
      [
        'Tell me about a mistake and how you recovered.',
        'Microsoft, Amazon, Google',
      ],
      ['Describe an unsuccessful attempt and your next iteration.', 'Meta'],
      [
        'Tell me about a time you failed and what you learned.',
        'Microsoft, Amazon',
      ],
      ['Tell me about a time you received hard feedback.', 'Microsoft, Meta'],
      ['What feedback changed how you work?', 'Meta'],
      [
        'What is the biggest bruise in your career and what did it change?',
        'Shopify',
      ],
      ['Tell me about a time you were wrong and how you handled it.', 'Google'],
      [
        'What did you learn recently that changed how you build systems?',
        'Stripe',
      ],
      [
        'Tell me about a project that dragged on and how you kept going.',
        'Meta',
      ],
    ],
  },
  {
    name: 'Ambiguity and adaptability',
    mapping: 'Ambiguous requirements / end-to-end ownership',
    questions: [
      [
        'Describe a time you worked with no spec and no process.',
        'Meta, startups',
      ],
      [
        'Tell me about a decision you made with incomplete information.',
        'Amazon',
      ],
      [
        'Describe a time you had to learn something quickly to deliver.',
        'Google',
      ],
      [
        'Tell me about a time priorities changed under you mid-project.',
        'Amazon, Shopify',
      ],
    ],
  },
  {
    name: 'Motivation and fit',
    mapping: 'Independent side-project ownership',
    questions: [
      ['Why this role and why now?', 'all'],
      [
        'Why us? What would you change about our product?',
        'startups, Shopify, Wealthsimple',
      ],
      ['What motivates you, and what kind of work drains you?', 'Meta'],
      ['Walk me through your life and career from the beginning.', 'Shopify'],
      [
        'What is the trophy you are proudest of, and what did it cost?',
        'Shopify',
      ],
      ['What kind of engineering environment helps you grow?', 'all'],
      ['What do you need from a team to do your best work?', 'startups'],
      ['Why are you leaving your current role?', 'all'],
    ],
  },
  {
    name: 'Inclusion and people',
    mapping: 'Working with non-engineers',
    questions: [
      [
        'How do you make sure quieter teammates are heard?',
        'Microsoft, Google',
      ],
      [
        "Tell me about a time you changed a decision because of someone else's situation.",
        'Meta',
      ],
      ['Tell me about mentoring or onboarding someone.', 'Amazon, Microsoft'],
    ],
  },
  {
    name: '2025–2026 additions',
    mapping: 'Technical complexity / correctness',
    questions: [
      [
        'How do you use AI tools in your work, and where do you not trust them?',
        'Shopify, Cohere, Meta',
      ],
      [
        'Tell me about a time an AI tool misled you and you caught it.',
        'Shopify, Cohere',
      ],
      [
        'How do you collaborate when the team is remote or across time zones?',
        'all',
      ],
      ['Explain the gap or the layoff on your resume.', 'all'],
    ],
  },
];

export function questionBankSections(
  matrix: { competency: string; best: string; backup: string }[],
): ResearchSection[] {
  return BANK.map((g) => {
    const row = matrix.find((m) => m.competency === g.mapping);
    return {
      name: `Question bank: ${g.name}`,
      items: g.questions.map(([q, companies], i) => ({
        slug: `bank-${slug(g.name)}-${i + 1}`,
        title: q,
        kind: 'QUESTION' as const,
        priority: 2 as const,
        scope: `Asked at: ${companies}. Competency: ${g.name}.`,
        checkpoint:
          'Answered aloud from a real story in 60–120 seconds; result quantified; one follow-up survived.',
        notes: row
          ? `Best story: ${row.best}. Backup: ${row.backup}. (From the handbook's selection matrix.)`
          : undefined,
        references: [
          prep(
            'Question wording: prep-site syntheses 2024–2026 and dated Glassdoor reports; see the company framework items for sources',
            'https://github.com/Shams261/CareerOs/blob/main/docs/WI-012-HANDOFF.md',
          ),
        ],
      })),
    };
  });
}
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/* ------------------------------------------------------------ project deep-dive probes */

export const DEEP_DIVE_PROBES: ResearchSection = {
  name: 'Project deep dive probes',
  items: [
    'Ownership one level below the narrative: what did you personally design, implement and decide, and what did others do?',
    'Internals of every technology you named: how does it actually work, and what does it guarantee?',
    'Business context and impact: who used it, what changed for them, how was it measured?',
    'Metrics with honest ranges: baseline, numerator, denominator, time window, confidence.',
    'Alternatives considered and where the chosen design breaks: load, failure, scale ×10.',
    'A production failure: what happened, how you found it, what you changed afterwards.',
    'What you would change today, specifically and technically, and why you did not then.',
    'Changed constraints: deadline halved, traffic ×10, team of one. What survives?',
    'A concrete cross-team disagreement inside this project and how it ended.',
    'Security and data boundaries: trusted inputs, authorization, secrets, tenant scoping.',
  ].map((probe, i) => ({
    slug: `probe-${i + 1}`,
    title: probe,
    kind: 'QUESTION' as const,
    priority: 1 as const,
    scope:
      'Deep-dive rounds (Wealthsimple Bring Your Own System, Shopify craft deep dive, startup project deep dives) run 15–20 minutes of narrative then 30–40 minutes of probes like this one.',
    checkpoint: 'Answered for 1V-01 and PROJ-03 without notes.',
    references: [
      prep(
        'DesignGurus Wealthsimple',
        'https://www.designgurus.io/answers/detail/what-is-the-wealthsimple-interview-process-like-round-by-round',
      ),
      prep(
        'interviewing.io Shopify',
        'https://interviewing.io/shopify-interview-questions',
      ),
    ],
  })),
};

/* ------------------------------------------------------------ delivery guidance */

export const DELIVERY_GUIDANCE: ResearchSection = {
  name: 'Delivery guidance',
  items: [
    [
      'STAR-L with about 60% on the action',
      'Situation and task in two sentences, the action as most of the answer, the result with a number, one line of learning. 60–120 seconds spoken.',
    ],
    [
      '"I", not "we"',
      'Interviewers score your contribution; say what you did, then what the team did.',
    ],
    [
      'Quantify with before and after',
      'Every result has a baseline and a measurement; say how it was measured and what the number does not claim.',
    ],
    [
      'Two genuine failure stories',
      'Bounded, with a corrective action you actually took and a changed behaviour since.',
    ],
    [
      'Disagreement stories show three things',
      'The case you made, that you listened, and that you committed to the outcome.',
    ],
    [
      'SDE II scope',
      'Team-level impact and ambiguity you resolved; not a task you were handed.',
    ],
    [
      'Amazon back-pocket details',
      'For every story: the data you used, who disagreed, what changed afterwards.',
    ],
    [
      'Shopify Life Story is chronological',
      'Not STAR. Choices, turning points, trophies and bruises, in order.',
    ],
    [
      'One AI story each way',
      'One where an AI tool sped you up and one where it misled you and you caught it.',
    ],
    [
      'Gap or layoff in two factual sentences',
      'What happened, what you did with the time; no apology, no detour.',
    ],
  ].map(([title, scope], i) => ({
    slug: `delivery-${i + 1}`,
    title,
    priority: 1 as const,
    scope,
    checkpoint: 'Applied in at least one rehearsed story.',
    references: [
      prep(
        'Behavioural research synthesis (WI-012 handoff)',
        'https://github.com/Shams261/CareerOs/blob/main/docs/WI-012-HANDOFF.md',
      ),
    ],
  })),
};

export const BEHAVIOURAL_UNCERTAINTY =
  'Uncertainty: Google and Amazon official prep pages were not retrievable at research time (prep-site quotes used); the Microsoft "three core questions" are unsourced; most question lists are 2024–2026 prep-site syntheses with dated Glassdoor reports for Shopify, Amazon, Cohere, Wealthsimple and Clio.';
