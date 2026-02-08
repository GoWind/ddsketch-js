const test = require('node:test');
const assert = require('node:assert/strict');

const { DDSketch, LogarithmicMapping } = require('../src');

const RELATIVE_ACCURACY = 0.01;
const EPSILON = 1e-9;

function newSketch(options = {}) {
  return new DDSketch({ relativeAccuracy: RELATIVE_ACCURACY, ...options });
}

function addIndividually(sketch, values) {
  values.forEach((value) => sketch.accept(value));
}

function addWithCounts(sketch, values) {
  const counts = new Map();
  values.forEach((value) => {
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  counts.forEach((count, value) => sketch.accept(value, count));
}

function assertClose(expected, actual, tolerance = EPSILON) {
  if (!Number.isFinite(expected)) {
    throw new Error('Expected value must be finite for comparison.');
  }
  if (expected === 0) {
    assert.ok(Math.abs(actual) <= tolerance, `${actual} not close to 0`);
  } else {
    assert.ok(
      Math.abs(actual - expected) <= Math.abs(expected) * RELATIVE_ACCURACY + tolerance,
      `${actual} not within relative tolerance of ${expected}`
    );
  }
}

function assertAccurateBounds(minExpected, maxExpected, actual) {
  const lower =
      minExpected > 0
        ? minExpected * (1 - RELATIVE_ACCURACY)
        : minExpected * (1 + RELATIVE_ACCURACY);
  const upper =
      maxExpected > 0
        ? maxExpected * (1 + RELATIVE_ACCURACY)
        : maxExpected * (1 - RELATIVE_ACCURACY);
  assert.ok(
    actual >= lower - EPSILON && actual <= upper + EPSILON,
    `Value ${actual} out of relaxed range [${lower}, ${upper}]`
  );
}

function assertQuantileAccurate(sortedValues, quantile, actual) {
  if (sortedValues.length === 0) {
    return;
  }
  const position = quantile * (sortedValues.length - 1);
  const lower = sortedValues[Math.floor(position)];
  const upper = sortedValues[Math.ceil(position)];
  assertAccurateBounds(lower, upper, actual);
}

function assertSketchMatchesValues(sketch, values) {
  assert.strictEqual(sketch.getCount(), values.length);
  if (values.length === 0) {
    assert.ok(sketch.isEmpty());
    assert.strictEqual(sketch.getSum(), 0);
    assert.throws(() => sketch.getAverage(), /empty/i);
    assert.throws(() => sketch.getMinValue(), /empty/i);
    assert.throws(() => sketch.getMaxValue(), /empty/i);
    assert.throws(() => sketch.getValueAtQuantile(0.5), /empty/i);
    assert.throws(() => sketch.getValuesAtQuantiles([0.5]), /empty/i);
    return;
  }

  assert.ok(!sketch.isEmpty());
  const sortedValues = values.slice().sort((a, b) => a - b);

  const minValue = sketch.getMinValue();
  const maxValue = sketch.getMaxValue();
  assertAccurateBounds(sortedValues[0], sortedValues[0], minValue);
  assertAccurateBounds(sortedValues[sortedValues.length - 1], sortedValues[sortedValues.length - 1], maxValue);

  const quantiles = Array.from({ length: 21 }, (_, i) => i / 20);
  quantiles.forEach((quantile) => {
    const approx = sketch.getValueAtQuantile(quantile);
    assertQuantileAccurate(sortedValues, quantile, approx);
    assert.ok(approx >= minValue - EPSILON);
    assert.ok(approx <= maxValue + EPSILON);
    const batch = sketch.getValuesAtQuantiles([quantile]);
    assert.strictEqual(batch.length, 1);
    assert.ok(Math.abs(batch[0] - approx) <= EPSILON);
  });

  const multi = sketch.getValuesAtQuantiles([0, 0.25, 0.5, 0.75, 1]);
  assert.strictEqual(multi.length, 5);
  multi.forEach((value, index) => {
    assertQuantileAccurate(sortedValues, index * 0.25, value);
  });

  const min = sortedValues[0];
  const max = sortedValues[sortedValues.length - 1];
  const sum = sketch.getSum();
  const expectedSum = values.reduce((acc, value) => acc + value, 0);
  const average = sketch.getAverage();
  if (min >= 0 || max <= 0) {
    assertClose(expectedSum, sum);
    assertClose(expectedSum / values.length, average);
  } else {
    assert.ok(Number.isFinite(sum));
    assert.ok(Number.isFinite(average));
  }
}

const deterministicSequences = [
  [],
  [0],
  [1],
  [1, 1, 1, 1],
  [-1, -1, -1],
  [-1, -1, -1, 1, 1, 1],
  Array.from({ length: 500 }, (_, i) => i),
  Array.from({ length: 500 }, (_, i) => 500 - i),
  Array.from({ length: 500 }, (_, i) => i - 250),
  Array.from({ length: 1000 }, (_, i) => (i % 2 === 0 ? 2 : -2)),
  Array.from({ length: 200 }, (_, i) => Math.exp(i / 25)),
  Array.from({ length: 200 }, (_, i) => -Math.exp(i / 25)),
  Array.from({ length: 200 }, (_, i) => (i % 10 === 0 ? 0 : i / 10)),
];

test('DDSketch matches deterministic sequences', () => {
  deterministicSequences.forEach((values) => {
    const sketch = newSketch();
    addIndividually(sketch, values);
    assertSketchMatchesValues(sketch, values);

    const sketchWithCounts = newSketch();
    addWithCounts(sketchWithCounts, values);
    assertSketchMatchesValues(sketchWithCounts, values);
  });
});

function flatten(arrays) {
  return arrays.reduce((all, current) => all.concat(current), []);
}

test('Merging sketches preserves accuracy', () => {
  const segments = [
    Array.from({ length: 100 }, (_, i) => i * 0.25),
    Array.from({ length: 50 }, (_, i) => -i * 0.5),
    [-1000, 0, 1000, 1001],
  ];
  const sketch = newSketch();
  segments.forEach((segment) => {
    const partial = newSketch();
    addIndividually(partial, segment);
    sketch.mergeWith(partial);
  });
  assertSketchMatchesValues(sketch, flatten(segments));

  const sketchCounts = newSketch();
  segments.forEach((segment) => {
    const partial = newSketch();
    addWithCounts(partial, segment);
    sketchCounts.mergeWith(partial);
  });
  assertSketchMatchesValues(sketchCounts, flatten(segments));
});

test('Copy provides an independent snapshot', () => {
  const values = [1, 2, 3, 4, 5];
  const sketch = newSketch();
  addIndividually(sketch, values);
  const copy = sketch.copy();
  assertSketchMatchesValues(copy, values);

  sketch.accept(10);
  assertSketchMatchesValues(copy, values);
  assertSketchMatchesValues(sketch, values.concat(10));
});

test('clear resets the sketch', () => {
  const sketch = newSketch();
  addIndividually(sketch, [1, 2, 3]);
  assert.strictEqual(sketch.isEmpty(), false);
  sketch.clear();
  assert.ok(sketch.isEmpty());
  assert.strictEqual(sketch.getCount(), 0);
  assert.strictEqual(sketch.getSum(), 0);
  assert.throws(() => sketch.getAverage(), /empty/i);
});

test('throws on invalid quantiles or counts', () => {
  const sketch = newSketch();
  addIndividually(sketch, [0]);
  assert.throws(() => sketch.accept(1, -1), /negative/);
  assert.throws(() => sketch.getValueAtQuantile(-0.1), /between 0 and 1/);
  assert.throws(() => sketch.getValueAtQuantile(1.1), /between 0 and 1/);
  assert.throws(() => sketch.getValuesAtQuantiles('foo'), /array/);
  assert.throws(() => sketch.getValuesAtQuantiles([-0.1]), /between 0 and 1/);
});

test('errors bubble up on empty sketch', () => {
  const sketch = newSketch();
  assert.throws(() => sketch.getValueAtQuantile(0.5), /empty/i);
  assert.throws(() => sketch.getValuesAtQuantiles([0.5]), /empty/i);
  assert.throws(() => sketch.getAverage(), /empty/i);
});

test('merge requires matching mappings', () => {
  const sketch = newSketch();
  const other = new DDSketch({ relativeAccuracy: 0.02 });
  assert.throws(() => sketch.mergeWith(other), /mappings differ/);
  assert.throws(() => sketch.mergeWith(null), /DDSketch/);
});

test('min indexed value routes samples to the zero bucket', () => {
  const sketch = newSketch({ minIndexedValue: 1 });
  const values = [-5, -0.5, 0, 0.25, 2, 10];
  addIndividually(sketch, values);
  assert.strictEqual(sketch.getCount(), values.length);
  assert.strictEqual(sketch.getValueAtQuantile(0.4), 0);
  assert.strictEqual(sketch.getValueAtQuantile(0.5), 0);
  assert.ok(sketch.getMinValue() <= 0);
  assert.ok(sketch.getMaxValue() >= 0);
});

test('respect trackable value range', () => {
  class TinyRangeMapping extends LogarithmicMapping {
    maxIndexableValue() {
      return 10;
    }
  }
  const mapping = new TinyRangeMapping(RELATIVE_ACCURACY);
  const sketch = new DDSketch({ indexMapping: mapping });
  assert.throws(() => sketch.accept(11), /outside the range/);
  assert.throws(() => sketch.accept(-11), /outside the range/);
});

test('accept supports weighted additions', () => {
  const sketch = newSketch();
  sketch.accept(5, 3);
  sketch.accept(-5, 2);
  assert.strictEqual(sketch.getCount(), 5);
  assertSketchMatchesValues(sketch, [5, 5, 5, -5, -5]);
});
