const { LogarithmicMapping } = require('./logarithmic-mapping');
const { UnboundedSizeDenseStore } = require('./unbounded-size-dense-store');

class DDSketch {
  constructor(config = {}) {
    if (typeof config === 'number') {
      config = { relativeAccuracy: config };
    } else if (config instanceof LogarithmicMapping) {
      config = { indexMapping: config };
    }

    const {
      relativeAccuracy = 0.01,
      indexMapping = new LogarithmicMapping(relativeAccuracy),
      storeFactory = () => new UnboundedSizeDenseStore(),
      negativeStoreFactory,
      positiveStoreFactory,
      negativeStore,
      positiveStore,
      zeroCount = 0,
      minIndexedValue = 0,
    } = config;

    if (typeof zeroCount !== 'number' || !Number.isFinite(zeroCount)) {
      throw new TypeError('zeroCount must be a finite number');
    }
    if (zeroCount < 0) {
      throw new RangeError('The zero bucket count cannot be negative.');
    }

    this.indexMapping = indexMapping;
    this.minIndexedValue = Math.max(minIndexedValue, indexMapping.minIndexableValue());
    this.maxIndexedValue = indexMapping.maxIndexableValue();

    const negativeFactory = negativeStoreFactory || storeFactory;
    const positiveFactory = positiveStoreFactory || storeFactory;

    this.negativeValueStore = negativeStore || negativeFactory();
    this.positiveValueStore = positiveStore || positiveFactory();
    this.zeroCount = zeroCount;
  }

  accept(value, count = 1) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError('value must be a finite number.');
    }
    if (typeof count !== 'number' || !Number.isFinite(count)) {
      throw new TypeError('count must be a finite number.');
    }
    if (count < 0) {
      throw new RangeError('The count cannot be negative.');
    }
    if (count === 0) {
      return;
    }

    this.#checkValueTrackable(value);

    if (value > this.minIndexedValue) {
      const index = this.indexMapping.index(value);
      this.positiveValueStore.add(index, count);
    } else if (value < -this.minIndexedValue) {
      const index = this.indexMapping.index(-value);
      this.negativeValueStore.add(index, count);
    } else {
      this.zeroCount += count;
    }
  }

  mergeWith(other) {
    if (!(other instanceof DDSketch)) {
      throw new TypeError('Can only merge another DDSketch instance.');
    }
    if (!this.indexMapping.isEquivalentTo(other.indexMapping)) {
      throw new Error('Sketches are not mergeable because their index mappings differ.');
    }
    this.negativeValueStore.mergeWith(other.negativeValueStore);
    this.positiveValueStore.mergeWith(other.positiveValueStore);
    this.zeroCount += other.zeroCount;
  }

  copy() {
    return new DDSketch({
      indexMapping: this.indexMapping,
      negativeStore: this.negativeValueStore.copy(),
      positiveStore: this.positiveValueStore.copy(),
      zeroCount: this.zeroCount,
      minIndexedValue: this.minIndexedValue,
    });
  }

  clear() {
    this.negativeValueStore.clear();
    this.positiveValueStore.clear();
    this.zeroCount = 0;
  }

  isEmpty() {
    return (
      this.zeroCount === 0 &&
      this.negativeValueStore.isEmpty() &&
      this.positiveValueStore.isEmpty()
    );
  }

  getCount() {
    return (
      this.zeroCount +
      this.negativeValueStore.getTotalCount() +
      this.positiveValueStore.getTotalCount()
    );
  }

  getSum() {
    let sum = 0;
    this.negativeValueStore.forEach((index, count) => {
      sum -= this.indexMapping.value(index) * count;
    });
    this.positiveValueStore.forEach((index, count) => {
      sum += this.indexMapping.value(index) * count;
    });
    return sum;
  }

  getAverage() {
    const totalCount = this.getCount();
    if (totalCount === 0) {
      throw new Error('Sketch is empty');
    }
    return this.getSum() / totalCount;
  }

  getMinValue() {
    if (!this.negativeValueStore.isEmpty()) {
      return -this.indexMapping.value(this.negativeValueStore.getMaxIndex());
    }
    if (this.zeroCount > 0) {
      return 0;
    }
    if (!this.positiveValueStore.isEmpty()) {
      return this.indexMapping.value(this.positiveValueStore.getMinIndex());
    }
    throw new Error('Sketch is empty');
  }

  getMaxValue() {
    if (!this.positiveValueStore.isEmpty()) {
      return this.indexMapping.value(this.positiveValueStore.getMaxIndex());
    }
    if (this.zeroCount > 0) {
      return 0;
    }
    if (!this.negativeValueStore.isEmpty()) {
      return -this.indexMapping.value(this.negativeValueStore.getMinIndex());
    }
    throw new Error('Sketch is empty');
  }

  getValueAtQuantile(quantile) {
    if (typeof quantile !== 'number' || !Number.isFinite(quantile)) {
      throw new TypeError('Quantile must be a finite number.');
    }
    if (quantile < 0 || quantile > 1) {
      throw new RangeError('The quantile must be between 0 and 1.');
    }

    const totalCount = this.getCount();
    if (totalCount === 0) {
      throw new Error('Sketch is empty');
    }

    const rank = quantile * (totalCount - 1);
    let runningCount = 0;

    for (const bin of this.negativeValueStore.getDescendingIterator()) {
      runningCount += bin.count;
      if (runningCount > rank) {
        return -this.indexMapping.value(bin.index);
      }
    }

    runningCount += this.zeroCount;
    if (runningCount > rank) {
      return 0;
    }

    for (const bin of this.positiveValueStore.getAscendingIterator()) {
      runningCount += bin.count;
      if (runningCount > rank) {
        return this.indexMapping.value(bin.index);
      }
    }

    throw new Error('Quantile was not found');
  }

  getValuesAtQuantiles(quantiles) {
    if (!Array.isArray(quantiles)) {
      throw new TypeError('quantiles must be an array');
    }
    const totalCount = this.getCount();
    if (totalCount === 0) {
      throw new Error('Sketch is empty');
    }
    return quantiles.map((q) => this.getValueAtQuantile(q));
  }

  #checkValueTrackable(value) {
    if (value < -this.maxIndexedValue || value > this.maxIndexedValue) {
      throw new RangeError('The input value is outside the range tracked by the sketch.');
    }
  }
}

module.exports = { DDSketch };
