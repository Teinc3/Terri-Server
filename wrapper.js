const strings = new (require('./strings'))()

class Wrapper {
    constructor() {
        this.index = 0;
    }

    setBits(array, bitCount, data) {
        for (let byteIndex, bitIndex, currentBit = this.index; currentBit < this.index + bitCount; currentBit++) {
            byteIndex = Math.floor(currentBit / 8);
            bitIndex = 7 - currentBit % 8;
            array[byteIndex] |= (data >> bitCount - (currentBit - this.index + 1) & 1) << bitIndex;
        }
        this.index += bitCount
    }

    getByteCount(bitCount) {
        return Math.floor(bitCount / 8) + (bitCount % 8 > 0 ? 1 : 0)
    }

    wrapLeaderboard(id, position, entries) {
        const arrayBitCount = entries.reduce((acc, entry) => {
            return acc + strings.convertToCharcode(entry.NAME).length + 14 + 5
        }, 1 + 2 + 1 + 1 + 16 + 4)
        const array = new Uint8Array(this.getByteCount(arrayBitCount));
        this.index = 0;
        this.setBits(array, 1, 0);
        this.setBits(array, 2, 0);
        this.setBits(array, 1, 1);
        this.setBits(array, 1, id);
        this.setBits(array, 16, position);
        this.setBits(array, 4, entries.length);
        for (const entry of entries) {
            this.setBits(array, 14, entry.ELO);
            const name = strings.convertToCharcode(entry.NAME);
            const length = name.length
            this.setBits(array, 5, length);
            this.setBits(array, length, name);
        }
        return array
    }
}

module.exports = Wrapper