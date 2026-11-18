# Development workflow while Macaly remains live

## Source-of-truth boundary

- GitHub branch `work` is the reviewed record for code, tests, workflows and documentation.
- Macaly is temporarily the live frontend workspace and publisher. It does not pull GitHub changes automatically.
- Convex owns operational application data and authenticated APIs. n8n owns routine orchestration.
- A Macaly preview or publication is not evidence that GitHub contains the same code. A Git push is not evidence that Macaly changed.

## Default change path

### Frontend/UI work

1. Make the scoped UI change in Macaly and validate it in Preview. Do not publish yet.
2. Click **Download** in Macaly. Keep the original ZIP locally; never upload or share it until you have confirmed it contains no `.env*`, credential or secret files. Create a sanitized copy when the audit will run on another computer.
3. Audit it from the repository root:

   ```bash
   npm run macaly:audit -- /path/to/macaly-export.zip
   ```

   The command is read-only. It ignores `.env.local`, secrets, dependencies and build output. It never copies or deletes files.
4. Deliberately merge only the intended source/assets into `work`. Never replace the repository wholesale and never import `.env.local`.
5. Run `npm run verify`.
6. Commit and push `work`; wait for the GitHub **Quality checks** workflow.
7. Recheck the same flow in Macaly Preview, then publish Macaly.
8. Record the Macaly publication and Git commit together in the handoff.

### Backend, Convex, n8n and documentation work

1. Change `work`, run the relevant focused tests and then `npm run verify`.
2. Push only reviewed code. The normal GitHub quality workflow validates but never deploys.
3. Convex production deploys are performed from Macaly against its existing Live deployment; GitHub does not hold a production deploy secret.
4. Follow the relevant runbook before any live Convex deploy or n8n mutation.
5. If a backend contract affects the UI, complete the frontend path above before publishing Macaly.

## Rules that prevent drift

- One scoped change at a time; do not edit the same frontend file concurrently in Macaly and GitHub.
- Macaly Publish is always the last step, after Preview, export audit, merge and CI.
- Never copy `.env.local`, secret values, credential IDs or Macaly internal files into Git.
- Never delete repository-only files merely because a Macaly export does not contain them.
- Assets containing personal or biometric images require explicit authorization before committing.
- GitHub CI performs validation only. Deployment remains an explicit, separately authorized action.

## One-command verification

```bash
npm run verify
```

This runs Vitest, the n8n workflow policy test, TypeScript, the production build and whitespace validation.

## Current temporary limitation

Macaly has no GitHub pull in the current project UI. Until the frontend is migrated to GitHub-based deployment, every published UI change must be reconciled through a fresh Macaly Download export. This is intentional and safer than overwriting either copy.
