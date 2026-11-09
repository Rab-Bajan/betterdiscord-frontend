import * as THREE from 'three';

/**
 * D.O.T.S. Laser Matrix for MiskolcPhobia
 * Projects 144 (12x12) bright green laser beams and matrix dots.
 * When a ghost enters the projected laser volume, the laser matrix
 * illuminates the ghost's silhouette as a green speckled paranormal figure.
 */
export class DotsLaserMatrix {
  constructor(options = {}) {
    this.group = new THREE.Group();
    this.group.name = 'DotsLaserMatrix';

    this.enabled = options.enabled ?? true;
    this.pointCountX = options.pointCountX ?? 12;
    this.pointCountY = options.pointCountY ?? 12;
    this.totalPoints = this.pointCountX * this.pointCountY; // 144 points (100+)
    this.range = options.range ?? 7.0;
    this.spreadAngleX = options.spreadAngleX ?? (Math.PI / 3); // 60 degrees horizontal
    this.spreadAngleY = options.spreadAngleY ?? (Math.PI / 4); // 45 degrees vertical
    this.laserColor = new THREE.Color(options.color ?? 0x00ff66);

    this.ghostInField = false;
    this.ghostSilhouetteAlpha = 0.0;

    this._buildProjectorHousing();
    this._buildLaserBeamsAndDots();
    this._buildGhostSilhouetteMesh();
  }

  _buildProjectorHousing() {
    this.housingGroup = new THREE.Group();

    // Tripod base and central cylinder
    const baseGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.15, 12);
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x22262c,
      roughness: 0.5,
      metalness: 0.8
    });
    const baseMesh = new THREE.Mesh(baseGeo, metalMat);
    baseMesh.position.y = 0.075;
    this.housingGroup.add(baseMesh);

    // Projector head box
    const headGeo = new THREE.BoxGeometry(0.14, 0.1, 0.18);
    const headMesh = new THREE.Mesh(headGeo, metalMat);
    headMesh.position.set(0, 0.18, 0);
    this.housingGroup.add(headMesh);

    // Green emitting lens aperture
    const lensGeo = new THREE.CircleGeometry(0.035, 16);
    const lensMat = new THREE.MeshBasicMaterial({
      color: this.laserColor,
      side: THREE.DoubleSide
    });
    this.lensMesh = new THREE.Mesh(lensGeo, lensMat);
    this.lensMesh.position.set(0, 0.18, -0.091);
    this.housingGroup.add(this.lensMesh);

    // Green ambient glow point light from aperture
    this.apertureLight = new THREE.PointLight(this.laserColor, 0.8, 3.0, 2.0);
    this.apertureLight.position.set(0, 0.18, -0.15);
    this.housingGroup.add(this.apertureLight);

    this.group.add(this.housingGroup);
  }

  _buildLaserBeamsAndDots() {
    const origin = new THREE.Vector3(0, 0.18, -0.09);

    // 1. Laser Beams (LineSegments from origin to grid terminals)
    const linePositions = new Float32Array(this.totalPoints * 6);
    // 2. Terminal Dots (Points at terminal distance)
    const dotPositions = new Float32Array(this.totalPoints * 3);

    let pIdx = 0;
    let lIdx = 0;

    const halfX = (this.pointCountX - 1) / 2;
    const halfY = (this.pointCountY - 1) / 2;

    this.beamDirections = [];

    for (let iy = 0; iy < this.pointCountY; iy++) {
      const vNorm = (iy - halfY) / halfY; // -1 to +1
      const pitch = vNorm * (this.spreadAngleY * 0.5);

      for (let ix = 0; ix < this.pointCountX; ix++) {
        const uNorm = (ix - halfX) / halfX; // -1 to +1
        const yaw = uNorm * (this.spreadAngleX * 0.5);

        // Direction forward is -Z in Three.js
        const dir = new THREE.Vector3(
          Math.sin(yaw) * Math.cos(pitch),
          Math.sin(pitch),
          -Math.cos(yaw) * Math.cos(pitch)
        ).normalize();

        this.beamDirections.push(dir.clone());

        const endPoint = origin.clone().add(dir.clone().multiplyScalar(this.range));

        // Line start (aperture)
        linePositions[lIdx++] = origin.x;
        linePositions[lIdx++] = origin.y;
        linePositions[lIdx++] = origin.z;
        // Line end
        linePositions[lIdx++] = endPoint.x;
        linePositions[lIdx++] = endPoint.y;
        linePositions[lIdx++] = endPoint.z;

        // Dot point
        dotPositions[pIdx++] = endPoint.x;
        dotPositions[pIdx++] = endPoint.y;
        dotPositions[pIdx++] = endPoint.z;
      }
    }

    // Line segments geometry & material
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    this.beamMaterial = new THREE.LineBasicMaterial({
      color: this.laserColor,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending
    });
    this.beamLines = new THREE.LineSegments(lineGeo, this.beamMaterial);
    this.group.add(this.beamLines);

    // Terminal dots geometry & material
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPositions, 3));

    // Custom circle sprite texture for glowing laser dots
    let dotTex = null;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
        grad.addColorStop(0.35, 'rgba(0, 255, 102, 0.9)');
        grad.addColorStop(0.7, 'rgba(0, 255, 102, 0.3)');
        grad.addColorStop(1, 'rgba(0, 255, 102, 0.0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);
        dotTex = new THREE.CanvasTexture(canvas);
      }
    }
    if (!dotTex) {
      dotTex = new THREE.Texture();
    }
    this.dotMaterial = new THREE.PointsMaterial({
      color: this.laserColor,
      size: 0.12,
      map: dotTex,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.dots = new THREE.Points(dotGeo, this.dotMaterial);
    this.group.add(this.dots);
  }

  _buildGhostSilhouetteMesh() {
    // Spectral silhouette that glows with green laser matrix speckles when ghost intersects
    this.silhouetteGroup = new THREE.Group();
    this.silhouetteGroup.visible = false;

    // Procedural humanoid ghost form (head, torso, arms, tattered trailing base)
    const torsoGeo = new THREE.CylinderGeometry(0.22, 0.28, 1.1, 10);
    const headGeo = new THREE.SphereGeometry(0.18, 12, 12);
    headGeo.translate(0, 0.72, 0);

    // Custom shader material for DOTS ghost silhouette
    this.silhouetteMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0.0 },
        uLaserColor: { value: this.laserColor },
        uAlpha: { value: 0.0 }
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uLaserColor;
        uniform float uAlpha;
        varying vec3 vWorldPos;
        varying vec3 vNormal;

        void main() {
          // Speckled laser dots pattern across silhouette
          float dots = sin(vWorldPos.x * 24.0) * sin(vWorldPos.y * 24.0) * sin(vWorldPos.z * 24.0);
          dots = smoothstep(0.4, 0.85, dots);

          // Ethereal rim
          float rim = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
          rim = pow(rim, 2.5);

          vec3 col = uLaserColor * (dots * 2.2 + rim * 0.7);
          float alpha = uAlpha * (dots * 0.75 + rim * 0.45);
          gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.9));
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const torsoMesh = new THREE.Mesh(torsoGeo, this.silhouetteMat);
    const headMesh = new THREE.Mesh(headGeo, this.silhouetteMat);
    this.silhouetteGroup.add(torsoMesh);
    this.silhouetteGroup.add(headMesh);

    this.group.add(this.silhouetteGroup);
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    this.beamLines.visible = this.enabled;
    this.dots.visible = this.enabled;
    this.apertureLight.visible = this.enabled;
    if (!this.enabled) {
      this.silhouetteGroup.visible = false;
      this.ghostInField = false;
    }
  }

  /**
   * Evaluates if a given world position is inside the DOTS cone field
   */
  isPositionInField(worldPos) {
    if (!this.enabled) return false;

    // Convert worldPos to local projector space
    const localPos = worldPos.clone();
    this.group.worldToLocal(localPos);

    // In local space, projector shoots along -Z from (0, 0.18, -0.09)
    const relZ = -(localPos.z - (-0.09));
    if (relZ <= 0.2 || relZ > this.range) return false;

    const maxHalfWidth = relZ * Math.tan(this.spreadAngleX * 0.5);
    const maxHalfHeight = relZ * Math.tan(this.spreadAngleY * 0.5);

    const relX = Math.abs(localPos.x);
    const relY = Math.abs(localPos.y - 0.18);

    return relX <= maxHalfWidth && relY <= maxHalfHeight;
  }

  update(delta, ghostWorldPos = null, isGhostActive = true) {
    if (!this.enabled) return;

    this.silhouetteMat.uniforms.uTime.value += delta;

    let inField = false;
    if (ghostWorldPos && isGhostActive) {
      inField = this.isPositionInField(ghostWorldPos);
    }
    this.ghostInField = inField;

    // Lerp silhouette visibility
    const targetAlpha = inField ? 0.8 : 0.0;
    this.ghostSilhouetteAlpha += (targetAlpha - this.ghostSilhouetteAlpha) * Math.min(delta * 6.0, 1.0);

    if (this.ghostSilhouetteAlpha > 0.02) {
      this.silhouetteGroup.visible = true;
      this.silhouetteMat.uniforms.uAlpha.value = this.ghostSilhouetteAlpha;

      if (ghostWorldPos) {
        // Place silhouette at ghost position inside the matrix
        const localGhost = ghostWorldPos.clone();
        this.group.worldToLocal(localGhost);
        this.silhouetteGroup.position.set(localGhost.x, localGhost.y + 0.6, localGhost.z);
      }
    } else {
      this.silhouetteGroup.visible = false;
    }
  }

  dispose() {
    this.beamLines.geometry.dispose();
    this.beamMaterial.dispose();
    this.dots.geometry.dispose();
    this.dotMaterial.dispose();
    this.silhouetteMat.dispose();
    this.group.clear();
  }
}

export default DotsLaserMatrix;
