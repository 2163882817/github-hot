# GitHub Trending HTML fixtures

The four HTML files were downloaded from the public GitHub Trending pages on 2026-10-19 (Asia/Shanghai) for daily/all, monthly/all, daily/typescript, and monthly/typescript.

Verified source URLs:

- https://github.com/trending?since=daily
- https://github.com/trending?since=monthly
- https://github.com/trending/typescript?since=daily
- https://github.com/trending/typescript?since=monthly

At capture time the pages contained 14, 20, 15, and 20 repository rows respectively. Every row in these fixtures has a parseable period Star count. The TypeScript URLs are independent GitHub Trending pages, not a local filter of the all-language list. The monthly page text is `stars this month`; it follows GitHub Trending's period, not a calendar-month calculation. The parser keeps upstream position only for ties and sorts by the parsed period count.

These files are test inputs only. They are not the production feed and must not be served to users as current rankings. Recheck selectors, language slugs, and the stars today / stars this month labels whenever the parser changes.
