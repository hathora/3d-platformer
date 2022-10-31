# Hathora 3d-platformer

## Running locally 

To run locally:

- Have node installed
- Get a Hathora `appId` and `appSecret` via `curl -X POST https://coordinator.hathora.dev/registerApp`
- Create a .env file at the root with
```
APP_ID=<appId>
APP_SECRET=<appSecret>
```
- Start server: inside `server` directory run `npm start` (remember to `npm install` first)
- Start client: inside `client` directory run `npm start` (remember to `npm install` first)
