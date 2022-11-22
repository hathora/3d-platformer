import './style.css';
import { Project, Scene3D, ExtendedObject3D, THREE, ThirdPersonControls, PointerLock, PointerDrag } from "enable3d";
import { HathoraClient } from "@hathora/client-sdk";
import { RoomConnection } from "./connection";
import { InterpolationBuffer } from "interpolation-buffer";
import { Direction, GameState, Player } from "../../common/types";
import { ClientMessageType } from "../../common/messages";
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils';
import { map } from '../../common/map';
import { MeshPhongMaterial } from 'three';

const client = new HathoraClient(process.env.APP_ID as string, process.env.COORDINATOR_HOST);

class PlatformerScene extends Scene3D {
  box: any;
  player!: ExtendedObject3D;
  stateBuffer: any;
  playerModel!: THREE.Group;
  playerAnims: Map<string, THREE.AnimationClip> = new Map();
  players: Map<string, ExtendedObject3D> = new Map();
  controls!: ThirdPersonControls;
  currentUserId!: string;
  prevDirection!: Direction;
  keys: Set<string> = new Set();
  connection!: RoomConnection;
  prevTheta: number = 0;
  preloaderContainer!: HTMLDivElement;
  preloaderBar!: HTMLDivElement;

  constructor() {
    super({
      key: 'PlatformerScene'
    });
  }

  async init() {
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.load.preload('texture-grass', '/textures/Ground037_1K_Color.jpg');
    this.load.preload('normal-grass', '/textures/Ground037_1K_NormalGL.jpg');
    this.load.preload('texture-brick', '/textures/PavingStones122_1K_Color.jpg');
    this.load.preload('normal-brick', '/textures/PavingStones122_1K_NormalGL.jpg');
  }

  bindPreloaderDOM() {
    this.preloaderContainer = document.querySelector('.preloader') as HTMLDivElement;
    this.preloaderBar = this.preloaderContainer.querySelector('.preloader__bar-inner') as HTMLDivElement;
  }

  setPreloaderPercentage(p: number) {
    if (p === 1) {
      this.preloaderContainer.classList.add('off');
    }

    this.preloaderBar.style.width = `${p*100}%`;
  }


  async create() {
    this.warpSpeed('-ground', '-orbitControls', '-lookAtCenter', '-camera');

    this.bindPreloaderDOM();

    this.setPreloaderPercentage(0);

    // Initialize Hathora server connection
    const token = await getToken();

    this.setPreloaderPercentage(0.1);

    // Once we have a token, we can get our roomId
    const roomId = await getRoomId(token);

    this.setPreloaderPercentage(0.2);

    // With a roomId, we can establish a connection to the room on server
    this.connection = new RoomConnection(client, token, roomId);
    await this.connection.connect();

    this.setPreloaderPercentage(0.3);

    // Save the current user's ID, so we know who to follow with the camera
    const currentUser = HathoraClient.getUserFromToken(token);
    this.currentUserId = currentUser.id;

    // Begin linear interpolation for player positions
    this.connection.addListener(({ state, ts }) => {
      // Start enqueuing state updates
      if (this.stateBuffer === undefined) {
        this.stateBuffer = new InterpolationBuffer(state, 50, lerp);
      }
      else {
        this.stateBuffer.enqueue(state, [], ts);
      }
    });

    // Load models
    this.playerModel = await this.load.fbx('/models/lewis/Idle.fbx');

    this.setPreloaderPercentage(0.7);
    
    // Parse Lewis' animations
    const animations = [
      'Slow Run',
      'Running Backward',
      'Falling Idle'
    ];

    this.playerAnims.set('Idle', this.playerModel.animations[0]);

    let load = 0.7;

    for (let animKey of animations) {
      const anim = await this.load.fbx(`/models/lewis/unskinned/${animKey}.fbx`);

      this.playerAnims.set(animKey, anim.animations[0]);
      
      load += 0.05;
      this.setPreloaderPercentage(load);
    }

    this.setPreloaderPercentage(0.9);

    // Render the ground
    const groundNormal = await this.load.texture('normal-grass');
    const groundTexture = await this.load.texture('texture-grass');

    this.setPreloaderPercentage(0.95);

    groundNormal.wrapS = THREE.RepeatWrapping;
    groundNormal.wrapT = THREE.RepeatWrapping;
    groundNormal.repeat.set(4, 4);

    groundTexture.wrapS = THREE.RepeatWrapping;
    groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(4, 4);

    this.add.box({ width: 40, depth: 40 }, {
      phong: {
        map: groundTexture,
        normalMap: groundNormal,
        normalScale: new THREE.Vector2(4, 4)
      }
    });

    // Render the map platforms
    const brickTexture = await this.load.texture('texture-brick');
    const brickNormal = await this.load.texture('normal-brick');

    map.forEach(async (platform) => {
      this.add.box(
        {
          x: platform.x,
          y: platform.y,
          z: platform.z,
          width: platform.w,
          height: platform.h,
          depth: platform.d
        },
        {
          phong: {
            map: brickTexture,
            normalMap: brickNormal,
            normalScale: new THREE.Vector2(8, 8),
            transparent: true
          }
        }
      );
    });
    
    // Setup player keyboard input
    this.prevDirection = { x: 0, y: 0, z: 0 };
    this.bindKeyboardEvents();

    this.setPreloaderPercentage(1);
  }

  update(time: number) {
    // If the stateBuffer hasn't been defined, skip this update tick
    if (this.stateBuffer === undefined) {
      return;
    }

    // Get current interpolated state from buffer
    const { state } = this.stateBuffer.getInterpolatedState(Date.now());

    // Spawn or update our player models
    this.syncModels(state, time);

    // Keep camera controls in sync
    this.controls.update(0, 0);

    // Send any keyboard input to the server
    this.sendKeyboardInput();

    // Send player rotational data
    this.sendPlayerTheta();
  }

  bindKeyboardEvents() {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e: KeyboardEvent) => {
      this.keys.delete(e.key.toLowerCase());
    });
  }

  sendKeyboardInput() {
    let direction: Direction = {
      x: 0,
      y: 0,
      z: 0
    };
  
    if (this.keys.has('w')) {
      direction.z = 1;
    }
    else if (this.keys.has('s')) {
      direction.z = -1;
    }
  
    if (this.keys.has('a')) {
      direction.x = 1;
    }
    else if (this.keys.has('d')) {
      direction.x = -1;
    }
  
    if (this.keys.has(' ')) {
      this.connection.sendMessage({ type: ClientMessageType.Jump });
    }
  
    if (direction.x !== this.prevDirection.x || direction.y !== this.prevDirection.y || direction.z !== this.prevDirection.z) {
      this.prevDirection = direction;
      this.connection.sendMessage({ type: ClientMessageType.SetDirection, direction });
    }
  }

  sendPlayerTheta() {
    if (this.player) {
      const v3 = new THREE.Vector3();
  
      const rotation = this.camera.getWorldDirection(v3);
      const theta = Math.atan2(rotation.x, rotation.z);

      if (theta !== this.prevTheta) {
        this.connection.sendMessage({ type: ClientMessageType.SetTheta, theta });
        this.prevTheta = theta;
      }
    }
  }

  buildPlayer() {
    // Create the object for our player
    const player = new ExtendedObject3D();

    // Clone our loaded player model
    // const model = this.playerModel.clone();
    const model = SkeletonUtils.clone(this.playerModel);

    // Lower it's scale
    model.scale.set(0.01, 0.01, 0.01);

    // Enable shadows on all mesh
    model.traverse((object: any) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;

        object.material.forEach((material: MeshPhongMaterial) => {
          material.color.setRGB(2, 2, 2);
        });
      }
    });

    // Add the model to the object
    player.add(model);

    // Add loaded animations
    const animations = [
      'Idle',
      'Slow Run',
      'Running Backward',
      'Falling Idle'
    ];

    for (let animKey of animations) {
      const anim = this.playerAnims.get(animKey);

      if (anim) {
        player.anims.add(
          animKey,
          anim
        );
      }
    }

    // Return our fresh player!
    return player;
  }

  syncModels(state: any, time: number) {
    const {players} = state;

    // Add or update player models
    players.forEach((player: Player) => {
      if (this.players.has(player.id)) {
        const playerObject = this.players.get(player.id);

        // Position player based on server
        playerObject?.position.set(player.position.x, player.position.y - 0.5, player.position.z);

        // Set rotation based on server theta
        playerObject?.rotation.set(0, player.theta, 0);

        // Handle animation syncing
        playerObject?.anims.play(player.animation, 600);

        playerObject?.animationMixer.update(time);
      }
      else {
        const playerObject = this.buildPlayer();

        playerObject.anims.play('Falling Idle');
        
        this.scene.add(playerObject);
        this.players.set(player.id, playerObject);

        // If this player belongs to current client, setup controls
        if (this.currentUserId === player.id) {
          this.controls = new ThirdPersonControls(this.camera, playerObject, {
            offset: new THREE.Vector3(0, 1, 0),
            targetRadius: 6
          });

          this.controls.theta = 90;

          const pl = new PointerLock(this.canvas);
          const pd = new PointerDrag(this.canvas);

          pd.onMove((delta) => {
            if (pl.isLocked()) {
              this.controls.update(delta.x * 2, delta.y * 2);
            }
          });

          this.player = playerObject;
        }
      }
    });

    // Remove any destroyed players
    this.players.forEach((playerObject, id) => {
      const playerExistsInState = (players.findIndex((p: Player) => p.id === id) > -1);

      if (!playerExistsInState) {
        playerObject.removeFromParent();
      }
    });
  }
}

// The getToken function first checks sessionStorage to see if there is an existing token, and if there is returns it. If not, it logs the user into a new session and updates the sessionStorage key.
async function getToken(): Promise<string> {
  const maybeToken = sessionStorage.getItem("3d-platformer-token");
  if (maybeToken !== null) {
    return maybeToken;
  }

  const token = await client.loginAnonymous();
  sessionStorage.setItem("3d-platformer-token", token);
  return token;
}

// getRoomId will first check if the location's pathname contains the roomId, and will return it if it does, otherwise it will request one from the HathoraClient instance we defined earlier.
async function getRoomId(token: string): Promise<string> {
  if (location.pathname.length > 1) {
    return location.pathname.split("/").pop()!;
  }
  
  const roomId = await client.create(token, new Uint8Array());
  history.pushState({}, "", `/${roomId}`);
  return roomId;
}

function lerp(from: GameState, to: GameState, pctElapsed: number): GameState {
  return {
    players: to.players.map((toPlayer) => {
      const fromPlayer = from.players.find((p) => p.id === toPlayer.id);
      return fromPlayer !== undefined ? lerpPlayer(fromPlayer, toPlayer, pctElapsed) : toPlayer;
    })
  };
}

function lerpPlayer(from: Player, to: Player, pctElapsed: number): Player {
  return {
    id: to.id,
    position: {
      x: from.position.x + (to.position.x - from.position.x) * pctElapsed,
      y: from.position.y + (to.position.y - from.position.y) * pctElapsed,
      z: from.position.z + (to.position.z - from.position.z) * pctElapsed,
    },
    theta: from.theta + (to.theta - from.theta) * pctElapsed,
    animation: to.animation,
    grounded: to.grounded
  };
}

const config = {
  scenes: [
    PlatformerScene
  ]
};

new Project(config);