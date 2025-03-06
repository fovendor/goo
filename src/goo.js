// -------------------- Твикнутый TweenMax.set --------------------
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

// -------------------- Основные параметры --------------------
let amount = 46;
let explosionAmount = 135;
let width = 22;
let speed = 3; // Ползунок для "speed" у нас пока закомментирован в HTML
let tail = 4;
let idleTimeout = 3000;
let cursorAttraction = 0.00019;
let particleAttraction = 0.000008;
let explosionIntensity = 4;
let minParticleSize = 13;
let maxParticleSize = 20;
let shakeAmplitude = 29; // Для "тряски" (фаза 1)

// -------------------- Длительности фаз --------------------
let phase1Duration = 2000;  // «тряска»
let phase2Duration = 300;   // «взрыв»
let phase4Duration = 3000;  // пауза перед «сдуванием» (сейчас 3000)

// -------------------- Сборка / возвращение --------------------
let assemblyThreshold = 13;
let cursorForceMultiplier = 700;
let particleForceMultiplier = 800;
let frictionAir = 0.067;

let innerDampingFactor = 1;
let innerDampingRadius = () => assemblyThreshold * 3;

// -------------------- Настройки «быстрого» поведения --------------------
let quickDeflateDuration = 300;   // при движении мышью в фазе 1
let fastAssembly = false;         // при клике
let explosionReturnDuration = 600; // по умолчанию 600 мс

// Родительский контейнер
const cursor = document.getElementById('cursor');

// Координаты и тайминги
let mousePosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let lastMoveTime = performance.now();
let lastFrame = performance.now();

// Плавность «цепочки»
let targetCircleLevel = 1;
let circleLevel = 1;
let dots = [];
let idleCenter = null;

// Фазы анимации
// 0 – нет взрыва, 1 – тряска, 2 – взрыв, 3 – сбор, 4 – пауза, 5 – возврат
let explosionPhase = 0;
let explosionStartTime = 0;
let phase3StartTime = 0;
let phase4StartTime = 0;

// Сохраняем исходные значения в userParams (чтобы при сбросе всё восстанавливать)
let userParams = {
  amount,
  explosionAmount,
  speed,
  width,
  explosionIntensity
};

// -------------------- Вспомогательные функции --------------------
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function startExplosion() {
  if (explosionPhase !== 0) return;
  explosionPhase = 1;
  explosionStartTime = performance.now();
  amount = userParams.explosionAmount;
  buildDots();
  targetCircleLevel = 0;
  idleCenter = { x: mousePosition.x, y: mousePosition.y };
}

function cancelExplosion(customDuration) {
  if (explosionPhase === 0 || explosionPhase === 5) return;
  explosionReturnDuration = (typeof customDuration === 'number') ? customDuration : 600;
  nextExplosionPhase(5);

  // Запоминаем позиции для плавной интерполяции
  dots.forEach(dot => {
    if (dot.physicsBody) {
      dot.startX = dot.physicsBody.position.x;
      dot.startY = dot.physicsBody.position.y;
    } else {
      dot.startX = dot.x;
      dot.startY = dot.y;
    }
    dot.startScale = 1;
  });
}

function nextExplosionPhase(newPhase) {
  explosionPhase = newPhase;
  explosionStartTime = performance.now();
}

// -------------------- Класс Dot --------------------
class Dot {
  constructor(index = 0, totalDots = amount) {
    this.index = index;
    this.x = mousePosition.x;
    this.y = mousePosition.y;
    // scale для "цепочки"
    this.scale = (totalDots > 1)
      ? (1 - (index / (totalDots - 1)) * 0.9)
      : 1;

    this.element = document.createElement('span');
    this.element.style.width = width + 'px';
    this.element.style.height = width + 'px';
    this.element.style.borderRadius = '50%';

    TweenMax.set(this.element, { scale: this.scale });
    cursor.appendChild(this.element);

    // Прочие служебные свойства
    this.locked = false;
    this.lockX = this.x;
    this.lockY = this.y;
    this.angleX = Math.random() * Math.PI * 2;
    this.angleY = Math.random() * Math.PI * 2;
    this.shakeRadius = shakeAmplitude / 2 + 2;
    this.explodeAngle = Math.random() * 2 * Math.PI;
    this.exploded = false;
    this.physicsBody = null;
    this.initialDistance = 0;
    this.frozen = false;
    this.freezeStartTime = null;
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
      // Переходное состояние между «цепочкой» и «шевелением на месте»
      if (!this.locked) this.lock();
      this.angleX += speed / 100;
      this.angleY += speed / 100;
      const idleX = this.lockX + Math.sin(this.angleX) * this.shakeRadius;
      const idleY = this.lockY + Math.sin(this.angleY) * this.shakeRadius;
      const finalX = activeX * circleLevel + idleX * (1 - circleLevel);
      const finalY = activeY * circleLevel + idleY * (1 - circleLevel);
      TweenMax.set(this.element, { x: finalX, y: finalY });
      this.x = finalX;
      this.y = finalY;
    } else {
      // Обычный режим цепочки
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
    const idleX = this.lockX + Math.sin(this.angleX) * this.shakeRadius;
    const idleY = this.lockY + Math.sin(this.angleY) * this.shakeRadius;
    TweenMax.set(this.element, { x: idleX, y: idleY });
    this.x = idleX;
    this.y = idleY;
  }
}

// -------------------- Пересоздать массив точек --------------------
function buildDots() {
  // Удаляем старые
  dots.forEach(dot => dot.element.remove());
  dots = [];

  for (let i = 0; i < amount; i++) {
    const dot = new Dot(i, amount);
    dot.x = mousePosition.x;
    dot.y = mousePosition.y;
    dots.push(dot);
  }
}

// -------------------- События ввода --------------------
function onMouseMove(e) {
  mousePosition.x = e.clientX;
  mousePosition.y = e.clientY;
  lastMoveTime = performance.now();

  if (explosionPhase === 0) {
    targetCircleLevel = 1;
    idleCenter = null;
    dots.forEach(dot => dot.locked = false);
  } else {
    if (explosionPhase === 1) {
      cancelExplosion(quickDeflateDuration);
      return;
    }
    if (explosionPhase >= 1 && explosionPhase <= 4) {
      idleCenter = { x: mousePosition.x, y: mousePosition.y };
    }
  }
}

function onTouchMove(e) {
  mousePosition.x = e.touches[0].clientX;
  mousePosition.y = e.touches[0].clientY;
  lastMoveTime = performance.now();

  if (explosionPhase === 0) {
    targetCircleLevel = 1;
    idleCenter = null;
    dots.forEach(dot => dot.locked = false);
  } else {
    if (explosionPhase === 1) {
      cancelExplosion(quickDeflateDuration);
      return;
    }
    if (explosionPhase >= 1 && explosionPhase <= 4) {
      idleCenter = { x: mousePosition.x, y: mousePosition.y };
    }
  }
}

function onMouseDown(e) {
  lastMoveTime = performance.now();
  // Любой клик отменяет анимацию взрыва, если она в процессе
  if (explosionPhase !== 0 && explosionPhase !== 5) {
    cancelExplosion(quickDeflateDuration);
  }
}

// -------------------- Основной цикл анимации --------------------
let engine = null;
let world = null;

function render(timestamp) {
  const delta = timestamp - lastFrame;
  lastFrame = timestamp;

  // Запуск «взрыва», если долго не было движения
  if (explosionPhase === 0 && timestamp - lastMoveTime > idleTimeout) {
    startExplosion();
  }

  if (explosionPhase === 0) {
    // Обычный режим «цепочки»
    let x = mousePosition.x;
    let y = mousePosition.y;
    dots.forEach((dot, i, arr) => {
      dot.drawIdleActive(x, y);
      if (targetCircleLevel === 1) {
        const nextDot = arr[i + 1] || arr[0];
        const dx = (nextDot.x - dot.x) * (tail / 10) * circleLevel;
        const dy = (nextDot.y - dot.y) * (tail / 10) * circleLevel;
        x += dx;
        y += dy;
      }
    });
  } else {
    // Идёт взрыв (фазы 1..5)
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

  // Плавное приближение circleLevel к targetCircleLevel
  circleLevel += (targetCircleLevel - circleLevel) * 0.1;
  requestAnimationFrame(render);
}

// -------------------- Логика фаз взрыва --------------------
function updateExplosionPhases(delta) {
  const now = performance.now();

  // Фаза 1: тряска
  if (explosionPhase === 1) {
    const elapsed = now - explosionStartTime;
    const t = Math.min(elapsed / phase1Duration, 1);
    shakeAmplitude = lerp(8, 32, t);
    speed = lerp(1, 10, t);

    dots.forEach(dot => {
      dot.shakeRadius = shakeAmplitude / 2 + 2;
      dot.drawPhase1();
    });

    if (t >= 1) {
      dots.forEach(dot => {
        dot.lock();
        dot.x = dot.lockX;
        dot.y = dot.lockY;
      });
      engine = Matter.Engine.create({ enableSleeping: false });
      world = engine.world;
      world.gravity.x = 0;
      world.gravity.y = 0;

      // Создаём физические тела
      dots.forEach(dot => {
        const randomSize = lerp(minParticleSize, maxParticleSize, Math.random());
        dot.element.style.width = randomSize + 'px';
        dot.element.style.height = randomSize + 'px';
        TweenMax.set(dot.element, { scale: 1 });

        const radius = randomSize / 2;
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

  // Фаза 2: «взрыв»
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
        dot.initialDistance = Math.sqrt(dx*dx + dy*dy);
      }
    });

    if ((now - explosionStartTime) >= phase2Duration) {
      nextExplosionPhase(3);
      phase3StartTime = now;
    }

  // Фаза 3: сбор
  } else if (explosionPhase === 3) {
    let allFrozen = true;

    dots.forEach(dot => {
      if (!dot.physicsBody || dot.frozen) return;
      allFrozen = false;
      const pos = dot.physicsBody.position;
      const dx = idleCenter.x - pos.x;
      const dy = idleCenter.y - pos.y;
      const distance = Math.sqrt(dx*dx + dy*dy);

      const freezeDelay = fastAssembly ? 0 : 5000;
      const freezeRadius = assemblyThreshold * 3;

      // Притягиваемся к idleCenter
      if (distance > innerDampingRadius()) {
        const extraBoost = fastAssembly ? 50 : 1;
        const epsilonCursor = 5;
        const forceMagnitude =
          (cursorAttraction * extraBoost) / (distance*distance + epsilonCursor*epsilonCursor)
          * cursorForceMultiplier;

        Matter.Body.applyForce(dot.physicsBody, pos, { x: dx*forceMagnitude, y: dy*forceMagnitude });

        // Межчастичное притяжение (если захотите доработать)
        // Можно перебрать все другие точки и притягивать их друг к другу через particleAttraction
        // Но это может быть ресурсоёмко при большом количестве точек.

      } else {
        // Близко – гасим скорость
        const vx = dot.physicsBody.velocity.x;
        const vy = dot.physicsBody.velocity.y;
        Matter.Body.setVelocity(dot.physicsBody, {
          x: vx * innerDampingFactor,
          y: vy * innerDampingFactor
        });
      }

      // Заморозка частицы
      if (distance <= freezeRadius) {
        if (dot.freezeStartTime === null) {
          dot.freezeStartTime = now;
        } else {
          const insideTime = now - dot.freezeStartTime;
          if (insideTime >= freezeDelay) {
            Matter.Body.setVelocity(dot.physicsBody, { x: 0, y: 0 });
            Matter.Body.setAngularVelocity(dot.physicsBody, 0);
            Matter.Body.setStatic(dot.physicsBody, true);
            dot.frozen = true;
          }
        }
      } else {
        dot.freezeStartTime = null;
      }
    });

    // Все частицы «замёрзли»
    if (allFrozen) {
      explosionPhase = 4;
      phase4StartTime = now;
    }

  // Фаза 4: короткая пауза
  } else if (explosionPhase === 4) {
    const phase4Elapsed = now - phase4StartTime;
    if (phase4Elapsed >= phase4Duration) {
      // Плавное «сдутие»
      cancelExplosion(50); // Пример: 50 мс
    }

  // Фаза 5: плавное возвращение (сдутие)
  } else if (explosionPhase === 5) {
    const elapsed = now - explosionStartTime;
    const t = Math.min(elapsed / explosionReturnDuration, 1);

    dots.forEach(dot => {
      const finalX = mousePosition.x;
      const finalY = mousePosition.y;
      const curX = lerp(dot.startX, finalX, t);
      const curY = lerp(dot.startY, finalY, t);
      TweenMax.set(dot.element, {
        x: curX,
        y: curY,
        scale: lerp(dot.startScale, dot.scale, t)
      });
    });

    if (t >= 1) {
      // Полный сброс
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
      // Восстанавливаем параметры (из userParams, которые уже обновляются слайдерами)
      amount = userParams.amount;
      speed = userParams.speed;
      width = userParams.width;
      explosionAmount = userParams.explosionAmount;
      explosionIntensity = userParams.explosionIntensity;

      buildDots();
      explosionPhase = 0;
      targetCircleLevel = 1;
      idleCenter = null;
      fastAssembly = false;
    }
  }
}

// -------------------- Функция для инициализации ползунков --------------------
function setupControls() {
  // 1) Количество обычных точек
  const amountInput = document.getElementById('amount');
  const amountVal = document.getElementById('amountVal');
  amountInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    amount = val;
    userParams.amount = val; // Чтобы при сбросе оставалось новое значение
    amountVal.textContent = val;
    buildDots(); // Пересоздадим точки сразу
  });

  // 2) Количество точек взрыва
  const explosionAmountInput = document.getElementById('explosionAmount');
  const explosionAmountVal = document.getElementById('explosionAmountVal');
  explosionAmountInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    explosionAmount = val;
    userParams.explosionAmount = val;
    explosionAmountVal.textContent = val;
  });

  // 3) Ширина
  const widthInput = document.getElementById('width');
  const widthValSpan = document.getElementById('widthVal');
  widthInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    width = val;
    userParams.width = val;
    widthValSpan.textContent = val;
    buildDots(); // Чтобы точки сразу перерисовались
  });

  // (Раскомментируйте, если хотите оживить «speed»)
  // const speedInput = document.getElementById('speed');
  // const speedValSpan = document.getElementById('speedVal');
  // speedInput.addEventListener('input', (e) => {
  //   const val = parseInt(e.target.value, 10);
  //   speed = val;
  //   userParams.speed = val;
  //   speedValSpan.textContent = val;
  // });

  // 4) Хвост
  const tailInput = document.getElementById('tail');
  const tailValSpan = document.getElementById('tailVal');
  tailInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    tail = val;
    tailValSpan.textContent = val;
  });

  // 5) Таймаут (idle)
  const idleTimeoutInput = document.getElementById('idleTimeout');
  const idleTimeoutValSpan = document.getElementById('idleTimeoutVal');
  idleTimeoutInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    idleTimeout = val;
    idleTimeoutValSpan.textContent = val;
  });

  // 6) Притяжение к курсору
  const cursorAttractionInput = document.getElementById('cursorAttraction');
  const cursorAttractionValSpan = document.getElementById('cursorAttractionVal');
  cursorAttractionInput.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    cursorAttraction = val;
    cursorAttractionValSpan.textContent = val.toFixed(5);
  });

  // 7) Межчастичное притяжение
  const particleAttractionInput = document.getElementById('particleAttraction');
  const particleAttractionValSpan = document.getElementById('particleAttractionVal');
  particleAttractionInput.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    particleAttraction = val;
    particleAttractionValSpan.textContent = val.toExponential(6);
  });

  // 8) Интенсивность взрыва
  const explosionIntensityInput = document.getElementById('explosionIntensity');
  const explosionIntensityValSpan = document.getElementById('explosionIntensityVal');
  explosionIntensityInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    explosionIntensity = val;
    userParams.explosionIntensity = val;
    explosionIntensityValSpan.textContent = val;
  });

  // 9) Минимальный размер частицы
  const minParticleSizeInput = document.getElementById('minParticleSize');
  const minParticleSizeValSpan = document.getElementById('minParticleSizeVal');
  minParticleSizeInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    minParticleSize = val;
    minParticleSizeValSpan.textContent = val;
  });

  // 10) Максимальный размер частицы
  const maxParticleSizeInput = document.getElementById('maxParticleSize');
  const maxParticleSizeValSpan = document.getElementById('maxParticleSizeVal');
  maxParticleSizeInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    maxParticleSize = val;
    maxParticleSizeValSpan.textContent = val;
  });

  // --- Параметры фаз ---
  const phase1DurationInput = document.getElementById('phase1Duration');
  const phase1DurationVal = document.getElementById('phase1DurationVal');
  phase1DurationInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    phase1Duration = val;
    phase1DurationVal.textContent = val;
  });

  const phase2DurationInput = document.getElementById('phase2Duration');
  const phase2DurationVal = document.getElementById('phase2DurationVal');
  phase2DurationInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    phase2Duration = val;
    phase2DurationVal.textContent = val;
  });

  const phase4DurationInput = document.getElementById('phase4Duration');
  const phase4DurationVal = document.getElementById('phase4DurationVal');
  phase4DurationInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    phase4Duration = val;
    phase4DurationVal.textContent = val;
  });

  const assemblyThresholdInput = document.getElementById('assemblyThreshold');
  const assemblyThresholdVal = document.getElementById('assemblyThresholdVal');
  assemblyThresholdInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    assemblyThreshold = val;
    assemblyThresholdVal.textContent = val;
  });

  // --- Параметры физики ---
  const cursorForceMultiplierInput = document.getElementById('cursorForceMultiplier');
  const cursorForceMultiplierVal = document.getElementById('cursorForceMultiplierVal');
  cursorForceMultiplierInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    cursorForceMultiplier = val;
    cursorForceMultiplierVal.textContent = val;
  });

  const particleForceMultiplierInput = document.getElementById('particleForceMultiplier');
  const particleForceMultiplierVal = document.getElementById('particleForceMultiplierVal');
  particleForceMultiplierInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    particleForceMultiplier = val;
    particleForceMultiplierVal.textContent = val;
  });

  const frictionAirInput = document.getElementById('frictionAir');
  const frictionAirVal = document.getElementById('frictionAirVal');
  frictionAirInput.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    frictionAir = val;
    frictionAirVal.textContent = val.toFixed(3);
  });
}

// -------------------- Инициализация --------------------
function init() {
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('touchmove', onTouchMove);
  window.addEventListener('mousedown', onMouseDown);

  // Сразу создаём начальные точки
  buildDots();

  // Запускаем анимацию
  requestAnimationFrame(render);

  // Подвешиваем все ползунки
  setupControls();
}

// Запуск
init();
