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
        const arrayBitCount = entries.reduce((acc, entry) => {
            return acc + entry.USERNAME.length * 10 + 14 + 5
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
            const name = strings.convertToCharcode(entry.USERNAME);
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

        const arrayLength = this.getByteCount(previewGames.reduce((acc, game) => {
            let clanBitCount = 0,
                i = 0;
            games_clans.push([]);
            for (const clan of game.clans) {
                const lastClan = games_clans[games_clans.length - 1];
                if (i >= 5) { // Added check for 5th and onward clans
                    lastClan[lastClan.length - 1].count += clan.count;
                } else {
                    if (i === 4 && game.clans.length > 5) { // Added check for more than 5 clans
                        lastClan.push({ name: strings.convertToCharcode(""), count: clan.count })
                        clanBitCount += 3 + 9;
                    } else {
                        lastClan.push({ name: strings.convertToCharcode(clan.name), count: clan.count })
                        clanBitCount += 10 * clan.name.length + 3 + 9;
                    }
                }
                i++;
            }
            return acc + 5 + 4 + 1 + 6 + 14 + exponent + 9 + 10 + 3 + clanBitCount;
        }, 0) + 1 + 2 + 6 + exponent * 4);

        const array = new Uint8Array(arrayLength);
        this.index = 0;
        this.setBits(array, 1, 0);
        this.setBits(array, 2, 1);
        this.setBits(array, 6, exponent);
        this.setBits(array, exponent, joinCount);
        this.setBits(array, exponent, clientSet.size - joinCount);
        this.setBits(array, exponent, clientSet.size); //In the future, also include private lobbies
        this.setBits(array, exponent, 0);

        this.setBits(array, 4, previewGames.length)
        for (const index in previewGames) {
            const game = previewGames[index];
            this.setBits(array, 5, game.previewID);
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

    wrapGameInit(game, playerID) {
        const is1v1 = game.mode === 8;
        const arrayLength = this.getByteCount(1 + 2 + 10 + 10 + 14 + 4 + 1 + 6 + 14 + 
            (is1v1 ? 1 + 2 * 14 : 9 + 9) + game.clients.reduce((acc, client) => {
                return acc + 1 + 3 * 6 + 5 + 10 * client.info.name.length
            }, 0));
        const array = new Uint8Array(arrayLength);
        this.index = 0;
        this.setBits(array, 1, 0);
        this.setBits(array, 2, is1v1 ? 3 : 2);
        this.setBits(array, 10, 0); // No redirects for now
        this.setBits(array, 10, 0); // No gameHash since no redirects

        this.setBits(array, is1v1 ? 1 : 9, playerID);
        this.setBits(array, 14, game.spawnSeed);
        this.setBits(array, 4, game.mode);
        this.setBits(array, 1, game.isContest ? 1 : 0);
        this.setBits(array, 6, game.mapID);
        this.setBits(array, 14, game.mapSeed);
        
        if (!is1v1) {
            this.setBits(array, 9, game.playerCount - 1);
        }
        for (const client of game.clients) {
            this.setBits(array, 1, client.info.cursiveName);
            client.info.rgb.forEach(color => this.setBits(array, 6, color));
            if (is1v1) {
                this.setBits(array, 14, client.info.ELO);
            }
            this.setBits(array, 5, client.info.name.length);
            for (const charCode of strings.convertToCharcode(client.info.name)) {
                this.setBits(array, 10, charCode);
            }
        }
        return array;
    }
}

module.exports = Wrapper