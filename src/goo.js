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

// ------------------------------------------
// Основные параметры
// ------------------------------------------
let amount = 46;
let explosionAmount = 100;
let width = 22;               // Ширина курсора в обычном состоянии
let speed = 3;
let tail = 4;
let idleTimeout = 1000;
let cursorAttraction = 0.00010;
let particleAttraction = 0.000004;
let explosionIntensity = 4;

// Новые параметры размера частиц при взрыве
let minParticleSize = 13;   // минимальный размер (px)
let maxParticleSize = 20;  // максимальный размер (px)

// Внутренняя «амплитуда дрожания» (заменяет бывший range)
let shakeAmplitude = 29; // Просто стартовое значение «бурления»

// Параметры фаз
let phase1Duration = 2000;
let phase2Duration = 300;
let phase4Duration = 3000;
let assemblyThreshold = 13; // Порог сборки (px)

// Параметры физики
let cursorForceMultiplier = 700;
let particleForceMultiplier = 800;
let frictionAir = 0.067;

// Дополнительные внутренние настройки
let innerDampingFactor = 1;   
let innerDampingRadius = () => assemblyThreshold * 3;  
// Радиус, внутри которого убираем силу притяжения и гасим скорость

const cursor = document.getElementById('cursor');

// Координаты курсора
let mousePosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let lastMoveTime = performance.now();
let lastFrame = performance.now();

// Для плавного рисования «цепочки»
let targetCircleLevel = 1;
let circleLevel = 1;
let dots = [];
let idleCenter = null;

// Фазы взрыва: 0 – нет, 1 – рост/бурление, 2 – взрыв, 3 – сбор, 4 – «наелась»
let explosionPhase = 0;
let explosionStartTime = 0;
let phase3StartTime = 0;
let phase4StartTime = 0;

/**
 * В объект userParams включаем то,
 * что нужно нам для сброса (cancelExplosion).
 */
let userParams = { 
  amount, 
  explosionAmount, 
  speed, 
  width, 
  explosionIntensity 
};

/* Функция линейной интерполяции */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/* Запуск взрыва (фаза 1) */
function startExplosion() {
  if (explosionPhase !== 0) return;
  explosionPhase = 1;
  explosionStartTime = performance.now();
  amount = userParams.explosionAmount;
  buildDots();
  targetCircleLevel = 0;
  idleCenter = { x: mousePosition.x, y: mousePosition.y };
}

/* Отмена взрыва, возвращение к обычному состоянию */
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
  speed = userParams.speed;
  width = userParams.width;
  explosionAmount = userParams.explosionAmount;

  // Создаём «обычные» точки заново
  buildDots();
  targetCircleLevel = 1;
  idleCenter = null;
}

/* Переход к следующей фазе */
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

    // Изначальный размер (в обычном режиме)
    // При взрыве он будет меняться отдельно.
    this.element.style.width = width + 'px';
    this.element.style.height = width + 'px';
    this.element.style.borderRadius = '50%';

    // Лёгкое масштабирование «от хвоста к голове»
    TweenMax.set(this.element, { scale: this.scale });

    cursor.appendChild(this.element);

    this.locked = false;
    this.lockX = this.x;
    this.lockY = this.y;
    this.angleX = Math.random() * Math.PI * 2;
    this.angleY = Math.random() * Math.PI * 2;

    // Вместо range используем shakeAmplitude
    this.shakeRadius = shakeAmplitude / 2 + 2;

    this.explodeAngle = Math.random() * 2 * Math.PI;
    this.exploded = false;
    this.physicsBody = null;
    this.initialDistance = 0;

    // Флаги для «заморозки»
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

  // Рисование обычной «живой» точки, когда нет взрыва
  drawIdleActive(activeX, activeY) {
    if (circleLevel < 1) {
      // точка «привязана» к своему центру, но колеблется
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
      // circleLevel = 1 -> двигается по «цепочке»
      this.locked = false;
      TweenMax.set(this.element, { x: activeX, y: activeY });
      this.x = activeX;
      this.y = activeY;
    }
  }

  // Рисование в фазе 1 (начало взрыва, «бурление»)
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

/* Создаём точки заново */
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

/* Основной цикл анимации */
function render(timestamp) {
  const delta = timestamp - lastFrame;
  lastFrame = timestamp;

  // Если фаза 0 и давно не двигаем мышью – запускаем взрыв
  if (explosionPhase === 0 && timestamp - lastMoveTime > idleTimeout) {
    startExplosion();
  }

  if (explosionPhase === 0) {
    // Обычный режим (нет взрыва)
    let x = mousePosition.x;
    let y = mousePosition.y;
    dots.forEach((dot, i, arr) => {
      dot.drawIdleActive(x, y);
      if (targetCircleLevel === 1) {
        // «цепочка» из точек
        const nextDot = arr[i + 1] || arr[0];
        const dx = ((nextDot.x - dot.x) * (tail / 10)) * circleLevel;
        const dy = ((nextDot.y - dot.y) * (tail / 10)) * circleLevel;
        x += dx;
        y += dy;
      }
    });
  } else {
    // Режим взрыва — обновляем фазы
    updateExplosionPhases(delta);
    if (engine) {
      Matter.Engine.update(engine, delta);
    }
    // Обновляем позиции span'ов по физ.телам
    dots.forEach(dot => {
      if (dot.physicsBody) {
        const pos = dot.physicsBody.position;
        TweenMax.set(dot.element, { x: pos.x, y: pos.y });
        dot.x = pos.x;
        dot.y = pos.y;
      }
    });
  }

  // Плавное приближение circleLevel
  const smoothing = 0.1;
  circleLevel += (targetCircleLevel - circleLevel) * smoothing;
  requestAnimationFrame(render);
}

// ------------------------------------------
// Управление фазами взрыва
// ------------------------------------------
let engine = null;
let world = null;

function updateExplosionPhases(delta) {
  const now = performance.now();

  // Фаза 1: «бурление» вокруг центра
  if (explosionPhase === 1) {
    const elapsed = now - explosionStartTime;
    const t = Math.min(elapsed / phase1Duration, 1);

    // От минимальной к максимальной «колебательной амплитуде»
    shakeAmplitude = lerp(8, 32, t);
    speed = lerp(1, 10, t);

    dots.forEach(dot => {
      dot.shakeRadius = shakeAmplitude / 2 + 2;
      dot.drawPhase1();
    });

    // Переход в фазу 2, когда время вышло
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

      // Создаём физ.тела и подготавливаем к взрыву
      dots.forEach(dot => {
        // Случайный размер в диапазоне [minParticleSize, maxParticleSize]
        const randomSize = lerp(minParticleSize, maxParticleSize, Math.random());
        
        // Ставим новые размеры под взрыв
        dot.element.style.width = randomSize + 'px';
        dot.element.style.height = randomSize + 'px';
        TweenMax.set(dot.element, { scale: 1 }); // убираем старый scale

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

  // Фаза 2: взрыв
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

        // Запоминаем, насколько далеко точка улетела
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

  // Фаза 3: сбор и «поглощение»
  } else if (explosionPhase === 3) {
    const phase3Elapsed = now - phase3StartTime;
    // Радиус, в котором считаем, что частица «достаточно близко»
    const freezeRadius = assemblyThreshold * 3;
    // 20 секунд для «полной заморозки»
    const freezeDelay = 20000; 
    let allFrozen = true;

    dots.forEach(dot => {
      if (!dot.physicsBody) return;
      if (dot.frozen) return; // уже заморожена

      allFrozen = false;
      const pos = dot.physicsBody.position;
      const dx = idleCenter.x - pos.x;
      const dy = idleCenter.y - pos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Притягиваем к центру
      if (distance > innerDampingRadius()) {
        const epsilonCursor = 5;
        const forceMagnitude = (cursorAttraction / (distance * distance + epsilonCursor * epsilonCursor)) * cursorForceMultiplier;
        Matter.Body.applyForce(dot.physicsBody, pos, { x: dx * forceMagnitude, y: dy * forceMagnitude });
      } else {
        // Очень близко — сильно гасим скорость
        const vx = dot.physicsBody.velocity.x;
        const vy = dot.physicsBody.velocity.y;
        Matter.Body.setVelocity(dot.physicsBody, {
          x: vx * innerDampingFactor,
          y: vy * innerDampingFactor
        });
      }

      // Логика «замораживания», если долго внутри freezeRadius
      if (distance <= freezeRadius) {
        if (dot.freezeStartTime === null) {
          dot.freezeStartTime = now;
        } else {
          const insideTime = now - dot.freezeStartTime;
          if (insideTime >= freezeDelay) {
            // Замораживаем тело
            Matter.Body.setVelocity(dot.physicsBody, { x: 0, y: 0 });
            Matter.Body.setAngularVelocity(dot.physicsBody, 0);
            Matter.Body.setStatic(dot.physicsBody, true);
            dot.frozen = true;
          }
        }
      } else {
        // Если вышла из зоны — сброс таймера
        dot.freezeStartTime = null;
      }
    });

    // Если все заморожены -> фаза 4
    if (allFrozen) {
      explosionPhase = 4;
      phase4StartTime = now;
    }

  // Фаза 4: «наелась» (после сбора)
  } else if (explosionPhase === 4) {
    const phase4Elapsed = now - phase4StartTime;
    if (phase4Elapsed >= phase4Duration) {
      // Убираем все тела и возвращаемся в обычное состояние
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

// ------------------------------------------
// Инициализация контролов
// ------------------------------------------
function initControls() {
  // Нет больше Range, зато есть minParticleSize и maxParticleSize
  const controls = [
    { id: 'amount', variable: 'amountVal', onChange: v => { amount = v; userParams.amount = v; } },
    { id: 'explosionAmount', variable: 'explosionAmountVal', onChange: v => { explosionAmount = v; userParams.explosionAmount = v; } },

    {
      id: 'width', 
      variable: 'widthVal', 
      onChange: v => {
        width = v;
        userParams.width = v; // сохраняем в userParams

        // Если мы не в фазе взрыва, меняем ширину существующих точек на лету
        if (explosionPhase === 0) {
          dots.forEach(dot => {
            dot.element.style.width = v + 'px';
            dot.element.style.height = v + 'px';
          });
        }
      }
    },

    { id: 'speed', variable: 'speedVal', onChange: v => { speed = v; userParams.speed = v; } },
    { id: 'tail', variable: 'tailVal', onChange: v => tail = v },
    { id: 'idleTimeout', variable: 'idleTimeoutVal', onChange: v => idleTimeout = v },
    { id: 'cursorAttraction', variable: 'cursorAttractionVal', onChange: v => cursorAttraction = v },
    { id: 'particleAttraction', variable: 'particleAttractionVal', onChange: v => particleAttraction = v },
    { id: 'explosionIntensity', variable: 'explosionIntensityVal', onChange: v => { explosionIntensity = v; userParams.explosionIntensity = v; } },
    { id: 'phase1Duration', variable: 'phase1DurationVal', onChange: v => phase1Duration = v },
    { id: 'phase2Duration', variable: 'phase2DurationVal', onChange: v => phase2Duration = v },
    { id: 'phase4Duration', variable: 'phase4DurationVal', onChange: v => phase4Duration = v },
    { id: 'assemblyThreshold', variable: 'assemblyThresholdVal', onChange: v => assemblyThreshold = v },
    { id: 'cursorForceMultiplier', variable: 'cursorForceMultiplierVal', onChange: v => cursorForceMultiplier = v },
    { id: 'particleForceMultiplier', variable: 'particleForceMultiplierVal', onChange: v => particleForceMultiplier = v },
    { id: 'frictionAir', variable: 'frictionAirVal', onChange: v => frictionAir = v },

    // Новые ползунки (размер частиц при взрыве)
    { id: 'minParticleSize', variable: 'minParticleSizeVal', onChange: v => minParticleSize = v },
    { id: 'maxParticleSize', variable: 'maxParticleSizeVal', onChange: v => maxParticleSize = v }
  ];

  controls.forEach(control => {
    const slider = document.getElementById(control.id);
    const valueSpan = document.getElementById(control.variable);
    if (slider && valueSpan) {
      slider.addEventListener('input', e => {
        const val = parseFloat(e.target.value);
        control.onChange(val);
        valueSpan.textContent = val;
      });
    }
  });
}

// ------------------------------------------
// Инициализация всей логики
// ------------------------------------------
function init() {
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('touchmove', onTouchMove);
  initControls();
  buildDots();
  requestAnimationFrame(render);
}

init();
