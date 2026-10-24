# Turning on sign-in

The database is ready: tables, rules and tests (see [README.md](README.md)). These steps, in the Supabase dashboard and with Google, GitHub and Cloudflare, need your accounts, so they're yours to do. Each one takes a few minutes. The app works without them, except for signing in.

Your project: **thought-desk-europe**, `https://nbzojbfkkpeisitbkwpg.supabase.co`.

## 1. Where sign-in may come back to

Supabase dashboard → **Authentication** → **URL Configuration** → **Redirect URLs**. Add both:

- `http://127.0.0.1:*/auth/callback` (the desktop app: a one-time listener on a free port)
- `http://localhost:1420/**` (trying the app in a browser while developing)

## 2. Sign-in codes by email

When someone picks **Email** in Thought Desk, Supabase emails them. Two settings decide what that email holds and who can get it.

**What it holds: a code, not a link.** Out of the box the email holds a link, and a link opens the web browser, not Thought Desk. Wherever the email's text says `{{ .Token }}`, Supabase writes the 6-digit code instead. Supabase sends one of two emails: **Confirm signup** the first time an address is used, **Magic Link** every time after. Both need the code.

**Authentication** → **Emails** → **Templates**. In both **Confirm signup** and **Magic Link**, set the subject to `Your Thought Desk code` and the body to:

```html
<h2>Your Thought Desk code</h2>
<p>Enter this code in Thought Desk to sign in:</p>
<p style="font-size: 28px; font-weight: 600; letter-spacing: 6px">{{ .Token }}</p>
<p>It works for an hour. If you didn't ask for it, you can ignore this email.</p>
```

**Who can get it: for now, only you.** Supabase's built-in mailer is for trying things out. It sends only to the people in your Supabase organization (the address you log in to Supabase with), and only a few emails an hour. Anyone else who asks for a code is told to use Google or GitHub, which send no email and work for everyone.

To let everyone sign in by email, give Supabase a mailer of your own. Without a domain of your own, the free way is a Gmail account. Make a new one for Thought Desk, since friends see it as the sender.

1. In that Google account, turn on **2-Step Verification**, then create an **app password** (search for **App passwords** in the Google Account settings).
2. Supabase → **Authentication** → **Emails** → **SMTP Settings**: turn on custom SMTP, then fill in host `smtp.gmail.com`, port `465`, the Gmail address as both username and sender email, the app password as the password, and `Thought Desk` as the sender name.

Supabase then sends up to 30 sign-in emails an hour (raise it under **Authentication** → **Rate Limits**), and Gmail a few hundred a day. If you own a domain later, a sending service such as Resend is the sturdier choice.

## 3. Google

1. [Google Cloud Console](https://console.cloud.google.com/) → create a project (or pick one) → **APIs & Services** → **OAuth consent screen**: choose External, name it **Thought Desk**, and add your email. Keep the basic scopes (email, profile, openid). Under **Publishing status**, choose **In production** so anyone can sign in. These basic scopes don't need Google's review.
2. **Credentials** → **Create credentials** → **OAuth client ID** → **Web application**. Under **Authorized redirect URIs**, add `https://nbzojbfkkpeisitbkwpg.supabase.co/auth/v1/callback`.
3. Copy the **Client ID** and **Client secret** into Supabase → **Authentication** → **Sign In / Providers** → **Google**, and turn it on.

## 4. GitHub

1. GitHub → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**:
   - Name: **Thought Desk**
   - Homepage URL: your repository's address
   - Authorization callback URL: `https://nbzojbfkkpeisitbkwpg.supabase.co/auth/v1/callback`
2. **Register application** → **Generate a new client secret**.
3. Copy the **Client ID** and the secret into Supabase → **Sign In / Providers** → **GitHub**, and turn it on.

## 5. The relay for writing together (Cloudflare)

Done: the relay runs at relay.thoughtdesk.org. To deploy a new version of it:

```bash
cd server
npx wrangler login     # once: approve in the browser
npm run deploy
```

See [server/README.md](../server/README.md).

## Good to know

- **A free Supabase project pauses after a week without use.** Sign-in then fails until you press **Restore** in the dashboard. Your notes aren't affected: they're on your computer.
- **What's online:** your account, profile (name, @username, picture), friends list, when you were last here (friends only), and invites. Your pages aren't: a page you write with a friend goes through the relay while you write and isn't kept there.
