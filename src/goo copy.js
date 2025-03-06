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
let width = 22;  // Ширина курсора в обычном состоянии
let speed = 3;
let tail = 4;
let idleTimeout = 1000;

// Силы притяжения (по умолчанию)
let cursorAttraction = 0.00010;
let particleAttraction = 0.000004;

// Интенсивность взрыва
let explosionIntensity = 4;

// Размеры частиц при взрыве
let minParticleSize = 13;   // минимальный размер (px)
let maxParticleSize = 20;   // максимальный размер (px)

// «Амплитуда дрожания»
let shakeAmplitude = 29;

// Длительности фаз
let phase1Duration = 2000; // тряска (рост)
let phase2Duration = 300;  // собственно «взрыв»
let phase4Duration = 3000; // «наелась» (пауза)

// Порог сборки
let assemblyThreshold = 13; 

// Параметры физики
let cursorForceMultiplier = 700;
let particleForceMultiplier = 800;
let frictionAir = 0.067;

// Дополнительные внутренние настройки
let innerDampingFactor = 1;
let innerDampingRadius = () => assemblyThreshold * 3; 

// ------------------------------------------
// [НОВОЕ] Дополнительные переменные
// ------------------------------------------
// Быстрая отмена взрыва (сокращённое время анимации возврата)
let quickDeflateDuration = 300;  // 0.3с
// Быстрое завершение «сборки» при клике
let fastAssembly = false;        
// Для гибкой регулировки длительности возвращения в фазе 5
let explosionReturnDuration = 600; // по умолчанию 0.6с

// Родительский контейнер
const cursor = document.getElementById('cursor');

// Координаты курсора
let mousePosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let lastMoveTime = performance.now();
let lastFrame = performance.now();

// Плавное приближение «цепочки»
let targetCircleLevel = 1;
let circleLevel = 1;
let dots = [];
let idleCenter = null;

// Фазы взрыва:
// 0 – нет взрыва (обычное состояние),
// 1 – рост/бурление (тряска),
// 2 – взрыв,
// 3 – сбор,
// 4 – «наелась» (скоро завершит),
// 5 – плавный возврат к обычному состоянию
let explosionPhase = 0;
let explosionStartTime = 0;
let phase3StartTime = 0;
let phase4StartTime = 0;

// Храним «базовые» пользовательские значения
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
  buildDots();         // Создаём «взрывные» точки
  targetCircleLevel = 0;
  idleCenter = { x: mousePosition.x, y: mousePosition.y };
}

/**
 * Плавная отмена взрыва, возвращение к обычному состоянию (фаза 5).
 * Частицы за короткое время «собираются» обратно, и уже потом мы чистим физику.
 * @param {number} [customDuration] - Можно передать своё время анимации возврата.
 */
function cancelExplosion(customDuration) {
  // Если уже в обычном состоянии или уже и так в фазе 5, ничего не делаем
  if (explosionPhase === 0 || explosionPhase === 5) return;

  // [НОВОЕ] Задаём время «сдувания» или возвращения
  explosionReturnDuration = (typeof customDuration === 'number') 
    ? customDuration 
    : 600; // по умолчанию 0.6с

  // Переходим в фазу 5
  nextExplosionPhase(5);

  // Сохраняем текущие позиции (они понадобятся для плавной интерполяции)
  dots.forEach(dot => {
    if (dot.physicsBody) {
      dot.startX = dot.physicsBody.position.x;
      dot.startY = dot.physicsBody.position.y;
    } else {
      dot.startX = dot.x;
      dot.startY = dot.y;
    }
    // При взрыве у нас scale=1 для частицы
    dot.startScale = 1;  
  });
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
    this.scale = (totalDots > 1) 
      ? (1 - (index / (totalDots - 1)) * 0.9) 
      : 1;

    this.element = document.createElement('span');

    // Изначальный размер (в обычном режиме)
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

  // Рисование обычной «живой» точки (нет взрыва)
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
      // circleLevel = 1 -> «цепочка»
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
function onMouseMove(event) {
  mousePosition.x = event.clientX;
  mousePosition.y = event.clientY;
  lastMoveTime = performance.now();

  // Если сейчас нет взрыва, идём в обычный режим «цепочки»
  if (explosionPhase === 0) {
    targetCircleLevel = 1;
    idleCenter = null;
    dots.forEach(dot => dot.locked = false);
  } else {
    // [НОВОЕ] Если мы в фазе 1 (тряска) и пользователь пошевелил мышью —
    // быстро, но плавно отменяем взрыв
    if (explosionPhase === 1) {
      cancelExplosion(quickDeflateDuration);
      return;
    }

    // Если взрыв уже идёт (фазы 2–4), центр «чёрной дыры» переносим
    if (explosionPhase >= 1 && explosionPhase <= 4) {
      idleCenter = { x: mousePosition.x, y: mousePosition.y };
    }
    // Если мы в фазе 5 (уже возвращаемся), ничего особенного — идёт плавная сборка
  }
}

function onTouchMove(event) {
  mousePosition.x = event.touches[0].clientX;
  mousePosition.y = event.touches[0].clientY;
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

// [НОВОЕ] Обработка клика левой кнопкой – быстрая «сборка»
// Если фаза 2 (взрыв) — сразу переходим в фазу 3 (сбор).
// Включаем флаг fastAssembly, который резко усиливает притяжение.
function onMouseDown(e) {
  // ЛКМ = button === 0
  if (e.button === 0 && explosionPhase >= 2 && explosionPhase <= 4) {
    // Если еще идёт взрыв (2) — сразу переводим в 3
    if (explosionPhase === 2) {
      nextExplosionPhase(3);
      phase3StartTime = performance.now();
    }
    // Включаем флаг «быстрого сбора»
    fastAssembly = true;
  }
}

/* Основной цикл анимации */
function render(timestamp) {
  const delta = timestamp - lastFrame;
  lastFrame = timestamp;

  // Если нет взрыва (фаза 0) и давно не двигаем мышью – запускаем взрыв
  if (explosionPhase === 0 && timestamp - lastMoveTime > idleTimeout) {
    startExplosion();
  }

  if (explosionPhase === 0) {
    // Обычный режим «цепочки»
    let x = mousePosition.x;
    let y = mousePosition.y;
    dots.forEach((dot, i, arr) => {
      dot.drawIdleActive(x, y);

      // «хвост» из точек
      if (targetCircleLevel === 1) {
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

    // Обновляем позиции span'ов по физ.телам (если они есть)
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

  // Фаза 1: «бурление»
  if (explosionPhase === 1) {
    const elapsed = now - explosionStartTime;
    const t = Math.min(elapsed / phase1Duration, 1);

    // От меньшей к большей «колебательной амплитуде»
    shakeAmplitude = lerp(8, 32, t);
    speed = lerp(1, 10, t);

    dots.forEach(dot => {
      dot.shakeRadius = shakeAmplitude / 2 + 2;
      dot.drawPhase1();
    });

    // Переход в фазу 2 по истечении времени (если не отменили раньше)
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

      // Создаём физ.тела для взрыва
      dots.forEach(dot => {
        // Случайный размер частицы
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

  // Фаза 2: взрыв (разброс)
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
    let allFrozen = true;

    dots.forEach(dot => {
      if (!dot.physicsBody) return;
      if (dot.frozen) return; // уже «прилипла»

      allFrozen = false;
      const pos = dot.physicsBody.position;
      const dx = idleCenter.x - pos.x;
      const dy = idleCenter.y - pos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // [НОВОЕ] Если включён fastAssembly, притягиваем сильнее и убираем задержку freezeDelay
      const freezeDelay = fastAssembly ? 0 : 20000; 
      const freezeRadius = assemblyThreshold * 3;

      // Притягиваем к центру
      if (distance > innerDampingRadius()) {
        // Если fastAssembly = true, увеличиваем силу
        const extraBoost = fastAssembly ? 50 : 1; 
        const epsilonCursor = 5;
        const forceMagnitude = ((cursorAttraction * extraBoost) / (distance*distance + epsilonCursor*epsilonCursor)) 
                                 * cursorForceMultiplier;

        Matter.Body.applyForce(dot.physicsBody, pos, { 
          x: dx * forceMagnitude, 
          y: dy * forceMagnitude 
        });
      } else {
        // Очень близко — сильно гасим скорость
        const vx = dot.physicsBody.velocity.x;
        const vy = dot.physicsBody.velocity.y;
        Matter.Body.setVelocity(dot.physicsBody, {
          x: vx * innerDampingFactor,
          y: vy * innerDampingFactor
        });
      }

      // Логика «замораживания» (если долго внутри freezeRadius)
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

    // Если все частицы заморожены -> фаза 4
    if (allFrozen) {
      explosionPhase = 4;
      phase4StartTime = now;
    }

  // Фаза 4: «наелась» (пауза, затем конец)
  } else if (explosionPhase === 4) {
    const phase4Elapsed = now - phase4StartTime;
    if (phase4Elapsed >= phase4Duration) {
      // Плавно завершаем взрыв (по умолчанию - сразу в обычное состояние)
      cancelExplosion(); 
    }

  // Фаза 5: плавное возвращение к обычному состоянию
  } else if (explosionPhase === 5) {
    const elapsed = now - explosionStartTime;
    const t = Math.min(elapsed / explosionReturnDuration, 1);

    // Сводим все частицы к позиции курсора (или где он был при cancelExplosion)
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
      // Всё, вернулись в обычное состояние
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

      // Восстанавливаем пользов. параметры
      amount = userParams.amount;
      speed = userParams.speed;
      width = userParams.width;
      explosionAmount = userParams.explosionAmount;

      // Снова создаём «цепочечные» точки заново
      buildDots();

      // Сброс флагов
      explosionPhase = 0;
      targetCircleLevel = 1; 
      idleCenter = null;
      fastAssembly = false; // [НОВОЕ] сбрасываем флаг быстрого сбора
    }
  }
}

// ------------------------------------------
// Инициализация контролов (ползунков)
// ------------------------------------------
function initControls() {
  const controls = [
    { id: 'amount', variable: 'amountVal', onChange: v => { amount = v; userParams.amount = v; } },
    { id: 'explosionAmount', variable: 'explosionAmountVal', onChange: v => { explosionAmount = v; userParams.explosionAmount = v; } },
    {
      id: 'width',
      variable: 'widthVal',
      onChange: v => {
        width = v;
        userParams.width = v;
        if (explosionPhase === 0) {
          // Меняем ширину существующих точек на лету
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
  // [НОВОЕ] обработчик клика
  window.addEventListener('mousedown', onMouseDown);

  initControls();
  buildDots();
  requestAnimationFrame(render);
}

init();
