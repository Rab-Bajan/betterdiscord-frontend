// Geometria / anyag / textúra gyorsítótár: újbóli belépéskor semmi sem jön létre újra.
// A CPU-oldali receptek (BufferGeometry tömbök, anyagparaméterek, DataTexture pixelek) a modulé és
// megmaradnak; lebontáskor csak a GPU-oldali példányokat engedjük el (`releaseGpu`), így a régi
// renderelő belső állapotára nem marad hivatkozás, és az új renderelő egyszerűen újra feltölti őket.
// A gyorsítótárazott anyagokat nem módosítjuk (példányonkénti szín: InstancedMesh.setColorAt).
import type * as THREE from 'three';

export class AssetCache {
  static #instance: AssetCache | null = null;

  static get(): AssetCache {
    AssetCache.#instance ??= new AssetCache();
    return AssetCache.#instance;
  }

  readonly #geometries = new Map<string, THREE.BufferGeometry>();
  readonly #materials = new Map<string, THREE.Material>();
  readonly #textures = new Map<string, THREE.Texture>();
  #created = 0;

  private constructor() {}

  geometry(key: string, create: () => THREE.BufferGeometry): THREE.BufferGeometry {
    return this.#memo(this.#geometries, key, create);
  }

  material(key: string, create: () => THREE.Material): THREE.Material {
    return this.#memo(this.#materials, key, create);
  }

  texture(key: string, create: () => THREE.Texture): THREE.Texture {
    return this.#memo(this.#textures, key, create);
  }

  /**
   * Frees the GPU copies held by the renderer that is about to be disposed. `dispose()` fires the
   * 'dispose' event, on which three's renderer deletes its buffers / programs / textures and
   * unhooks its listeners from the asset; the CPU-side object stays valid and is re-uploaded on
   * first use by the next renderer. Call while that renderer's context is still alive.
   */
  releaseGpu(): void {
    for (const g of this.#geometries.values()) g.dispose();
    for (const m of this.#materials.values()) m.dispose();
    for (const t of this.#textures.values()) t.dispose();
  }

  /** How many assets were ever created (debug / tests: stays flat on re-entry). */
  get createdCount(): number {
    return this.#created;
  }

  #memo<T>(map: Map<string, T>, key: string, create: () => T): T {
    const hit = map.get(key);
    if (hit !== undefined) return hit;
    const value = create();
    map.set(key, value);
    this.#created += 1;
    return value;
  }
}
