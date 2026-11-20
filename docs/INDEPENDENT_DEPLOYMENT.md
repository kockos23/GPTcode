# Independent frontend deployment

The production frontend can be deployed directly from GitHub without Macaly. Convex remains the data and authentication backend; n8n remains the execution layer.

## Cloudflare Pages

- Repository: `kockos23/GPTcode`
- Production branch: `work` (switch to `main` after the release-branch cleanup)
- Build command: `npm run build:static`
- Build output: `.output/public`
- Node version: `22`

Set these non-secret build variables:

```text
VITE_CONVEX_URL=https://coordinated-mongoose-77.eu-west-1.convex.cloud
VITE_ENABLE_MACALY_GOOGLE=false
VITE_ENABLE_MACALY_BRIDGE=false
```

The independent deployment uses the existing Resend one-time-code login. Macaly Google authentication is intentionally disabled because it depends on Macaly's proprietary OAuth handoff. Replace it later with a standard Google OAuth provider before removing the legacy provider from Convex.

Cloudflare Pages should serve the included `_redirects` and `_headers` files. Attach the final custom domain only after the preview deployment passes login and owner-access tests.
