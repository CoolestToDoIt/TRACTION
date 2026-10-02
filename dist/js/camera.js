import { nearest, clamp } from "./engine.js";
import { surfaceHeight } from "./terrain.js";

export class ChaseCamera {
  update(track, car, yaw, dt, menu, lookBack) {
    const back = menu ? 18 : 10.5;
    const x = car.x - Math.sin(yaw) * back + (menu ? 9 : 0);
    const z = car.z - Math.cos(yaw) * back;
    const ground = surfaceHeight(track, x, z, nearest(track, x, z));
    // Predict the rear ground from the car's grade, while enforcing actual clearance.
    const targetHeight = menu
      ? car.y + 9
      : Math.max(
          car.y + 3.8 - Math.sin(car.pitch || 0) * back * (lookBack ? -1 : 1),
          ground + 2.8,
        );
    const targetPitch = menu
      ? 0.19
      : clamp(0.12 - (car.pitch || 0) * 0.8 * (lookBack ? -1 : 1), -0.35, 0.45);
    const reset =
      !this.position ||
      this.lookBack !== lookBack ||
      this.menu !== menu ||
      Math.hypot(car.x - this.carX, car.z - this.carZ) > 45;
    const amount = 1 - Math.exp(-8 * Math.min(dt, 0.05));
    const y = reset
      ? targetHeight
      : this.position.y + (targetHeight - this.position.y) * amount;
    this.pitch = reset
      ? targetPitch
      : this.pitch + (targetPitch - this.pitch) * amount;
    this.position = { x, y: Math.max(ground + 1.2, y), z };
    this.lookBack = lookBack;
    this.menu = menu;
    this.carX = car.x;
    this.carZ = car.z;
    return { position: this.position, pitch: this.pitch };
  }
}
