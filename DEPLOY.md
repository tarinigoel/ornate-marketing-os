# Go live: checklist (about 20 minutes)

## 1. Database (Neon)
1. Sign up at https://neon.tech and create a project called `ornate-marketing-os`, in the Singapore or Mumbai region.
2. Copy the **connection string** (it starts with `postgresql://`). You'll paste it into Vercel as `DATABASE_URL`.

## 2. Google sign-in (Google Cloud console)
1. Go to https://console.cloud.google.com, then **APIs & Services**, then **Credentials**, then **Create credentials**, then **OAuth client ID**.
2. Set the type to **Web application**.
3. Leave **Authorised redirect URIs** empty for now. You'll add it after step 3.
4. Copy the **Client ID** and **Client secret**.
5. On the OAuth consent screen, set the user type to **Internal** (this keeps sign-in limited to your Google Workspace).

## 3. Website (Vercel)
1. Sign up at https://vercel.com with GitHub, then click **Add New**, **Project**, and import `tarinigoel/ornate-marketing-os`.
2. Before you click Deploy, add these **Environment Variables**:

| Name | Value |
|---|---|
| `DATABASE_URL` | the Neon connection string |
| `AUTH_SECRET` | any long random text (e.g. from https://generate-secret.vercel.app/32) |
| `AUTH_GOOGLE_ID` | the Google Client ID |
| `AUTH_GOOGLE_SECRET` | the Google Client secret |
| `ALLOWED_DOMAIN` | `ornatesolar.com` |
| `HEAD_EMAILS` | Fateh's ornatesolar.com address |
| `GROQ_API_KEY` | a key from https://console.groq.com/keys |
| `CRON_SECRET` | any long random text |

3. Click **Deploy**. The build creates the database tables and the starting team. You'll get a link like `https://ornate-marketing-os-xxxx.vercel.app`.
4. Go back to Google (step 2) and add this redirect URI: `https://<your-vercel-link>/api/auth/callback/google`

## 4. Wake the agents every 30 minutes (GitHub)
In the GitHub repo, go to **Settings**, then **Secrets and variables**, then **Actions**, and add two repository secrets:
- `APP_URL`: your Vercel link, with no slash at the end
- `CRON_SECRET`: the same value you gave Vercel

## 5. Check it
Open the Vercel link and sign in with Google using an ornatesolar.com account. The Overview should show 13 managers. Press **Top up now** on Ideas, and ideas should appear within a minute.
