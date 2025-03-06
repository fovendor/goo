# Goo Explosion

**Goo Explosion** is an interactive demo page that uses HTML/CSS/JS and the Matter.js library to model physically appealing gooey explosions.

![gif of goo](img/goo.gif "A short demo of droplet animation").

## How It Works

1. **Cursor Mode**:

   - When the mouse moves, a chain of “blobs” is created and smoothed by linear interpolation (Lerp), which gives the illusion of a tail.
   - If the cursor remains still for a certain amount of time, the goo begins to accumulate entropy.

2. **Goo Escape Mode**:

   - **Phase 1: Shaking**  
     A few blobs want to get out, trying to escape the gravity of their parent and start vibrating.
   - **Phase 2: Explosion**  
     The blobs realize they can’t do it alone, so they call on others from the `explosionAmount` to start a REVOLT!!! Entropy has peaked, and the blobs fly off in all directions.
   - **Phase 3: Gathering**  
     Once they’ve had their fun, the parent’s gravity calls them all back home!
   - **Phase 4: Pause**  
     Finally, everyone is back together. The blobs need a moment to reflect!

3. **Matter.js Physics Engine**:

   - **Gravity** in `world.gravity` is turned off (x=0, y=0) so that the blobs float in a two-dimensional plane.
   - **Air friction (frictionAir)** controls how quickly the blobs slow down during explosion and gathering.
   - **applyForce**: during the explosion, each blob receives a random force vector depending on `explosionIntensity`.
   - **Bodies.circle**: each blob is represented as a small circular body in the engine. The property `isSensor: true` allows them not to collide physically and cancel collisions.
   - **World.add** and **World.remove**: add/remove blobs when the explosion starts or ends.

4. **Mathematical Details**:

   - **Linear Interpolation (Lerp)** is used for smooth movement of blobs and transitions between different states (idle → mouse movement → shaking).
   - **Shaker-Style Shaking**: the coordinates of each blob are distorted by sinusoidal functions (`Math.sin`) within a radius that grows during Phase 1.
   - **Cursor Attraction** (`cursorAttraction`): the force is inversely proportional to the square of the distance from the cursor, multiplied by the `cursorForceMultiplier` coefficient.
   - **Inter-particle Attraction** (`particleAttraction`), if enabled, is calculated similarly – inversely proportional to the square of the distance between pairs of nearby blobs.

5. **SVG Goo Filter**:

   - The page includes a `<filter id="goo">` containing `feGaussianBlur` (blur) and `feColorMatrix`. It is applied to the block of elements (`<span>`) to create a sticky, blending blob/ink effect.

## Parameter Setup

The page has a control block (panels “Basic Settings,” “Phase Parameters,” “Physics Parameters”). Each slider updates the corresponding variable in real time:

**Basic Settings**

1. **Number of Regular Blobs** – how many blobs follow the cursor in cursor mode to create the tail effect.

2. **Explosion Blob Count** – how many blobs are created during the explosion to fill the space.

3. **Width** – the diameter of the cursor and blobs in the tail during cursor mode.

4. **Tail** – how elongated the chain is; the greater the value, the more stretched out and less dense the tail appears.

5. **Timeout** – the number of milliseconds the cursor must remain still before triggering the blob explosion.

6. **Cursor Attraction** – the coefficient of force that pulls the blobs back to the cursor during the gathering phase.

7. **Inter-particle Attraction** – the coefficient of force by which blobs attract each other.

8. **Explosion Intensity** – how strongly the blobs fly apart during the explosion.

9. **Minimum/Maximum Blob Size** – defines the size range for new blobs appearing in the explosion (each one is randomly chosen between the minimum and maximum).

### Phase Parameters

1. **Phase 1 Duration** – how long the shaking lasts before the explosion occurs.

2. **Phase 2 Duration** – how much time is allocated for the explosion, i.e., how long the blobs keep flying apart.

3. **Phase 4 Duration** – how long the pause after the gathering lasts before the blobs become the cursor again.

4. **Assembly Threshold** – the size of the area around the cursor into which blobs are gathered.

### Physics Parameters

1. **Cursor Force Multiplier** – the “gravity” strength of the cursor (an invisible force that pulls the blobs back).

2. **Inter-particle Force Multiplier** – the attraction strength between particles themselves.

3. **Damping** – “air resistance”: the higher it is, the faster the blobs slow down and come to a stop.

## Usage

1. Open `index.html` in your browser.
2. Adjust the sliders and move your mouse to see the effects.
3. If the cursor remains still for longer than `idleTimeout` milliseconds, it triggers the blob explosion.
4. If you decide to evade the blobs by moving the cursor, you’ll see inertial dances and fluid-mixing effects.
5. Once you’re done experimenting, click any mouse button, and the tail cursor will appear again.

**Have fun experimenting with the goo explosion!**

---

## Backlog

- **Inter-particle Attraction** – with a large number of blobs, this can be computationally heavy (O(n^2) when iterating over all pairs). It can be optimized using Matter.js spatial structures or by limiting neighbors.
- Make it possible to load an SVG cursor.
- **Various Shaking Modes** – adjust the amplitude/frequency of the sine wave.
- **Blob Colors and Styles** – when embedding in a dark-themed site, the cursor might not be visible. Color and border customization might help.

## Contribution

Feel free to open Issues with suggestions or bug reports.

## License

The project and the Matter.js library are freely available for use and modification for any purpose, provided a link to the source is included. They are distributed under the MIT license.