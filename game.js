'use strict';

const pl = planck;
const {Vec2, Box} = pl;

const increasingRand = (progress, scale = 0.8) => {
  return scale * (Math.random() * progress + (1 - progress)) + 1 - scale;
}

const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));

const makeWalls = (world, bodyX, bodyY, points) => {
  let body = world.createBody(Vec2(bodyX, bodyY)),
      wallDef = {density: 0, restitution: 0.4};
  points.forEach(([x, y], idx) => {
    if (idx < points.length - 1) {
      let [nextX, nextY] = points[idx + 1];
      body.createFixture(planck.Edge(
        Vec2(nextX, nextY),
        Vec2(x, y)
      ), wallDef);
    }
  });
  return body;
};

const generateWalls = (world, segments, width, height) => {
  let center = 0, // random-walk center of opening
      floor = [[0, 0]],
      ceil = [[0, height]];
  for (let i = 1; i < segments; i++) {
    let gap = increasingRand(i / segments) * height / 2, // [h/4, h/2]
        centerYCoord = height / 2 + center * height / 4, // [h/4, 3h/4]
        x = i * width / segments;
    floor.push([x, centerYCoord - gap / 2]);
    ceil.push([x, centerYCoord + gap / 2]);
    center = clamp((Math.random() * 2 - 1) / 3 + center, -1.0, 1.0);
  }
  floor.push([width, 0]);
  ceil.push([width, height]);
  return {
    floor: makeWalls(world, -width / 2, 0, floor),
    ceil: makeWalls(world, -width / 2, 0, ceil),
    left: makeWalls(world, -width / 2, 0, [
      [0, 0],
      [0, height]
    ]),
    right: makeWalls(world, -width / 2, 0, [
      [width, 0],
      [width, height]
    ])
  };
};

class Status {
  constructor () {
    this.elem  = document.querySelector('#status');
    this.big   = document.querySelector('#status > span');
    this.small = document.querySelector('#status > small');
    this.elem.style.top = (window.innerHeight / 2 - this.elem.clientHeight / 2).toFixed(3) + 'px';
  }

  clear () {
    this.big.innerText = this.small.innerText = '';
  }

  setText (big, small) {
    if (big != null) {
      this.big.innerText = big + '';
    }
    if (small != null) {
      this.small.innerText = small + '';
    }
  }
}

class Body {
  constructor (world, startX, startY) {
    this.world = world;
    this.startX = startX;
    this.startY = startY;
  }

  reset () {
    if (this.body) {
      this.body.setPosition(Vec2(this.startX, this.startY));
      this.body.setAngle(0);
      this.body.setLinearVelocity(Vec2(0, 0));
      this.body.setAngularVelocity(0);
    }
  }

  get x () { return this.body.getPosition().x; }
  get y () { return this.body.getPosition().y; }
}

class Drone extends Body {
  constructor (world, startX, startY, thrust = 12, angularDamping = 3.0, linearDamping = 0.5, density = 2.25, friction = 0.1) {
    super(world, startX, startY);
    this.thrust = thrust;

    this.body = world.createBody({
      type : 'dynamic',
      allowSleep : false,
      angularDamping,
      linearDamping
    });

    let fd = {density, friction};
    this.body.createFixture(Box(4, 0.5), fd);
    this.body.createFixture(Box(0.5, 0.25, Vec2(-3.5, 0.75)), fd);
    this.body.createFixture(Box(0.5, 0.25, Vec2(3.5, 0.75)), fd);
  }

  move (left, right) {
    let tv = this.body.getWorldVector(Vec2(0, this.thrust));
    if (left) {
      let pt = this.body.getWorldPoint(Vec2(1.5, 0));
      this.body.applyLinearImpulse(tv, pt, true);
    }
    if (right) {
      let pt = this.body.getWorldPoint(Vec2(-1.5, 0));
      this.body.applyLinearImpulse(tv, pt, true);
    }
  }

  isLosing () {
    let angle = (this.body.getAngle() + 2 * Math.PI) % (2 * Math.PI);
    return angle > Math.PI / 2 && angle < Math.PI * 3 / 2;
  }
}

class DroneBox extends Body {
  constructor (world, drone, startX, startY, maxDist = 4, density = 1, friction = 0.1) {
    super(world, startX, startY);
    this.drone = drone;
    this.maxDist = maxDist;

    this.body = this.world.createBody({type: 'dynamic'});
    this.body.createFixture(Box(0.5, 0.5), {density, friction});
  }

  isLosing () {
    let distSq = Math.pow(this.x - this.drone.x, 2) + Math.pow(this.y - this.drone.y, 2);
    if (distSq >= Math.pow(this.maxDist, 2)) {
      return true;
    }
  }
}

class Game {
  constructor (width, height, addBox) {
    this.status = new Status();

    this.width = width;
    this.height = height;

    this.startX = 4;
    this.wallSegments = Math.round(width / 3);
    this.loseTimerMax = 5000;

    this.world = new pl.World();
    this.world.setGravity(Vec2(0.0, -50));

    this.drone = new Drone(this.world, -this.width / 2 + this.startX, this.height / 2);
    this.box = addBox ? new DroneBox(this.world, this.drone, -this.width / 2 + this.startX, this.height / 2 + 1) : null;

    this.reset();
  }

  reset () {
    this.loseTimer = -3000;
    this.gameOver = false;
    this.status.clear();

    this.drone.reset();
    if (this.box)
      this.box.reset();

    if (this.walls !== undefined) {
      for (let k of Object.keys(this.walls)) {
        this.world.destroyBody(this.walls[k]);
      }
      this.walls = undefined;
    }

    this.walls = generateWalls(this.world, this.wallSegments, this.width, this.height);
  }

  keyUpdate (dt, left, right, down) {
    if (down) {
      this.reset();
    } else if (!this.gameOver && (left || right)) {
      this.drone.move(left, right);
    }
  }

  getScore () {
    return Math.round(this.drone.x + this.width / 2 - this.startX);
  }

  step (dt, testbed) {
    this.keyUpdate(dt, testbed.activeKeys.left, testbed.activeKeys.right, testbed.activeKeys.down);

    testbed.x = this.drone.x;
    testbed.y = -this.drone.y;

    if (this.gameOver)
      return;

    if (this.drone.isLosing() || (this.box && this.box.isLosing())) {
      if (this.loseTimer >= this.loseTimerMax - 1) {
        this.status.setText(':( (' + this.getScore() + 'm)', 'Press ↓ to restart');
        this.gameOver = true;
      } else if (this.loseTimer > 0) {
        this.status.setText(Math.round((this.loseTimerMax - this.loseTimer) / 1000), null);
      }
      this.loseTimer += dt;
    } else {
      this.loseTimer = -1000;
      if (this.getScore() >= this.width - 20) {
        this.status.setText('You win!', this.getScore() + 'm');
        this.gameOver = true;
      } else {
        this.status.setText('', this.getScore() + 'm');
      }
    }
  }
}

const startGame = (boxMode) => {
  planck.testbed('DroneGame', (testbed) => {
    document.getElementById('menu').style.display = 'none';
    document.getElementById('status').style.display = 'block';
    window.testbed = testbed;

    let game = new Game(1020, 50, boxMode);
    window.game = game;

    testbed.step = (dtMs) => {
      game.step(dtMs, testbed);
    };

    return game.world;
  });
};

window.onload = (() => {
  let nrm = document.getElementById('nrm'),
      hrd = document.getElementById('hrd');
  nrm.addEventListener('click', () => {
    startGame(false);
  });
  hrd.addEventListener('click', () => {
    startGame(true);
  });
});