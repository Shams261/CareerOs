/**
 * The researched DSA curriculum (WI-012): pattern order, the core problems per pattern, the
 * practical-coding tasks product companies ask, review and bug-squash drills, and the
 * JavaScript toolkit. Public research only; nothing personal. Sources are carried per item so
 * the owner can judge them. Membership legend: N = NeetCode 150, B = Blind 75, G = Grind 75,
 * P = Sean Prashad's LeetCode patterns list (verified against the JSON by the builder).
 */
export type CoreProblem = {
  id: number;
  title: string;
  slug: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  lists: string;
  note?: string;
};
export type Pattern = {
  name: string;
  /** Chapter numbers in the DSA Pattern Bible that explain this pattern. */
  chapters: number[];
  signal: string;
  problems: CoreProblem[];
};

const p = (
  id: number,
  title: string,
  slug: string,
  difficulty: CoreProblem['difficulty'],
  lists: string,
  note?: string,
): CoreProblem => ({ id, title, slug, difficulty, lists, note });

export const PATTERNS: Pattern[] = [
  {
    name: 'Arrays & Hashing',
    chapters: [0, 1],
    signal: 'Counting, de-duplication, O(1) lookup, grouping by a key.',
    problems: [
      p(1, 'Two Sum', 'two-sum', 'EASY', 'NBGP'),
      p(217, 'Contains Duplicate', 'contains-duplicate', 'EASY', 'NBGP'),
      p(242, 'Valid Anagram', 'valid-anagram', 'EASY', 'NBGP'),
      p(49, 'Group Anagrams', 'group-anagrams', 'MEDIUM', 'NBP'),
      p(
        347,
        'Top K Frequent Elements',
        'top-k-frequent-elements',
        'MEDIUM',
        'NBP',
      ),
      p(
        238,
        'Product of Array Except Self',
        'product-of-array-except-self',
        'MEDIUM',
        'NBP',
      ),
      p(
        271,
        'Encode and Decode Strings',
        'encode-and-decode-strings',
        'MEDIUM',
        'NB',
        'premium',
      ),
      p(
        128,
        'Longest Consecutive Sequence',
        'longest-consecutive-sequence',
        'MEDIUM',
        'NBP',
      ),
      p(36, 'Valid Sudoku', 'valid-sudoku', 'MEDIUM', 'N'),
    ],
  },
  {
    name: 'Two Pointers',
    chapters: [2],
    signal: 'Sorted input, pair or triplet, in-place rewriting, palindromes.',
    problems: [
      p(125, 'Valid Palindrome', 'valid-palindrome', 'EASY', 'NBGP'),
      p(
        167,
        'Two Sum II - Input Array Is Sorted',
        'two-sum-ii-input-array-is-sorted',
        'MEDIUM',
        'NP',
      ),
      p(15, '3Sum', '3sum', 'MEDIUM', 'NBGP'),
      p(
        11,
        'Container With Most Water',
        'container-with-most-water',
        'MEDIUM',
        'NBGP',
      ),
      p(42, 'Trapping Rain Water', 'trapping-rain-water', 'HARD', 'NP'),
    ],
  },
  {
    name: 'Sliding Window & Prefix Sum',
    chapters: [3, 4],
    signal:
      'Contiguous subarray or substring, "at most k", running sums with negatives.',
    problems: [
      p(
        121,
        'Best Time to Buy and Sell Stock',
        'best-time-to-buy-and-sell-stock',
        'EASY',
        'NBGP',
      ),
      p(
        3,
        'Longest Substring Without Repeating Characters',
        'longest-substring-without-repeating-characters',
        'MEDIUM',
        'NBGP',
      ),
      p(
        424,
        'Longest Repeating Character Replacement',
        'longest-repeating-character-replacement',
        'MEDIUM',
        'NB',
      ),
      p(567, 'Permutation in String', 'permutation-in-string', 'MEDIUM', 'NP'),
      p(
        76,
        'Minimum Window Substring',
        'minimum-window-substring',
        'HARD',
        'NBGP',
      ),
      p(239, 'Sliding Window Maximum', 'sliding-window-maximum', 'HARD', 'NP'),
      p(53, 'Maximum Subarray', 'maximum-subarray', 'MEDIUM', 'BGP'),
      p(560, 'Subarray Sum Equals K', 'subarray-sum-equals-k', 'MEDIUM', 'P'),
    ],
  },
  {
    name: 'Stack & Monotonic Stack',
    chapters: [8],
    signal: 'Nearest greater or smaller element, nesting, evaluation order.',
    problems: [
      p(20, 'Valid Parentheses', 'valid-parentheses', 'EASY', 'NBGP'),
      p(155, 'Min Stack', 'min-stack', 'MEDIUM', 'NGP'),
      p(
        150,
        'Evaluate Reverse Polish Notation',
        'evaluate-reverse-polish-notation',
        'MEDIUM',
        'NG',
      ),
      p(22, 'Generate Parentheses', 'generate-parentheses', 'MEDIUM', 'NP'),
      p(739, 'Daily Temperatures', 'daily-temperatures', 'MEDIUM', 'NP'),
      p(853, 'Car Fleet', 'car-fleet', 'MEDIUM', 'N'),
      p(
        84,
        'Largest Rectangle in Histogram',
        'largest-rectangle-in-histogram',
        'HARD',
        'NP',
      ),
    ],
  },
  {
    name: 'Binary Search',
    chapters: [5],
    signal: 'Monotone predicate, "minimum x such that", rotated sorted input.',
    problems: [
      p(704, 'Binary Search', 'binary-search', 'EASY', 'NGP'),
      p(74, 'Search a 2D Matrix', 'search-a-2d-matrix', 'MEDIUM', 'NP'),
      p(875, 'Koko Eating Bananas', 'koko-eating-bananas', 'MEDIUM', 'NP'),
      p(
        33,
        'Search in Rotated Sorted Array',
        'search-in-rotated-sorted-array',
        'MEDIUM',
        'NBGP',
      ),
      p(
        153,
        'Find Minimum in Rotated Sorted Array',
        'find-minimum-in-rotated-sorted-array',
        'MEDIUM',
        'NBP',
      ),
      p(
        981,
        'Time Based Key-Value Store',
        'time-based-key-value-store',
        'MEDIUM',
        'N',
      ),
      p(
        4,
        'Median of Two Sorted Arrays',
        'median-of-two-sorted-arrays',
        'HARD',
        'NP',
      ),
    ],
  },
  {
    name: 'Linked List',
    chapters: [7],
    signal: 'Fast and slow pointers, in-place rewiring, dummy head.',
    problems: [
      p(206, 'Reverse Linked List', 'reverse-linked-list', 'EASY', 'NBGP'),
      p(21, 'Merge Two Sorted Lists', 'merge-two-sorted-lists', 'EASY', 'NBGP'),
      p(143, 'Reorder List', 'reorder-list', 'MEDIUM', 'NBP'),
      p(
        19,
        'Remove Nth Node From End of List',
        'remove-nth-node-from-end-of-list',
        'MEDIUM',
        'NBP',
      ),
      p(
        138,
        'Copy List with Random Pointer',
        'copy-list-with-random-pointer',
        'MEDIUM',
        'NP',
      ),
      p(2, 'Add Two Numbers', 'add-two-numbers', 'MEDIUM', 'NP'),
      p(141, 'Linked List Cycle', 'linked-list-cycle', 'EASY', 'NBGP'),
      p(
        146,
        'LRU Cache',
        'lru-cache',
        'MEDIUM',
        'NGP',
        'Shopify, Microsoft, Google report it',
      ),
      p(23, 'Merge k Sorted Lists', 'merge-k-sorted-lists', 'HARD', 'NBGP'),
    ],
  },
  {
    name: 'Trees',
    chapters: [10],
    signal: 'Recursion returning (value, flag), BFS by level, BST ordering.',
    problems: [
      p(226, 'Invert Binary Tree', 'invert-binary-tree', 'EASY', 'NBGP'),
      p(
        104,
        'Maximum Depth of Binary Tree',
        'maximum-depth-of-binary-tree',
        'EASY',
        'NBGP',
      ),
      p(
        543,
        'Diameter of Binary Tree',
        'diameter-of-binary-tree',
        'EASY',
        'NG',
      ),
      p(110, 'Balanced Binary Tree', 'balanced-binary-tree', 'EASY', 'NG'),
      p(100, 'Same Tree', 'same-tree', 'EASY', 'NBG'),
      p(
        572,
        'Subtree of Another Tree',
        'subtree-of-another-tree',
        'EASY',
        'NB',
      ),
      p(
        235,
        'Lowest Common Ancestor of a Binary Search Tree',
        'lowest-common-ancestor-of-a-binary-search-tree',
        'MEDIUM',
        'NBGP',
      ),
      p(
        102,
        'Binary Tree Level Order Traversal',
        'binary-tree-level-order-traversal',
        'MEDIUM',
        'NBGP',
      ),
      p(
        199,
        'Binary Tree Right Side View',
        'binary-tree-right-side-view',
        'MEDIUM',
        'NP',
      ),
      p(
        1448,
        'Count Good Nodes in Binary Tree',
        'count-good-nodes-in-binary-tree',
        'MEDIUM',
        'N',
      ),
      p(
        98,
        'Validate Binary Search Tree',
        'validate-binary-search-tree',
        'MEDIUM',
        'NBGP',
      ),
      p(
        230,
        'Kth Smallest Element in a BST',
        'kth-smallest-element-in-a-bst',
        'MEDIUM',
        'NBP',
      ),
      p(
        105,
        'Construct Binary Tree from Preorder and Inorder Traversal',
        'construct-binary-tree-from-preorder-and-inorder-traversal',
        'MEDIUM',
        'NBP',
      ),
      p(
        124,
        'Binary Tree Maximum Path Sum',
        'binary-tree-maximum-path-sum',
        'HARD',
        'NBP',
      ),
      p(
        297,
        'Serialize and Deserialize Binary Tree',
        'serialize-and-deserialize-binary-tree',
        'HARD',
        'NBGP',
      ),
      p(
        314,
        'Binary Tree Vertical Order Traversal',
        'binary-tree-vertical-order-traversal',
        'MEDIUM',
        '',
        'premium; Meta E5 reports',
      ),
    ],
  },
  {
    name: 'Tries',
    chapters: [15],
    signal: 'Prefix queries, autocomplete, wildcard search.',
    problems: [
      p(
        208,
        'Implement Trie (Prefix Tree)',
        'implement-trie-prefix-tree',
        'MEDIUM',
        'NBGP',
      ),
      p(
        211,
        'Design Add and Search Words Data Structure',
        'design-add-and-search-words-data-structure',
        'MEDIUM',
        'NBP',
      ),
      p(212, 'Word Search II', 'word-search-ii', 'HARD', 'NBP'),
    ],
  },
  {
    name: 'Heap / Priority Queue',
    chapters: [9],
    signal:
      '"Top k", "kth", "closest", streaming data; JavaScript has no built-in heap.',
    problems: [
      p(
        703,
        'Kth Largest Element in a Stream',
        'kth-largest-element-in-a-stream',
        'EASY',
        'N',
      ),
      p(1046, 'Last Stone Weight', 'last-stone-weight', 'EASY', 'N'),
      p(
        973,
        'K Closest Points to Origin',
        'k-closest-points-to-origin',
        'MEDIUM',
        'NGP',
      ),
      p(
        215,
        'Kth Largest Element in an Array',
        'kth-largest-element-in-an-array',
        'MEDIUM',
        'NGP',
        'Meta E5 reports',
      ),
      p(621, 'Task Scheduler', 'task-scheduler', 'MEDIUM', 'NP'),
      p(355, 'Design Twitter', 'design-twitter', 'MEDIUM', 'N'),
      p(
        295,
        'Find Median from Data Stream',
        'find-median-from-data-stream',
        'HARD',
        'NBP',
      ),
    ],
  },
  {
    name: 'Backtracking',
    chapters: [6],
    signal: 'Enumerate all answers; choose, recurse, un-choose.',
    problems: [
      p(78, 'Subsets', 'subsets', 'MEDIUM', 'NP'),
      p(39, 'Combination Sum', 'combination-sum', 'MEDIUM', 'NBGP'),
      p(46, 'Permutations', 'permutations', 'MEDIUM', 'NP'),
      p(90, 'Subsets II', 'subsets-ii', 'MEDIUM', 'N'),
      p(40, 'Combination Sum II', 'combination-sum-ii', 'MEDIUM', 'N'),
      p(79, 'Word Search', 'word-search', 'MEDIUM', 'NBGP'),
      p(
        131,
        'Palindrome Partitioning',
        'palindrome-partitioning',
        'MEDIUM',
        'N',
      ),
      p(
        17,
        'Letter Combinations of a Phone Number',
        'letter-combinations-of-a-phone-number',
        'MEDIUM',
        'NGP',
      ),
      p(51, 'N-Queens', 'n-queens', 'HARD', 'NP'),
    ],
  },
  {
    name: 'Graphs',
    chapters: [11],
    signal:
      'Grid or adjacency list, dependencies, shortest path, connectivity.',
    problems: [
      p(200, 'Number of Islands', 'number-of-islands', 'MEDIUM', 'NBGP'),
      p(133, 'Clone Graph', 'clone-graph', 'MEDIUM', 'NBGP'),
      p(695, 'Max Area of Island', 'max-area-of-island', 'MEDIUM', 'N'),
      p(
        417,
        'Pacific Atlantic Water Flow',
        'pacific-atlantic-water-flow',
        'MEDIUM',
        'NBP',
      ),
      p(130, 'Surrounded Regions', 'surrounded-regions', 'MEDIUM', 'N'),
      p(994, 'Rotting Oranges', 'rotting-oranges', 'MEDIUM', 'NGP'),
      p(286, 'Walls and Gates', 'walls-and-gates', 'MEDIUM', 'N', 'premium'),
      p(207, 'Course Schedule', 'course-schedule', 'MEDIUM', 'NBGP'),
      p(210, 'Course Schedule II', 'course-schedule-ii', 'MEDIUM', 'NP'),
      p(684, 'Redundant Connection', 'redundant-connection', 'MEDIUM', 'N'),
      p(
        323,
        'Number of Connected Components in an Undirected Graph',
        'number-of-connected-components-in-an-undirected-graph',
        'MEDIUM',
        'NBP',
        'premium',
      ),
      p(261, 'Graph Valid Tree', 'graph-valid-tree', 'MEDIUM', 'NB', 'premium'),
      p(127, 'Word Ladder', 'word-ladder', 'HARD', 'NP'),
      p(
        743,
        'Network Delay Time',
        'network-delay-time',
        'MEDIUM',
        'NP',
        'Dijkstra',
      ),
      p(
        269,
        'Alien Dictionary',
        'alien-dictionary',
        'HARD',
        'NBP',
        'premium; topological sort',
      ),
      p(332, 'Reconstruct Itinerary', 'reconstruct-itinerary', 'HARD', 'N'),
      p(778, 'Swim in Rising Water', 'swim-in-rising-water', 'HARD', 'N'),
    ],
  },
  {
    name: '1-D Dynamic Programming',
    chapters: [12],
    signal:
      '"Number of ways", "minimum cost", overlapping subproblems over one index.',
    problems: [
      p(70, 'Climbing Stairs', 'climbing-stairs', 'EASY', 'NBGP'),
      p(
        746,
        'Min Cost Climbing Stairs',
        'min-cost-climbing-stairs',
        'EASY',
        'N',
      ),
      p(198, 'House Robber', 'house-robber', 'MEDIUM', 'NBGP'),
      p(213, 'House Robber II', 'house-robber-ii', 'MEDIUM', 'NB'),
      p(
        5,
        'Longest Palindromic Substring',
        'longest-palindromic-substring',
        'MEDIUM',
        'NBP',
      ),
      p(
        647,
        'Palindromic Substrings',
        'palindromic-substrings',
        'MEDIUM',
        'NB',
      ),
      p(91, 'Decode Ways', 'decode-ways', 'MEDIUM', 'NBP'),
      p(322, 'Coin Change', 'coin-change', 'MEDIUM', 'NBGP'),
      p(
        152,
        'Maximum Product Subarray',
        'maximum-product-subarray',
        'MEDIUM',
        'NBP',
      ),
      p(139, 'Word Break', 'word-break', 'MEDIUM', 'NBGP'),
      p(
        300,
        'Longest Increasing Subsequence',
        'longest-increasing-subsequence',
        'MEDIUM',
        'NBP',
      ),
      p(
        416,
        'Partition Equal Subset Sum',
        'partition-equal-subset-sum',
        'MEDIUM',
        'N',
      ),
    ],
  },
  {
    name: '2-D Dynamic Programming',
    chapters: [12, 13],
    signal: 'Two sequences or a grid; edit distance, LCS, paths.',
    problems: [
      p(62, 'Unique Paths', 'unique-paths', 'MEDIUM', 'NBGP'),
      p(
        1143,
        'Longest Common Subsequence',
        'longest-common-subsequence',
        'MEDIUM',
        'NBP',
      ),
      p(
        309,
        'Best Time to Buy and Sell Stock with Cooldown',
        'best-time-to-buy-and-sell-stock-with-cooldown',
        'MEDIUM',
        'N',
      ),
      p(518, 'Coin Change II', 'coin-change-ii', 'MEDIUM', 'NP'),
      p(494, 'Target Sum', 'target-sum', 'MEDIUM', 'N'),
      p(97, 'Interleaving String', 'interleaving-string', 'MEDIUM', 'N'),
      p(
        329,
        'Longest Increasing Path in a Matrix',
        'longest-increasing-path-in-a-matrix',
        'HARD',
        'NB',
      ),
      p(72, 'Edit Distance', 'edit-distance', 'HARD', 'NP'),
      p(312, 'Burst Balloons', 'burst-balloons', 'HARD', 'N'),
    ],
  },
  {
    name: 'Greedy & Intervals',
    chapters: [16, 17],
    signal: 'Local choice that stays optimal; sort then sweep; meeting rooms.',
    problems: [
      p(55, 'Jump Game', 'jump-game', 'MEDIUM', 'NBGP'),
      p(45, 'Jump Game II', 'jump-game-ii', 'MEDIUM', 'N'),
      p(134, 'Gas Station', 'gas-station', 'MEDIUM', 'NP'),
      p(846, 'Hand of Straights', 'hand-of-straights', 'MEDIUM', 'N'),
      p(763, 'Partition Labels', 'partition-labels', 'MEDIUM', 'NP'),
      p(57, 'Insert Interval', 'insert-interval', 'MEDIUM', 'NBGP'),
      p(
        56,
        'Merge Intervals',
        'merge-intervals',
        'MEDIUM',
        'NBGP',
        'Google and Microsoft reports',
      ),
      p(
        435,
        'Non-overlapping Intervals',
        'non-overlapping-intervals',
        'MEDIUM',
        'NBP',
      ),
      p(252, 'Meeting Rooms', 'meeting-rooms', 'EASY', 'NBGP', 'premium'),
      p(
        253,
        'Meeting Rooms II',
        'meeting-rooms-ii',
        'MEDIUM',
        'NBGP',
        'premium',
      ),
      p(
        1851,
        'Minimum Interval to Include Each Query',
        'minimum-interval-to-include-each-query',
        'HARD',
        'N',
      ),
    ],
  },
  {
    name: 'Bit Manipulation & Math',
    chapters: [14],
    signal: 'XOR tricks, counting bits, matrix rotation and spirals.',
    problems: [
      p(136, 'Single Number', 'single-number', 'EASY', 'NBGP'),
      p(191, 'Number of 1 Bits', 'number-of-1-bits', 'EASY', 'NBGP'),
      p(338, 'Counting Bits', 'counting-bits', 'EASY', 'NBGP'),
      p(190, 'Reverse Bits', 'reverse-bits', 'EASY', 'NB'),
      p(268, 'Missing Number', 'missing-number', 'EASY', 'NB'),
      p(371, 'Sum of Two Integers', 'sum-of-two-integers', 'MEDIUM', 'NB'),
      p(48, 'Rotate Image', 'rotate-image', 'MEDIUM', 'NBP'),
      p(54, 'Spiral Matrix', 'spiral-matrix', 'MEDIUM', 'NBP'),
      p(73, 'Set Matrix Zeroes', 'set-matrix-zeroes', 'MEDIUM', 'NBP'),
    ],
  },
];

/** Design-a-class problems none of the lists own but product companies ask. */
export const DESIGN_CLASS = {
  name: 'Design a class',
  signal:
    'An object with a small API and invariants: state, O(1) operations, eviction or ordering. Asked by Stripe, Shopify, Wealthsimple, Microsoft and Google; judged on structure and tests as much as on the algorithm.',
  problems: [
    p(
      146,
      'LRU Cache',
      'lru-cache',
      'MEDIUM',
      'NGP',
      'Map keeps insertion order: delete-and-set moves a key to the end',
    ),
    p(155, 'Min Stack', 'min-stack', 'MEDIUM', 'NGP'),
    p(
      981,
      'Time Based Key-Value Store',
      'time-based-key-value-store',
      'MEDIUM',
      'N',
    ),
    p(355, 'Design Twitter', 'design-twitter', 'MEDIUM', 'N'),
    p(
      232,
      'Implement Queue using Stacks',
      'implement-queue-using-stacks',
      'EASY',
      'G',
    ),
    p(729, 'My Calendar I', 'my-calendar-i', 'MEDIUM', '', 'interval booking'),
  ],
  tasks: [
    {
      title: 'Rate limiter class (sliding window and token bucket)',
      scope:
        'allow(key, now) with a per-key window; then a token bucket with refill; then many keys with eviction. Discuss clock source, burst behaviour and what happens under concurrency.',
      companies: 'Stripe, Wealthsimple (early talent)',
    },
    {
      title: 'In-memory file system',
      scope:
        'ls, mkdir -p, addContent, readContent over a trie of directories; then concurrency questions.',
      companies: 'Shopify screen',
    },
    {
      title: 'In-memory key-value store with transactions',
      scope:
        'get/set/delete plus begin/commit/rollback with nested transactions; a stack of change logs.',
      companies: 'Rippling; used as a Stripe proxy',
    },
  ],
};

export type Task = {
  title: string;
  scope: string;
  companies: string;
  source: [string, string][];
};

/** Practical "build it" problems reported in product-company screens and onsites. */
export const PRACTICAL_TASKS: Task[] = [
  {
    title: 'Rate limiter: sliding window, then token bucket',
    scope:
      'Part 1: allow(userId, timestamp) with at most N requests per window. Part 2: token bucket with refill rate and burst. Part 3: many users, memory bound, eviction. Narrate trade-offs; write tests for boundaries.',
    companies: 'Stripe, Wealthsimple',
    source: [
      [
        'interviewing.io Stripe questions',
        'https://interviewing.io/stripe-interview-questions',
      ],
      [
        'aced.io Stripe guide',
        'https://www.aced.io/guides/stripe-software-engineer-interview',
      ],
      [
        'DesignGurus Wealthsimple process',
        'https://www.designgurus.io/answers/detail/what-is-the-wealthsimple-interview-process-like-round-by-round',
      ],
    ],
  },
  {
    title: 'CSV parse → validate → cross-column rules → dependency cycle',
    scope:
      'Escalating multi-part: parse a CSV with a header; validate required columns and row types; apply rules that span columns; detect a cycle in a dependency column with DFS. Keep each step testable.',
    companies: 'Stripe screen',
    source: [
      [
        'aced.io Stripe guide',
        'https://www.aced.io/guides/stripe-software-engineer-interview',
      ],
    ],
  },
  {
    title: 'Transaction log → per-user balances → flag suspicious users',
    scope:
      'Parse lines of transactions; compute balances per user in integer cents; then flag users with more than three transactions within any one-minute window (sliding window over sorted timestamps).',
    companies: 'Stripe, Wealthsimple',
    source: [
      [
        'aced.io Stripe guide',
        'https://www.aced.io/guides/stripe-software-engineer-interview',
      ],
      [
        'Stripe experience 2025–2026 (Medium)',
        'https://medium.com/@diyaag2020/my-stripe-interview-experience-2025-2026-a-journey-to-the-final-round-19990fa6876a',
      ],
    ],
  },
  {
    title: 'Currency conversion as graph traversal',
    scope:
      'Given pairwise rates, convert between any two currencies by BFS/DFS over the rate graph; then the best rate; then detect inconsistent cycles.',
    companies: 'Stripe',
    source: [
      [
        'aced.io Stripe guide',
        'https://www.aced.io/guides/stripe-software-engineer-interview',
      ],
    ],
  },
  {
    title: 'Mask card numbers in logs; mini IAM',
    scope:
      'Redact PAN-like digit runs in free text with a safe regex (Luhn check optional); then a tiny IAM: users, roles, permissions, hasAccess(user, action) with inheritance.',
    companies: 'Stripe general coding',
    source: [
      [
        'interviewing.io Stripe questions',
        'https://interviewing.io/stripe-interview-questions',
      ],
    ],
  },
  {
    title: 'HTTP route matching with {param} segments',
    scope:
      'Register routes like /users/{id}/posts; match a path, static segments before dynamic ones, return the handler and the params; then wildcards and method handling. A trie over segments.',
    companies: 'Google (senior, 2026 report)',
    source: [
      [
        'HelloInterview community question',
        'https://www.hellointerview.com/community/questions/http-route-matching/cmou3jp0m13rl0cadz84s19xd',
      ],
      [
        'HelloInterview Google L4 guide',
        'https://www.hellointerview.com/guides/google/l4',
      ],
    ],
  },
  {
    title: 'Retry with bounded backoff, idempotency keys, pagination',
    scope:
      'Call a flaky paginated API: honour 429 and Retry-After with capped exponential backoff and jitter; send an idempotency key on writes; walk cursor pagination and offset pagination; parse defensively.',
    companies: 'Stripe Integration round',
    source: [
      [
        'leonstaff Stripe bug squash and integration guide',
        'https://leonstaff.com/blogs/stripe-technical-interview-bug-squash-integration-guide/',
      ],
    ],
  },
  {
    title: 'Order products by price with popularity tiebreak; discount rules',
    scope:
      'Sort with a comparator chain; then apply stacked discount rules (percentage, fixed, buy-x-get-y) in a defined order with integer cents; tests for rounding.',
    companies: 'Shopify',
    source: [
      [
        'interviewing.io Shopify questions',
        'https://interviewing.io/shopify-interview-questions',
      ],
    ],
  },
  {
    title: 'Grid rover / drone controls class',
    scope:
      'A class with position and heading; commands L, R, M over a bounded grid with obstacles; then multiple rovers and collision rules. OOP structure is judged.',
    companies: 'Wealthsimple (reported)',
    source: [
      [
        'DesignGurus Wealthsimple process',
        'https://www.designgurus.io/answers/detail/what-is-the-wealthsimple-interview-process-like-round-by-round',
      ],
    ],
  },
  {
    title: 'Access-log parsing into status-class metrics',
    scope:
      'Stream lines of an HTTP access log; aggregate counts per status class and p95 latency per route in one pass; memory bound; then a top-k endpoints query.',
    companies: 'reported at Apple; generic',
    source: [
      [
        'PracHub access logs question',
        'https://prachub.com/interview-questions/parse-and-summarize-http-access-logs',
      ],
    ],
  },
  {
    title: 'Money arithmetic in integer cents',
    scope:
      'Represent amounts as integer minor units; split a total across n parties with remainder allocation; convert with a rate and explicit rounding mode; never use floats for money.',
    companies: 'Stripe, Wealthsimple (implied by every payments task)',
    source: [
      [
        'Stripe docs: amounts in minor units',
        'https://docs.stripe.com/currencies',
      ],
    ],
  },
];

/** Code review and bug squash drills; each one is a prompt scenario to run in Claude. */
export const DRILLS: Task[] = [
  {
    title: 'Bug squash: run the failing test first',
    scope:
      'Unfamiliar repo, one failing test. Method: run it, read the stack trace, form one hypothesis, confirm with a print or a smaller test, make the minimal fix, re-run, say what else might break. Narrate as you go.',
    companies:
      'Stripe Bug Bash; Google code-comprehension pilot (May 2026); Meta AI round phase 1',
    source: [
      [
        'leonstaff Stripe bug squash guide',
        'https://leonstaff.com/blogs/stripe-technical-interview-bug-squash-integration-guide/',
      ],
      [
        'LeetCode discuss: Stripe new grad 2026',
        'https://leetcode.com/discuss/post/7566910/',
      ],
    ],
  },
  {
    title: 'Bug families: off-by-one',
    scope:
      'Loops over ranges, inclusive/exclusive ends, pagination boundaries, slice indices. Practise finding one planted off-by-one in 50–100 lines in under ten minutes.',
    companies: 'all bug-squash rounds',
    source: [
      [
        'LeetCode discuss: 74-interview analysis 2026',
        'https://leetcode.com/discuss/post/8446005/',
      ],
    ],
  },
  {
    title: 'Bug families: stale state',
    scope:
      'A cached value or closure that is not refreshed after a write; a memo keyed on the wrong input; React state captured by an old render.',
    companies: 'all bug-squash rounds',
    source: [
      [
        'LeetCode discuss: 74-interview analysis 2026',
        'https://leetcode.com/discuss/post/8446005/',
      ],
    ],
  },
  {
    title: 'Bug families: bad comparator',
    scope:
      'sort without a comparator, a comparator that is not transitive, string versus number comparison, locale-dependent ordering.',
    companies: 'all bug-squash rounds',
    source: [
      [
        'Sonar rule S2871',
        'https://rules.sonarsource.com/javascript/RSPEC-2871',
      ],
    ],
  },
  {
    title: 'Bug families: unguarded read-modify-write',
    scope:
      'Two requests read a balance, both write; fix with a transaction, a version check or an atomic update. Explain the race aloud before fixing it.',
    companies: 'Stripe, Wealthsimple',
    source: [
      [
        'leonstaff Stripe bug squash guide',
        'https://leonstaff.com/blogs/stripe-technical-interview-bug-squash-integration-guide/',
      ],
    ],
  },
  {
    title: 'Code review drill: a PR with 3–5 planted issues',
    scope:
      'Restate the intent, read once, rank findings by impact (correctness → design → tests → style), say why and give the fix, name the failing test, separate blockers from nits, keep the tone kind and specific. Score yourself with the rubric.',
    companies:
      'Airbnb (rubric-scored), Elastic, GitHub; Google EM debug-in-doc',
    source: [
      [
        'Interview formats research (WI-012, see the Technical mastery roadmap)',
        'https://usesilsila.me/roadmap',
      ],
    ],
  },
];

/** JavaScript toolkit facts the owner must have at hand in a CoderPad or a Google Doc. */
export const TOOLKIT: { title: string; scope: string; chapters: number[] }[] = [
  {
    title: 'MinHeap class from memory (about 40 lines)',
    scope:
      'Array-backed heap with a comparator: push → bubbleUp, pop → swap with last and siftDown, peek, size. CoderPad and Google Docs have no imports. On LeetCode `@datastructures-js/priority-queue` (MinPriorityQueue, MaxPriorityQueue, PriorityQueue with compare) is preloaded.',
    chapters: [9, 19],
  },
  {
    title: 'Queue and deque without shift()',
    scope:
      'shift() is O(n): BFS uses an array plus a head index (`q[head++]`); two-stack queue for amortised O(1) (LeetCode 232); a real deque only when both ends are needed.',
    chapters: [0, 19],
  },
  {
    title: 'sort() always takes a comparator',
    scope:
      'Default sort is lexicographic ([10,2,1] → [1,10,2]); pass (a, b) => a - b; sort mutates, toSorted does not; comparator must be consistent.',
    chapters: [0, 19],
  },
  {
    title: 'Map and Set for typed keys and insertion order',
    scope:
      'Object keys become strings; Map keeps insertion order (LRU via delete-and-set); composite keys as `${r},${c}` or r * cols + c; one-liner duplicate check with Set size.',
    chapters: [0, 19],
  },
  {
    title: 'Strings are immutable',
    scope:
      'Build with an array and join; charCodeAt / fromCharCode for letter maths; codePointAt for non-BMP characters; split("") breaks surrogate pairs.',
    chapters: [0, 19],
  },
  {
    title: 'Numbers and bits',
    scope:
      'Number.MAX_SAFE_INTEGER is 2^53 − 1; BigInt for 64-bit; bitwise ops are 32-bit signed, >>> 0 for unsigned (190, 191); ~~x only for 32-bit truncation; ((x % k) + k) % k for a positive modulo; 0.1 + 0.2 !== 0.3.',
    chapters: [0, 14, 19],
  },
  {
    title: 'Recursion depth',
    scope:
      'About 10k frames in V8: write iterative DFS and iterative linked-list code when n ≥ 10^4; Array(m).fill([]) shares one array, use Array.from({ length: m }, () => []).',
    chapters: [19],
  },
  {
    title: 'Sorted-container stand-ins',
    scope:
      'No TreeMap: binary search over a sorted array (981), a heap for order-by-priority, or implement when the problem needs it.',
    chapters: [5, 9],
  },
];

export const HOW_TO_USE = {
  title: 'How this roadmap is ordered and how to use it',
  scope: [
    "Order follows NeetCode's dependency graph (arrays and hashing → two pointers → sliding window → stack → binary search → linked list → trees → tries → heap → backtracking → graphs → DP → greedy and intervals → bits), adjusted for return on time: two pointers, DFS/BFS and hash maps are the highest-frequency patterns; DP is weighted mainly at Google. Blind 75 ⊂ NeetCode 150 ⊂ NeetCode 250; Grind 75 overlaps both by roughly 55–60% and orders by popularity.",
    'One pattern at a time: read the book chapter, do the core problems in order (5–10 per pattern), record every attempt in Practice so revision dates drive the second pass; open "More practice" only when revision marks a pattern Yellow.',
    'Company emphasis. Stripe asks no LeetCode-style questions: a long multi-part practical scenario, then bug bash, integrations, API-focused design and behavioural; AI prohibited, docs and debugger allowed (one Glassdoor report of an AI-assisted round conflicts; confirm with the recruiter). Shopify: AI-assisted screen in your own IDE and a two-hour onsite AI coding round, problems not algorithmically hard and design-layered, judged on verifying AI output. Wealthsimple: CoderPad screen, Bring Your Own System, pair programming on a multi-level problem, OOP structure judged. Amazon SDE II (official): 90-minute OA with two coding problems plus design scenarios and a work-style survey; four 55-minute loop rounds with Leadership Principles in each; real code, not pseudo code; two mediums from sliding window, binary search, graphs, heaps, two pointers. Google: one screen plus two or three onsite coding rounds, medium to hard, trees, graphs and DP weighted higher, problems combine patterns, no running code, no AI. Meta: 35 minutes with two problems, DP discouraged, one onsite round now AI-enabled; E5 reports 1249, 314, 227, 215, 408. Microsoft: easy-to-medium screen, OA with one easy and one hard; 146, 273, 297, 88, 2858 reported. Cohere and similar Canadian AI companies: parser, API and cache tasks, memorised LeetCode flagged.',
    'Uncertainty: NeetCode and Grind order come from mirrors and the FAQ (the live pages are client-rendered); Prashad membership is verified by the builder against the JSON; LeetCode company tags are Premium and were not used; Glassdoor and Blind items are anecdotal; no usable data for Faire, Clio, 1Password or Hopper.',
  ].join('\n\n'),
  references: [
    [
      'NeetCode roadmap mirror',
      'https://github.com/aridepai17/NEETCODE-ROADMAP',
    ],
    ['Grind 75 FAQ', 'https://www.techinterviewhandbook.org/grind75/faq/'],
    ['AlgoMonster problem stats', 'https://algo.monster/problems/stats'],
    [
      'Tech Interview Handbook study plan',
      'https://www.techinterviewhandbook.org/coding-interview-study-plan/',
    ],
    [
      'Sean Prashad LeetCode patterns',
      'https://seanprashad.com/leetcode-patterns/',
    ],
    [
      'Amazon SDE II interview prep (official)',
      'https://amazon.jobs/content/en/how-we-hire/sde-ii-interview-prep',
    ],
    [
      'Meta: preparing for your software engineering interview (official)',
      'https://www.metacareers.com/blog/preparing-for-your-software-engineering-interview-at-meta/',
    ],
    [
      'HelloInterview Google L4 guide',
      'https://www.hellointerview.com/guides/google/l4',
    ],
    [
      'HelloInterview Meta E5 guide',
      'https://www.hellointerview.com/guides/meta/e5',
    ],
    [
      'HelloInterview Microsoft senior guide',
      'https://www.hellointerview.com/guides/microsoft/senior',
    ],
    [
      'interviewing.io Stripe questions',
      'https://interviewing.io/stripe-interview-questions',
    ],
    [
      'interviewing.io Shopify questions',
      'https://interviewing.io/shopify-interview-questions',
    ],
    [
      'DesignGurus Wealthsimple process',
      'https://www.designgurus.io/answers/detail/what-is-the-wealthsimple-interview-process-like-round-by-round',
    ],
    [
      'LeetCode discuss: 74-interview analysis 2026',
      'https://leetcode.com/discuss/post/8446005/',
    ],
    [
      'Cohere interview prep 2026 (jobsbyculture)',
      'https://jobsbyculture.com/blog/cohere-interview-prep-2026',
    ],
  ] as [string, string][],
};

/** Prashad tag → pattern name, first matching tag wins; the rest go under "Other patterns". */
export const PRASHAD_TAG_TO_PATTERN: [RegExp, string][] = [
  [/^(Two Pointers|Floyd's Cycle Finding Algorithm)$/, 'Two Pointers'],
  [/^(Sliding Window|Prefix Sum)$/, 'Sliding Window & Prefix Sum'],
  [/^Binary Search$/, 'Binary Search'],
  [/^Backtracking$/, 'Backtracking'],
  [/^Linked List$/, 'Linked List'],
  [/^(Stack|Monotonic Stack|Bracket Sequences)$/, 'Stack & Monotonic Stack'],
  [/^Heap \(Priority Queue\)$/, 'Heap / Priority Queue'],
  [/^Trie$/, 'Tries'],
  [
    /^(Tree|Binary Tree|Binary Search Tree|Lowest Common Ancestor|DP on Trees)$/,
    'Trees',
  ],
  [
    /^(Graph Theory|Breadth-First Search|Depth-First Search|Topological Sort|Union-Find|Directed Acyclic Graph|Shortest Path)$/,
    'Graphs',
  ],
  [
    /^(Dynamic Programming|Memoization|Knapsack Problem|0-1 Knapsack|Longest Increasing Subsequence)$/,
    '1-D Dynamic Programming',
  ],
  [
    /^(Divide and Conquer|Merge Sort|Quicksort|Quickselect)$/,
    '2-D Dynamic Programming',
  ],
  [/^(Bit Manipulation|Bitmask)$/, 'Bit Manipulation & Math'],
  [/^(Sweep Line|Greedy|Intervals)$/, 'Greedy & Intervals'],
  [/^(Design|Data Stream|Ordered Set)$/, 'Design a class'],
  [
    /^(Array|Hash Table|String|Sorting|Math|Counting|Matrix|Simulation|Recursion|Bucket Sort)$/,
    'Arrays & Hashing',
  ],
];
