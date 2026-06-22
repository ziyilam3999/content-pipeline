/**
 * Canonical social links bound to this channel / content-pipeline — the SSOT that every publish
 * path (YouTube, and future platforms) references so handles never drift or get re-typed.
 *
 * Every URL here is operator-confirmed AND verified to resolve to the intended account before commit
 * (a typo'd handle = a dead link or a stranger's profile — see the verify-external-identifier lesson).
 *
 *   - github  : github.com/ziyilam3999          (repo owner — verified by existence)
 *   - x       : x.com/anson3999                  (the posts link real statuses there — verified)
 *   - threads : threads.com/@gotextrameal        (verified 2026-06-19 — live profile, display "Anson Lam")
 *   - youtube : @ansonlam9488                    (operator-provided channel)
 *
 * LinkedIn is intentionally ABSENT: it is on hold (the operator's day-job employer might notice), and
 * linking it from a PUBLIC channel re-creates exactly that discoverable connection. Add a `linkedin`
 * key here only when the operator decides to go public on LinkedIn.
 */
export const SOCIAL_LINKS = {
  github: "https://github.com/ziyilam3999",
  x: "https://x.com/anson3999",
  threads: "https://www.threads.com/@gotextrameal",
} as const;

/** The YouTube channel these uploads target. */
export const YOUTUBE_CHANNEL = "@ansonlam9488";
