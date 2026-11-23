/**
 * The standard for an agent-written PR body, and the checker that holds a body
 * to it before the worker publishes: seven `##` sections in a fixed order, at
 * most {@link MAX_LINES} lines, and one finding with a one-sentence fix for
 * every gap. Errors block publishing; hints never do.
 *
 * It imports nothing, so CI runs `scripts/pr-check.ts` with bare bun and no
 * install.
 */

export type Severity = 'error' | 'hint';

/** One standard `##` section of a PR body. */
export interface Section {
  readonly heading: string;
  readonly required: boolean;
  /** What the section holds, as the template comment states it. */
  readonly purpose: string;
}

/** The standard sections, in the order a body lists them. */
export const SECTIONS: ReadonlyArray<Section> = [
  {
    heading: 'Summary',
    required: true,
    purpose: 'What changed and why, in at most three sentences. Open with the goal.',
  },
  {
    heading: 'What changed',
    required: true,
    purpose: 'One bullet per change a reviewer would look for, at most six.',
  },
  {
    heading: 'Decisions',
    required: false,
    purpose: 'Each choice a reviewer would question: what you picked, over what, and why.',
  },
  {
    heading: 'Proof',
    required: false,
    purpose: 'What shows it working: screenshots, report images, a PDF, links to runs.',
  },
  {
    heading: 'Blast Radius',
    required: true,
    purpose: 'What else this touches or could break, and how to back it out.',
  },
  {
    heading: 'Verification',
    required: true,
    purpose: 'The commands you ran and their results, as code. Never a promise.',
  },
  { heading: 'Follow-ups', required: false, purpose: 'What is left, and who does it.' },
];

/** The most non-blank lines a body may hold, HTML comments not counted. */
export const MAX_LINES = 40;

/** `type(scope): subject`, with a lowercase subject of ten or more characters. */
export const TITLE_PATTERN =
  /^(feat|fix|docs|chore|refactor|test|perf|ci|build|revert)(\([a-z0-9-]+\))?!?: [a-z].{9,}$/;

/** One gap between a body and the standard. */
export interface Finding {
  readonly severity: Severity;
  readonly rule: string;
  /** The standard section, or an unknown heading as written; undefined for the title and the body as a whole. */
  readonly section: string | undefined;
  readonly message: string;
  /** One imperative sentence the worker can act on. */
  readonly fix: string;
}

/** Every finding for one body, errors first. */
export interface Report {
  readonly findings: ReadonlyArray<Finding>;
  readonly errors: number;
  readonly hints: number;
  /** Non-blank lines outside HTML comments. */
  readonly lines: number;
}

type Rule =
  | 'title-format'
  | 'missing-section'
  | 'duplicate-section'
  | 'empty-section'
  | 'placeholder'
  | 'too-long'
  | 'verification-evidence'
  | 'order'
  | 'unknown-section'
  | 'wrong-level'
  | 'summary-length'
  | 'bullets'
  | 'wall-of-text'
  | 'no-decisions'
  | 'no-proof'
  | 'proof-without-evidence';

const ERRORS: ReadonlySet<Rule> = new Set<Rule>([
  'title-format',
  'missing-section',
  'duplicate-section',
  'empty-section',
  'placeholder',
  'too-long',
  'verification-evidence',
]);

const SUMMARY_SENTENCES = 3;
const SUMMARY_CHARACTERS = 400;
const MAX_BULLETS = 6;
const WALL_CHARACTERS = 300;

/** One body line: a fenced line keeps its text, any other loses its HTML comments. */
interface Line {
  readonly text: string;
  readonly fenced: boolean;
  /** HTML comments that open on this line. */
  readonly comments: number;
}

interface Heading {
  readonly level: number;
  readonly title: string;
}

/** The lines under one `##` heading; the block above the first heading has no title. */
interface Block {
  readonly title: string | undefined;
  readonly standard: Section | undefined;
  readonly lines: ReadonlyArray<Line>;
}

interface Body {
  readonly title: string | undefined;
  readonly lines: ReadonlyArray<Line>;
  readonly blocks: ReadonlyArray<Block>;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+/;
const TOP_BULLET = /^ ?(?:[-*+]|\d+[.)])\s+/;
const TOKEN = /\b(TODO|TBD|FIXME)\b/;
const INLINE_CODE = /`[^`]+`/;
const INLINE_CODES = /`[^`]+`/g;
const LINK = /\[[^\]]*\]\([^)]+\)|<https?:\/\/[^>\s]+>|https?:\/\/\S+/;
const IMAGE = /!\[[^\]]*\]\([^)]+\)|<img\b[^>]*>/i;
const ATTACHMENTS = /!?\[[^\]]*\]\([^)]+\)|<img\b[^>]*>|<https?:\/\/[^>\s]+>|https?:\/\/\S+/gi;
const LINK_TEXT = /!?\[([^\]]*)\]\([^)]+\)/g;
const BARE_TARGETS = /<img\b[^>]*>|<https?:\/\/[^>\s]+>|https?:\/\/\S+/gi;

/**
 * Split a body into lines, tracking fenced code and HTML comments (which may
 * span lines). Nothing inside a fence is a heading, a comment or a token.
 */
const scan = (body: string): ReadonlyArray<Line> => {
  const lines: Array<Line> = [];
  let fence: string | undefined;
  let inComment = false;
  for (const raw of body.split(/\r?\n/)) {
    const marker = inComment ? undefined : FENCE.exec(raw)?.[1];
    if (fence !== undefined) {
      const closes =
        marker !== undefined &&
        marker.charAt(0) === fence.charAt(0) &&
        marker.length >= fence.length &&
        raw.trim() === marker;
      if (closes) fence = undefined;
      lines.push({ text: raw, fenced: true, comments: 0 });
      continue;
    }
    if (marker !== undefined) {
      fence = marker;
      lines.push({ text: raw, fenced: true, comments: 0 });
      continue;
    }
    let text = '';
    let comments = 0;
    let rest = raw;
    while (rest !== '') {
      const at = rest.indexOf(inComment ? '-->' : '<!--');
      if (at === -1) {
        if (!inComment) text += rest;
        break;
      }
      if (!inComment) {
        text += rest.slice(0, at);
        comments += 1;
      }
      rest = rest.slice(at + (inComment ? 3 : 4));
      inComment = !inComment;
    }
    lines.push({ text, fenced: false, comments });
  }
  return lines;
};

const headingOf = (line: Line): Heading | undefined => {
  if (line.fenced) return undefined;
  const match = HEADING.exec(line.text);
  return match === null
    ? undefined
    : { level: match[1]?.length ?? 0, title: (match[2] ?? '').trim() };
};

const normalize = (text: string): string => text.trim().replace(/\s+/g, ' ').toLowerCase();

const standardOf = (title: string): Section | undefined =>
  SECTIONS.find((section) => normalize(section.heading) === normalize(title));

const split = (lines: ReadonlyArray<Line>): ReadonlyArray<Block> => {
  const starts = lines.flatMap((line, index) => {
    const heading = headingOf(line);
    return heading?.level === 2 ? [{ index, title: heading.title }] : [];
  });
  const preamble: Block = {
    title: undefined,
    standard: undefined,
    lines: lines.slice(0, starts[0]?.index ?? lines.length),
  };
  return [
    preamble,
    ...starts.map((start, position) => ({
      title: start.title,
      standard: standardOf(start.title),
      lines: lines.slice(start.index + 1, starts[position + 1]?.index ?? lines.length),
    })),
  ];
};

const filled = (line: Line): boolean => line.text.trim() !== '';

const evidence = (lines: ReadonlyArray<Line>): boolean =>
  lines.some((line) =>
    line.fenced
      ? filled(line)
      : INLINE_CODE.test(line.text) || LINK.test(line.text) || IMAGE.test(line.text),
  );

const attachmentOnly = (text: string): boolean => {
  const rest = text.replace(ATTACHMENTS, '');
  return rest !== text && /^[\s\d\-*+>|,;:.()]*$/.test(rest);
};

/** Characters a reader sees: link targets collapse to their text. */
const visibleLength = (text: string): number =>
  text.replace(LINK_TEXT, '$1').replace(BARE_TARGETS, 'link').trim().length;

/** The longest prose paragraph or list item, in visible characters. */
const longestParagraph = (lines: ReadonlyArray<Line>): number => {
  let longest = 0;
  let current = 0;
  for (const line of lines) {
    const text = line.text.trim();
    if (line.fenced || text === '' || headingOf(line) !== undefined || text.startsWith('|')) {
      current = 0;
    } else if (!attachmentOnly(text)) {
      const length = visibleLength(text);
      current = BULLET.test(text) || current === 0 ? length : current + 1 + length;
      longest = Math.max(longest, current);
    }
  }
  return longest;
};

const sentenceCount = (text: string): number =>
  text
    .replace(INLINE_CODES, 'code')
    .replace(/\b(?:e\.g|i\.e|etc|vs)\./gi, 'x')
    .split(/(?<=[.!?])\s+/)
    .filter((part) => part.trim() !== '').length;

const ALIASES: ReadonlyArray<readonly [heading: string, aliases: ReadonlyArray<string>]> = [
  [
    'Summary',
    [
      'why',
      'motivation',
      'context',
      'background',
      'overview',
      'description',
      'goal',
      'problem',
      'tldr',
      'tl;dr',
    ],
  ],
  [
    'What changed',
    ['changes', 'what', 'changelog', 'implementation', 'details', 'how', 'approach', 'solution'],
  ],
  [
    'Decisions',
    ['tradeoffs', 'trade-offs', 'trade offs', 'alternatives', 'design', 'rationale', 'decision'],
  ],
  [
    'Proof',
    [
      'screenshots',
      'screenshot',
      'demo',
      'evidence',
      'preview',
      'recording',
      'video',
      'images',
      'results',
    ],
  ],
  [
    'Blast Radius',
    [
      'scope',
      'risk',
      'risks',
      'impact',
      'rollback',
      'rollout',
      'breaking changes',
      'migration',
      'compatibility',
    ],
  ],
  [
    'Verification',
    ['testing', 'test', 'tests', 'test plan', 'how to test', 'validation', 'qa', 'checks'],
  ],
  [
    'Follow-ups',
    [
      'follow ups',
      'followups',
      'follow-up',
      'todo',
      'next steps',
      'future work',
      'notes',
      'open questions',
      'known issues',
    ],
  ],
];

const FOLD: ReadonlyMap<string, string> = new Map(
  ALIASES.flatMap(([heading, aliases]) =>
    aliases.map((alias): readonly [string, string] => [alias, heading]),
  ),
);

const STOP: ReadonlySet<string> = new Set([
  'what',
  'with',
  'that',
  'this',
  'each',
  'would',
  'could',
  'your',
  'most',
  'never',
  'three',
  'else',
  'left',
  'does',
  'over',
]);

const stem = (word: string): string =>
  word.length > 4 ? word.replace(/(?:ing|ed|es|e|s)$/, '') : word;

/** The standard section an unknown heading belongs in: an alias, else the best purpose match. */
const foldTarget = (title: string): string => {
  const exact = FOLD.get(normalize(title));
  if (exact !== undefined) return exact;
  const tokens = title.toLowerCase().match(/[a-z]+/g) ?? [];
  const ranked = SECTIONS.map((section) => {
    const vocabulary = new Set(
      (`${section.heading} ${section.purpose}`.toLowerCase().match(/[a-z]+/g) ?? [])
        .filter((word) => word.length > 3 && !STOP.has(word))
        .map(stem),
    );
    const score = tokens.reduce(
      (total, token) =>
        total +
        (FOLD.get(token) === section.heading ? 2 : 0) +
        (vocabulary.has(stem(token)) ? 1 : 0),
      0,
    );
    return { heading: section.heading, score };
  })
    .filter((entry) => entry.score > 0)
    .toSorted((left, right) => right.score - left.score);
  return ranked[0]?.heading ?? 'What changed';
};

const finding = (
  rule: Rule,
  section: string | undefined,
  message: string,
  fix: string,
): Finding => ({
  severity: ERRORS.has(rule) ? 'error' : 'hint',
  rule,
  section,
  message,
  fix,
});

const sectionOf = (block: Block): string | undefined => block.standard?.heading ?? block.title;

const whereOf = (block: Block): string =>
  block.title === undefined ? 'above the first heading' : `under ## ${sectionOf(block)}`;

/** The purpose's first sentence, lowercased to follow "with". */
const askOf = (section: Section): string => {
  const first = section.purpose.split('. ')[0] ?? section.purpose;
  return `${first.charAt(0).toLowerCase()}${first.slice(1)}`.replace(/\.$/, '');
};

const blocksOf = (body: Body, heading: string): ReadonlyArray<Block> =>
  body.blocks.filter((block) => block.standard?.heading === heading);

const linesOf = (body: Body, heading: string): ReadonlyArray<Line> =>
  blocksOf(body, heading).flatMap((block) => block.lines);

const titleFormat = (body: Body): ReadonlyArray<Finding> =>
  body.title === undefined || TITLE_PATTERN.test(body.title)
    ? []
    : [
        finding(
          'title-format',
          undefined,
          `The title "${body.title}" is not type(scope): subject.`,
          'Rewrite the title as type(scope): subject, with a conventional type and a lowercase subject of ten or more characters.',
        ),
      ];

const missingSection = (body: Body): ReadonlyArray<Finding> =>
  SECTIONS.filter(
    (section) => section.required && blocksOf(body, section.heading).length === 0,
  ).map((section) =>
    finding(
      'missing-section',
      section.heading,
      `## ${section.heading} is missing.`,
      `Add a ## ${section.heading} section with ${askOf(section)}.`,
    ),
  );

const duplicateSection = (body: Body): ReadonlyArray<Finding> =>
  SECTIONS.flatMap((section) => {
    const count = blocksOf(body, section.heading).length;
    return count > 1
      ? [
          finding(
            'duplicate-section',
            section.heading,
            `## ${section.heading} appears ${count} times.`,
            `Merge the ${count} ## ${section.heading} sections into one.`,
          ),
        ]
      : [];
  });

const emptySection = (body: Body): ReadonlyArray<Finding> =>
  body.blocks.flatMap((block) => {
    if (block.title === undefined || block.lines.some(filled)) return [];
    if (block.standard?.required === true) {
      const heading = block.standard.heading;
      return [
        finding(
          'empty-section',
          heading,
          `## ${heading} is empty.`,
          `Fill ## ${heading} with ${askOf(block.standard)}.`,
        ),
      ];
    }
    const heading = sectionOf(block);
    return [
      finding(
        'empty-section',
        heading,
        `## ${heading} is empty.`,
        `Drop the empty ## ${heading} heading.`,
      ),
    ];
  });

const placeholderComment = (body: Body): ReadonlyArray<Finding> =>
  body.blocks
    .filter((block) => block.lines.some((line) => line.comments > 0))
    .map((block) =>
      finding(
        'placeholder',
        sectionOf(block),
        `An HTML comment is left ${whereOf(block)}.`,
        `Replace the HTML comment ${whereOf(block)} with real content, or delete it.`,
      ),
    );

const placeholderToken = (body: Body): ReadonlyArray<Finding> =>
  body.blocks.flatMap((block) => {
    const token = block.lines
      .map((line) =>
        line.fenced ? undefined : TOKEN.exec(line.text.replace(INLINE_CODES, ''))?.[1],
      )
      .find((match) => match !== undefined);
    return token === undefined
      ? []
      : [
          finding(
            'placeholder',
            sectionOf(block),
            `A ${token} marker is left ${whereOf(block)}.`,
            `Replace the ${token} ${whereOf(block)} with finished text, or state the open work under ## Follow-ups without the marker.`,
          ),
        ];
  });

const tooLong = (body: Body): ReadonlyArray<Finding> => {
  const count = body.lines.filter(filled).length;
  return count > MAX_LINES
    ? [
        finding(
          'too-long',
          undefined,
          `The body has ${count} lines, over the ${MAX_LINES}-line limit.`,
          `Cut the body to ${MAX_LINES} lines by moving logs and long tables into a linked file or PR comment.`,
        ),
      ]
    : [];
};

const verificationEvidence = (body: Body): ReadonlyArray<Finding> => {
  const lines = linesOf(body, 'Verification');
  return lines.some(filled) && !evidence(lines)
    ? [
        finding(
          'verification-evidence',
          'Verification',
          '## Verification holds no command, output or link.',
          'Put the commands you ran and their results under ## Verification as inline code or a fenced block.',
        ),
      ]
    : [];
};

const order = (body: Body): ReadonlyArray<Finding> => {
  const seen = body.blocks.flatMap((block) =>
    block.standard === undefined ? [] : [block.standard],
  );
  const present = seen.filter((section, index) => seen.indexOf(section) === index);
  const misplaced = present.find((section, index) =>
    present
      .slice(0, index)
      .some((earlier) => SECTIONS.indexOf(earlier) > SECTIONS.indexOf(section)),
  );
  if (misplaced === undefined) return [];
  const expected = SECTIONS.filter((section) => present.includes(section))
    .map((section) => section.heading)
    .join(', ');
  return [
    finding(
      'order',
      misplaced.heading,
      `## ${misplaced.heading} is out of order.`,
      `Move ## ${misplaced.heading} into place: ${expected}.`,
    ),
  ];
};

const unknownSection = (body: Body): ReadonlyArray<Finding> =>
  body.blocks.flatMap((block) =>
    block.title === undefined || block.standard !== undefined
      ? []
      : [
          finding(
            'unknown-section',
            block.title,
            `## ${block.title} is not a standard section.`,
            `Fold ## ${block.title} into ## ${foldTarget(block.title)}.`,
          ),
        ],
  );

const wrongLevel = (body: Body): ReadonlyArray<Finding> =>
  body.lines.flatMap((line) => {
    const heading = headingOf(line);
    const standard =
      heading === undefined || heading.level === 2 ? undefined : standardOf(heading.title);
    if (heading === undefined || standard === undefined) return [];
    const written = `${'#'.repeat(heading.level)} ${heading.title}`;
    return [
      finding(
        'wrong-level',
        standard.heading,
        `${written} is not a level-2 heading.`,
        `Write ${written} as ## ${standard.heading}.`,
      ),
    ];
  });

const summaryLength = (body: Body): ReadonlyArray<Finding> => {
  const text = linesOf(body, 'Summary')
    .filter((line) => !line.fenced && filled(line))
    .map((line) => line.text.trim())
    .join(' ');
  const sentences = sentenceCount(text);
  return sentences > SUMMARY_SENTENCES || text.length > SUMMARY_CHARACTERS
    ? [
        finding(
          'summary-length',
          'Summary',
          `## Summary runs ${sentences} sentences and ${text.length} characters.`,
          `Cut ## Summary to at most three sentences and ${SUMMARY_CHARACTERS} characters, opening with the goal.`,
        ),
      ]
    : [];
};

const bullets = (body: Body): ReadonlyArray<Finding> => {
  const lines = linesOf(body, 'What changed');
  if (!lines.some(filled)) return [];
  const count = lines.filter((line) => !line.fenced && TOP_BULLET.test(line.text)).length;
  if (count === 0) {
    return [
      finding(
        'bullets',
        'What changed',
        '## What changed has no bullets.',
        'Rewrite ## What changed as one bullet per change.',
      ),
    ];
  }
  return count > MAX_BULLETS
    ? [
        finding(
          'bullets',
          'What changed',
          `## What changed has ${count} bullets.`,
          `Cut ## What changed to at most ${MAX_BULLETS} bullets by merging related changes.`,
        ),
      ]
    : [];
};

const wallOfText = (body: Body): ReadonlyArray<Finding> =>
  body.blocks.flatMap((block) => {
    if (block.standard?.heading === 'Summary') return [];
    const longest = longestParagraph(block.lines);
    return longest > WALL_CHARACTERS
      ? [
          finding(
            'wall-of-text',
            sectionOf(block),
            `A ${longest}-character paragraph ${whereOf(block)} reads as a wall of text.`,
            `Split the long paragraph ${whereOf(block)} into bullets.`,
          ),
        ]
      : [];
  });

const noDecisions = (body: Body): ReadonlyArray<Finding> =>
  blocksOf(body, 'Decisions').length > 0
    ? []
    : [
        finding(
          'no-decisions',
          'Decisions',
          'The body records no decisions.',
          'Add a ## Decisions section when a reviewer would question a choice, and skip it when none would.',
        ),
      ];

const noProof = (body: Body): ReadonlyArray<Finding> =>
  blocksOf(body, 'Proof').length > 0 ||
  body.lines.some((line) => !line.fenced && IMAGE.test(line.text))
    ? []
    : [
        finding(
          'no-proof',
          'Proof',
          'The body shows no proof.',
          'If the change is visible (UI, CLI output, a report), attach a screenshot under ## Proof.',
        ),
      ];

const proofWithoutEvidence = (body: Body): ReadonlyArray<Finding> => {
  const lines = linesOf(body, 'Proof');
  return lines.some(filled) && !evidence(lines)
    ? [
        finding(
          'proof-without-evidence',
          'Proof',
          '## Proof holds no image, link or code.',
          'Put a screenshot, a link to a run, or the output as code under ## Proof.',
        ),
      ]
    : [];
};

const RULES: ReadonlyArray<(body: Body) => ReadonlyArray<Finding>> = [
  titleFormat,
  missingSection,
  duplicateSection,
  emptySection,
  placeholderComment,
  placeholderToken,
  tooLong,
  verificationEvidence,
  order,
  unknownSection,
  wrongLevel,
  summaryLength,
  bullets,
  wallOfText,
  noDecisions,
  noProof,
  proofWithoutEvidence,
];

const rankOf = (entry: Finding): number => (entry.severity === 'error' ? 0 : 1);

/**
 * Hold a PR body (and, when given, its title) to the standard.
 * @param input - the body as markdown, and the PR title
 * @returns every finding, errors first, with the counts and the body's line count
 */
export const check = (input: {
  readonly body: string;
  readonly title?: string | undefined;
}): Report => {
  const lines = scan(input.body);
  const body: Body = { title: input.title, lines, blocks: split(lines) };
  const findings = RULES.flatMap((rule) => rule(body)).toSorted(
    (left, right) => rankOf(left) - rankOf(right),
  );
  const errors = findings.filter((entry) => entry.severity === 'error').length;
  return { findings, errors, hints: findings.length - errors, lines: lines.filter(filled).length };
};

/** A body skeleton: every standard section, each with its purpose as a comment to replace. */
export const template = (): string =>
  `${SECTIONS.map(
    (section) =>
      `## ${section.heading}\n<!-- ${section.required ? '' : '(optional, drop if empty) '}${section.purpose} -->`,
  ).join('\n\n')}\n`;

const nextOf = (report: Report): string => {
  if (report.errors > 0) return 'fix the errors, then check again';
  return report.hints > 0 ? 'fix the hints that apply, then publish' : 'publish';
};

/**
 * The report as text. The agent form is `key=value` lines ending in `next=`;
 * the human form is a header and one glyph line per finding.
 * @param report - from {@link check}
 * @param options - `human` picks the human form
 */
export const render = (report: Report, options: { readonly human: boolean }): string => {
  if (options.human) {
    const verdict = report.errors > 0 ? 'PR body not ready' : 'PR body ready';
    return [
      `${verdict} · errors ${report.errors} · hints ${report.hints} · lines ${report.lines}/${MAX_LINES}`,
      ...report.findings.map(
        (entry) => `${entry.severity === 'error' ? '✗' : '→'} ${entry.message} ${entry.fix}`,
      ),
    ].join('\n');
  }
  return [
    `pr-check errors=${report.errors} hints=${report.hints} lines=${report.lines}/${MAX_LINES}`,
    ...report.findings.map(
      (entry) =>
        `${entry.severity} rule=${entry.rule}${entry.section === undefined ? '' : ` section=${JSON.stringify(entry.section)}`} fix=${JSON.stringify(entry.fix)}`,
    ),
    `next=${JSON.stringify(nextOf(report))}`,
  ].join('\n');
};
