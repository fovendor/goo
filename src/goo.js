// Упрощённый TweenMax.set для обновления transform
const TweenMax = {
    set: function(elem, props) {
      if (!elem._transformData) {
        elem._transformData = { x: 0, y: 0, scale: 1 };
      }
      Object.assign(elem._transformData, props);
      const { x, y, scale } = elem._transformData;
      elem.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    }
  };
  
  let amount = 46;
  let explosionAmount = 100;
  let width = 22;
  let range = 29;
  let speed = 3;
  let tail = 4;
  let idleTimeout = 3000;
  let cursorAttraction = 0.00010;
  let particleAttraction = 0.000004;
  let explosionIntensity = 4;
  
  let phase1Duration = 2000;
  let phase2Duration = 300;
  let phase4Duration = 3000;
  let assemblyThreshold = 2;
  
  let cursorForceMultiplier = 700;
  let particleForceMultiplier = 800;
  let frictionAir = 0.027;
  
  const cursor = document.getElementById('cursor');
  
  // Сырые координаты курсора (центр)
  let mousePosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let lastMoveTime = performance.now();
  let lastFrame = performance.now();
  
  let targetCircleLevel = 1; 
  let circleLevel = 1;
  let dots = [];
  let idleCenter = null;
  
  // Фазы взрыва: 0 – нет, 1 – рост/бурление, 2 – взрыв, 3 – сбор, 4 – «наелась»
  let explosionPhase = 0;
  let explosionStartTime = 0;
  let phase3StartTime = 0;
  let phase4StartTime = 0;
  
  let userParams = { amount, explosionAmount, range, speed, width, explosionIntensity };
  
  // Функции easing
  function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }
  function easeInQuad(t) { return t * t; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  
  /* Запуск взрыва */
  function startExplosion() {
    if (explosionPhase !== 0) return;
    explosionPhase = 1;
    explosionStartTime = performance.now();
    amount = userParams.explosionAmount;
    buildDots();
    targetCircleLevel = 0;
    idleCenter = { x: mousePosition.x, y: mousePosition.y };
  }
  
  function cancelExplosion() {
    if (explosionPhase === 0) return;
    explosionPhase = 0;
    if (engine) {
      dots.forEach(dot => {
        if (dot.physicsBody) {
          Matter.World.remove(world, dot.physicsBody);
          dot.physicsBody = null;
        }
      });
      engine = null;
      world = null;
    }
    amount = userParams.amount;
    range = userParams.range;
    speed = userParams.speed;
    width = userParams.width;
    explosionAmount = userParams.explosionAmount;
    cursor.style.transform = 'scale(1)';
    buildDots();
    targetCircleLevel = 1;
    idleCenter = null;
  }
  
  function nextExplosionPhase(newPhase) {
    explosionPhase = newPhase;
    explosionStartTime = performance.now();
  }
  
  /* Класс точки */
  class Dot {
    constructor(index = 0, totalDots = amount) {
      this.index = index;
      this.x = mousePosition.x;
      this.y = mousePosition.y;
      this.scale = (totalDots > 1) ? (1 - (index / (totalDots - 1)) * 0.9) : 1;
      this.element = document.createElement('span');
      this.element.style.width = width + 'px';
      this.element.style.height = width + 'px';
      this.element.style.borderRadius = '50%';
      TweenMax.set(this.element, { scale: this.scale });
      cursor.appendChild(this.element);
  
      this.locked = false;
      this.lockX = this.x;
      this.lockY = this.y;
      this.angleX = Math.random() * Math.PI * 2;
      this.angleY = Math.random() * Math.PI * 2;
      this.range = range / 2 + 2;
      this.explodeAngle = Math.random() * 2 * Math.PI;
      this.exploded = false;
      this.physicsBody = null;
      this.initialDistance = 0;
    }
    lock() {
      if (idleCenter) {
        this.lockX = idleCenter.x;
        this.lockY = idleCenter.y;
      } else {
        this.lockX = this.x;
        this.lockY = this.y;
      }
      this.angleX = Math.random() * Math.PI * 2;
      this.angleY = Math.random() * Math.PI * 2;
      this.locked = true;
    }
    drawIdleActive(activeX, activeY) {
      if (circleLevel < 1) {
        if (!this.locked) this.lock();
        this.angleX += speed / 100;
        this.angleY += speed / 100;
        const idleX = this.lockX + Math.sin(this.angleX) * this.range;
        const idleY = this.lockY + Math.sin(this.angleY) * this.range;
        const finalX = activeX * circleLevel + idleX * (1 - circleLevel);
        const finalY = activeY * circleLevel + idleY * (1 - circleLevel);
        TweenMax.set(this.element, { x: finalX, y: finalY });
        this.x = finalX;
        this.y = finalY;
      } else {
        this.locked = false;
        TweenMax.set(this.element, { x: activeX, y: activeY });
        this.x = activeX;
        this.y = activeY;
      }
    }
    drawPhase1() {
      if (!this.locked) this.lock();
      this.angleX += speed / 100;
      this.angleY += speed / 100;
      const idleX = this.lockX + Math.sin(this.angleX) * this.range;
      const idleY = this.lockY + Math.sin(this.angleY) * this.range;
      TweenMax.set(this.element, { x: idleX, y: idleY });
      this.x = idleX;
      this.y = idleY;
    }
  }
  
  /* Создание точек */
  function buildDots() {
    dots.forEach(dot => dot.element.remove());
    dots = [];
    for (let i = 0; i < amount; i++) {
      const dot = new Dot(i, amount);
      dot.x = mousePosition.x;
      dot.y = mousePosition.y;
      dots.push(dot);
    }
  }
  
  /* Обработчики мыши */
  const onMouseMove = event => {
    mousePosition.x = event.clientX;
    mousePosition.y = event.clientY;
    lastMoveTime = performance.now();
    cancelExplosion();
    targetCircleLevel = 1;
    idleCenter = null;
    dots.forEach(dot => dot.locked = false);
  };
  
  const onTouchMove = event => {
    mousePosition.x = event.touches[0].clientX;
    mousePosition.y = event.touches[0].clientY;
    lastMoveTime = performance.now();
    cancelExplosion();
    targetCircleLevel = 1;
    idleCenter = null;
    dots.forEach(dot => dot.locked = false);
  };
  
  /* Основной цикл отрисовки */
  function render(timestamp) {
    const delta = timestamp - lastFrame;
    lastFrame = timestamp;
  
    if (explosionPhase === 0 && timestamp - lastMoveTime > idleTimeout) {
      startExplosion();
    }
  
    if (explosionPhase === 0) {
      let x = mousePosition.x;
      let y = mousePosition.y;
      dots.forEach((dot, i, arr) => {
        dot.drawIdleActive(x, y);
        if (targetCircleLevel === 1) {
          const nextDot = arr[i + 1] || arr[0];
          const dx = ((nextDot.x - dot.x) * (tail / 10)) * circleLevel;
          const dy = ((nextDot.y - dot.y) * (tail / 10)) * circleLevel;
          x += dx;
          y += dy;
        }
      });
    } else {
      updateExplosionPhases(delta);
      if (engine) {
        Matter.Engine.update(engine, delta);
      }
      dots.forEach(dot => {
        if (dot.physicsBody) {
          const pos = dot.physicsBody.position;
          TweenMax.set(dot.element, { x: pos.x, y: pos.y });
          dot.x = pos.x;
          dot.y = pos.y;
        }
      });
    }
  
    const smoothing = 0.1;
    circleLevel += (targetCircleLevel - circleLevel) * smoothing;
    requestAnimationFrame(render);
  }
  
  /* Фазы взрыва */
  let engine = null;
  let world = null;
  function updateExplosionPhases(delta) {
    const now = performance.now();
    if (explosionPhase === 1) {
      const elapsed = now - explosionStartTime;
      const t = Math.min(elapsed / phase1Duration, 1);
      speed = lerp(1, 10, t);
      range = lerp(8, 32, t);
      dots.forEach(dot => {
        dot.range = range / 2 + 2;
        dot.drawPhase1();
      });
      if (t >= 1) {
        dots.forEach(dot => {
          dot.lock();
          dot.x = dot.lockX;
          dot.y = dot.lockY;
        });
        engine = Matter.Engine.create();
        world = engine.world;
        world.gravity.x = 0;
        world.gravity.y = 0;
        dots.forEach(dot => {
          const radius = (width * dot.scale) / 2;
          dot.physicsBody = Matter.Bodies.circle(dot.x, dot.y, radius, {
            frictionAir: frictionAir,
            restitution: 0,
            isSensor: true
          });
          dot.explodeAngle = Math.random() * Math.PI * 2;
          dot.exploded = false;
          Matter.World.add(world, dot.physicsBody);
        });
        nextExplosionPhase(2);
      }
    } else if (explosionPhase === 2) {
      dots.forEach(dot => {
        if (dot.physicsBody && !dot.exploded) {
          const intensity = userParams.explosionIntensity;
          const scaleFactor = intensity / 10;
          const baseForce = 0.06 * scaleFactor;
          const randomFactor = Math.random() * 0.04 * scaleFactor;
          const forceMagnitude = baseForce + randomFactor;
          const force = {
            x: Math.cos(dot.explodeAngle) * forceMagnitude,
            y: Math.sin(dot.explodeAngle) * forceMagnitude
          };
          Matter.Body.applyForce(dot.physicsBody, dot.physicsBody.position, force);
          dot.exploded = true;
          const dx = dot.physicsBody.position.x - idleCenter.x;
          const dy = dot.physicsBody.position.y - idleCenter.y;
          dot.initialDistance = Math.sqrt(dx * dx + dy * dy);
        }
      });
      const elapsed = now - explosionStartTime;
      if (elapsed >= phase2Duration) {
        nextExplosionPhase(3);
        phase3StartTime = now;
      }
    } else if (explosionPhase === 3) {
      const phase3Elapsed = now - phase3StartTime;
      const epsilonCursor = 5;
      dots.forEach(dot => {
        if (dot.physicsBody) {
          const pos = dot.physicsBody.position;
          const dx = idleCenter.x - pos.x;
          const dy = idleCenter.y - pos.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const delayThreshold = (dot.initialDistance || 0) * 0.3;
          if (phase3Elapsed > delayThreshold) {
            const forceMagnitude = (cursorAttraction / (distance * distance + epsilonCursor * epsilonCursor)) * cursorForceMultiplier;
            const forceCursor = {
              x: dx * forceMagnitude,
              y: dy * forceMagnitude
            };
            Matter.Body.applyForce(dot.physicsBody, pos, forceCursor);
          }
        }
      });
      const assembled = dots.every(dot => {
        if (dot.physicsBody) {
          const dx = dot.physicsBody.position.x - idleCenter.x;
          const dy = dot.physicsBody.position.y - idleCenter.y;
          return Math.sqrt(dx * dx + dy * dy) < assemblyThreshold;
        }
        return true;
      });
      if (assembled) {
        dots.forEach(dot => {
          if (dot.physicsBody) {
            Matter.World.remove(world, dot.physicsBody);
            dot.physicsBody = null;
          }
        });
        engine = null;
        world = null;
        explosionPhase = 4;
        phase4StartTime = now;
      }
    } else if (explosionPhase === 4) {
      const phase4Elapsed = now - phase4StartTime;
      if (phase4Elapsed >= phase4Duration) {
        amount = userParams.amount;
        range = userParams.range;
        speed = userParams.speed;
        width = userParams.width;
        explosionAmount = userParams.explosionAmount;
        buildDots();
        explosionPhase = 0;
        targetCircleLevel = 0;
        idleCenter = { x: mousePosition.x, y: mousePosition.y };
      }
    }
  }
  
  /* Подтягиваем данные на панель управления */
  function initControls() {
    const amountSlider = document.getElementById("amount");
    const explosionAmountSlider = document.getElementById("explosionAmount");
    const widthSlider = document.getElementById("width");
    const rangeSlider = document.getElementById("range");
    const speedSlider = document.getElementById("speed");
    const tailSlider = document.getElementById("tail");
    const idleTimeoutSlider = document.getElementById("idleTimeout");
    const cursorAttractionSlider = document.getElementById("cursorAttraction");
    const particleAttractionSlider = document.getElementById("particleAttraction");
    const explosionIntensitySlider = document.getElementById("explosionIntensity");
  
    const phase1DurationSlider = document.getElementById("phase1Duration");
    const phase2DurationSlider = document.getElementById("phase2Duration");
    const phase4DurationSlider = document.getElementById("phase4Duration");
    const assemblyThresholdSlider = document.getElementById("assemblyThreshold");
    const cursorForceMultiplierSlider = document.getElementById("cursorForceMultiplier");
    const particleForceMultiplierSlider = document.getElementById("particleForceMultiplier");
    const frictionAirSlider = document.getElementById("frictionAir");
  
    amountSlider.addEventListener("input", function() {
      const newVal = parseInt(this.value);
      document.getElementById("amountVal").textContent = newVal;
      userParams.amount = newVal;
      if (explosionPhase === 0) {
        amount = newVal;
        buildDots();
      }
    });
    explosionAmountSlider.addEventListener("input", function() {
      const newVal = parseInt(this.value);
      document.getElementById("explosionAmountVal").textContent = newVal;
      userParams.explosionAmount = newVal;
    });
    widthSlider.addEventListener("input", function() {
      const newVal = parseInt(this.value);
      document.getElementById("widthVal").textContent = newVal;
      userParams.width = newVal;
      width = newVal;
      if (explosionPhase === 0) {
        buildDots();
      }
    });
    rangeSlider.addEventListener("input", function() {
      const newVal = parseInt(this.value);
      document.getElementById("rangeVal").textContent = newVal;
      userParams.range = newVal;
      range = newVal;
      dots.forEach(dot => {
        dot.range = range / 2 + 2;
      });
    });
    speedSlider.addEventListener("input", function() {
      const newVal = parseInt(this.value);
      document.getElementById("speedVal").textContent = newVal;
      userParams.speed = newVal;
      speed = newVal;
    });
    tailSlider.addEventListener("input", function() {
      const newVal = parseInt(this.value);
      document.getElementById("tailVal").textContent = newVal;
      tail = newVal;
    });
    idleTimeoutSlider.addEventListener("input", function() {
      const newVal = parseInt(this.value);
      document.getElementById("idleTimeoutVal").textContent = newVal;
      idleTimeout = newVal;
    });
    cursorAttractionSlider.addEventListener("input", function() {
      const newVal = parseFloat(this.value);
      document.getElementById("cursorAttractionVal").textContent = newVal.toFixed(5);
      cursorAttraction = newVal;
    });
    particleAttractionSlider.addEventListener("input", function() {
      const newVal = parseFloat(this.value);
      document.getElementById("particleAttractionVal").textContent = newVal.toFixed(6);
      particleAttraction = newVal;
    });
    explosionIntensitySlider.addEventListener("input", function() {
      const newVal = parseInt(this.value);
      document.getElementById("explosionIntensityVal").textContent = newVal;
      userParams.explosionIntensity = newVal;
      explosionIntensity = newVal;
    });
    phase1DurationSlider.addEventListener("input", function() {
      const newVal = parseInt(this.value);
      document.getElementById("phase1DurationVal").textContent = newVal;
      phase1Duration = newVal;
    });
    phase2DurationSlider.addEventListener("input", function() {
      const newVal = parseInt(this.value);
      document.getElementById("phase2DurationVal").textContent = newVal;
      phase2Duration = newVal;
    });
    phase4DurationSlider.addEventListener("input", function() {
      const newVal = parseInt(this.value);
      document.getElementById("phase4DurationVal").textContent = newVal;
      phase4Duration = newVal;
    });
    assemblyThresholdSlider.addEventListener("input", function() {
      const newVal = parseInt(this.value);
      document.getElementById("assemblyThresholdVal").textContent = newVal;
      assemblyThreshold = newVal;
    });
    cursorForceMultiplierSlider.addEventListener("input", function() {
      const newVal = parseInt(this.value);
      document.getElementById("cursorForceMultiplierVal").textContent = newVal;
      cursorForceMultiplier = newVal;
    });
    particleForceMultiplierSlider.addEventListener("input", function() {
      const newVal = parseInt(this.value);
      document.getElementById("particleForceMultiplierVal").textContent = newVal;
      particleForceMultiplier = newVal;
    });
    frictionAirSlider.addEventListener("input", function() {
      const newVal = parseFloat(this.value);
      document.getElementById("frictionAirVal").textContent = newVal.toFixed(3);
      frictionAir = newVal;
    });
  }
  
  function init() {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove);
    initControls();
    buildDots();
    requestAnimationFrame(render);
  }
  
  init();
  