# Thymer Hardcover Sync Plugin

Simple plugin to sync your Hardcover library into a Thymer Books collection.

## Features

- Connects to your Hardcover account via API key
- Syncs books from your Hardcover library into Thymer records
- Creates/updates these fields:
  - Title
  - Author
  - Published Year
  - Read Date
  - Synopsis
  - Genres
  - Status
  - Rating
  - Hardcover ID
- Sets each book's banner image from Hardcover cover data (when available)

## Why the Worker is needed

Hardcover's API cannot be called directly from the browser because of CORS restrictions.  
This project includes a tiny Cloudflare Worker proxy (`hardcover-proxy-worker.js`) to forward requests.

## Quick Setup

1. Create a Books collection in Thymer using `hardcover-plugin.json`.
2. Add/install this plugin (`hardcover-plugin.js`) as the collection plugin.
3. Get your Hardcover API key from:  
   `https://hardcover.app/account/api`
4. Deploy the Cloudflare Worker (steps below).
5. In Thymer, click **Sync Hardcover** and enter:
   - API key
   - Worker URL

## Deploy the Cloudflare Worker

Use the code in `hardcover-proxy-worker.js`.

1. Sign in to Cloudflare Dashboard: `https://dash.cloudflare.com`
2. Go to **Workers & Pages**
3. Click **Create** → **Create Worker**
4. Replace default code with contents of `hardcover-proxy-worker.js`
5. Click **Deploy**
6. Copy your Worker URL (example: `https://hardcover-proxy.yourname.workers.dev`)
7. Paste that URL into the plugin setup in Thymer

## Files

- `hardcover-plugin.js` — main Thymer plugin logic
- `hardcover-plugin.json` — Thymer collection schema/config
- `hardcover-proxy-worker.js` — Cloudflare Worker CORS proxy

## Notes

- The Worker does not store your API key.
- If sync fails, verify:
  - API key is valid
  - Worker URL is correct and deployed
  - Worker allows `POST` and `OPTIONS` requests

## Still to be sorted
- Published date is a number right now and not date, should be a quick fix that I'll try do this week.
- Want to add syncing book progress
- Need to sync book cover as a separate property as book covers are terrible dimensions to display in a banner

## Contributions
- I would love for anyone who wants to add features / clean up code etc. to do so. Please feel free to submit a PR and I'll get it approved ASAP. Any questions shoot me a message in the Discord server.

# Example Images
<img width="1066" height="1347" alt="image" src="https://github.com/user-attachments/assets/62475f4b-e1de-4cd5-9347-f340505b289b" />
</br>
</br>
<img width="1221" height="1368" alt="image" src="https://github.com/user-attachments/assets/66242367-c0f9-4233-801a-63c4e28b9cf8" />
