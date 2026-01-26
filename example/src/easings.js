import { float, sin, cos, pow, sqrt, PI } from 'three/tsl';

// ============== LINEAR ==============
export const easeLinear = (t) => t;

// ============== POWER 1 ==============
export const easeInPower1 = (t) => t;
export const easeOutPower1 = (t) => float(1).sub(float(1).sub(t));
export const easeInOutPower1 = (t) => t;

// ============== POWER 2 ==============
export const easeInPower2 = (t) => t.mul(t);
export const easeOutPower2 = (t) => float(1).sub(pow(float(1).sub(t), 2));
export const easeInOutPower2 = (t) =>
  t
    .lessThan(0.5)
    .select(
      float(2).mul(t).mul(t),
      float(1).sub(pow(float(-2).mul(t).add(2), 2).div(2))
    );

// ============== POWER 3 ==============
export const easeInPower3 = (t) => t.mul(t).mul(t);
export const easeOutPower3 = (t) => float(1).sub(pow(float(1).sub(t), 3));
export const easeInOutPower3 = (t) =>
  t
    .lessThan(0.5)
    .select(
      float(4).mul(t).mul(t).mul(t),
      float(1).sub(pow(float(-2).mul(t).add(2), 3).div(2))
    );

// ============== POWER 4 ==============
export const easeInPower4 = (t) => t.mul(t).mul(t).mul(t);
export const easeOutPower4 = (t) => float(1).sub(pow(float(1).sub(t), 4));
export const easeInOutPower4 = (t) =>
  t
    .lessThan(0.5)
    .select(
      float(8).mul(t).mul(t).mul(t).mul(t),
      float(1).sub(pow(float(-2).mul(t).add(2), 4).div(2))
    );

// ============== QUAD ==============
export const easeInQuad = (t) => t.mul(t);
export const easeOutQuad = (t) => t.mul(float(2).sub(t));
export const easeInOutQuad = (t) =>
  t
    .lessThan(0.5)
    .select(
      float(2).mul(t).mul(t),
      float(-1).add(float(4).sub(float(2).mul(t)).mul(t))
    );

// ============== CUBIC ==============
export const easeInCubic = (t) => t.mul(t).mul(t);
export const easeOutCubic = (t) => {
  const t1 = t.sub(1);
  return float(1).add(t1.mul(t1).mul(t1));
};
export const easeInOutCubic = (t) => {
  const t1 = t.sub(1);
  const t2 = float(2).mul(t).sub(2);
  return t
    .lessThan(0.5)
    .select(float(4).mul(t).mul(t).mul(t), t1.mul(t2).mul(t2).add(1));
};

// ============== QUART ==============
export const easeInQuart = (t) => t.mul(t).mul(t).mul(t);
export const easeOutQuart = (t) => {
  const t1 = t.sub(1);
  return float(1).sub(t1.mul(t1).mul(t1).mul(t1));
};
export const easeInOutQuart = (t) => {
  const t1 = t.sub(1);
  return t
    .lessThan(0.5)
    .select(
      float(8).mul(t).mul(t).mul(t).mul(t),
      float(1).sub(float(8).mul(t1).mul(t1).mul(t1).mul(t1))
    );
};

// ============== QUINT ==============
export const easeInQuint = (t) => t.mul(t).mul(t).mul(t).mul(t);
export const easeOutQuint = (t) => {
  const t1 = t.sub(1);
  return float(1).add(t1.mul(t1).mul(t1).mul(t1).mul(t1));
};
export const easeInOutQuint = (t) => {
  const t1 = t.sub(1);
  return t
    .lessThan(0.5)
    .select(
      float(16).mul(t).mul(t).mul(t).mul(t).mul(t),
      float(1).add(float(16).mul(t1).mul(t1).mul(t1).mul(t1).mul(t1))
    );
};

// ============== SINE ==============
export const easeInSine = (t) => float(1).sub(cos(t.mul(PI).mul(0.5)));
export const easeOutSine = (t) => sin(t.mul(PI).mul(0.5));
export const easeInOutSine = (t) => float(-0.5).mul(cos(PI.mul(t)).sub(1));

// ============== EXPO ==============
export const easeInExpo = (t) =>
  t.equal(0).select(float(0), pow(2, float(10).mul(t.sub(1))));
export const easeOutExpo = (t) =>
  t.equal(1).select(float(1), float(1).sub(pow(2, float(-10).mul(t))));
export const easeInOutExpo = (t) =>
  t
    .lessThan(0.5)
    .select(
      float(0.5).mul(pow(2, float(20).mul(t).sub(10))),
      float(0.5).mul(float(2).sub(pow(2, float(-20).mul(t).add(10))))
    );

// ============== CIRC ==============
export const easeInCirc = (t) => float(1).sub(sqrt(float(1).sub(t.mul(t))));
export const easeOutCirc = (t) => {
  const t1 = t.sub(1);
  return sqrt(float(1).sub(t1.mul(t1)));
};
export const easeInOutCirc = (t) => {
  const t1 = float(2).mul(t);
  const t2 = t1.sub(2);
  return t
    .lessThan(0.5)
    .select(
      float(-0.5).mul(sqrt(float(1).sub(t1.mul(t1))).sub(1)),
      float(0.5).mul(sqrt(float(1).sub(t2.mul(t2))).add(1))
    );
};

// ============== ELASTIC ==============
export const easeInElastic = (t) => {
  const period = float(0.3);
  return float(-1)
    .mul(pow(2, float(10).mul(t.sub(1))))
    .mul(sin(t.sub(1.075).mul(float(2).mul(PI)).div(period)));
};
export const easeOutElastic = (t) => {
  const period = float(0.3);
  return pow(2, float(-10).mul(t))
    .mul(sin(t.sub(0.075).mul(float(2).mul(PI)).div(period)))
    .add(1);
};
export const easeInOutElastic = (t) => {
  const period = float(4.5);
  return t.lessThan(0.5).select(
    float(-0.5)
      .mul(pow(2, float(20).mul(t).sub(10)))
      .mul(sin(float(20).mul(t).sub(11.125).mul(float(2).mul(PI)).div(period))),
    pow(2, float(-20).mul(t).add(10))
      .mul(sin(float(20).mul(t).sub(11.125).mul(float(2).mul(PI)).div(period)))
      .mul(0.5)
      .add(1)
  );
};

// ============== BACK ==============
export const easeInBack = (t) => {
  const s = float(1.70158);
  return t.mul(t).mul(s.add(1).mul(t).sub(s));
};
export const easeOutBack = (t) => {
  const s = float(1.70158);
  const t1 = t.sub(1);
  return t1.mul(t1).mul(s.add(1).mul(t1).add(s)).add(1);
};
export const easeInOutBack = (t) => {
  const s = float(1.70158 * 1.525);
  const t2 = t.mul(2);
  const t2minus2 = t2.sub(2);
  return t
    .lessThan(0.5)
    .select(
      float(0.5).mul(t2.mul(t2).mul(s.add(1).mul(t2).sub(s))),
      float(0.5).mul(
        t2minus2.mul(t2minus2).mul(s.add(1).mul(t2minus2).add(s)).add(2)
      )
    );
};

// ============== BOUNCE ==============
export const easeOutBounce = (t) => {
  const n1 = float(7.5625);
  const d1 = float(2.75);

  return t.lessThan(float(1).div(d1)).select(
    n1.mul(t).mul(t),
    t.lessThan(float(2).div(d1)).select(
      n1
        .mul(t.sub(float(1.5).div(d1)))
        .mul(t.sub(float(1.5).div(d1)))
        .add(0.75),
      t.lessThan(float(2.5).div(d1)).select(
        n1
          .mul(t.sub(float(2.25).div(d1)))
          .mul(t.sub(float(2.25).div(d1)))
          .add(0.9375),
        n1
          .mul(t.sub(float(2.625).div(d1)))
          .mul(t.sub(float(2.625).div(d1)))
          .add(0.984375)
      )
    )
  );
};

export const easeInBounce = (t) => float(1).sub(easeOutBounce(float(1).sub(t)));

export const easeInOutBounce = (t) =>
  t.lessThan(0.5).select(
    float(1)
      .sub(easeOutBounce(float(1).sub(float(2).mul(t))))
      .mul(0.5),
    float(1)
      .add(easeOutBounce(float(2).mul(t).sub(1)))
      .mul(0.5)
  );

// ============== EASING ENUM ==============
export const Easing = Object.freeze({
  LINEAR: 'linear',
  IN_QUAD: 'inQuad',
  OUT_QUAD: 'outQuad',
  IN_OUT_QUAD: 'inOutQuad',
  IN_CUBIC: 'inCubic',
  OUT_CUBIC: 'outCubic',
  IN_OUT_CUBIC: 'inOutCubic',
  IN_QUART: 'inQuart',
  OUT_QUART: 'outQuart',
  IN_OUT_QUART: 'inOutQuart',
  IN_QUINT: 'inQuint',
  OUT_QUINT: 'outQuint',
  IN_OUT_QUINT: 'inOutQuint',
  IN_SINE: 'inSine',
  OUT_SINE: 'outSine',
  IN_OUT_SINE: 'inOutSine',
  IN_EXPO: 'inExpo',
  OUT_EXPO: 'outExpo',
  IN_OUT_EXPO: 'inOutExpo',
  IN_CIRC: 'inCirc',
  OUT_CIRC: 'outCirc',
  IN_OUT_CIRC: 'inOutCirc',
  IN_ELASTIC: 'inElastic',
  OUT_ELASTIC: 'outElastic',
  IN_OUT_ELASTIC: 'inOutElastic',
  IN_BACK: 'inBack',
  OUT_BACK: 'outBack',
  IN_OUT_BACK: 'inOutBack',
  IN_BOUNCE: 'inBounce',
  OUT_BOUNCE: 'outBounce',
  IN_OUT_BOUNCE: 'inOutBounce',
});

// Helper to get easing function by name
export const getEasing = (name) => {
  const easings = {
    linear: easeLinear,
    inQuad: easeInQuad,
    outQuad: easeOutQuad,
    inOutQuad: easeInOutQuad,
    inCubic: easeInCubic,
    outCubic: easeOutCubic,
    inOutCubic: easeInOutCubic,
    inQuart: easeInQuart,
    outQuart: easeOutQuart,
    inOutQuart: easeInOutQuart,
    inQuint: easeInQuint,
    outQuint: easeOutQuint,
    inOutQuint: easeInOutQuint,
    inSine: easeInSine,
    outSine: easeOutSine,
    inOutSine: easeInOutSine,
    inExpo: easeInExpo,
    outExpo: easeOutExpo,
    inOutExpo: easeInOutExpo,
    inCirc: easeInCirc,
    outCirc: easeOutCirc,
    inOutCirc: easeInOutCirc,
    inElastic: easeInElastic,
    outElastic: easeOutElastic,
    inOutElastic: easeInOutElastic,
    inBack: easeInBack,
    outBack: easeOutBack,
    inOutBack: easeInOutBack,
    inBounce: easeInBounce,
    outBounce: easeOutBounce,
    inOutBounce: easeInOutBounce,
    inPower2: easeInPower2,
    outPower2: easeOutPower2,
    inOutPower2: easeInOutPower2,
    inPower3: easeInPower3,
    outPower3: easeOutPower3,
    inOutPower3: easeInOutPower3,
    inPower4: easeInPower4,
    outPower4: easeOutPower4,
    inOutPower4: easeInOutPower4,
  };
  return easings[name] || easeLinear;
};
