/**
 * PhobiaAvatars.js
 *
 * Multiplayer 3D Avatars Synchronization for MiskolcPhobia.
 *
 * Implements:
 * - Procedural 3D humanoid character model wearing reflective orange/yellow hazard vest
 *   ('Láthatósági mellény') and forehead white LED headlamp.
 * - Position and rotation interpolation (lerp/slerp) matching 12 Hz tick packets
 *   with 15.0 * dt damping factor.
 * - Synchronized flashlight beam (on/off state, directional tracking with head pitch).
 * - Dynamic leg/arm walk and sprint swing animations.
 * - Floating billboard overhead nameplate displaying username and sanity status.
 * - Full lifecycle management: add, remove, update from 12 Hz phobia:tick packets, disposal.
 */

import * as THREE from 'three';

/**
 * Creates a canvas texture for the overhead player nameplate billboard.
 */
function createNameplateTexture(username, sanity = 100) {
  if (typeof document === 'undefined') {
    // In headless testing environment, return null
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Background
  ctx.fillStyle = 'rgba(15, 17, 26, 0.75)';
  ctx.roundRect ? ctx.roundRect(4, 4, 248, 56, 8) : ctx.fillRect(4, 4, 248, 56);
  ctx.fill();

  // Border
  ctx.strokeStyle = '#7655F5';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Username
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(username || 'Kutató', 128, 22);

  // Sanity bar background
  ctx.fillStyle = '#222530';
  ctx.fillRect(28, 40, 200, 10);

  // Sanity bar fill
  const clampedSanity = Math.max(0, Math.min(100, sanity));
  let barColor = '#28C997'; // Green > 50%
  if (clampedSanity <= 25) {
    barColor = '#E94B64'; // Red <= 25%
  } else if (clampedSanity <= 50) {
    barColor = '#F59E0B'; // Orange <= 50%
  }
  ctx.fillStyle = barColor;
  ctx.fillRect(28, 40, (200 * clampedSanity) / 100, 10);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

/**
 * Single peer player 3D avatar instance.
 */
export class PhobiaAvatarInstance {
  constructor(id, data = {}) {
    this.id = id;
    this.userId = data.userId || id;
    this.username = data.username || `Kutató_${id.toString().slice(0, 4)}`;
    this.avatarColor = data.avatarColor || '#ff6a00'; // Default safety orange

    // Spatial State
    const initX = data.x !== undefined ? data.x : (data.position?.[0] || -4.0);
    const initY = data.y !== undefined ? data.y : (data.position?.[1] || 0.0);
    const initZ = data.z !== undefined ? data.z : (data.position?.[2] || -15.0);

    this.currentPosition = new THREE.Vector3(initX, initY, initZ);
    this.targetPosition = new THREE.Vector3(initX, initY, initZ);

    this.currentYaw = data.yaw !== undefined ? data.yaw : (data.rotation?.[1] || 0.0);
    this.targetYaw = this.currentYaw;

    this.currentPitch = data.pitch !== undefined ? data.pitch : (data.rotation?.[0] || 0.0);
    this.targetPitch = this.currentPitch;

    this.crouched = Boolean(data.crouched);
    this.sprinting = Boolean(data.sprinting);
    this.alive = data.alive !== undefined ? Boolean(data.alive) : true;
    this.sanity = data.sanity !== undefined ? data.sanity : 100;

    // Flashlight synchronization
    this.flashlightOn = data.flashlightOn !== undefined ? Boolean(data.flashlightOn) : true;

    // Animation & Bobbing
    this.swingTimer = 0.0;
    this.isMoving = false;

    // Build 3D Model Hierarchy
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = `Avatar_${this.id}`;
    this.rootGroup.position.copy(this.currentPosition);
    this.rootGroup.rotation.y = this.currentYaw;

    this._buildProceduralModel();
  }

  _buildProceduralModel() {
    // 1. Legs Group (Pivoting at hip y = 0.82m)
    this.legsGroup = new THREE.Group();
    this.legsGroup.name = 'LegsGroup';

    const trouserMat = new THREE.MeshStandardMaterial({
      color: 0x22262d,
      roughness: 0.8
    });
    const bootMat = new THREE.MeshStandardMaterial({
      color: 0x141416,
      roughness: 0.9,
      metalness: 0.2
    });

    const legGeom = new THREE.BoxGeometry(0.14, 0.74, 0.16);
    const bootGeom = new THREE.BoxGeometry(0.15, 0.12, 0.22);

    // Left Leg
    this.leftLeg = new THREE.Group();
    this.leftLeg.position.set(-0.12, 0.78, 0);
    const leftLegMesh = new THREE.Mesh(legGeom, trouserMat);
    leftLegMesh.position.y = -0.37;
    leftLegMesh.castShadow = true;
    const leftBootMesh = new THREE.Mesh(bootGeom, bootMat);
    leftBootMesh.position.set(0, -0.70, 0.03);
    leftBootMesh.castShadow = true;
    this.leftLeg.add(leftLegMesh);
    this.leftLeg.add(leftBootMesh);

    // Right Leg
    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(0.12, 0.78, 0);
    const rightLegMesh = new THREE.Mesh(legGeom, trouserMat);
    rightLegMesh.position.y = -0.37;
    rightLegMesh.castShadow = true;
    const rightBootMesh = new THREE.Mesh(bootGeom, bootMat);
    rightBootMesh.position.set(0, -0.70, 0.03);
    rightBootMesh.castShadow = true;
    this.rightLeg.add(rightLegMesh);
    this.rightLeg.add(rightBootMesh);

    this.legsGroup.add(this.leftLeg);
    this.legsGroup.add(this.rightLeg);
    this.rootGroup.add(this.legsGroup);

    // 2. Torso Group (y = 0.82m)
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.name = 'TorsoGroup';
    this.torsoGroup.position.set(0, 0.82, 0);

    // Base dark sweater
    const sweaterMat = new THREE.MeshStandardMaterial({
      color: 0x1c1e24,
      roughness: 0.7
    });
    const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.54, 0.24), sweaterMat);
    torsoMesh.position.y = 0.27;
    torsoMesh.castShadow = true;
    this.torsoGroup.add(torsoMesh);

    // High-Visibility Hazard Vest ('Láthatósági mellény')
    // Safety orange / fluorescent yellow vest with silver reflective stripes
    const vestMat = new THREE.MeshStandardMaterial({
      color: 0xff6600, // Vibrant safety orange
      roughness: 0.5,
      metalness: 0.1
    });
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      roughness: 0.15,
      metalness: 0.95, // High specular retro-reflectivity
      emissive: 0x222222
    });

    const vestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.26), vestMat);
    vestMesh.position.y = 0.26;
    vestMesh.castShadow = true;
    this.torsoGroup.add(vestMesh);

    // Horizontal reflective stripes on vest
    const stripeUpper = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.05, 0.27), stripeMat);
    stripeUpper.position.y = 0.36;
    const stripeLower = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.05, 0.27), stripeMat);
    stripeLower.position.y = 0.18;
    this.torsoGroup.add(stripeUpper);
    this.torsoGroup.add(stripeLower);

    // 3. Arms
    const armGeom = new THREE.BoxGeometry(0.11, 0.55, 0.12);

    // Left Arm
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(-0.26, 0.50, 0);
    const leftArmMesh = new THREE.Mesh(armGeom, vestMat);
    leftArmMesh.position.y = -0.24;
    leftArmMesh.castShadow = true;
    this.leftArm.add(leftArmMesh);
    this.torsoGroup.add(this.leftArm);

    // Right Arm (holds tool or tracks flashlight)
    this.rightArm = new THREE.Group();
    this.rightArm.position.set(0.26, 0.50, 0);
    const rightArmMesh = new THREE.Mesh(armGeom, vestMat);
    rightArmMesh.position.y = -0.24;
    rightArmMesh.castShadow = true;
    this.rightArm.add(rightArmMesh);
    this.torsoGroup.add(this.rightArm);

    // 4. Neck & Head Pivot (pitches up/down [-81°, +81°])
    this.headPivot = new THREE.Group();
    this.headPivot.name = 'HeadPivot';
    this.headPivot.position.set(0, 0.56, 0);

    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xdfb498,
      roughness: 0.6
    });
    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.22, 0.20), skinMat);
    headMesh.position.y = 0.12;
    headMesh.castShadow = true;
    this.headPivot.add(headMesh);

    // Dark beanie / security cap
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x1b1c20,
      roughness: 0.9
    });
    const capMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.10, 0.22), capMat);
    capMesh.position.y = 0.20;
    this.headPivot.add(capMesh);

    // White LED Headlamp on forehead
    const lampCasingMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 });
    const lampLensMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 1.5
    });

    const lampCasing = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.05), lampCasingMat);
    lampCasing.position.set(0, 0.16, 0.11);
    const lampLens = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 8), lampLensMat);
    lampLens.rotation.x = Math.PI / 2;
    lampLens.position.set(0, 0.16, 0.136);

    this.headPivot.add(lampCasing);
    this.headPivot.add(lampLens);

    // Synchronized 3D Flashlight Spotlight
    this.flashlight = new THREE.SpotLight(0xfffaee, 2.5);
    this.flashlight.angle = Math.PI / 6; // 30 degrees cone
    this.flashlight.penumbra = 0.35;
    this.flashlight.distance = 18.0;
    this.flashlight.decay = 2.0;
    this.flashlight.castShadow = false; // Keep shadow casting budgeted for local player & floodlights
    this.flashlight.position.set(0, 0.16, 0.14);

    this.flashlightTarget = new THREE.Object3D();
    this.flashlightTarget.position.set(0, 0.16, 5.0);
    this.headPivot.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;
    this.headPivot.add(this.flashlight);

    this.flashlight.visible = this.flashlightOn;

    this.torsoGroup.add(this.headPivot);
    this.rootGroup.add(this.torsoGroup);

    // 5. Overhead Floating Nameplate Billboard
    this.nameplateTexture = createNameplateTexture(this.username, this.sanity);
    if (this.nameplateTexture) {
      const spriteMat = new THREE.SpriteMaterial({
        map: this.nameplateTexture,
        depthTest: false,
        depthWrite: false
      });
      this.nameplateSprite = new THREE.Sprite(spriteMat);
      this.nameplateSprite.scale.set(1.4, 0.35, 1.0);
      this.nameplateSprite.position.set(0, 1.95, 0);
      this.rootGroup.add(this.nameplateSprite);
    }
  }

  updateData(data = {}) {
    if (data.userId) this.userId = data.userId;
    if (data.username && data.username !== this.username) {
      this.username = data.username;
      this.updateNameplate(this.username, this.sanity);
    }

    if (data.x !== undefined && data.y !== undefined && data.z !== undefined) {
      this.targetPosition.set(data.x, data.y, data.z);
    } else if (Array.isArray(data.position)) {
      this.targetPosition.set(data.position[0], data.position[1], data.position[2]);
    }

    if (data.yaw !== undefined) {
      this.targetYaw = data.yaw;
    } else if (Array.isArray(data.rotation)) {
      this.targetYaw = data.rotation[1];
    }

    if (data.pitch !== undefined) {
      this.targetPitch = data.pitch;
    } else if (Array.isArray(data.rotation)) {
      this.targetPitch = data.rotation[0];
    }

    if (data.crouched !== undefined) this.crouched = Boolean(data.crouched);
    if (data.sprinting !== undefined) this.sprinting = Boolean(data.sprinting);
    if (data.alive !== undefined) this.alive = Boolean(data.alive);

    if (data.sanity !== undefined && Math.abs(this.sanity - data.sanity) >= 1) {
      this.sanity = data.sanity;
      this.updateNameplate(this.username, this.sanity);
    }

    if (data.flashlightOn !== undefined) {
      this.setFlashlight(data.flashlightOn);
    }
  }

  setFlashlight(state) {
    this.flashlightOn = Boolean(state);
    if (this.flashlight) {
      this.flashlight.visible = this.flashlightOn && this.alive;
    }
  }

  updateNameplate(username, sanity) {
    if (!this.nameplateSprite || typeof document === 'undefined') return;

    if (this.nameplateTexture) {
      this.nameplateTexture.dispose();
    }
    this.nameplateTexture = createNameplateTexture(username, sanity);
    if (this.nameplateTexture) {
      this.nameplateSprite.material.map = this.nameplateTexture;
      this.nameplateSprite.material.needsUpdate = true;
    }
  }

  update(delta) {
    if (!delta || delta <= 0) return;
    const dt = Math.min(delta, 0.1);

    // Point 30 Interpolation: Damping factor 15.0 * dt
    const factor = Math.min(1.0, 15.0 * dt);

    // 1. Position Lerp
    this.currentPosition.lerp(this.targetPosition, factor);
    this.rootGroup.position.copy(this.currentPosition);

    // 2. Yaw Interpolation (handling 2π angular wrapping)
    let yawDiff = this.targetYaw - this.currentYaw;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    this.currentYaw += yawDiff * factor;
    this.rootGroup.rotation.y = this.currentYaw;

    // 3. Head Pitch Lerp
    this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, this.targetPitch, factor);
    if (this.headPivot) {
      this.headPivot.rotation.x = this.currentPitch;
    }

    // 4. Crouching Offset Lerp
    const targetTorsoY = this.crouched ? 0.42 : 0.82;
    if (this.torsoGroup) {
      this.torsoGroup.position.y = THREE.MathUtils.lerp(this.torsoGroup.position.y, targetTorsoY, factor);
    }

    // 5. Walking / Running Swing Animation
    const distMoved = this.currentPosition.distanceTo(this.targetPosition);
    this.isMoving = distMoved > 0.02;

    if (this.isMoving && this.alive) {
      const swingSpeed = this.sprinting ? 14.0 : 9.0;
      this.swingTimer += dt * swingSpeed;

      const legAngle = Math.sin(this.swingTimer) * (this.sprinting ? 0.65 : 0.45);
      const armAngle = Math.sin(this.swingTimer) * (this.sprinting ? 0.55 : 0.35);

      if (this.leftLeg) this.leftLeg.rotation.x = legAngle;
      if (this.rightLeg) this.rightLeg.rotation.x = -legAngle;
      if (this.leftArm) this.leftArm.rotation.x = -armAngle;
      if (this.rightArm) this.rightArm.rotation.x = armAngle;
    } else {
      // Smoothly return limbs to neutral pose
      if (this.leftLeg) this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, factor);
      if (this.rightLeg) this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, factor);
      if (this.leftArm) this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, factor);
      if (this.rightArm) this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, factor);
    }

    // 6. Alive / Dead Appearance
    if (!this.alive) {
      // Fallen dead pose
      this.rootGroup.rotation.z = THREE.MathUtils.lerp(this.rootGroup.rotation.z, Math.PI / 2, factor);
      if (this.flashlight) this.flashlight.visible = false;
      if (this.nameplateSprite) this.nameplateSprite.visible = false;
    } else {
      this.rootGroup.rotation.z = THREE.MathUtils.lerp(this.rootGroup.rotation.z, 0, factor);
      if (this.flashlight) this.flashlight.visible = this.flashlightOn;
      if (this.nameplateSprite) this.nameplateSprite.visible = true;
    }
  }

  dispose() {
    if (this.nameplateTexture) {
      this.nameplateTexture.dispose();
      this.nameplateTexture = null;
    }

    // Traverse and dispose all geometries & materials
    this.rootGroup.traverse((obj) => {
      if (obj.geometry) {
        obj.geometry.dispose();
      }
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    if (this.rootGroup.parent) {
      this.rootGroup.parent.remove(this.rootGroup);
    }
  }
}

/**
 * PhobiaAvatars Manager
 * Coordinates all peer avatars in the session.
 */
export class PhobiaAvatars {
  constructor(options = {}) {
    this.scene = options.scene || null;
    this.group = new THREE.Group();
    this.group.name = 'PhobiaAvatarsGroup';

    if (this.scene) {
      this.scene.add(this.group);
    }

    this.localPlayerId = options.localPlayerId || null;
    this.avatars = new Map(); // peerId -> PhobiaAvatarInstance
  }

  setLocalPlayerId(id) {
    this.localPlayerId = id;
    if (this.avatars.has(id)) {
      this.removeAvatar(id);
    }
  }

  addAvatar(id, data = {}) {
    if (this.avatars.has(id)) {
      this.updateAvatar(id, data);
      return this.avatars.get(id);
    }

    const avatar = new PhobiaAvatarInstance(id, data);
    this.avatars.set(id, avatar);
    this.group.add(avatar.rootGroup);
    return avatar;
  }

  removeAvatar(id) {
    const avatar = this.avatars.get(id);
    if (!avatar) return false;

    this.group.remove(avatar.rootGroup);
    avatar.dispose();
    this.avatars.delete(id);
    return true;
  }

  getAvatar(id) {
    return this.avatars.get(id) || null;
  }

  hasAvatar(id) {
    return this.avatars.has(id);
  }

  updateAvatar(id, data = {}) {
    const avatar = this.avatars.get(id);
    if (avatar) {
      avatar.updateData(data);
    } else {
      this.addAvatar(id, data);
    }
  }

  /**
   * Synchronizes avatars with authoritative 12 Hz phobia:tick payload.
   * @param {Array} players - Array of player states from tick packet
   * @param {String} localPlayerId - Optional local player identifier to omit
   */
  handleTick(players = [], localPlayerId = null) {
    const myId = localPlayerId || this.localPlayerId;
    const activeIds = new Set();

    if (Array.isArray(players)) {
      for (const p of players) {
        const pId = p.id || p.socketId || p.userId;
        if (!pId || (myId && pId === myId)) continue;

        activeIds.add(pId);
        if (this.avatars.has(pId)) {
          this.avatars.get(pId).updateData(p);
        } else {
          this.addAvatar(pId, p);
        }
      }
    }

    // Remove avatars that disconnected or left
    for (const [id, avatar] of this.avatars.entries()) {
      if (!activeIds.has(id)) {
        this.removeAvatar(id);
      }
    }
  }

  update(delta) {
    for (const avatar of this.avatars.values()) {
      avatar.update(delta);
    }
  }

  clear() {
    for (const avatar of this.avatars.values()) {
      avatar.dispose();
    }
    this.avatars.clear();
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
  }

  dispose() {
    this.clear();
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}
