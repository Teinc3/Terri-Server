const strings = new (require('./strings.js'))()

class Unwrapper {
    constructor() {
        this.index = 0;
    }

    readBits(array, bitsToDecode) {
        let data = 0;
        for (let bitIndex, byteIndex, currentBit = this.index; currentBit < this.index + bitsToDecode; currentBit++) {
            byteIndex = Math.floor(currentBit/8);
            bitIndex = 7 - currentBit % 8;
            data |= (array[byteIndex] >> bitIndex & 1) << this.index + bitsToDecode - currentBit - 1;
        }
        this.index += bitsToDecode;
        return data
    }

    getBitCount(number) {
        let bitCount = 0;
        while (number > 0) {
            bitCount++;
            number = Math.floor(number / 2);
        }
        return bitCount;
    }

    decodeNames(length, array) {
        let name = Array(length);
        let nameIndex = 0;
        for (; nameIndex < length; nameIndex++) name[nameIndex] = this.readBits(array, 10);
        return strings.convertToString(name)
    }

    /*
    0000: Request load info
    0001: Join Lobby
    0010: Join Game
    0011: Join Singleplayer
    0100: Unallocated
    0101: Heartbeat
    0110: Switch Server
    0111000: Load Leaderboard
    0111001: Upload Error
    0111010: Discord Vote
    */

    unwrap(array) {
        this.index = 0;
        const inGameAction = this.readBits(array, 1);
        return inGameAction ? this.unwrapInGame(array) : this.unwrapNotInGame(array);
    }

    unwrapInGame(array) {
        return {
            action: "ERROR"
        }
    }

    unwrapNotInGame(array) {
        const type = this.readBits(array, 3);
        switch (type) {
            case 7: {
                return this.unwrapExtendedNotInGame(array)
            }
            default: {
                return {
                    action: "ERROR"
                }
            }
        }
    }

    unwrapExtendedNotInGame(array) {
        const type = this.readBits(array, 3);
        switch (type) {
            case 0: {
                return {
                    action: "LEADERBOARD",
                    mwCode: this.readBits(array, 14),
                    id: this.readBits(array, 1),
                    position: this.readBits(array, 16)
                }
            }
            default: {
                return {
                    action: "ERROR"
                }
            }
        }
    }

}

module.exports = Unwrapper