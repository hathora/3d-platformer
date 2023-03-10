# Hathora 3D-Platformer

A demo 3D-platformer utilizing [Hathora Builtkits](https://github.com/hathora/buildkits/tree/main/typescript-client-sdk) alongside [Enable3D](https://enable3d.io/).

![A screenshot of the 3D platformer running.](https://user-images.githubusercontent.com/7004280/205775862-d3e8ec3d-040e-4681-93ef-d86e4d206fdb.png)

## Running locally 

To run locally:

- Have node installed
- Get a Hathora `appId` and `appSecret` [(see below)]((#getting-an-app_id-and-app_secret))
- Create a .env file at the root with
```
APP_ID=<appId>
APP_SECRET=<appSecret>
```
- Start server: inside `server` directory run `npm start` (remember to `npm install` first)
- Start client: inside `client` directory run `npm start` (remember to `npm install` first)

## Getting an APP_ID and APP_SECRET

Visit [console.hathora.dev](https://console.hathora.dev/) and login if you haven't already done so.

You will be greeted with a project list screen, if you have already created an app the App ID and App Secret can be copied directly from the list...

![A screenshot of the Hathora console's project list](https://user-images.githubusercontent.com/7004280/224391310-2cad1799-d048-4776-97c9-4e1d62997fb0.png)

If you have not yet created an app, click the `Create Application` button. You will then be faced with the following screen...

![A screenshot of the Hathora console's Create Application screen](https://user-images.githubusercontent.com/7004280/224391423-444fa426-8c8c-4705-aa5a-e64342cdb82e.png)

After entering a valid name and creating your application, it's App ID and App Secret will be available to be copied.