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
        const commandID = this.readBits(array, 3);
        switch (commandID) {
            case 0: {
                return {
                    action: "PUBLIC_COMMAND",
                    type: "landAttack",
                    ratio: this.readBits(array, 10),
                    targetID: this.readBits(array, 9)
                }
            }
            case 1: {
                return {
                    action: "PUBLIC_COMMAND",
                    type: "seaAttack",
                    ratio: this.readBits(array, 10),
                    x: this.readBits(array, 11),
                    y: this.readBits(array, 11)
                }
            }
            case 2: {
                const data = {
                    action: "PUBLIC_COMMAND",
                    type: this.readBits(array, 1) === 0 ? "cancelAttack" : "cancelSeaAttack"
                }
                if (data.type === "cancelAttack") {
                    data.targetID = this.readBits(array, 9);
                } else {
                    data.boatID = this.readBits(array, 11);

                }
                return data;
            }
            case 3: {
                return this.unwrapEndGame(array);
            }
            case 4: {
                return {
                    action: "PUBLIC_COMMAND",
                    type: "surrender"
                }
            }
            case 5: {
                return {
                    action: "PUBLIC_COMMAND",
                    type: "publicEmoji",
                    emojiID: this.readBits(array, 7)
                }
            }
            case 6: {
                return this.unwrapPrivateCommand(array);
            }
            case 7: {
                return {
                    action: "PUBLIC_COMMAND",
                    type: "vote",
                    vote: this.readBits(array, 1) === 1
                }
            }
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

    unwrapEndGame(array) {
        const type = this.readBits(array, 1);
        switch (type) {
            case 0: { // Normal win
                return {
                    action: "END_GAME",
                    type: "WIN",
                    hash: this.readBits(array, 12),
                    winnerID: this.readBits(array, 10)
                }
            }
            case 1: { // Stalemate
                return {
                    action: "END_GAME",
                    type: "STALEMATE",
                    hash: this.readBits(array, 12),
                    winnerIDs: [this.readBits(array, 9), this.readBits(array, 9), this.readBits(array, 9)]
                }
            }
        }
    }

    unwrapPrivateCommand(array) {
        const type = this.readBits(array, 2);
        switch (type) {
            case 0: { // Private Emoji
                return {
                    action: "PRIVATE_COMMAND",
                    type: "PRIVATE_EMOJI",
                    targetID: this.readBits(array, 9),
                    emojiID: this.readBits(array, 7)
                }
            }
            case 1: { // Non-aggression pact
                return {
                    action: "PRIVATE_COMMAND",
                    type: "NON_AGGRESSION",
                    targetID: this.readBits(array, 9)
                }
            }
            case 2: { // Order attack
                const data =  {
                    action: "PRIVATE_COMMAND",
                    type: "ORDER",
                    targetID: this.readBits(array, 9),
                    receiverIDs: []
                }
                while (this.index + 8 <= array.length * 8) {
                    data.receiverIDs.push(this.readBits(array, 9));
                }
                return data;
            }
        }
    }
}

module.exports = Unwrapper