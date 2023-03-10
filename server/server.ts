// @ts-ignore
import _ammo from '@enable3d/ammo-on-nodejs/ammo/ammo.js';
import Enable3D from '@enable3d/ammo-on-nodejs';
import { UserId, RoomId, Application, startServer, verifyJwt } from "@hathora/server-sdk";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Direction, GameState } from "../common/types";
import { ClientMessage, ClientMessageType, ServerMessage, ServerMessageType } from "../common/messages";
import { map } from '../common/map';

const { Physics, ServerClock, ExtendedObject3D } = Enable3D;

// Game constants
const PLAYER_MOVE_SPEED = 200;
const PLAYER_JUMP_FORCE = 5;
const RADIANS_45 = 0.785398;

// A type which defines the properties of a player used internally on the server (not sent to client)
type InternalPlayer = {
  id: UserId;
  body: Enable3D.ExtendedObject3D;
  direction: Direction;
  theta: number;
  grounded: boolean;
  animation: string;
};

// A type which represents the internal state of the server, containing:
//   - physics: our "physics" engine (detect-collisions library)
//   - players: an array containing all connected players to a room
type InternalState = {
  physics: Enable3D.Physics;
  platforms: Enable3D.ExtendedObject3D[];
  players: InternalPlayer[];
};

// A map which the server uses to contain all room's InternalState instances
const rooms: Map<RoomId, InternalState> = new Map();

// Create an object to represent our Store
const store: Application = {
  verifyToken(token: string): UserId | undefined {
    const userId = verifyJwt(token, process.env.APP_SECRET!);
    if (userId === undefined) {
      console.error("Failed to verify token", token);
    }
    return userId;
  },

  // subscribeUser is called when a new user enters a room, it's an ideal place to do any player-specific initialization steps
  subscribeUser(roomId: RoomId, userId: string): void {
    // Make sure the room exists (or create one if not)
    if (!rooms.has(roomId)) {
      console.log("Creating new room...");
      createRoom(roomId);
    }
    const game = rooms.get(roomId)!;

    // Make sure the player hasn't already spawned
    if (!game.players.some((player) => player.id === userId)) {
      // Then create a physics body (box, for now) for the player
      const body = game.physics.add.box({ name: `player_${userId}`, y: 5 });
      body.scale.set(0.0005, 0.0005, 0.0005);
      body.body.setAngularFactor(0, 0, 0); // prevent player's body from rotating

      const groundSensor = new ExtendedObject3D();
      groundSensor.position.setY(5 - 1 - 0.0005);
      game.physics.add.existing(groundSensor, {
        mass: 1e-8,
        shape: 'box',
        width: 0.2,
        height: 0.2,
        depth: 0.2 
      });
      groundSensor.body.setCollisionFlags(4);
      game.physics.add.constraints.lock(body.body, groundSensor.body);

      groundSensor.body.on.collision((object, e) => {
        if (/ground/.test(object.name)) {
          const collidingPlayer = game.players.find((p) => p.id === userId);
          
          if (collidingPlayer) {
            if (e !== 'end') {
              collidingPlayer.grounded = true;
            }
            else {
              collidingPlayer.grounded = false;
            }
          }
        }
      });

      game.players.push({
        id: userId,
        body,
        direction: { x: 0, y: 0, z: 0},
        theta: 0,
        grounded: false,
        animation: 'Falling Idle'
      });
    }
  },

  // unsubscribeUser is called when a user disconnects from a room, and is the place where you'd want to do any player-cleanup
  unsubscribeUser(roomId: RoomId, userId: string): void {
    // Make sure the room exists
    if (!rooms.has(roomId)) {
      return;
    }
    
    const game = rooms.get(roomId)!;
    const idx = game.players.findIndex((player) => player.id === userId);

    // Remove the player's physics body
    const {body} = game.players[idx];
    game.physics.destroy(body);
    
    // Remove the player from the room's state
    if (idx >= 0) {
      game.players.splice(idx, 1);
    }
  },

  // onMessage is an integral part of your game's server. It is responsible for reading messages sent from the clients and handling them accordingly, this is where your game's event-based logic should live
  onMessage(roomId: RoomId, userId: string, data: ArrayBuffer): void {
    if (!rooms.has(roomId)) {
      return;
    }

    // Get the player, or return out of the function if they don't exist
    const game = rooms.get(roomId)!;
    const player = game.players.find((player) => player.id === userId);
    if (player === undefined) {
      return;
    }

    // Parse out the data string being sent from the client
    const message: ClientMessage = JSON.parse(Buffer.from(data).toString("utf8"));

    // Handle the various message types, specific to this game
    if (message.type === ClientMessageType.SetDirection) {
      player.direction = message.direction;
    }
    else if (message.type === ClientMessageType.SetTheta) {
      player.theta = message.theta;
    }
    else if (message.type === ClientMessageType.Jump) {
      if (player.grounded) {
        player.body.body.transform();
        player.body.body.setVelocityY(PLAYER_JUMP_FORCE);
      }
    }
  },
};

// Load our environment variables into process.env
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env") });
if (process.env.APP_SECRET === undefined) {
  throw new Error("APP_SECRET not set");
}

// Boot server
const port = parseInt(process.env.PORT ?? "4000");
const server = await startServer(store, port);
console.log(`Server listening on port ${port}`);

_ammo().then((ammo: any) => {
  globalThis.Ammo = ammo;

  const clock = new ServerClock();

  clock.onTick(delta => {
    rooms.forEach((room, roomId) => {
      // Tick each room
      updateRoom(room, delta);

      // Send the state updates to each client connected to that room
      broadcastStateUpdate(roomId);
    });
  });
});

function createRoom(roomId: RoomId) {
  const physics = new Physics();
  let platforms: Enable3D.ExtendedObject3D[] = [];

  // Create ground & platforms
  platforms.push(physics.add.box({
    name: 'ground',
    width: 40,
    depth: 40,
    collisionFlags: 2,
    mass: 0
  }));

  map.forEach((platform, i) => {
    platforms.push(physics.add.box({
      name: `ground_${i}`,
      x: platform.x,
      y: platform.y,
      z: platform.z,
      width: platform.w,
      height: platform.h,
      depth: platform.d,
      collisionFlags: 2,
      mass: 0
    }));
  });

  rooms.set(roomId, {
    physics,
    platforms,
    players: []
  });
}

function updateRoom(room: InternalState, delta: number) {
  // Move each player with a direction set and apply gravity
  room.players.forEach((player) => {
    player.body.body.transform();

    // Forward / backward movement
    const {theta} = player;
    const x = Math.sin(theta + (RADIANS_45 * player.direction.x)) * PLAYER_MOVE_SPEED * player.direction.z * delta;
    // const x = PLAYER_MOVE_SPEED * player.direction.z * delta;
    // const x = player.body.body.velocity.x;
    const y = player.body.body.velocity.y;
    const z = Math.cos(theta + (RADIANS_45 * player.direction.x)) * PLAYER_MOVE_SPEED * player.direction.z * delta;
    // const z = PLAYER_MOVE_SPEED * player.direction.z * delta;

    player.body.body.setVelocity(x, y, z);

    if (player.grounded) {
      if (player.direction.z === 1) {
        player.animation = 'Slow Run';
      }
      else if (player.direction.z === -1) {
        player.animation = 'Running Backward';
      }
      else {
        player.animation = 'Idle';
      }
    }
    else {
      player.animation = 'Falling Idle';
    }

    player.body.body.refresh();
  });

  room.physics.update(delta * 1000);
}

function broadcastStateUpdate(roomId: RoomId) {
  const game = rooms.get(roomId)!;
  const now = Date.now();
  // Map properties in the game's state which the clients need to know about to render the game
  const state: GameState = {
    players: game.players.map((player) => ({
      id: player.id,
      position: {
        x: player.body.position.x,
        y: player.body.position.y,
        z: player.body.position.z,
      },
      theta: player.theta,
      grounded: player.grounded,
      animation: player.animation
    }))
  };

  // Send the state update to each connected client
  const msg: ServerMessage = {
    type: ServerMessageType.StateUpdate,
    state,
    ts: now,
  };
  server.broadcastMessage(roomId, Buffer.from(JSON.stringify(msg), "utf8"));
}