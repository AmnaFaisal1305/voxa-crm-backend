# Developer Deployment & Testing Guide

This guide details the manual steps required to set up local testing with `ngrok`, register the webhook on the Meta Developer Portal, subscribe the Facebook Page, and deploy the backend service to Vercel.

---

## 1. Local Testing with ngrok

Since Meta sends webhook notifications to a public HTTPS URL, you must use a tool like `ngrok` to expose your local server during development.

### Step 1.1: Start the Local Backend Server
Run the Express application in development mode:
```bash
npm run dev
```
By default, the server runs on `http://localhost:3000`.

### Step 1.2: Start ngrok
In a separate terminal window, forward port 3000 to the public internet:
```bash
ngrok http 3000
```
ngrok will display a forwarding section with a temporary HTTPS URL (e.g. `https://abc123x.ngrok-free.app`). Copy this URL.

### Step 1.3: Configure Webhook in Meta Developer Portal
1. Go to the [Meta Developer Portal](https://developers.facebook.com) and sign in.
2. Select your App (ensure your Facebook account has a Developer role on the app).
3. In the left sidebar, add/click on the **Webhooks** product.
4. Select **Page** from the dropdown menu, then click **Subscribe to this object**.
5. Set the values:
   - **Callback URL**: `https://<your-ngrok-subdomain>.ngrok-free.app/webhook`
   - **Verify Token**: Enter the `META_WEBHOOK_VERIFY_TOKEN` string from your `.env` file (e.g. `e4399e31d0442e3a5ecfa88f8d5f479ea2284cf6852bb0ba9c99ec9381c81ef8`).
6. Click **Verify and Save**. Meta will send a GET request to verify. Upon success, the modal will close.
7. Locate the **leadgen** row in the field listing, and click **Subscribe** to listen for Lead Ads submissions.

> **CRITICAL**: Every time you restart ngrok, the public URL changes. You must re-configure the Callback URL in the Meta Developer Portal using the new ngrok URL.

---

## 2. Subscribing the Facebook Page to the App

After configuring the webhook, you must tell Meta to send webhook events for your specific Facebook Page to your App.

Execute a POST request using Postman, cURL, or a web browser to the Graph API endpoint:

### HTTP Request
```http
POST https://graph.facebook.com/v19.0/116432581557748/subscribed_apps?access_token=<YOUR_PAGE_ACCESS_TOKEN>&subscribed_fields=leadgen
```

- Replace `116432581557748` with the actual `META_PAGE_ID` if it has changed.
- Replace `<YOUR_PAGE_ACCESS_TOKEN>` with the Page Access Token generated from the Meta Developer App.

### Expected Response
```json
{
  "success": true
}
```

---

## 3. Testing Lead Capture using Meta's Lead Ads Testing Tool

Meta provides a sandbox testing tool to generate mock lead submissions.

1. Navigate to the [Lead Ads Testing Tool](https://developers.facebook.com/tools/lead-ads-testing).
2. Under **Page**, select the Facebook Page.
3. Under **Form**, select the form you published from the portal (or a test form).
4. Click **Create Lead**.
5. Check your console logs or your Neon PostgreSQL database `leads` table to confirm that a new row has been added with the lead details.

---

## 4. Deploying to Vercel

Once verified locally, deploy the backend to Vercel for permanent hosting.

### Step 4.1: Push Project to GitHub
1. Initialize git and push your repository to a private GitHub repo.
2. **Double check that the `.env` file is excluded** via `.gitignore` and not pushed.

### Step 4.2: Import Project on Vercel
1. Go to the [Vercel Dashboard](https://vercel.com) and click **Add New** -> **Project**.
2. Import your GitHub repository.
3. Set **Framework Preset** to **Other**.
4. Leave root directory as `./`.
5. Under **Environment Variables**, add the environment variables from your `.env` file:
   - `META_APP_ID`
   - `META_APP_SECRET`
   - `META_PAGE_ACCESS_TOKEN`
   - `META_PAGE_ID`
   - `META_AD_ACCOUNT_ID`
   - `META_WEBHOOK_VERIFY_TOKEN` (use the secure generated hex token)
   - `DATABASE_URL` (your Neon PostgreSQL URL)
   - `FRONTEND_URL` (`https://voxa-crm.vercel.app`)
   - `PORT` (`3000`)
6. Click **Deploy**.

### Step 4.3: Switch Meta Webhook to Production URL
Once Vercel generates your deployment URL (e.g. `https://voxa-meta-service.vercel.app`), configure it permanently in the Meta Developer Portal:
1. Go back to your App's **Webhooks** product on the Meta Developer Portal.
2. Click **Edit Subscription**.
3. Update the **Callback URL** to: `https://voxa-meta-service.vercel.app/webhook`.
4. Verify token remains the same. Click **Verify and Save**.
5. Re-run the Page Subscription HTTP Request (Section 2) using the live page access token to ensure page hook subscription is active.

---

## 5. Security & Credentials Rotation Checklist

Since credentials were exposed during the roadmap review:
1. **Regenerate App Secret**:
   - Go to App Settings -> Basic in Meta Portal.
   - Click **Reset** next to the App Secret.
   - Update your local `.env` and Vercel environment variables with the new secret.
2. **Regenerate Long-Lived Page Access Token**:
   - Revoke the previous token.
   - Generate a fresh, non-expiring Page Access Token using the Graph API Explorer or System User config.
   - Update `.env` and Vercel variables.
