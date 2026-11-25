# PostPilot

Shortlist from hundreds or thousands of photos, edit them in one look, and get Instagram-ready content.

Version 2 follows the 8-step design. It is a static web app. Photos stay in the browser; nothing is uploaded to a server.

Demo login: demo@postpilot.app / PostPilot2026

## Run locally
Open index.html in a browser.

## Deploy
Import this repo in Vercel. No build step, no settings needed.

## Not built yet
Google Drive and Dropbox, music for the reel, straighten, saving to Drive, server-side feedback storage (set FEEDBACK_URL in app.js).


## Optional: Enhance scene (AI)

The button on screen 8 calls `api/enhance.js`, a Vercel function that sends one photo to an image model.
It stays off until you add these in Vercel, Project Settings, Environment Variables:

- `OPENAI_API_KEY` (required, paid per image)
- `OPENAI_IMAGE_MODEL` (optional, defaults to `gpt-image-1.5`)
- `ENHANCE_TOKEN` (optional access code testers must enter, so strangers cannot spend your credit)

Set a monthly spend limit on the key before sharing the link.
