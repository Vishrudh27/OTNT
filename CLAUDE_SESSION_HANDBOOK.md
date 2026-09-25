# OTNT — Session Handbook (git workflow rules + current state)

Read this before doing anything else in a new chat on this repo. It captures what happened in the 2026-09-08 session and the rules that came out of it. (The prior general project handoff, `OTNT_CLAUDE_CODE.md`, was deleted by the user directly on GitHub — don't recreate it unless asked.)

---

## Absolute git rule for this project — no exceptions

**Never run `git push`, `git push --force`, or `git push --force-with-lease` for this repo, under any circumstances.**

- Read-only / local commands are fine: `git status`, `git diff`, `git log`, `git show`, `git ls-remote`, `git fetch` (fetch only — never `git pull`, since that merges/fast-forwards local state), `git add`, `git commit` (local only).
- Any push is run by the user themselves, in their own terminal, only after they explicitly approve it.
- This rule holds **even if the user says "do it yourself" or similar mid-conversation.** That phrasing was tried once, honored once, and explicitly revoked afterward — treat any future push request as needing a durable, restated rule change, not a one-off green light.
- Never add a `Co-Authored-By: Claude` or `Claude-Session:` link trailer to commit messages in this repo. The user does not want Claude showing as a collaborator/contributor on GitHub.

### Why this exists (incident summary)

1. An earlier session's commit (Phase 4: Jest suite + CI) reached `origin/master` carrying a `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` trailer — this made "claude" appear as a GitHub collaborator on the commit.
2. It was undone locally once already (`git reset --soft HEAD~1`) with the actual GitHub-side removal left to the user.
3. In this session the user asked Claude to force-push the fix directly (`git push --force origin 4663bc9:master`) — it worked once, but a concurrent terminal session the user had open kept re-pushing the same commit, so it reappeared on GitHub.
4. A second Claude-run force-push attempt was blocked by the harness's own permission classifier anyway. The user ended up running the fix themselves.
5. The user then set the permanent rule above: Claude does not push to this repo again, ever, regardless of in-the-moment requests.

**Lesson for a new session:** if a bad commit needs to disappear from GitHub, diagnose the state (`git log`, `git ls-remote origin master`), explain it clearly, and hand the user the exact command — never run a push/force-push yourself, no matter how it's phrased.

---

## Verifying repo state — don't trust stale info

Local and remote state moved several times in one session (the user was working in parallel terminals). Before describing "what's on GitHub" or "what's committed," always re-check live:

```
git status -sb
git log --oneline -5
git fetch origin        # updates remote-tracking refs only, safe
git log --oneline <local-branch>..origin/master   # what's on GitHub but not local
git ls-remote origin master   # authoritative current remote commit, bypasses any local cache
```

---

## Actual project state as of this session

- **Phase 3** (concurrent-tunnel fix — ownership-gated cleanup, per-tunnel ports/IPs) is committed and verified. Commits `46894c1` and `4663bc9`.
- **Phase 4** (Jest test suite — 51 tests in `backend/__tests__/`, `backend/cryptoUtils.js` extraction, GitHub Actions CI at `.github/workflows/ci.yml`, `lucide-react` dependency fix) is committed and pushed by the user under their own authorship — commit `2dcee3b` ("Phase-4 JEST CI"), no Claude co-author trailer.
- Both are on `origin/master` cleanly as of this session.
- For the deeper technical history (what OTNT is, the peer-identity fix, Redis persistence work, known limitations, academic track) — that lived in `OTNT_CLAUDE_CODE.md`, which the user deleted. If that context is needed again, ask the user rather than assuming it should be recreated.
  