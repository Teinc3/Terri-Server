const constants = require("./constants.json");
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
            case 0: {
                return {
                    action: "SITE",
                    mwCode: this.readBits(array, 14)
                }
            }
            case 1: {
                return this.unwrapJoinLobby(array);
            }
            case 2: {
                return {
                    action: "GAME",
                    previewID: this.readBits(array, 4)
                }
            }
            case 3: {
                return { action: "SINGLEPLAYER" } // We are not actively concerned with how many people are playing singleplayer
            }
            case 5: {
                return {
                    action: "HEARTBEAT"
                }
            }
            case 6: {
                return { // Should not be necessary though, since we only have one server
                    action: "SWITCH",
                    lobbyServer: this.readBits(array, 8),
                    gameID: this.readBits(array, 10),
                    playerID: this.readBits(array, 9),
                    mwIDms: this.readBits(array, 10),
                    mwCode: this.readBits(array, 14)
                }
            }
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

    unwrapJoinLobby(array) {
        return {
            action: "LOBBY",
            mwIDms: this.readBits(array, 10),
            lshID: this.readBits(array, 20),
            lshTime: this.readBits(array, 10),
            rgb: [this.readBits(array, 6), this.readBits(array, 6), this.readBits(array, 6)],
            password: 2**24 * this.readBits(array, 24) + this.readBits(array, 24),
            mwCode: this.readBits(array, 14),
            device: this.readBits(array, 4),
            validHostName: this.readBits(array, 1),
            mwIFrame: this.readBits(array, 1),
            timezone: this.readBits(array, 5),
            name: this.decodeNames(constants.MAX_NAME_LENGTH, array).trim(),
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