class UnboundedSizeDenseStore {
  constructor() {
    this._counts = new Map();
  }

  add(index, count = 1) {
    if (!Number.isInteger(index)) {
      throw new TypeError('index must be an integer');
    }
    if (typeof count !== 'number' || !Number.isFinite(count)) {
      throw new TypeError('count must be a finite number');
    }
    if (count < 0) {
      throw new RangeError('count cannot be negative');
    }
    if (count === 0) {
      return;
    }
    const next = (this._counts.get(index) || 0) + count;
    this._counts.set(index, next);
  }

  mergeWith(store) {
    if (!store) {
      throw new TypeError('store is required');
    }
    if (store === this) {
      return;
    }
    if (typeof store.forEach !== 'function') {
      throw new TypeError('store must expose a forEach method');
    }
    store.forEach((index, count) => this.add(index, count));
  }

  copy() {
    const clone = new UnboundedSizeDenseStore();
    for (const [index, count] of this._counts.entries()) {
      clone._counts.set(index, count);
    }
    return clone;
  }

  clear() {
    this._counts.clear();
  }

  isEmpty() {
    return this._counts.size === 0;
  }

  getTotalCount() {
    let sum = 0;
    for (const count of this._counts.values()) {
      sum += count;
    }
    return sum;
  }

  forEach(callback) {
    for (const [index, count] of this._counts.entries()) {
      if (count > 0) {
        callback(index, count);
      }
    }
  }

  getMinIndex() {
    if (this.isEmpty()) {
      throw new Error('Store is empty');
    }
    let minIndex = Infinity;
    for (const index of this._counts.keys()) {
      if (index < minIndex) {
        minIndex = index;
      }
    }
    return minIndex;
  }

  getMaxIndex() {
    if (this.isEmpty()) {
      throw new Error('Store is empty');
    }
    let maxIndex = -Infinity;
    for (const index of this._counts.keys()) {
      if (index > maxIndex) {
        maxIndex = index;
      }
    }
    return maxIndex;
  }

  *getAscendingIterator() {
    const indices = this.#sortedIndices();
    for (const index of indices) {
      yield { index, count: this._counts.get(index) };
    }
  }

  *getDescendingIterator() {
    const indices = this.#sortedIndices();
    for (let i = indices.length - 1; i >= 0; i -= 1) {
      yield { index: indices[i], count: this._counts.get(indices[i]) };
    }
  }

  #sortedIndices() {
    return Array.from(this._counts.keys()).sort((a, b) => a - b);
  }
}

module.exports = { UnboundedSizeDenseStore };
