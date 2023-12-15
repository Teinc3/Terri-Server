const strings = new (require('./strings.js'))()

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
        const names = [];
        const arrayBitCount = entries.reduce((acc, entry) => {
            const nameArray = strings.convertToCharcode(entry.USERNAME);
            names.push(nameArray);
            return acc + nameArray.length * 10 + 14 + 5
        }, 1 + 2 + 1 + 1 + 16 + 4)
        const array = new Uint8Array(this.getByteCount(arrayBitCount));
        this.index = 0;
        this.setBits(array, 1, 0);
        this.setBits(array, 2, 0);
        this.setBits(array, 1, 1);
        this.setBits(array, 1, id);
        this.setBits(array, 16, position);
        this.setBits(array, 4, entries.length);
        for (const i in entries) {
            this.setBits(array, 14, entries[i].ELO);
            const name = names[i];
            this.setBits(array, 5, name.length);
            for (const charCode of name) {
                this.setBits(array, 10, charCode);
            }
        }
        return array
    }

    wrapLobby(clientSet, previewGames) {
        const exponent = Math.ceil(Math.log2(clientSet.size + 1));
        const joinCount = previewGames.reduce((acc, game) => {
            return acc + game.clients.length
        }, 0);

        const games_clans = [];

        const arrayLength = this.getByteCount(previewGames.reduce((acc, game, index) => {
            let clanBitCount = 0,
                i = 0;
            games_clans.push([]);
            for (const clan of game.clans) {
                const lastClan = games_clans[games_clans.length - 1];
                if (i >= 5) { // Don't tell anyone, but if there are only 5 clans, the last one is shown as ""
                    if (i === 5) {
                        lastClan.push({ name: strings.convertToCharcode(""), count: 0 })
                        clanBitCount += 3 + 9;
                    }
                    lastClan[lastClan.length - 1].count += clan.players.length;
                } else {
                    lastClan.push({ name: strings.convertToCharcode(clan.name), count: clan.players.length })
                    clanBitCount += 10 * clan.name.length + 3 + 9;
                }
                i++;
            }
            return 5 + 4 + 1 + 6 + 14 + exponent + 9 + 10 + 3 + clanBitCount;
        }, 1 + 2 + 6 + exponent * 4));

        const array = new Uint8Array(arrayLength);
        this.setBits(array, 1, 0);
        this.setBits(array, 2, 1);
        this.setBits(array, 6, exponent);
        this.setBits(array, exponent, joinCount);
        this.setBits(array, exponent, clientSet.size - joinCount);
        this.setBits(array, exponent, clientSet.size); //In the future, also include private lobbies
        this.setBits(array, exponent, 0);

        for (const index in previewGames) {
            const game = previewGames[index];
            this.setBits(array, 5, game.gameID);
            this.setBits(array, 4, game.mode);
            this.setBits(array, 1, game.isContest ? 1 : 0);
            this.setBits(array, 6, game.mapID);
            this.setBits(array, 14, game.mapSeed);
            this.setBits(array, exponent, game.clients.length);
            this.setBits(array, 9, game.nMaxPlayers - 1);
            this.setBits(array, 10, game.progress);

            this.setBits(array, 3, games_clans[index].length);
            for (const clan of games_clans[index]) {
                this.setBits(array, 9, clan.count - 1);
                this.setBits(array, 3, clan.name.length);
                for (const charCode of clan.name) {
                    this.setBits(array, 10, charCode);
                }
            }
        }

        return array;
    }
}

module.exports = Wrapper