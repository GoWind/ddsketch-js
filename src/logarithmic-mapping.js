const INT_MIN = -2147483648;
const INT_MAX = 2147483647;
const EPSILON = 1e-12;

class LogarithmicMapping {
  constructor(relativeAccuracy, indexOffset = 0) {
    if (typeof relativeAccuracy !== 'number' || !Number.isFinite(relativeAccuracy)) {
      throw new TypeError('relativeAccuracy must be a finite number.');
    }
    if (relativeAccuracy <= 0 || relativeAccuracy >= 1) {
      throw new RangeError('relativeAccuracy must be between 0 and 1 (exclusive).');
    }
    this._relativeAccuracy = relativeAccuracy;
    this.indexOffset = indexOffset;
    this.gamma = (1 + relativeAccuracy) / (1 - relativeAccuracy);
    this.multiplier = 1 / Math.log(this.gamma);
    this._minIndexableValue = this.#computeMinIndexableValue();
    this._maxIndexableValue = this.#computeMaxIndexableValue();
  }

  relativeAccuracy() {
    return this._relativeAccuracy;
  }

  minIndexableValue() {
    return this._minIndexableValue;
  }

  maxIndexableValue() {
    return this._maxIndexableValue;
  }

  index(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError('value must be a finite number.');
    }
    if (value <= 0) {
      throw new RangeError('LogarithmicMapping only indexes strictly positive values.');
    }
    const index = Math.log(value) * this.multiplier + this.indexOffset;
    return Math.floor(index);
  }

  value(index) {
    return this.lowerBound(index) * (1 + this._relativeAccuracy);
  }

  lowerBound(index) {
    return Math.exp((index - this.indexOffset) / this.multiplier);
  }

  upperBound(index) {
    return this.lowerBound(index + 1);
  }

  isEquivalentTo(other) {
    if (!other) {
      return false;
    }
    if (other === this) {
      return true;
    }
    if (!(other instanceof LogarithmicMapping)) {
      return false;
    }
    return (
      Math.abs(other.gamma - this.gamma) <= EPSILON &&
      Math.abs(other.indexOffset - this.indexOffset) <= EPSILON
    );
  }

  #computeMinIndexableValue() {
    const boundFromIndices = Math.exp((INT_MIN - this.indexOffset) / this.multiplier + 1);
    const minNormal = Number.MIN_VALUE * (1 + this._relativeAccuracy) / (1 - this._relativeAccuracy);
    return Math.max(boundFromIndices, minNormal);
  }

  #computeMaxIndexableValue() {
    const boundFromIndices = Math.exp((INT_MAX - this.indexOffset) / this.multiplier - 1);
    const maxNormal = Number.MAX_VALUE / (1 + this._relativeAccuracy);
    return Math.min(boundFromIndices, maxNormal);
  }
}

module.exports = { LogarithmicMapping };
