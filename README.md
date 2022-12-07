# Hathora 3D-Platformer

A demo 3D-platformer utilizing [Hathora Builtkits](https://github.com/hathora/buildkits/tree/main/typescript-client-sdk) alongside [Enable3D](https://enable3d.io/).

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
- Start client: inside `client` directory run `npm start` (remember to `npm install` first)
