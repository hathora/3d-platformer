# Hathora 3D-Platformer

A demo project utilizing [Hathora Builtkit](https://hathora.dev/), alongside [Enable3D](https://enable3d.io/) and [TypeScript](https://www.typescriptlang.org/) which showcases Hathora's ability to handle multiplayer three dimensional games.

![A screenshot of the 3D platformer running.](https://user-images.githubusercontent.com/7004280/205775862-d3e8ec3d-040e-4681-93ef-d86e4d206fdb.png)

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
- Start client: inside `client` directory run `npm run dev` (remember to `npm install` first)
