# Afterglow — private disappearing chat for two

A dark, responsive, two-person chat built with React, Vite, Firebase Authentication, Cloud Firestore, and browser Web Crypto.

## What it does

- Two separate email/password accounts.
- One private room, locked to the creator's email and the invited partner's email.
- Messages are encrypted in the sender's browser with AES-256-GCM before upload.
- The shared encryption key is derived locally with PBKDF2-SHA-256 (310,000 iterations).
- The passphrase is never sent to Firebase or stored in the database.
- The recipient's browser decrypts and renders an incoming message, then deletes the Firestore document.
- No Firestore offline persistence is enabled; chat history is held in page memory only.
- Text-only messages in this starter version.

## Important security notes

This is end-to-end encryption for message contents, not anonymity. Firebase can still see account emails, room membership metadata, timestamps, message sizes, and connection metadata. The room ID is a high-entropy unguessable token; the passphrase is a separate high-entropy secret. Share both with your partner using a trusted channel.

A message is deleted from the server after the recipient's browser successfully decrypts and renders it. A recipient can still take a screenshot, copy text, photograph the screen, or use a modified client. No website can prevent those actions. Deletion is not a guarantee that no copy exists.

For stronger production assurance, commission an independent security review before using this for highly sensitive conversations. Consider enabling Firebase App Check, setting Firebase Authentication password policy, adding rate limits, and monitoring abuse. Do not commit `.env` to a public repository. Firebase web config is not a server secret; Firestore Security Rules are the access boundary.

## 1. Create a new Firebase project

1. Open https://console.firebase.google.com/ and create a new project.
2. Add a Web App in Project Overview and copy its Firebase configuration.
3. In **Authentication → Sign-in method**, enable **Email/Password**.
4. In **Firestore Database**, create a database. Choose a nearby region and keep it consistent with your deployment needs.
5. Open **Firestore → Rules**, replace the rules with the contents of `firestore.rules`, and publish.
6. In **Project settings → General → Your apps**, copy the web app config values.

## 2. Configure the app

1. Install Node.js 20 or later.
2. Unzip this project and open a terminal in the project folder.
3. Copy `.env.example` to `.env`.
4. Fill in the values from your Firebase web app config.

Example:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Then run:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## 3. Create the two accounts and connect

1. You create an account with your email and a strong, unique password.
2. Your girlfriend creates her own account with her email and a strong, unique password.
3. Sign in as the first account and create a room, entering her exact sign-in email.
4. Copy the Room ID and Secret Phrase and send them to her privately.
5. She signs in with the invited email, chooses **Join a room**, and enters both values.
6. Both devices derive the same encryption key locally. Start chatting.

The room creator can sign back in and rejoin using the same room ID and secret phrase. Keep a safe copy of those values; the app does not have a recovery mechanism.

## 4. Deploy

You can deploy the Vite `dist` folder to Firebase Hosting, Netlify, or another static host.

For Firebase Hosting:

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
```

Choose the existing Firebase project, set the public directory to `dist`, configure it as a single-page app, then:

```bash
npm run build
firebase deploy --only hosting
```

Add your deployed domain to **Authentication → Settings → Authorized domains** if Firebase does not add it automatically. Always serve over HTTPS.

## 5. Before real use

- Confirm Firestore rules are published and test that a third account cannot open the room.
- Do not share the room secret in the same place as the room ID if you can avoid it.
- Use a strong device lock and keep both browsers/devices updated.
- A message disappears after the recipient's browser renders it and the delete request reaches Firestore. If the recipient is offline, it remains encrypted on the server until they next open the room.
- This version intentionally does not store a message history or support image uploads, voice notes, group chats, or account recovery for the room secret.

## Deploying with GitHub Pages

This project includes a GitHub Actions workflow at `.github/workflows/deploy.yml` and a Vite configuration that automatically uses the repository path on GitHub Pages.

1. Push the project contents to the `main` branch of a GitHub repository.
2. In the repository, open **Settings → Secrets and variables → Actions** and add these repository secrets using the matching values from your Firebase web app configuration: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, and `VITE_FIREBASE_APP_ID`.
3. Open **Settings → Pages** and set the source to **GitHub Actions**.
4. The workflow will build and deploy the site after each push to `main`.
5. In Firebase Authentication, add your GitHub Pages host (for example, `your-username.github.io`) to the authorised domains.

Do not commit `.env` files, passwords, room secret phrases, service-account keys, or private keys. Publish the included `firestore.rules` in the Firebase console before using the app.
