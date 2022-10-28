// @ts-ignore
import _ammo from '@enable3d/ammo-on-nodejs/ammo/ammo.js';
import Enable3D from '@enable3d/ammo-on-nodejs';
import { register, Store, UserId, RoomId } from "@hathora/server-sdk";
import dotenv from "dotenv";
import hash from "hash.js";
import { Direction, GameState } from "../common/types";
import { ClientMessage, ClientMessageType, ServerMessage, ServerMessageType } from "../common/messages";
import { map } from '../common/map';

const { Physics, ServerClock, ExtendedObject3D } = Enable3D;

// Game constants
const PLAYER_MOVE_SPEED = 200;
const PLAYER_TURN_SPEED = 100;
const PLAYER_JUMP_FORCE = 5;

// A type which defines the properties of a player used internally on the server (not sent to client)
type InternalPlayer = {
  id: UserId;
  body: Enable3D.ExtendedObject3D;
  direction: Direction;
  theta: number;
  grounded: boolean;
  isMoving: boolean;
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
const store: Store = {
  // newState is called when a user requests a new room, this is a good place to handle any world initialization
  newState(roomId: bigint, userId: string): void {
    // const clock = new ServerClock();

    // clock.onTick(delta => this.update(delta));

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
  },

  // subscribeUser is called when a new user enters a room, it's an ideal place to do any player-specific initialization steps
  subscribeUser(roomId: bigint, userId: string): void {
    // Make sure the room exists
    if (!rooms.has(roomId)) {
      return;
    }
    const game = rooms.get(roomId)!;

    // Make sure the player hasn't already spawned
    if (!game.players.some((player) => player.id === userId)) {
      // Then create a physics body (box, for now) for the player
      const body = game.physics.add.box({ name: `player_${userId}`, y: 5 });
      body.scale.set(0.005, 0.005, 0.005);
      body.body.setAngularFactor(0, 0, 0); // prevent player's body from rotating

      const groundSensor = new ExtendedObject3D();
      groundSensor.position.setY(5 - 1 - 0.006);
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
        isMoving: false
      });
    }
  },

  // unsubscribeUser is called when a user disconnects from a room, and is the place where you'd want to do any player-cleanup
  unsubscribeUser(roomId: bigint, userId: string): void {
    // Make sure the room exists
    if (!rooms.has(roomId)) {
      return;
    }
    
    // Remove the player from the room's state
    const game = rooms.get(roomId)!;
    const idx = game.players.findIndex((player) => player.id === userId);

    if (idx >= 0) {
      game.players.splice(idx, 1);
    }
  },

  // onMessage is an integral part of your game's server. It is responsible for reading messages sent from the clients and handling them accordingly, this is where your game's event-based logic should live
  onMessage(roomId: bigint, userId: string, data: ArrayBufferView): void {
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
    const dataStr = Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
    const message: ClientMessage = JSON.parse(dataStr);

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
dotenv.config({ path: "../.env" });
if (process.env.APP_SECRET === undefined) {
  throw new Error("APP_SECRET not set");
}

// Connect to the Hathora coordinator
const coordinator = await register({
  appId: hash.sha256().update(process.env.APP_SECRET).digest("hex"),
  coordinatorHost: process.env.COORDINATOR_HOST,
  appSecret: process.env.APP_SECRET,
  authInfo: { anonymous: { separator: "-" } },
  store,
});

const { host, appId, storeId } = coordinator;
console.log(`Connected to coordinator at ${host} with appId ${appId} and storeId ${storeId}`);

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

function updateRoom(room: InternalState, delta: number) {
  // Move each player with a direction set and apply gravity
  room.players.forEach((player) => {
    player.body.body.transform();

    // Forward / backward movement
    const {theta} = player;
    const x = Math.sin(theta) * PLAYER_MOVE_SPEED * player.direction.z * delta;
    // const x = PLAYER_MOVE_SPEED * player.direction.z * delta;
    // const x = player.body.body.velocity.x;
    const y = player.body.body.velocity.y;
    const z = Math.cos(theta) * PLAYER_MOVE_SPEED * player.direction.z * delta;
    // const z = PLAYER_MOVE_SPEED * player.direction.z * delta;

    player.body.body.setVelocity(x, y, z);

    if (player.direction.z !== 0) {
      player.isMoving = true;
    }
    else {
      player.isMoving = false;
    }

    player.body.body.refresh();
  });

  room.physics.update(delta * 1000);
}

function broadcastStateUpdate(roomId: RoomId) {
  const game = rooms.get(roomId)!;
  const subscribers = coordinator.getSubscribers(roomId);
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
      isMoving: player.isMoving
    }))
  };

  // Send the state update to each connected client
  subscribers.forEach((userId) => {
    const msg: ServerMessage = {
      type: ServerMessageType.StateUpdate,
      state,
      ts: now,
    };
    coordinator.sendMessage(roomId, userId, Buffer.from(JSON.stringify(msg), "utf8"));
  });
}